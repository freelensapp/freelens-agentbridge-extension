import { describe, expect, it, vi } from "vitest";
import { buildArtifactGroup } from "../common/harness-artifacts";
import {
  chipLabel,
  formatRelativeAge,
  iconForArtifactKind,
  labelForArtifactKind,
  loadHarnessInventory,
  opensCoalesceWindow,
  shouldRefresh,
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

describe("shouldRefresh", () => {
  const request = { lastScanAtMs: undefined, nowMs: NOW, scanInFlight: false, force: false };

  it("always allows the first scan", () => {
    expect(shouldRefresh(request)).toBe(true);
  });

  it("coalesces refreshes requested within two seconds of the last scan", () => {
    expect(shouldRefresh({ ...request, lastScanAtMs: NOW - 500 })).toBe(false);
    expect(shouldRefresh({ ...request, lastScanAtMs: NOW - 1_999 })).toBe(false);
    expect(shouldRefresh({ ...request, lastScanAtMs: NOW - 2_000 })).toBe(true);
    expect(shouldRefresh({ ...request, lastScanAtMs: NOW - 10_000 })).toBe(true);
  });

  it("suppresses a scan while one is already in flight", () => {
    // Restoring the window fires `focus` and `visibilitychange` in the same tick,
    // and `lastScanAt` is only written on completion, so the coalescing window
    // cannot catch the second one: both would run the main-process scan in full.
    expect(shouldRefresh({ ...request, scanInFlight: true })).toBe(false);
    expect(shouldRefresh({ ...request, lastScanAtMs: NOW - 10_000, scanInFlight: true })).toBe(false);
  });

  it("lets an explicit refresh through both gates", () => {
    expect(shouldRefresh({ ...request, force: true, scanInFlight: true })).toBe(true);
    expect(shouldRefresh({ ...request, force: true, lastScanAtMs: NOW - 500 })).toBe(true);
    expect(shouldRefresh({ ...request, force: true, lastScanAtMs: NOW - 500, scanInFlight: true })).toBe(true);
  });
});

describe("opensCoalesceWindow", () => {
  it("opens the window only for a successful scan", () => {
    expect(opensCoalesceWindow({ status: "ok", groups: [] })).toBe(true);
  });

  it("keeps a failed or discarded scan retryable", () => {
    // An error result is truthy, so a naive `if (result)` starts the window and
    // swallows the automatic retries for the next two seconds.
    expect(opensCoalesceWindow({ status: "error", error: "Forbidden path" })).toBe(false);
    expect(opensCoalesceWindow(undefined)).toBe(false);
  });
});

describe("loadHarnessInventory", () => {
  it("invokes the inventory channel with the cluster and provider", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "ok", groups: [] });

    await loadHarnessInventory("cluster-1", "claude", invoke, () => true);

    expect(invoke).toHaveBeenCalledWith("agentbridge-extension:list-provider-artifacts", "cluster-1", "claude");
  });

  it("returns the inventory when the request is still current", async () => {
    const groups = [buildArtifactGroup("skill", [artifact("a", NOW)])];
    const invoke = vi.fn().mockResolvedValue({ status: "ok", groups });

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => true)).toEqual({ status: "ok", groups });
  });

  it("discards a stale response", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "ok", groups: [] });

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => false)).toBeUndefined();
  });

  it("converts a rejected invoke into an error result", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("Forbidden path"));

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => true)).toEqual({
      status: "error",
      error: "Forbidden path",
    });
  });

  it("discards a rejection that is no longer current", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("Forbidden path"));

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => false)).toBeUndefined();
  });

  it("stringifies a non-Error rejection", async () => {
    const invoke = vi.fn().mockRejectedValue("channel closed");

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => true)).toEqual({
      status: "error",
      error: "channel closed",
    });
  });

  it("passes an error result straight through without invoking twice", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "error", error: "Forbidden path" });

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => true)).toEqual({
      status: "error",
      error: "Forbidden path",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("checks currency after the response lands, not before", async () => {
    // A guard evaluated before the await would let a selection that changed
    // mid-flight through; asserting the call count pins the order.
    let settled = false;
    const invoke = vi.fn().mockImplementation(async () => {
      settled = true;
      return { status: "ok", groups: [] };
    });

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => !settled)).toBeUndefined();
  });
});
