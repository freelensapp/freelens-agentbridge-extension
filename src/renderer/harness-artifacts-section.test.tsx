import { describe, expect, it, vi } from "vitest";
import { buildArtifactGroup } from "../common/harness-artifacts";
import { HarnessArtifactRow, HarnessArtifactsSection, HarnessInventoryChips } from "./harness-artifacts-section";
import { summarizeInventory } from "./harness-inventory";

import type { HarnessArtifact } from "../common/harness-artifacts";
import type { InventorySummary } from "./harness-inventory";

// Every export here is hook-free, so it can be invoked directly and the returned
// React element inspected without a DOM renderer (the test env is node, no RTL)
// — the same approach as capabilities-section.test.tsx. Visual layout is
// smoke-tested manually in Freelens.

const NOW = 1_700_000_000_000;

type ElementLike = { type?: unknown; props?: Record<string, unknown> };

function artifact(overrides: Partial<HarnessArtifact> = {}): HarnessArtifact {
  return {
    kind: "skill",
    name: "ns-map-default",
    description: "Map of the default namespace",
    path: ".claude/skills/ns-map-default/SKILL.md",
    mtimeMs: NOW - 4 * 60_000,
    origin: "generated",
    ...overrides,
  };
}

// Nested components (ArtifactKindGroup, HarnessArtifactRow, Icon) are hook-free
// too, so they are invoked rather than skipped. Without that, a component whose
// whole payload sits one component deep reads as empty text and assertions about
// the drill-down pass vacuously.
function renderedText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");

  const element = node as ElementLike & { props?: { children?: unknown } };

  if (typeof element.type === "function") {
    return renderedText((element.type as (props: unknown) => unknown)(element.props ?? {}));
  }

  return element.props ? renderedText(element.props.children) : "";
}

function collectElements(node: unknown, found: ElementLike[] = []): ElementLike[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, found);

    return found;
  }
  if (node === null || typeof node !== "object") return found;

  const element = node as ElementLike;

  found.push(element);

  if (typeof element.type === "function") {
    collectElements((element.type as (props: unknown) => unknown)(element.props ?? {}), found);
  } else {
    collectElements(element.props?.children, found);
  }

  return found;
}

function buttonsIn(node: unknown): Record<string, unknown>[] {
  return collectElements(node)
    .filter((element) => element.type === "button")
    .map((element) => element.props ?? {});
}

function findButton(node: unknown, match: (props: Record<string, unknown>) => boolean): Record<string, unknown> {
  const button = buttonsIn(node).find(match);

  if (!button) throw new Error("No matching button rendered");

  return button;
}

function click(props: Record<string, unknown>): void {
  (props.onClick as () => void)();
}

function elementsOfType(node: unknown, type: string): ElementLike[] {
  return collectElements(node).filter((element) => element.type === type);
}

function iconMaterialsIn(node: unknown): string[] {
  return collectElements(node)
    .filter((element) => typeof element.type === "function" && typeof element.props?.material === "string")
    .map((element) => String(element.props?.material));
}

