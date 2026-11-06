// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./ipc", () => ({ invoke: () => new Promise(() => {}) }));
vi.mock("./code-editor", () => ({ CodeEditor: () => null }));

import { getAgentBridgeProvider } from "../common/agentbridge-providers";
import { buildArtifactGroup } from "../common/harness-artifacts";
import { WorkspaceExplorer } from "./workspace-explorer";

import type { HarnessArtifact, HarnessInventoryResult } from "../common/harness-artifacts";
import type { ExplorerSelection } from "./page-model";

afterEach(cleanup);

const NOW = 1_700_000_000_000;

function skill(name: string, ageMinutes: number, description?: string): HarnessArtifact {
  return {
    kind: "skill",
    name,
    description,
    path: `.pi/skills/${name}/SKILL.md`,
    mtimeMs: NOW - ageMinutes * 60_000,
    origin: "generated",
  };
}

function Explorer({
  inventory,
  providerId = "pi",
  initial = { kind: "file", path: "AGENTS.md" },
  onRescan = () => {},
}: {
  inventory: HarnessInventoryResult | undefined;
  providerId?: string;
  initial?: ExplorerSelection;
  onRescan?: () => void;
}) {
  const [selection, setSelection] = useState<ExplorerSelection | undefined>(initial);
  const provider = getAgentBridgeProvider(providerId);

  if (!provider) throw new Error(providerId);

  return (
    <WorkspaceExplorer
      clusterId="c"
      provider={provider}
      inventory={inventory}
      inventoryLoading={false}
      scanNowMs={NOW}
      onRescan={onRescan}
      selection={selection}
      onSelect={setSelection}
      onOpenInEditor={() => {}}
    />
  );
}

const nav = () => screen.getByRole("navigation");

describe("WorkspaceExplorer", () => {
  it("lists every declared file, one item each, and opens the selected one", () => {
    render(<Explorer inventory={undefined} />);

    const items = within(nav()).getAllByRole("button", { name: /Instructions|Guardrails|Settings/ });

    expect(items.map((item) => item.textContent)).toEqual([
      "InstructionsAGENTS.md",
      "Guardrailskubectl-guard.ts",
      "Settingssettings.json",
    ]);
    expect(items[0]?.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("heading", { name: "Instructions" })).toBeDefined();

    fireEvent.click(items[1] as HTMLElement);
    expect(screen.getByRole("heading", { name: "Guardrails" })).toBeDefined();
    expect(screen.getByText(/Kubernetes RBAC decide what the agent can do/)).toBeDefined();
    expect(screen.getByText(".pi/extensions/kubectl-guard.ts")).toBeDefined();

    // Pi's settings are tools and session options: no safety promise there.
    fireEvent.click(items[2] as HTMLElement);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeDefined();
    expect(screen.queryByText(/Kubernetes RBAC decide/)).toBeNull();
    expect(screen.getByText(".pi/settings.json")).toBeDefined();
  });

  it("says nothing about skills before the first scan, and never prints a zero", () => {
    render(<Explorer inventory={undefined} />);

    expect(within(nav()).getByText("Scanning the workspace…")).toBeDefined();
    expect(within(nav()).queryByText("0")).toBeNull();
  });

  it("shows a failed scan with no count, and retries it", () => {
    const onRescan = vi.fn();

    render(<Explorer inventory={{ status: "error", error: "EACCES" }} onRescan={onRescan} />);

    expect(screen.getByRole("alert").textContent).toContain("EACCES");
    expect(within(nav()).queryByText("0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRescan).toHaveBeenCalledOnce();
  });

  it("explains an empty workspace, and marks the cluster map as not built", () => {
    render(<Explorer inventory={{ status: "ok", groups: [buildArtifactGroup("skill", [])] }} />);

    expect(within(nav()).getByText(/None yet/)).toBeDefined();
    expect(within(nav()).getByText("Not built yet")).toBeDefined();
  });

  it("lists skills newest first, with a truncated count as a floor, and shows one's details", () => {
    const group = buildArtifactGroup("skill", [skill("ns-map-old", 600), skill("cluster-map-kind", 4, "Map")], true);

    render(<Explorer inventory={{ status: "ok", groups: [group] }} />);

    const skills = within(screen.getByRole("group", { name: "Skills" })).getAllByRole("button");

    expect(skills.map((item) => item.textContent)).toEqual(["cluster-map-kind4m ago", "ns-map-old10h ago"]);
    expect(within(nav()).getByText("2+")).toBeDefined();
    expect(within(nav()).getByText(/the workspace holds more/)).toBeDefined();
    expect(within(nav()).getByText("Built 4m ago")).toBeDefined();

    fireEvent.click(skills[0] as HTMLElement);
    expect(screen.getByRole("heading", { name: "cluster-map-kind" })).toBeDefined();
    expect(screen.getByText(".pi/skills/cluster-map-kind/SKILL.md")).toBeDefined();
  });

  it("shows how to run a capability in this provider's own syntax, with its seeded file", () => {
    render(
      <Explorer
        providerId="codex"
        initial={{ kind: "capability", id: "cluster-map" }}
        inventory={{ status: "ok", groups: [] }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Build a cluster map" })).toBeDefined();
    expect(screen.getByText("$build-cluster-map")).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy $build-cluster-map" })).toBeDefined();
    expect(screen.getByText(".agents/skills/build-cluster-map/SKILL.md")).toBeDefined();
  });
});
