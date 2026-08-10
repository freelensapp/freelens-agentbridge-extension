import { describe, expect, it } from "vitest";
import { getClusterMapCommand } from "./cluster-map-command";

describe("getClusterMapCommand", () => {
  it("returns the slash command for Claude and OpenCode", () => {
    expect(getClusterMapCommand("claude")).toBe("/build-cluster-map");
    expect(getClusterMapCommand("opencode")).toBe("/build-cluster-map");
  });

  it("appends the namespace argument for slash-command providers", () => {
    expect(getClusterMapCommand("claude", "prod")).toBe("/build-cluster-map prod");
    expect(getClusterMapCommand("opencode", "  team-a  ")).toBe("/build-cluster-map team-a");
  });

  it("invokes the skill by name for Copilot", () => {
    expect(getClusterMapCommand("copilot")).toBe("Use the build-cluster-map skill to map this cluster.");
    expect(getClusterMapCommand("copilot", "prod")).toBe(
      "Use the build-cluster-map skill to refresh the map for namespace prod.",
    );
  });

  it("treats blank namespaces as no namespace", () => {
    expect(getClusterMapCommand("claude", "   ")).toBe("/build-cluster-map");
  });
});
