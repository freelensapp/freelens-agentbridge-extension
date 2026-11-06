import { Renderer } from "@freelensapp/extensions";
import { describe, expect, it, vi } from "vitest";

vi.mock("./agentbridge-page", () => ({
  AgentBridgePage: () => null,
}));

vi.mock("./settings-page", () => ({
  ExtensionSettings: () => null,
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

  it("does not register any kube-object menu items", () => {
    const extension = new AgentBridgeRendererExtension({} as never);

    expect(extension.kubeObjectMenuItems).toBeUndefined();
  });

  it("registers both settings in one preferences block", () => {
    const extension = new AgentBridgeRendererExtension({} as never);

    expect(extension.appPreferences).toHaveLength(1);

    const [preference] = extension.appPreferences;

    expect(preference).toMatchObject({ id: "agentbridge-settings", title: "Freelens Agent Bridge" });
    expect(preference.components.Input).toBeTypeOf("function");
    expect(preference.components.Hint).toBeTypeOf("function");
  });
});
