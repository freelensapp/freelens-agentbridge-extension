import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { applicableCapabilityHints, capabilityHints, defaultIconForKind, iconForHint } from "./capability-hints";

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

  // Codex has no project-local slash commands — `~/.codex/prompts/` is
  // global-only and deprecated — so it mentions the seeded skill with `$<name>`.
  // Falling through to the default would print a command Codex does not have.
  it("shows the skill mention for Codex", () => {
    expect(clusterMapHint().getInvocation("codex")).toEqual({
      verb: "Run",
      command: "$build-cluster-map",
    });
  });

  // Pi needs no branch in the hint: `.pi/prompts/<name>.md` becomes `/<name>`,
  // so it falls through to the default like Claude Code and OpenCode.
  it("shows the slash command for Pi", () => {
    expect(clusterMapHint().getInvocation("pi")).toEqual({ verb: "Run", command: "/build-cluster-map" });
  });

  it("offers a slash command only to the providers that have project-local ones", () => {
    const hint = clusterMapHint();
    const withSlashCommands = new Set(["claude", "opencode", "pi"]);

    for (const providerId of agentBridgeProviders.map(({ id }) => id)) {
      const slash = hint.getInvocation(providerId)?.command.startsWith("/") ?? false;

      expect(slash, `${providerId}`).toBe(withSlashCommands.has(providerId));
    }
  });

  it("describes the produced artifacts", () => {
    const { description } = clusterMapHint();
    expect(description).toContain("read-only");
    expect(description).toContain("skill per namespace");
    expect(description).toContain("idempotent");
  });

  it("is a command with the map icon, shown with the seeded command files", () => {
    const hint = clusterMapHint();
    expect(hint.kind).toBe("command");
    expect(iconForHint(hint)).toBe("map");
    expect(hint.editorRole).toBe("command");
  });

  it("finds the cluster-level skill as proof the map was built, and nothing else", () => {
    const hint = clusterMapHint();
    const skill = (name: string, kind: "skill" | "agent" = "skill") => ({
      kind,
      name,
      path: `.claude/skills/${name}/SKILL.md`,
      mtimeMs: 1,
      origin: "generated" as const,
    });

    expect(hint.findEvidence?.([skill("ns-map-default"), skill("cluster-map-kind")])?.name).toBe("cluster-map-kind");
    // The seeded Copilot/Codex skill that BUILDS the map is not the map.
    expect(hint.findEvidence?.([skill("build-cluster-map"), skill("ns-map-default")])).toBeUndefined();
    expect(hint.findEvidence?.([skill("cluster-map-kind", "agent")])).toBeUndefined();
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
