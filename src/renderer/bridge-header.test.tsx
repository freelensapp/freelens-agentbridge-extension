// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { BridgeHeader } from "./bridge-header";

afterEach(cleanup);

const CLUSTER = { name: "kind-lan-dev", colorHash: "kind-lan-dev-local" };

describe("BridgeHeader", () => {
  it("names the cluster, and its context only when it differs", () => {
    const { rerender } = render(
      <BridgeHeader cluster={CLUSTER} providers={agentBridgeProviders} onSelect={() => {}} />,
    );

    expect(screen.getByRole("heading", { name: "kind-lan-dev" })).toBeDefined();
    expect(screen.getByText("Cluster")).toBeDefined();

    rerender(
      <BridgeHeader
        cluster={{ ...CLUSTER, contextName: "admin@prod" }}
        providers={agentBridgeProviders}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Cluster · context admin@prod")).toBeDefined();
  });

  it("offers every provider as a radio named in full, with its mark", () => {
    const onSelect = vi.fn();

    const { container } = render(
      <BridgeHeader cluster={CLUSTER} providers={agentBridgeProviders} selectedId="opencode" onSelect={onSelect} />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(agentBridgeProviders.length);
    expect(screen.getByRole("radio", { name: "OpenCode" })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "OpenAI Codex CLI" })).toBeDefined();
    // One decorative mark per provider, hidden from screen readers.
    expect(container.querySelectorAll('fieldset svg[aria-hidden="true"]')).toHaveLength(agentBridgeProviders.length);

    fireEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    expect(onSelect).toHaveBeenCalledWith("claude");
  });

  it("shows the workspace once it exists, with the full path one copy away", () => {
    const workdir = "/home/u/.config/Freelens/agentbridge-sessions/6952fa4870abe023dd17/opencode";

    render(
      <BridgeHeader
        cluster={CLUSTER}
        providers={agentBridgeProviders}
        selectedId="opencode"
        onSelect={() => {}}
        workdir={workdir}
      />,
    );

    expect(screen.getByTitle(workdir).textContent).toBe("…/6952fa48…/opencode");
    expect(screen.getByRole("button", { name: "Copy the workspace path" })).toBeDefined();
  });

  it("disables the switcher without a cluster", () => {
    render(<BridgeHeader providers={agentBridgeProviders} onSelect={() => {}} />);

    expect(screen.getByRole("heading", { name: "No cluster" })).toBeDefined();
    for (const radio of screen.getAllByRole("radio")) expect(radio.matches(":disabled")).toBe(true);
  });
});
