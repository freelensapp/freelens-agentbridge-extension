import { Renderer } from "@freelensapp/extensions";
import { AgentBridgePage } from "./agentbridge-page";
import { withPageErrorBoundary } from "./components/error-boundary";
import { activateIpc, deactivateIpc } from "./ipc";
import { ExtensionSettings } from "./settings-page";

const {
  Component: { Icon },
} = Renderer;

function AgentBridgeIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} material="terminal" />;
}

export default class AgentBridgeRendererExtension extends Renderer.LensExtension {
  onActivate() {
    activateIpc(this);
  }

  onDeactivate() {
    deactivateIpc();
  }

  // The page renders inside an error boundary, so an error it throws replaces
  // the page rather than the cluster's whole main area.
  clusterPages: Renderer.LensExtension["clusterPages"] = [
    {
      id: "agentbridge",
      components: { Page: () => <AgentBridgePage /> },
    },
  ].map((registration) => withPageErrorBoundary(this, registration));

  clusterPageMenus = [
    {
      id: "agentbridge",
      title: "Freelens Agent Bridge",
      target: { pageId: "agentbridge" },
      components: { Icon: AgentBridgeIcon },
    },
  ];

  appPreferences = [
    {
      id: "agentbridge-settings",
      title: "Freelens Agent Bridge",
      components: {
        Input: () => <ExtensionSettings />,
        // Each setting carries its own hint inside the block.
        Hint: () => null,
      },
    },
  ];
}
