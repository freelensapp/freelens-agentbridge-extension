import { describe, expect, it } from "vitest";
import { buildArtifactGroup } from "../common/harness-artifacts";
import {
  chipLabel,
  formatRelativeAge,
  iconForArtifactKind,
  labelForArtifactKind,
  summarizeInventory,
  totalLabel,
} from "./harness-inventory";

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

describe("iconForArtifactKind and labelForArtifactKind", () => {
  it("reuses the capability vocabulary so both panels agree", () => {
    expect(labelForArtifactKind("skill")).toBe("Skills");
    expect(labelForArtifactKind("agent")).toBe("Agents");
    expect(iconForArtifactKind("skill")).toBe("school");
    expect(iconForArtifactKind("agent")).toBe("smart_toy");
  });
});

describe("chipLabel", () => {
  it("pluralizes counts and renders truncation as a floor", () => {
    expect(chipLabel("skill", 1, false)).toBe("1 skill");
    expect(chipLabel("skill", 21, false)).toBe("21 skills");
    expect(chipLabel("agent", 2, false)).toBe("2 agents");
    expect(chipLabel("skill", 200, true)).toBe("200+ skills");
  });

  it("pluralizes a zero count and keeps the suffix off an untruncated kind", () => {
    expect(chipLabel("agent", 0, false)).toBe("0 agents");
    expect(chipLabel("agent", 1, true)).toBe("1+ agent");
    expect(chipLabel("skill", 200, false)).toBe("200 skills");
  });
});

describe("summarizeInventory", () => {
  it("omits zero-count kinds and reports the newest age across kinds", () => {
    const groups = [
      buildArtifactGroup("skill", [artifact("a", NOW - 10 * 60_000), artifact("b", NOW - 4 * 60_000)]),
      buildArtifactGroup("agent", []),
    ];

    expect(summarizeInventory(groups, NOW)).toEqual({
      chips: [{ kind: "skill", label: "2 skills", count: 2, truncated: false }],
      totalCount: 2,
      ageLabel: "4m ago",
    });
  });

  // A scan builds one group per declared artifact source, so Pi — which has no
  // sub-agents and therefore declares no agent source — produces a result with
  // the agent kind *absent* rather than present-and-zero. Every other provider
  // has always produced both, so this path had no real caller until Pi.
  it("renders a provider that declares no agent source at all", () => {
    const groups = [buildArtifactGroup("skill", [artifact("ns-map-default", NOW - 60_000)])];

    expect(summarizeInventory(groups, NOW)).toEqual({
      chips: [{ kind: "skill", label: "1 skill", count: 1, truncated: false }],
      totalCount: 1,
      ageLabel: "1m ago",
    });
    expect(totalLabel(groups)).toBe("1");
  });

  it("returns no chips and no age for a completely empty inventory", () => {
    expect(summarizeInventory([buildArtifactGroup("skill", []), buildArtifactGroup("agent", [])], NOW)).toEqual({
      chips: [],
      totalCount: 0,
      ageLabel: undefined,
    });
  });

  it("keeps registry order across kinds", () => {
    const groups = [
      buildArtifactGroup("skill", [artifact("a", NOW)]),
      buildArtifactGroup("agent", [artifact("r", NOW, "agent")]),
    ];

    expect(summarizeInventory(groups, NOW).chips.map(({ kind }) => kind)).toEqual(["skill", "agent"]);
  });

  it("reorders groups that arrive out of registry order", () => {
    // Passed agent-first: the chips must still come back skill-first, which only
    // holds if HARNESS_ARTIFACT_KIND_ORDER actually drives the order.
    const groups = [
      buildArtifactGroup("agent", [artifact("r", NOW, "agent")]),
      buildArtifactGroup("skill", [artifact("a", NOW)]),
    ];

    expect(summarizeInventory(groups, NOW).chips.map(({ kind }) => kind)).toEqual(["skill", "agent"]);
  });

  it("takes the newest mtime across kinds whichever kind holds it", () => {
    const stale = buildArtifactGroup("skill", [artifact("a", NOW - 3 * 60 * 60_000)]);
    const fresh = buildArtifactGroup("agent", [artifact("r", NOW - 2 * 60_000, "agent")]);

    expect(summarizeInventory([stale, fresh], NOW).ageLabel).toBe("2m ago");
    expect(
      summarizeInventory(
        [
          buildArtifactGroup("skill", [artifact("a", NOW - 2 * 60_000)]),
          buildArtifactGroup("agent", [artifact("r", NOW - 3 * 60 * 60_000, "agent")]),
        ],
        NOW,
      ).ageLabel,
    ).toBe("2m ago");
  });

  it("ignores an empty kind when picking the newest mtime", () => {
    const groups = [
      buildArtifactGroup("skill", []),
      buildArtifactGroup("agent", [artifact("r", NOW - 5 * 60_000, "agent")]),
    ];

    expect(summarizeInventory(groups, NOW).ageLabel).toBe("5m ago");
  });

  it("totals every kind and carries truncation into the chip", () => {
    const groups = [
      buildArtifactGroup("skill", [artifact("a", NOW), artifact("b", NOW)], true),
      buildArtifactGroup("agent", [artifact("r", NOW, "agent")]),
    ];

    expect(summarizeInventory(groups, NOW)).toEqual({
      chips: [
        { kind: "skill", label: "2+ skills", count: 2, truncated: true },
        { kind: "agent", label: "1 agent", count: 1, truncated: false },
      ],
      totalCount: 3,
      ageLabel: "just now",
    });
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
