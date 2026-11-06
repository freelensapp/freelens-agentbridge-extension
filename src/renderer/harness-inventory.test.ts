import { describe, expect, it } from "vitest";
import { buildArtifactGroup } from "../common/harness-artifacts";
import { formatRelativeAge, labelForArtifactKind, totalLabel } from "./harness-inventory";

import type { HarnessArtifact } from "../common/harness-artifacts";

const NOW = 1_700_000_000_000;

function artifact(name: string, mtimeMs: number, kind: "skill" | "agent" = "skill"): HarnessArtifact {
  return { kind, name, path: `.claude/skills/${name}/SKILL.md`, mtimeMs, origin: "generated" };
}

describe("formatRelativeAge", () => {
  it("formats ages from seconds to days", () => {
    expect(formatRelativeAge(NOW, NOW)).toBe("just now");
    expect(formatRelativeAge(NOW - 30_000, NOW)).toBe("just now");
    expect(formatRelativeAge(NOW - 60_000, NOW)).toBe("1m ago");
    expect(formatRelativeAge(NOW - 4 * 60_000, NOW)).toBe("4m ago");
    expect(formatRelativeAge(NOW - 60 * 60_000, NOW)).toBe("1h ago");
    expect(formatRelativeAge(NOW - 25 * 60 * 60_000, NOW)).toBe("1d ago");
    expect(formatRelativeAge(NOW - 48 * 60 * 60_000, NOW)).toBe("2d ago");
  });

  it("clamps a future mtime to just now rather than showing a negative age", () => {
    expect(formatRelativeAge(NOW + 60_000, NOW)).toBe("just now");
    expect(formatRelativeAge(NOW + 10 * 24 * 60 * 60_000, NOW)).toBe("just now");
  });

  it("switches unit exactly at each boundary of the ladder", () => {
    // Every boundary is asserted from both sides so a `<` flipped to `<=`, or a
    // whole rung deleted, changes an assertion.
    expect(formatRelativeAge(NOW - 59_999, NOW)).toBe("just now");
    expect(formatRelativeAge(NOW - 60_000, NOW)).toBe("1m ago");
    expect(formatRelativeAge(NOW - (60 * 60_000 - 1), NOW)).toBe("59m ago");
    expect(formatRelativeAge(NOW - 60 * 60_000, NOW)).toBe("1h ago");
    expect(formatRelativeAge(NOW - (24 * 60 * 60_000 - 1), NOW)).toBe("23h ago");
    expect(formatRelativeAge(NOW - 24 * 60 * 60_000, NOW)).toBe("1d ago");
  });
});

describe("labelForArtifactKind", () => {
  it("reuses the capability vocabulary so both panels agree", () => {
    expect(labelForArtifactKind("skill")).toBe("Skills");
    expect(labelForArtifactKind("agent")).toBe("Agents");
  });
});

describe("totalLabel", () => {
  it("sums the kinds and keeps an untruncated total exact", () => {
    expect(totalLabel([buildArtifactGroup("skill", [artifact("a", NOW), artifact("b", NOW)])])).toBe("2");
    expect(
      totalLabel([
        buildArtifactGroup("skill", [artifact("a", NOW), artifact("b", NOW)]),
        buildArtifactGroup("agent", [artifact("r", NOW, "agent")]),
      ]),
    ).toBe("3");
    expect(totalLabel([])).toBe("0");
  });

  it("marks the total as a floor when any kind is truncated, matching the chips", () => {
    // The chip for that kind already reads "200+"; a bare total next to it would
    // claim a precision the scan never had.
    expect(totalLabel([buildArtifactGroup("skill", [artifact("a", NOW)], true)])).toBe("1+");
    expect(
      totalLabel([
        buildArtifactGroup("skill", [artifact("a", NOW)], true),
        buildArtifactGroup("agent", [artifact("r", NOW, "agent")]),
      ]),
    ).toBe("2+");
  });
});
