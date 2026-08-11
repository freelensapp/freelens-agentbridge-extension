import { Renderer } from "@freelensapp/extensions";
import { describe, expect, it, vi } from "vitest";

vi.mock("./agentbridge-page", () => ({
  AgentBridgePage: () => null,
}));

vi.mock("./namespace-menu-item", () => ({
  NamespaceMapMenuItem: () => null,
}));

vi.mock("./settings-page", () => ({
  ProbeTimeoutSetting: () => null,
  ProbeTimeoutHint: () => null,
  EditorCommandSetting: () => null,
  EditorCommandHint: () => null,
}));

import AgentBridgeRendererExtension from "./index";

describe("AgentBridgeRendererExtension sidebar registration", () => {
  it("registers the Freelens Agent Bridge menu item with the terminal icon", () => {
    const extension = new AgentBridgeRendererExtension({} as never);

    expect(extension.clusterPageMenus).toHaveLength(1);

    const [menu] = extension.clusterPageMenus;

    expect(menu).toMatchObject({
      id: "agentbridge",
      title: "Freelens Agent Bridge",
      target: { pageId: "agentbridge" },
    });

    const icon = menu.components.Icon({ className: "sidebar-icon" });

    expect(icon.type).toBe(Renderer.Component.Icon);
    expect(icon.props).toMatchObject({ className: "sidebar-icon", material: "terminal" });
  });

  it("registers a Namespace kube-object menu item", () => {
    const extension = new AgentBridgeRendererExtension({} as never);

    expect(extension.kubeObjectMenuItems).toHaveLength(1);

    const [item] = extension.kubeObjectMenuItems;

    expect(item).toMatchObject({ kind: "Namespace", apiVersions: ["v1"] });
    expect(item.components.MenuItem).toBeTypeOf("function");
  });

  it("registers the probe timeout preference", () => {
    const extension = new AgentBridgeRendererExtension({} as never);

    expect(extension.appPreferences).toHaveLength(2);

    const [preference] = extension.appPreferences;

    expect(preference).toMatchObject({ id: "agentbridge-probe-timeout", title: "Freelens Agent Bridge" });
    expect(preference.components.Input).toBeTypeOf("function");
    expect(preference.components.Hint).toBeTypeOf("function");
  });

  it("registers the editor command preference", () => {
    const extension = new AgentBridgeRendererExtension({} as never);

    const preference = extension.appPreferences.find((entry) => entry.id === "agentbridge-editor-command");

    expect(preference).toMatchObject({ id: "agentbridge-editor-command", title: "Freelens Agent Bridge" });
    expect(preference?.components.Input).toBeTypeOf("function");
    expect(preference?.components.Hint).toBeTypeOf("function");
  });
});