describe("HarnessInventoryChips", () => {
  it("renders nothing when the inventory is empty", () => {
    const summary = summarizeInventory([buildArtifactGroup("skill", []), buildArtifactGroup("agent", [])], NOW);

    expect(HarnessInventoryChips({ summary, onSelect: () => {} })).toBeNull();
  });

  it("renders one chip per non-empty kind plus the newest age", () => {
    const summary = summarizeInventory(
      [buildArtifactGroup("skill", [artifact()]), buildArtifactGroup("agent", [])],
      NOW,
    );
    const text = renderedText(HarnessInventoryChips({ summary, onSelect: () => {} }));

    expect(text).toContain("1 skill");
    expect(text).not.toContain("agent");
    expect(text).toContain("4m ago");
  });

  it("renders every non-empty kind in summary order", () => {
    const summary = summarizeInventory(
      [
        buildArtifactGroup("skill", [artifact({ name: "a" }), artifact({ name: "b" })]),
        buildArtifactGroup("agent", [artifact({ name: "r", kind: "agent" })]),
      ],
      NOW,
    );
    const text = renderedText(HarnessInventoryChips({ summary, onSelect: () => {} }));

    expect(text).toContain("2 skills");
    expect(text).toContain("1 agent");
    expect(text.indexOf("2 skills")).toBeLessThan(text.indexOf("1 agent"));
  });

  it("omits the trailing age when the summary has none", () => {
    const summary: InventorySummary = {
      chips: [{ kind: "skill", label: "1 skill", count: 1, truncated: false }],
      totalCount: 1,
      ageLabel: undefined,
    };

    expect(renderedText(HarnessInventoryChips({ summary, onSelect: () => {} }))).not.toContain("updated");
  });

  it("opens the drill-down when a chip is clicked", () => {
    const onSelect = vi.fn();
    const summary = summarizeInventory([buildArtifactGroup("skill", [artifact()])], NOW);

    click(findButton(HarnessInventoryChips({ summary, onSelect }), () => true));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("HarnessArtifactRow", () => {
  it("renders the name, badge, relative age, description and path", () => {
    // The name is asserted on its own element: the default path contains the
    // name, so a text-only assertion would pass even if the name were dropped.
    const row = HarnessArtifactRow({ artifact: artifact(), nowMs: NOW });
    const text = renderedText(row);

    expect(elementsOfType(row, "strong").map((element) => element.props?.children)).toEqual(["ns-map-default"]);
    expect(text).toContain("generated");
    expect(text).toContain("4m ago");
    expect(text).toContain("Map of the default namespace");
    expect(text).toContain(".claude/skills/ns-map-default/SKILL.md");
  });

  it("renders a seeded artifact with the seeded badge and no description slot", () => {
    const described = HarnessArtifactRow({ artifact: artifact(), nowMs: NOW });
    const row = HarnessArtifactRow({ artifact: artifact({ origin: "seeded", description: undefined }), nowMs: NOW });
    const text = renderedText(row);

    expect(text).toContain("seeded");
    expect(text).not.toContain("generated");
    expect(text).not.toContain("Map of the default namespace");
    // Not merely blank: the description element is absent, so it takes no space
    // in the row's flex column.
    expect(elementsOfType(row, "span")).toHaveLength(elementsOfType(described, "span").length - 1);
  });

  it("uses the capability icon of the artifact's kind", () => {
    expect(iconMaterialsIn(HarnessArtifactRow({ artifact: artifact(), nowMs: NOW }))).toEqual(["school"]);
    expect(iconMaterialsIn(HarnessArtifactRow({ artifact: artifact({ kind: "agent" }), nowMs: NOW }))).toEqual([
      "smart_toy",
    ]);
  });

  it("formats the age against the passed nowMs, not the wall clock", () => {
    const text = renderedText(HarnessArtifactRow({ artifact: artifact(), nowMs: NOW + 3 * 60 * 60_000 }));

    expect(text).toContain("3h ago");
  });
});

describe("HarnessArtifactsSection", () => {
  const props = { loading: false, expanded: true, onToggle: () => {}, onRefresh: () => {}, nowMs: NOW };

  it("renders nothing before the first result arrives", () => {
    expect(HarnessArtifactsSection({ ...props, result: undefined })).toBeNull();
  });

  it("renders the empty state when the workspace has no artifacts", () => {
    const result = {
      status: "ok" as const,
      groups: [buildArtifactGroup("skill", []), buildArtifactGroup("agent", [])],
    };
    const text = renderedText(HarnessArtifactsSection({ ...props, result }));

    expect(text).toContain("No skills or custom agents yet");
    // A kind with no artifacts must not render its header either.
    expect(text).not.toContain("Skills");
    expect(text).not.toContain("Agents");
  });

  it("states that the personal ~/.claude is not counted", () => {
    const result = { status: "ok" as const, groups: [buildArtifactGroup("skill", [artifact()])] };
    const text = renderedText(HarnessArtifactsSection({ ...props, result }));

    expect(text).toContain("~/.claude");
    expect(text).toContain("not counted");
  });

  it("renders artifacts oldest-first under their kind label", () => {
    const result = {
      status: "ok" as const,
      groups: [
        buildArtifactGroup("skill", [
          // Paths deliberately do not echo the names, so the ordering assertion
          // is about the rendered names and not their paths.
          artifact({ name: "fresh", path: ".claude/skills/one/SKILL.md", mtimeMs: NOW - 60_000 }),
          artifact({ name: "stale", path: ".claude/skills/two/SKILL.md", mtimeMs: NOW - 3 * 24 * 60 * 60_000 }),
        ]),
      ],
    };
    const element = HarnessArtifactsSection({ ...props, result });
    const text = renderedText(element);

    expect(text).toContain("Skills");
    expect(elementsOfType(element, "strong").map((strong) => strong.props?.children)).toEqual([
      "Workspace artifacts",
      "stale",
      "fresh",
    ]);
    expect(text).toContain("3d ago");
  });

  it("renders kind groups in registry order however the result orders them", () => {
    const result = {
      status: "ok" as const,
      groups: [
        buildArtifactGroup("agent", [
          artifact({ name: "reviewer", path: ".claude/agents/reviewer.md", kind: "agent" }),
        ]),
        buildArtifactGroup("skill", [artifact()]),
      ],
    };
    const text = renderedText(HarnessArtifactsSection({ ...props, result }));

    expect(text.indexOf("Skills")).toBeLessThan(text.indexOf("Agents"));
  });

  it("omits a kind that has no artifacts", () => {
    const result = {
      status: "ok" as const,
      groups: [buildArtifactGroup("skill", [artifact()]), buildArtifactGroup("agent", [])],
    };
    const text = renderedText(HarnessArtifactsSection({ ...props, result }));

    expect(text).toContain("Skills");
    expect(text).not.toContain("Agents");
  });

  it("says the count is a floor for a truncated kind", () => {
    const result = {
      status: "ok" as const,
      groups: [buildArtifactGroup("skill", [artifact()], true)],
    };

    expect(renderedText(HarnessArtifactsSection({ ...props, result }))).toContain(
      "showing the first 1; the workspace holds more",
    );
  });

  it("shows the total across kinds in the header", () => {
    const result = {
      status: "ok" as const,
      groups: [
        buildArtifactGroup("skill", [artifact({ name: "a" }), artifact({ name: "b", path: "b" })]),
        buildArtifactGroup("agent", [artifact({ name: "r", path: "r", kind: "agent" })]),
      ],
    };
    // Collapsed, so the only number in the output is the header total.
    const text = renderedText(HarnessArtifactsSection({ ...props, result, expanded: false }));

    expect(text).toContain("Workspace artifacts");
    expect(text).toContain("3");
  });

  it("marks the header total as a floor when any kind is truncated", () => {
    // The header chip already says "2+ skills"; a bare "3" next to it would read
    // as an exact total the scan never established.
    const result = {
      status: "ok" as const,
      groups: [
        buildArtifactGroup("skill", [artifact({ name: "a" }), artifact({ name: "b", path: "b" })], true),
        buildArtifactGroup("agent", [artifact({ name: "r", path: "r", kind: "agent" })]),
      ],
    };
    const text = renderedText(HarnessArtifactsSection({ ...props, result, expanded: false }));

    expect(text).toContain("3+");
  });

  it("renders the error state with a retry control and no empty state", () => {
    const text = renderedText(
      HarnessArtifactsSection({ ...props, result: { status: "error", error: "Forbidden path" } }),
    );

    expect(text).toContain("Forbidden path");
    expect(text).toContain("Retry");
    expect(text).not.toContain("No skills or custom agents yet");
  });

  it("rescans when Retry is clicked", () => {
    const onRefresh = vi.fn();
    const element = HarnessArtifactsSection({
      ...props,
      onRefresh,
      result: { status: "error", error: "Forbidden path" },
    });

    click(findButton(element, (button) => button.children === "Retry"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("rescans when Refresh is clicked and disables it while loading", () => {
    const onRefresh = vi.fn();
    const result = { status: "ok" as const, groups: [buildArtifactGroup("skill", [artifact()])] };
    const refresh = (element: unknown) => findButton(element, (button) => button.title === "Rescan the workspace");

    click(refresh(HarnessArtifactsSection({ ...props, result, onRefresh })));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(refresh(HarnessArtifactsSection({ ...props, result, onRefresh })).disabled).toBe(false);
    expect(refresh(HarnessArtifactsSection({ ...props, result, onRefresh, loading: true })).disabled).toBe(true);
  });

  it("toggles expansion through the header button", () => {
    const onToggle = vi.fn();
    const result = { status: "ok" as const, groups: [buildArtifactGroup("skill", [artifact()])] };
    const header = (expanded: boolean) =>
      findButton(HarnessArtifactsSection({ ...props, result, expanded, onToggle }), (button) =>
        Object.hasOwn(button, "aria-expanded"),
      );

    click(header(true));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(header(true)["aria-expanded"]).toBe(true);
    expect(header(false)["aria-expanded"]).toBe(false);
  });

  it("flips the header chevron with the expanded state", () => {
    const result = { status: "ok" as const, groups: [buildArtifactGroup("skill", [])] };

    expect(iconMaterialsIn(HarnessArtifactsSection({ ...props, result }))).toContain("expand_less");
    expect(iconMaterialsIn(HarnessArtifactsSection({ ...props, result, expanded: false }))).toContain("expand_more");
  });

  it("hides the body when collapsed", () => {
    const result = { status: "ok" as const, groups: [buildArtifactGroup("skill", [artifact({ name: "hidden-row" })])] };
    const text = renderedText(HarnessArtifactsSection({ ...props, result, expanded: false }));

    expect(text).not.toContain("hidden-row");
    expect(text).not.toContain("~/.claude");
  });

  // The section is collapsed by default and force-collapsed on every
  // cluster/provider change, so the collapsed rendering IS the default rendering
  // of a failed scan. Hiding the failure there leaves "Workspace artifacts 0",
  // which reads as an authoritative empty workspace.
  it("keeps the error and Retry visible when collapsed", () => {
    const text = renderedText(
      HarnessArtifactsSection({ ...props, expanded: false, result: { status: "error", error: "Forbidden path" } }),
    );

    expect(text).toContain("Forbidden path");
    expect(text).toContain("Retry");
  });

  it("rescans from the collapsed error Retry", () => {
    const onRefresh = vi.fn();
    const element = HarnessArtifactsSection({
      ...props,
      expanded: false,
      onRefresh,
      result: { status: "error", error: "Forbidden path" },
    });

    click(findButton(element, (button) => button.children === "Retry"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows no count in the header when the scan failed", () => {
    // A failed scan knows nothing about the workspace, so any number here is a
    // fabrication — and "0" is the most damaging one.
    const element = HarnessArtifactsSection({
      ...props,
      expanded: false,
      result: { status: "error" as const, error: "Forbidden path" },
    });

    expect(renderedText(element)).not.toMatch(/\d/);
    expect(
      renderedText(HarnessArtifactsSection({ ...props, result: { status: "error", error: "Forbidden path" } })),
    ).not.toContain("0");
  });

  it("still hides the descriptive body when a failed scan is collapsed", () => {
    const text = renderedText(
      HarnessArtifactsSection({ ...props, expanded: false, result: { status: "error", error: "Forbidden path" } }),
    );

    expect(text).not.toContain("~/.claude");
  });
});
