import { Renderer } from "@freelensapp/extensions";
import { useState } from "react";
import {
  applicableCapabilityHints,
  CAPABILITY_KIND_BADGE,
  groupApplicableCapabilityHints,
  iconForHint,
} from "./capability-hints";

import type { CapabilityHint } from "./capability-hints";

// One generic card that renders any capability hint: icon + title + a small kind
// badge + description + the per-provider invocation, and an optional footnote.
// Self-hides (returns null) when the hint does not apply to the given provider.
export function CapabilityHintCard({ hint, providerId }: { hint: CapabilityHint; providerId: string }) {
  const invocation = hint.getInvocation(providerId);

  if (!invocation) return null;

  return (
    <div
      style={{
        border: "1px solid var(--borderFaintColor, rgba(127,127,127,0.25))",
        borderRadius: "6px",
        padding: "12px 14px",
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
      }}
    >
      <Renderer.Component.Icon material={iconForHint(hint)} small style={{ marginTop: "2px", opacity: 0.8 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <strong>{hint.title}</strong>
          <span
            style={{
              fontSize: "0.7em",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              padding: "1px 6px",
              borderRadius: "10px",
              border: "1px solid var(--borderFaintColor, rgba(127,127,127,0.25))",
              opacity: 0.75,
            }}
          >
            {CAPABILITY_KIND_BADGE[hint.kind]}
          </span>
        </div>
        <span style={{ opacity: 0.85 }}>{hint.description}</span>
        <span>
          {invocation.verb} inside a session:{" "}
          <code
            style={{
              padding: "1px 6px",
              borderRadius: "4px",
              background: "var(--halfGray, rgba(127,127,127,0.15))",
              fontFamily: "var(--font-monospace, monospace)",
            }}
          >
            {invocation.command}
          </code>
          {hint.footnote ? <>. {hint.footnote}</> : null}
        </span>
      </div>
    </div>
  );
}

// The capabilities rail: every hint applicable to the current provider, grouped
// by kind (Commands / Skills / Agents) with a small header per non-empty group,
// inside a collapsible (default-expanded) section. Cards flow in an intrinsic
// grid (auto-fill / minmax) so they reflow to one column in a narrow rail and
// wrap to multiple columns when given room — no media queries required. Renders
// nothing when no capability applies.
export function CapabilitiesSection({ providerId }: { providerId: string }) {
  const [expanded, setExpanded] = useState(true);
  const applicable = applicableCapabilityHints(providerId);

  if (applicable.length === 0) return null;

  const groups = groupApplicableCapabilityHints(providerId);

  return (
    <section
      style={{
        border: "1px solid var(--borderFaintColor, rgba(127,127,127,0.25))",
        borderRadius: "6px",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
          textAlign: "left",
        }}
      >
        <Renderer.Component.Icon material={expanded ? "expand_less" : "expand_more"} small />
        <strong style={{ flex: 1 }}>Capabilities</strong>
        <span style={{ opacity: 0.6, fontSize: "0.85em" }}>{applicable.length}</span>
      </button>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {groups.map((group) => (
            <div key={group.kind} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span
                style={{
                  fontSize: "0.75em",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  opacity: 0.6,
                }}
              >
                {group.label}
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "12px",
                }}
              >
                {group.hints.map((hint) => (
                  <CapabilityHintCard key={hint.id} hint={hint} providerId={providerId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
