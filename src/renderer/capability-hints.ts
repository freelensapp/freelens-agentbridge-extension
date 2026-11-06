import type { EditorRole } from "../common/agentbridge-providers";
import type { HarnessArtifact } from "../common/harness-artifacts";

// Data-only registry of the capabilities the extension seeds into provider
// workspaces (bundled commands, preloaded skills, custom agents, ...). Each
// entry is a plain object describing one capability; the workspace explorer
// renders every applicable entry as one generic item (see
// workspace-explorer.tsx), so adding a new capability is appending one object
// here — no bespoke component per capability.
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
  // Picks the default icon (Commands / Skills / Agents).
  readonly kind: CapabilityKind;
  // Material icon name; defaults per kind when omitted (see defaultIconForKind).
  readonly icon?: string;
  readonly title: string;
  readonly description: string;
  // Per-provider invocation text. Return null to hide this hint for the given
  // provider — non-null invocation is the single applicability gate.
  getInvocation(providerId: string): CapabilityInvocation | null;
  // The role of the declared editors that hold this capability's seeded file,
  // when it has one; the step shows those files in place.
  readonly editorRole?: EditorRole;
  // The artifact whose presence proves the capability has run in this
  // workspace, if any can. Absent means the page cannot tell, and says nothing.
  findEvidence?(artifacts: readonly HarnessArtifact[]): HarnessArtifact | undefined;
}

// Human labels for the kinds.
export const CAPABILITY_KIND_LABEL: Record<CapabilityKind, string> = {
  command: "Commands",
  skill: "Skills",
  agent: "Agents",
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
  "Explores this cluster read-only, one agent per namespace and up to 5 in parallel, then writes a " +
  "short navigation map into the instructions file, one skill per namespace and a cluster-level skill. " +
  "Future sessions start already knowing the cluster. It is idempotent: run it again any time to refresh.";

// Every provider's scaffold names the cluster-level skill `cluster-map-<cluster>`
// (the per-namespace ones are `ns-map-<namespace>`), so its presence is the
// proof that the map was built in this workspace.
const CLUSTER_MAP_SKILL_PREFIX = "cluster-map-";

// The bundled cluster-map command. Claude Code and OpenCode expose it as a
// native slash command; Copilot CLI invokes it as a named skill via natural
// language, and Codex mentions a skill with `$<name>`. It is seeded per provider
// and its seeded file is editable in the same step (`editorRole: "command"`).
//
// The default is the slash command, so every branch here is a provider that does
// NOT have project-local slash commands. Getting this wrong is not cosmetic: the
// card is the only place the invocation is written down, so a provider falling
// through to the default is told to type a command its CLI does not have.
const clusterMapHint: CapabilityHint = {
  id: "cluster-map",
  kind: "command",
  icon: "map",
  title: "Build a cluster map",
  description: CLUSTER_MAP_DESCRIPTION,
  editorRole: "command",
  findEvidence: (artifacts) =>
    artifacts.find((artifact) => artifact.kind === "skill" && artifact.name.startsWith(CLUSTER_MAP_SKILL_PREFIX)),
  getInvocation(providerId: string): CapabilityInvocation | null {
    if (providerId === "copilot") {
      return { verb: "Ask Copilot", command: "Use the build-cluster-map skill" };
    }

    // Codex mentions a skill with `$<name>` (or picks it from `/skills`);
    // `~/.codex/prompts/` is global-only and deprecated, so there is no
    // `/build-cluster-map` to offer.
    if (providerId === "codex") {
      return { verb: "Run", command: "$build-cluster-map" };
    }

    return { verb: "Run", command: "/build-cluster-map" };
  },
};

export const capabilityHints: readonly CapabilityHint[] = [clusterMapHint];

// The hints that apply to a given provider, in registry order.
export function applicableCapabilityHints(providerId: string): CapabilityHint[] {
  return capabilityHints.filter((hint) => hint.getInvocation(providerId) !== null);
}
