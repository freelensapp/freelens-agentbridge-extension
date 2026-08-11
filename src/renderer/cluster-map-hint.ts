// Human-facing guidance for the bundled cluster-map command/skill. The command
// is seeded into each provider workspace (and editable via the "Command" editor);
// the user runs it themselves inside a session — the extension never auto-launches
// it. These strings back the static "Cluster map" info card on the cluster page.

export const CLUSTER_MAP_DESCRIPTION =
  "Explores this cluster read-only (one agent per namespace, up to 5 in parallel) and writes a durable " +
  "map: a short navigation map merged into the instructions file, one skill per namespace, and a " +
  "cluster-level skill. Future sessions then start already knowing the cluster. It is idempotent — run " +
  "it again any time to refresh.";

export interface ClusterMapInvocation {
  // Verb shown before the command, e.g. "Run" or "Ask".
  readonly verb: string;
  // The exact text the user types into the session.
  readonly command: string;
}

// How the user invokes the bundled command/skill for a given provider. Claude
// Code and OpenCode expose it as a native slash command; Copilot CLI invokes it
// as a named skill via natural language.
export function getClusterMapInvocation(providerId: string): ClusterMapInvocation {
  if (providerId === "copilot") {
    return { verb: "Ask Copilot", command: "Use the build-cluster-map skill" };
  }

  return { verb: "Run", command: "/build-cluster-map" };
}
