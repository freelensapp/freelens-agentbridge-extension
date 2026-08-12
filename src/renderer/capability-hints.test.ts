import { describe, expect, it } from "vitest";
import {
  applicableCapabilityHints,
  CAPABILITY_KIND_ORDER,
  capabilityHints,
  defaultIconForKind,
  groupApplicableCapabilityHints,
  iconForHint,
} from "./capability-hints";

import type { CapabilityHint } from "./capability-hints";

function clusterMapHint() {
  const hint = capabilityHints.find((entry) => entry.id === "cluster-map");
  if (!hint) throw new Error("cluster-map hint missing from registry");
  return hint;
}

describe("cluster-map capability hint", () => {
  it("shows the slash command for Claude and OpenCode", () => {
    const hint = clusterMapHint();
    expect(hint.getInvocation("claude")).toEqual({ verb: "Run", command: "/build-cluster-map" });
    expect(hint.getInvocation("opencode")).toEqual({ verb: "Run", command: "/build-cluster-map" });
  });

  it("shows the skill invocation for Copilot", () => {
    expect(clusterMapHint().getInvocation("copilot")).toEqual({
      verb: "Ask Copilot",
      command: "Use the build-cluster-map skill",
    });
  });

  it("describes the produced artifacts", () => {
    const { description } = clusterMapHint();
    expect(description).toContain("read-only");
    expect(description).toContain("skill per namespace");
    expect(description).toContain("idempotent");
  });

  it("is a command with the map icon and an editable footnote", () => {
    const hint = clusterMapHint();
    expect(hint.kind).toBe("command");
    expect(iconForHint(hint)).toBe("map");
    expect(hint.footnote).toContain("editable");
  });
});

describe("kind defaults", () => {
  it("provides a default material icon per kind", () => {
    expect(defaultIconForKind("command")).toBe("terminal");
    expect(defaultIconForKind("skill")).toBe("school");
    expect(defaultIconForKind("agent")).toBe("smart_toy");
  });

  it("falls back to the kind default when a hint omits an icon", () => {
    expect(iconForHint({ kind: "skill", getInvocation: () => null } as never)).toBe("school");
  });
});

describe("applicableCapabilityHints", () => {
  it("includes hints whose getInvocation is non-null for the provider", () => {
    expect(applicableCapabilityHints("claude").map((hint) => hint.id)).toContain("cluster-map");
  });

  it("excludes hints whose getInvocation returns null", () => {
    const hidden: CapabilityHint = {
      id: "hidden",
      kind: "agent",
      title: "x",
      description: "x",
      getInvocation: () => null,
    };
    expect([hidden].filter((hint) => hint.getInvocation("claude") !== null)).toHaveLength(0);
  });
});

describe("groupApplicableCapabilityHints", () => {
  it("groups applicable hints by kind and skips empty groups", () => {
    const groups = groupApplicableCapabilityHints("claude");
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.hints.length).toBeGreaterThan(0);
      for (const hint of group.hints) {
        expect(hint.kind).toBe(group.kind);
      }
    }
  });

  it("orders groups by CAPABILITY_KIND_ORDER", () => {
    const groups = groupApplicableCapabilityHints("claude");
    const orderIndex = groups.map((group) => CAPABILITY_KIND_ORDER.indexOf(group.kind));
    const sorted = [...orderIndex].sort((a, b) => a - b);
    expect(orderIndex).toEqual(sorted);
  });
});
