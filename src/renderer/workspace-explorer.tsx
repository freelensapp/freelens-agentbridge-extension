import { HARNESS_ARTIFACT_KIND_ORDER } from "../common/harness-artifacts";
import styles from "./agentbridge-page.module.scss";
import { applicableCapabilityHints, iconForHint } from "./capability-hints";
import { CopyButton } from "./copy-button";
import { Glyph } from "./glyph";
import { formatRelativeAge, labelForArtifactKind, totalLabel } from "./harness-inventory";
import { capabilityProgress, fileLabel, groupEditors, selectionKey } from "./page-model";
import { ProviderFileEditor } from "./provider-file-editor";

import type { ReactNode } from "react";

import type { AgentBridgeProvider } from "../common/agentbridge-providers";
import type { HarnessArtifact, HarnessArtifactGroup, HarnessInventoryResult } from "../common/harness-artifacts";
import type { CapabilityHint } from "./capability-hints";
import type { CapabilityProgress, ExplorerSelection } from "./page-model";

// The workspace as an explorer: what the agent reads and may do, the
// capabilities seeded into it, and the skills and agents it holds, listed on
// the left; the selected item fills the pane on the right, a file in a
// full-height editor.

interface WorkspaceExplorerProps {
  clusterId: string;
  provider: AgentBridgeProvider;
  inventory: HarnessInventoryResult | undefined;
  inventoryLoading: boolean;
  scanNowMs: number;
  onRescan: () => void;
  selection: ExplorerSelection | undefined;
  onSelect: (selection: ExplorerSelection) => void;
  onOpenInEditor: () => void;
}

export function WorkspaceExplorer(props: WorkspaceExplorerProps) {
  const { provider, inventory, inventoryLoading, scanNowMs, onRescan, selection, onSelect } = props;
  const editors = groupEditors(provider.editors);
  const capabilities = applicableCapabilityHints(provider.id);
  const groups =
    inventory?.status === "ok"
      ? HARNESS_ARTIFACT_KIND_ORDER.flatMap((kind) => inventory.groups.filter((group) => group.kind === kind))
      : [];
  const current = selection ? selectionKey(selection) : undefined;
  const item = (target: ExplorerSelection) => ({
    selected: selectionKey(target) === current,
    onSelect: () => onSelect(target),
  });

  return (
    <div className={styles.explorer}>
      <nav className={styles.explorerNav} aria-label={`${provider.name} workspace`}>
        <NavGroup label="Configuration">
          {editors.instructions.map((editor) => (
            <NavItem
              key={editor.path}
              icon="description"
              title="Instructions"
              detail={fileLabel(editor.path)}
              {...item({ kind: "file", path: editor.path })}
            />
          ))}
          {editors.guardrails.map((editor) => (
            <NavItem
              key={editor.path}
              icon="shield"
              title="Guardrails"
              detail={fileLabel(editor.path)}
              {...item({ kind: "file", path: editor.path })}
            />
          ))}
          {editors.settings.map((editor) => (
            <NavItem
              key={editor.path}
              icon="tune"
              title="Settings"
              detail={fileLabel(editor.path)}
              {...item({ kind: "file", path: editor.path })}
            />
          ))}
        </NavGroup>

        {capabilities.length > 0 && (
          <NavGroup label="Capabilities">
            {capabilities.map((hint) => {
              const progress = capabilityProgress(hint, inventory);

              return (
                <NavItem
                  key={hint.id}
                  icon={iconForHint(hint)}
                  title={hint.title}
                  detail={progressLabel(progress, scanNowMs)}
                  marker={progress.status === "done" ? "done" : progress.status === "todo" ? "todo" : undefined}
                  {...item({ kind: "capability", id: hint.id })}
                />
              );
            })}
          </NavGroup>
        )}

        {inventory?.status === "error" && (
          <div role="alert" className={styles.navAlert}>
            <span>The workspace could not be scanned: {inventory.error}</span>
            <button type="button" className={styles.linkButton} onClick={onRescan}>
              Try again
            </button>
          </div>
        )}

        {groups.map((group) => (
          <ArtifactGroup key={group.kind} group={group} nowMs={scanNowMs} item={item} />
        ))}

        {inventory?.status === "ok" && groups.every((group) => group.count === 0) && (
          <NavGroup label="Skills and agents">
            <span className={styles.navEmpty}>None yet. Building the cluster map adds one skill per namespace.</span>
          </NavGroup>
        )}

        <div className={styles.navFooter}>
          <span>{inventory ? "Lists this workspace only, not your home directory." : "Scanning the workspace…"}</span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRescan}
            disabled={inventoryLoading}
            aria-label="Rescan the workspace"
            title="Rescan the workspace"
          >
            <Glyph material="refresh" small />
          </button>
        </div>
      </nav>

      <section className={styles.pane} aria-labelledby="agentbridge-pane-title">
        <Pane {...props} editors={editors} capabilities={capabilities} groups={groups} />
      </section>
    </div>
  );
}

