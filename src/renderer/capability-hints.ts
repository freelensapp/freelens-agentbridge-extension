// Data-only registry of the capabilities the extension seeds into provider
// workspaces (bundled commands, preloaded skills, custom agents, ...). Each
// entry is a plain object describing one capability; a single generic card
// (see capability-hints.tsx) renders every entry uniformly, so adding a new
// capability is appending one object here — no bespoke component per capability.
//
// The extension never runs these itself. The user invokes them inside a session;
// each hint just explains what the capability produces and exactly how to invoke
// it for the selected provider.

export type CapabilityKind = "command" | "skill" | "agent";

export interface CapabilityInvocation {
  // Verb shown before the command, e.g. "Run" or "Ask Copilot".
  readonly verb: string;
  // The exact text the user types into the session (a slash command or a
  // natural-language instruction).
  readonly command: string;
}

export interface CapabilityHint {
  readonly id: string;
  // Groups and badges the card (Commands / Skills / Agents).
  readonly kind: CapabilityKind;
  // Material icon name; defaults per kind when omitted (see defaultIconForKind).
  readonly icon?: string;
  readonly title: string;
  readonly description: string;
  // Per-provider invocation text. Return null to hide this hint for the given
  // provider — non-null invocation is the single applicability gate.
  getInvocation(providerId: string): CapabilityInvocation | null;
  // Optional trailing note, e.g. "The command is also editable below." — only
  // true for capabilities that are also seeded as editable files, so it lives
  // per-hint rather than being hardcoded in the card.
  readonly footnote?: string;
}

// Render order and human labels for the kind groups.
export const CAPABILITY_KIND_ORDER: readonly CapabilityKind[] = ["command", "skill", "agent"];

export const CAPABILITY_KIND_LABEL: Record<CapabilityKind, string> = {
  command: "Commands",
  skill: "Skills",
  agent: "Agents",
};

// Singular badge label shown on each card.
export const CAPABILITY_KIND_BADGE: Record<CapabilityKind, string> = {
  command: "Command",
  skill: "Skill",
  agent: "Agent",
};

const DEFAULT_ICON_FOR_KIND: Record<CapabilityKind, string> = {
  command: "terminal",
  skill: "school",
  agent: "smart_toy",
};

export function defaultIconForKind(kind: CapabilityKind): string {
  return DEFAULT_ICON_FOR_KIND[kind];
}

export function iconForHint(hint: CapabilityHint): string {
  return hint.icon ?? defaultIconForKind(hint.kind);
}

const CLUSTER_MAP_DESCRIPTION =
  "Explores this cluster read-only (one agent per namespace, up to 5 in parallel) and writes a durable " +
  "map: a short navigation map merged into the instructions file, one skill per namespace, and a " +
  "cluster-level skill. Future sessions then start already knowing the cluster. It is idempotent — run " +
  "it again any time to refresh.";

// The bundled cluster-map command. Claude Code and OpenCode expose it as a
// native slash command; Copilot CLI invokes it as a named skill via natural
// language. It is seeded per provider and also editable via the "Command"
// editor below the capabilities rail.
const clusterMapHint: CapabilityHint = {
  id: "cluster-map",
  kind: "command",
  icon: "map",
  title: "Build a cluster map",
  description: CLUSTER_MAP_DESCRIPTION,
  footnote: "The command is also editable below.",
  getInvocation(providerId: string): CapabilityInvocation | null {
    if (providerId === "copilot") {
      return { verb: "Ask Copilot", command: "Use the build-cluster-map skill" };
    }

    return { verb: "Run", command: "/build-cluster-map" };
  },
};

export const capabilityHints: readonly CapabilityHint[] = [clusterMapHint];

// The hints that apply to a given provider, in registry order.
export function applicableCapabilityHints(providerId: string): CapabilityHint[] {
  return capabilityHints.filter((hint) => hint.getInvocation(providerId) !== null);
}

export interface CapabilityHintGroup {
  readonly kind: CapabilityKind;
  readonly label: string;
  readonly hints: readonly CapabilityHint[];
}

// Applicable hints grouped by kind in CAPABILITY_KIND_ORDER, skipping empty
// groups so the section never renders an empty "Skills" header.
export function groupApplicableCapabilityHints(providerId: string): CapabilityHintGroup[] {
  const applicable = applicableCapabilityHints(providerId);

  return CAPABILITY_KIND_ORDER.map((kind) => ({
    kind,
    label: CAPABILITY_KIND_LABEL[kind],
    hints: applicable.filter((hint) => hint.kind === kind),
  })).filter((group) => group.hints.length > 0);
}
