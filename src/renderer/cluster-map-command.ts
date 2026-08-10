// Builds the follow-up command that is typed into a freshly launched provider
// session to invoke the bundled cluster-map command/skill. Claude Code and
// OpenCode expose it as a native slash command; Copilot CLI invokes it as a
// named skill via natural language.
export function getClusterMapCommand(providerId: string, namespace?: string): string {
  const ns = namespace?.trim();

  if (providerId === "copilot") {
    return ns
      ? `Use the build-cluster-map skill to refresh the map for namespace ${ns}.`
      : "Use the build-cluster-map skill to map this cluster.";
  }

  return ns ? `/build-cluster-map ${ns}` : "/build-cluster-map";
}