function progressLabel(progress: CapabilityProgress, nowMs: number): string | undefined {
  if (progress.status === "done") return `Built ${formatRelativeAge(progress.evidenceMtimeMs, nowMs)}`;
  if (progress.status === "todo") return "Not built yet";
  return undefined;
}

function NavGroup({ label, count, children }: { label: string; count?: string; children: ReactNode }) {
  return (
    <div className={styles.navGroup} role="group" aria-label={label}>
      <span className={styles.navLabel} aria-hidden>
        {label}
        {count && <span className={styles.count}>{count}</span>}
      </span>
      {children}
    </div>
  );
}

function NavItem({
  icon,
  title,
  detail,
  marker,
  selected,
  onSelect,
}: {
  icon: string;
  title: string;
  detail?: string;
  marker?: "done" | "todo";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.navItem}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      title={detail ? `${title} · ${detail}` : title}
    >
      <Glyph material={icon} small />
      <span className={styles.navText}>
        <span className={styles.navTitle}>{title}</span>
        {detail && (
          <span className={styles.navDetail} data-marker={marker}>
            {detail}
          </span>
        )}
      </span>
    </button>
  );
}

function ArtifactGroup({
  group,
  nowMs,
  item,
}: {
  group: HarnessArtifactGroup;
  nowMs: number;
  item: (target: ExplorerSelection) => { selected: boolean; onSelect: () => void };
}) {
  if (group.count === 0) return null;

  // Newest first: after a map run, the skills it just wrote lead the list.
  const artifacts = [...group.artifacts].sort((a, b) => b.mtimeMs - a.mtimeMs);

  return (
    <NavGroup label={labelForArtifactKind(group.kind)} count={totalLabel([group])}>
      {group.truncated && (
        <span className={styles.navEmpty}>Showing the first {group.count}; the workspace holds more.</span>
      )}
      <div className={styles.navList}>
        {artifacts.map((artifact) => (
          <NavItem
            key={artifact.path}
            icon={artifact.kind === "agent" ? "smart_toy" : "school"}
            title={artifact.name}
            detail={formatRelativeAge(artifact.mtimeMs, nowMs)}
            {...item({ kind: "artifact", path: artifact.path })}
          />
        ))}
      </div>
    </NavGroup>
  );
}

