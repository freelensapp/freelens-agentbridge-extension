import { describe, expect, it } from "vitest";
import { CLUSTER_MAP_DESCRIPTION, getClusterMapInvocation } from "./cluster-map-hint";

describe("getClusterMapInvocation", () => {
  it("shows the slash command for Claude and OpenCode", () => {
    expect(getClusterMapInvocation("claude")).toEqual({ verb: "Run", command: "/build-cluster-map" });
    expect(getClusterMapInvocation("opencode")).toEqual({ verb: "Run", command: "/build-cluster-map" });
  });

  it("shows the skill invocation for Copilot", () => {
    expect(getClusterMapInvocation("copilot")).toEqual({
      verb: "Ask Copilot",
      command: "Use the build-cluster-map skill",
    });
  });
});

describe("CLUSTER_MAP_DESCRIPTION", () => {
  it("explains the produced artifacts", () => {
    expect(CLUSTER_MAP_DESCRIPTION).toContain("read-only");
    expect(CLUSTER_MAP_DESCRIPTION).toContain("skill per namespace");
    expect(CLUSTER_MAP_DESCRIPTION).toContain("idempotent");
  });
});
