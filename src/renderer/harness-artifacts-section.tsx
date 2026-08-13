import { Renderer } from "@freelensapp/extensions";
import { HARNESS_ARTIFACT_KIND_ORDER } from "../common/harness-artifacts";
import { formatRelativeAge, iconForArtifactKind, labelForArtifactKind, totalLabel } from "./harness-inventory";

import type { HarnessArtifact, HarnessArtifactGroup, HarnessInventoryResult } from "../common/harness-artifacts";
import type { InventorySummary } from "./harness-inventory";

// The retrospective counterpart to the capabilities rail: what the workspace
// actually contains right now. Every export here is hook-free so it stays
// unit-testable in the node test environment; expansion state lives in the page.

const FAINT_BORDER = "1px solid var(--borderFaintColor, rgba(127,127,127,0.25))";

const badgeStyle = {
  fontSize: "0.7em",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  padding: "1px 6px",
  borderRadius: "10px",
  border: FAINT_BORDER,
  opacity: 0.75,
};

const inlineButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
  textAlign: "left" as const,
};

// The header rollup: "· 21 skills · 2 agents · updated 4m ago". Renders nothing
// for an empty inventory — a fresh workspace shows no chips rather than "0
// skills", and an authoritative-looking zero is worse than nothing.
export function HarnessInventoryChips({ summary, onSelect }: { summary: InventorySummary; onSelect: () => void }) {
  if (summary.chips.length === 0) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {summary.chips.map((chip) => (
        <span key={chip.kind}>
          {" · "}
          <button
            type="button"
            onClick={onSelect}
            title={`Show workspace ${labelForArtifactKind(chip.kind).toLowerCase()}`}
            style={{ ...inlineButtonStyle, textDecoration: "underline dotted" }}
          >
            {chip.label}
          </button>
        </span>
      ))}
      {summary.ageLabel ? <span style={{ opacity: 0.7 }}>{` · updated ${summary.ageLabel}`}</span> : null}
    </span>
  );
}

// One artifact: icon, name, origin badge, relative age, description.
export function HarnessArtifactRow({ artifact, nowMs }: { artifact: HarnessArtifact; nowMs: number }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "6px 0", borderTop: FAINT_BORDER }}>
      <Renderer.Component.Icon
        material={iconForArtifactKind(artifact.kind)}
        small
        style={{ marginTop: "2px", opacity: 0.8 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <strong>{artifact.name}</strong>
          <span style={badgeStyle}>{artifact.origin}</span>
          <span style={{ opacity: 0.7, fontSize: "0.85em" }} title={new Date(artifact.mtimeMs).toLocaleString()}>
            {formatRelativeAge(artifact.mtimeMs, nowMs)}
          </span>
        </div>
        {artifact.description ? (
          <span style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {artifact.description}
          </span>
        ) : null}
      </div>
      <span style={{ opacity: 0.5, fontSize: "0.8em", fontFamily: "var(--font-monospace, monospace)" }}>
        {artifact.path}
      </span>
    </div>
  );
}

function ArtifactKindGroup({ group, nowMs }: { group: HarnessArtifactGroup; nowMs: number }) {
  if (group.count === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: "0.75em", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}>
        {labelForArtifactKind(group.kind)}
        {group.truncated ? ` (showing the first ${group.count}; the workspace holds more)` : null}
      </span>
      {group.artifacts.map((artifact) => (
        <HarnessArtifactRow key={artifact.path} artifact={artifact} nowMs={nowMs} />
      ))}
    </div>
  );
}

export function HarnessArtifactsSection({
  result,
  loading,
  expanded,
  onToggle,
  onRefresh,
  nowMs,
}: {
  result: HarnessInventoryResult | undefined;
  loading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  nowMs: number;
}) {
  // Nothing at all until the first scan lands: an empty panel that might just be
  // slow is noise.
  if (!result) return null;

  const groups =
    result.status === "ok"
      ? HARNESS_ARTIFACT_KIND_ORDER.flatMap((kind) => result.groups.filter((group) => group.kind === kind))
      : [];
  const total = groups.reduce((count, group) => count + group.count, 0);

  return (
    <section
      style={{
        border: FAINT_BORDER,
        borderRadius: "6px",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{ ...inlineButtonStyle, display: "flex", alignItems: "center", gap: "8px", flex: 1 }}
        >
          <Renderer.Component.Icon material={expanded ? "expand_less" : "expand_more"} small />
          <strong style={{ flex: 1 }}>Workspace artifacts</strong>
          {/* A failed scan knows nothing about the workspace, so it gets no
              number at all: the section is collapsed by default and on every
              selection change, so a "0" here would be the whole story a user
              ever sees, and an authoritative-looking zero is worse than
              nothing (spec §4.5). */}
          {result.status === "ok" && <span style={{ opacity: 0.6, fontSize: "0.85em" }}>{totalLabel(groups)}</span>}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Rescan the workspace"
          style={inlineButtonStyle}
        >
          <Renderer.Component.Icon material="refresh" small />
        </button>
      </div>

      {/* Outside the expanded body on purpose: the failure and its Retry are the
          only honest content a failed scan has, and they must survive the
          default-collapsed state (spec §4.7). */}
      {result.status === "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Renderer.Component.Icon material="error_outline" small />
          <span>{result.error}</span>
          <button type="button" onClick={onRefresh} style={{ ...inlineButtonStyle, textDecoration: "underline" }}>
            Retry
          </button>
        </div>
      )}

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ opacity: 0.7, fontSize: "0.85em" }}>
            Seeded by this extension and generated in this cluster's workspace. Your personal <code>~/.claude</code>,{" "}
            <code>~/.opencode</code> or <code>~/.github</code> not counted.
          </span>

          {result.status === "ok" && total === 0 && (
            <span style={{ opacity: 0.85 }}>
              No skills or custom agents yet. Run /build-cluster-map inside a session to generate some.
            </span>
          )}

          {result.status === "ok" &&
            groups.map((group) => <ArtifactKindGroup key={group.kind} group={group} nowMs={nowMs} />)}
        </div>
      )}
    </section>
  );
}
