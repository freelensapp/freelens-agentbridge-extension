import { describe, expect, it } from "vitest";
import { buildArtifactGroup, HARNESS_ARTIFACT_KIND_ORDER, MAX_ARTIFACTS_PER_KIND } from "./harness-artifacts";

import type { HarnessArtifact } from "./harness-artifacts";

function artifact(name: string, mtimeMs: number): HarnessArtifact {
  return { kind: "skill", name, path: `.claude/skills/${name}/SKILL.md`, mtimeMs, origin: "generated" };
}

describe("buildArtifactGroup", () => {
  it("derives count and the mtime range from the artifact list", () => {
    const group = buildArtifactGroup("skill", [artifact("b", 3000), artifact("a", 1000), artifact("c", 2000)]);

    expect(group.count).toBe(3);
    expect(group.oldestMtimeMs).toBe(1000);
    expect(group.newestMtimeMs).toBe(3000);
    expect(group.truncated).toBe(false);
  });

  it("orders artifacts oldest-first, breaking ties by name", () => {
    const group = buildArtifactGroup("skill", [artifact("b", 1000), artifact("c", 5000), artifact("a", 1000)]);

    expect(group.artifacts.map(({ name }) => name)).toEqual(["a", "b", "c"]);
  });

  it("leaves the mtime range undefined for an empty kind", () => {
    const group = buildArtifactGroup("agent", []);

    expect(group).toEqual({
      kind: "agent",
      count: 0,
      newestMtimeMs: undefined,
      oldestMtimeMs: undefined,
      artifacts: [],
      truncated: false,
    });
  });

  it("carries the truncated flag through", () => {
    expect(buildArtifactGroup("skill", [artifact("a", 1)], true).truncated).toBe(true);
  });

  it("does not mutate the caller's array", () => {
    const input = [artifact("b", 2000), artifact("a", 1000)];
    buildArtifactGroup("skill", input);

    expect(input.map(({ name }) => name)).toEqual(["b", "a"]);
  });

  it("exposes the render order and the per-kind cap", () => {
    expect(HARNESS_ARTIFACT_KIND_ORDER).toEqual(["skill", "agent"]);
    expect(MAX_ARTIFACTS_PER_KIND).toBe(200);
  });
});
