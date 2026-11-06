import type { EditorDefinition } from "../common/agentbridge-providers";
import type { HarnessInventoryResult } from "../common/harness-artifacts";
import type { CapabilityHint } from "./capability-hints";

// React-free view logic for the cluster page: which declared files the
// explorer lists under which heading, how a workspace path is shortened for the
// bridge strip, and whether a capability has run. Kept apart from the
// components so it runs in the Node tests.

export interface EditorGroups {
  // What the agent reads at session start. Reset never touches it.
  readonly instructions: readonly EditorDefinition[];
  // What the agent may do without asking: the permission file, or, for a
  // provider that has none, the settings that carry its approval policy.
  readonly guardrails: readonly EditorDefinition[];
  // Settings beside a separate permission file (Pi's tools and session
  // options): managed by Reset, but no guardrail of their own.
  readonly settings: readonly EditorDefinition[];
  // The seeded cluster-map command or skill; the explorer shows it under its
  // capability rather than as a file of its own.
  readonly command: readonly EditorDefinition[];
}

export function groupEditors(editors: readonly EditorDefinition[]): EditorGroups {
  const hasPermissions = editors.some((editor) => editor.role === "permissions");

  return {
    instructions: editors.filter((editor) => editor.role === "instructions"),
    guardrails: editors.filter(
      (editor) => editor.role === "permissions" || (editor.role === "settings" && !hasPermissions),
    ),
    settings: hasPermissions ? editors.filter((editor) => editor.role === "settings") : [],
    command: editors.filter((editor) => editor.role === "command"),
  };
}

// What Reset calls the cluster-map file: a command, or a skill for the
// providers whose seeded capability is a `SKILL.md`.
export function managedCapabilityNoun(groups: EditorGroups): "command" | "skill" {
  return groups.command.some((editor) => editor.path.endsWith("SKILL.md")) ? "skill" : "command";
}

// `.opencode/command/build-cluster-map.md` -> `build-cluster-map.md`; a skill's
// `SKILL.md` keeps its directory, because every skill file has that name.
export function fileLabel(path: string): string {
  const parts = path.split("/");
  const base = parts.at(-1) ?? path;

  return base === "SKILL.md" && parts.length > 1 ? `${parts.at(-2)}/${base}` : base;
}

// The timeout error is the one the user can fix in Preferences.
export function isProbeTimeout(error: string): boolean {
  return error.includes("timed out");
}

// The workspace path is long and mostly a hash: keep an abbreviated cluster key
// and the provider directory. The full path stays one hover or one copy away.
// `/home/u/.config/Freelens/agentbridge-sessions/6952fa48…bc7b9/copilot`
//   -> `…/6952fa48…/copilot`
export function shortenWorkdir(workdir: string): string {
  const parts = workdir.split(/[\\/]/).filter(Boolean);

  if (parts.length < 2) return workdir;

  const [cluster, provider] = parts.slice(-2);
  const clusterLabel = cluster.length > 12 ? `${cluster.slice(0, 8)}…` : cluster;

  return `…/${clusterLabel}/${provider}`;
}

export type CapabilityProgress =
  | { status: "done"; evidenceName: string; evidenceMtimeMs: number }
  | { status: "todo" }
  // No successful scan yet: say nothing rather than "not built".
  | { status: "unknown" };

export function capabilityProgress(
  hint: CapabilityHint,
  inventory: HarnessInventoryResult | undefined,
): CapabilityProgress {
  if (!hint.findEvidence || inventory?.status !== "ok") return { status: "unknown" };

  const evidence = hint.findEvidence(inventory.groups.flatMap((group) => group.artifacts));

  return evidence
    ? { status: "done", evidenceName: evidence.name, evidenceMtimeMs: evidence.mtimeMs }
    : { status: "todo" };
}

// The switcher sets every provider on one line inside the bridge strip, so the
// two longest product names drop the vendor; the full name stays in its tooltip
// and its accessible name.
const SHORT_NAMES: Readonly<Record<string, string>> = {
  copilot: "Copilot CLI",
  codex: "Codex CLI",
};

export function providerShortName(provider: { id: string; name: string }): string {
  return SHORT_NAMES[provider.id] ?? provider.name;
}

// What the explorer's pane shows. Ids are stable strings, so the selection
// survives a rescan that returns new objects.
export type ExplorerSelection =
  | { kind: "file"; path: string }
  | { kind: "capability"; id: string }
  | { kind: "artifact"; path: string };

export function selectionKey(selection: ExplorerSelection): string {
  return selection.kind === "capability" ? `capability:${selection.id}` : `${selection.kind}:${selection.path}`;
}

// The workspace opens on its instructions file: what the agent reads first.
export function defaultSelection(groups: EditorGroups): ExplorerSelection | undefined {
  const first = groups.instructions[0] ?? groups.guardrails[0];

  return first ? { kind: "file", path: first.path } : undefined;
}