function Pane({
  clusterId,
  provider,
  inventory,
  scanNowMs,
  selection,
  onOpenInEditor,
  editors,
  capabilities,
  groups,
}: WorkspaceExplorerProps & {
  editors: ReturnType<typeof groupEditors>;
  capabilities: CapabilityHint[];
  groups: HarnessArtifactGroup[];
}) {
  if (selection?.kind === "file") {
    const editor = provider.editors.find((candidate) => candidate.path === selection.path);

    if (!editor) return null;
    const kind = editors.guardrails.includes(editor)
      ? "guardrails"
      : editors.settings.includes(editor)
        ? "settings"
        : "instructions";
    const head = {
      instructions: {
        icon: "description",
        title: "Instructions",
        lede: `What ${provider.name} reads first about this cluster. Reset never touches it.`,
      },
      guardrails: {
        icon: "shield",
        title: "Guardrails",
        lede: `What ${provider.name} may run without asking. Seeded to let read-only kubectl and helm run and ask before the rest.`,
      },
      settings: {
        icon: "tune",
        title: "Settings",
        lede: `The tools ${provider.name} may use and its session options. Reset puts back the bundled version.`,
      },
    }[kind];

    return (
      <>
        <PaneHead icon={head.icon} title={head.title} lede={head.lede} />
        {kind === "guardrails" && (
          <div className={styles.callout}>
            <Glyph material="info_outline" small />
            <span>
              Guardrails are a convenience, not a security boundary.{" "}
              <strong>The kubeconfig and Kubernetes RBAC decide what the agent can do</strong>, so pair sensitive
              clusters with a read-only context.
            </span>
          </div>
        )}
        <ProviderFileEditor clusterId={clusterId} providerId={provider.id} editor={editor} />
      </>
    );
  }

  if (selection?.kind === "capability") {
    const hint = capabilities.find((candidate) => candidate.id === selection.id);
    const invocation = hint?.getInvocation(provider.id);

    if (!hint || !invocation) return null;
    const progress = capabilityProgress(hint, inventory);
    const seeded = hint.editorRole ? provider.editors.filter((editor) => editor.role === hint.editorRole) : [];

    return (
      <>
        <PaneHead icon={iconForHint(hint)} title={hint.title} lede={hint.description} />
        <div className={styles.invocation}>
          {progress.status === "done" ? (
            <span className={styles.ok}>
              <Glyph material="check_circle" smallest /> Built: <code>{progress.evidenceName}</code> updated{" "}
              {formatRelativeAge(progress.evidenceMtimeMs, scanNowMs)}. Run again to refresh:
            </span>
          ) : (
            <span>
              {progress.status === "todo" && <span className={styles.warn}>Not built yet. </span>}
              {invocation.verb} in a session:
            </span>
          )}
          <code>{invocation.command}</code>
          <CopyButton text={invocation.command} label={`Copy ${invocation.command}`} />
        </div>
        {seeded.map((editor) => (
          <ProviderFileEditor key={editor.path} clusterId={clusterId} providerId={provider.id} editor={editor} />
        ))}
      </>
    );
  }

  if (selection?.kind === "artifact") {
    const artifact = groups.flatMap((group) => group.artifacts).find((candidate) => candidate.path === selection.path);

    if (!artifact) return <p className={styles.paneEmpty}>This item is no longer in the workspace.</p>;

    return <ArtifactDetail artifact={artifact} nowMs={scanNowMs} onOpenInEditor={onOpenInEditor} />;
  }

  return <p className={styles.paneEmpty}>Select an item to see it here.</p>;
}

function PaneHead({ icon, title, lede }: { icon: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className={styles.paneHead}>
      <span className={styles.paneIcon} aria-hidden>
        <Glyph material={icon} />
      </span>
      <div className={styles.paneHeadText}>
        <h2 id="agentbridge-pane-title">{title}</h2>
        {lede && <p>{lede}</p>}
      </div>
    </header>
  );
}

function ArtifactDetail({
  artifact,
  nowMs,
  onOpenInEditor,
}: {
  artifact: HarnessArtifact;
  nowMs: number;
  onOpenInEditor: () => void;
}) {
  const kind = artifact.kind === "agent" ? "Agent" : "Skill";

  return (
    <>
      <PaneHead
        icon={artifact.kind === "agent" ? "smart_toy" : "school"}
        title={artifact.name}
        lede={artifact.description ?? `This ${kind.toLowerCase()} has no description.`}
      />
      <dl className={styles.facts}>
        <dt>Kind</dt>
        <dd>{kind}</dd>
        <dt>Origin</dt>
        <dd>{artifact.origin === "seeded" ? "Seeded by AgentBridge" : "Written in a session"}</dd>
        <dt>Updated</dt>
        <dd>
          <time dateTime={new Date(artifact.mtimeMs).toISOString()} title={new Date(artifact.mtimeMs).toLocaleString()}>
            {formatRelativeAge(artifact.mtimeMs, nowMs)}
          </time>
        </dd>
        <dt>Path</dt>
        <dd className={styles.factPath}>
          <code>{artifact.path}</code>
          <CopyButton text={artifact.path} label="Copy the path" />
        </dd>
      </dl>
      <div className={styles.callout}>
        <Glyph material="info_outline" small />
        <span>
          AgentBridge lists skills and agents without opening them. Ask the agent to change one, or open the workspace
          in your editor.{" "}
          <button type="button" className={styles.linkButton} onClick={onOpenInEditor}>
            Open in editor
          </button>
        </span>
      </div>
    </>
  );
}
