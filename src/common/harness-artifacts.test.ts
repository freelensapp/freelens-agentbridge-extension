import { describe, expect, it } from "vitest";
import {
  buildArtifactGroup,
  HARNESS_ARTIFACT_KIND_ORDER,
  MAX_ARTIFACTS_PER_KIND,
  MAX_ENTRIES_SCANNED,
} from "./harness-artifacts";

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
      examinedCount: 0,
    });
  });

  it("carries the truncated flag through", () => {
    expect(buildArtifactGroup("skill", [artifact("a", 1)], true).truncated).toBe(true);
  });

  // Truncation drops artifacts in NAME order, so the kept set's mtime range can
  // be arbitrarily older than the workspace's real one — the header chip would
  // say "updated 20800d ago" while the dropped tail was written seconds ago.
  it("reports the scanned mtime range and examined count, not the kept ones", () => {
    const group = buildArtifactGroup("skill", [artifact("a", 1000), artifact("b", 2000)], true, {
      examined: 205,
      newestMtimeMs: 9_000,
      oldestMtimeMs: 500,
    });

    expect(group.count).toBe(2);
    expect(group.examinedCount).toBe(205);
    expect(group.newestMtimeMs).toBe(9_000);
    expect(group.oldestMtimeMs).toBe(500);
  });

  it("falls back to the kept artifacts when no scan totals are supplied", () => {
    const group = buildArtifactGroup("skill", [artifact("a", 1000), artifact("b", 2000)]);

    expect(group.examinedCount).toBe(2);
    expect(group.newestMtimeMs).toBe(2000);
    expect(group.oldestMtimeMs).toBe(1000);
  });

  it("does not mutate the caller's array", () => {
    const input = [artifact("b", 2000), artifact("a", 1000)];
    buildArtifactGroup("skill", input);

    expect(input.map(({ name }) => name)).toEqual(["b", "a"]);
  });

  it("exposes the render order and both scan budgets", () => {
    expect(HARNESS_ARTIFACT_KIND_ORDER).toEqual(["skill", "agent"]);
    expect(MAX_ARTIFACTS_PER_KIND).toBe(200);
    // Bounds the WORK, so it has to leave room for entries the result cap
    // discards: duplicates, non-artifacts and everything past the cap.
    expect(MAX_ENTRIES_SCANNED).toBe(2000);
    expect(MAX_ENTRIES_SCANNED).toBeGreaterThan(MAX_ARTIFACTS_PER_KIND);
  });
});
