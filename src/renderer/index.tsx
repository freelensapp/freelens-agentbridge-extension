import { Renderer } from "@freelensapp/extensions";
import { AgentBridgePage } from "./agentbridge-page";
import {
  EditorCommandHint,
  EditorCommandSetting,
  LaunchCommandsHint,
  LaunchCommandsSetting,
  ProbeTimeoutHint,
  ProbeTimeoutSetting,
} from "./settings-page";

const {
  Component: { Icon },
} = Renderer;

function AgentBridgeIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} material="terminal" />;
}

export default class AgentBridgeRendererExtension extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "agentbridge",
      components: { Page: () => <AgentBridgePage extension={this} /> },
    },
  ];

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
      id: "agentbridge-probe-timeout",
      title: "Freelens Agent Bridge",
      components: {
        Input: () => <ProbeTimeoutSetting />,
        Hint: () => <ProbeTimeoutHint />,
      },
    },
    {
      id: "agentbridge-editor-command",
      title: "Freelens Agent Bridge",
      components: {
        Input: () => <EditorCommandSetting />,
        Hint: () => <EditorCommandHint />,
      },
    },
    {
      id: "agentbridge-launch-commands",
      title: "Freelens Agent Bridge",
      components: {
        Input: () => <LaunchCommandsSetting />,
        Hint: () => <LaunchCommandsHint />,
      },
    },
  ];
}
