import { Renderer } from "@freelensapp/extensions";

import type { LaunchSessionDeps } from "./launch-session";

// Adapts the Freelens renderer terminal APIs to the injectable LaunchSessionDeps
// interface so launchProviderSession stays framework-agnostic and testable.
export function createRendererLaunchDeps(): LaunchSessionDeps {
  return {
    createTerminalTab: (options) => Renderer.Component.createTerminalTab(options),
    getTerminalApi: (tabId) => (Renderer.Component.terminalStore as any).getTerminalApi?.(tabId),
    sendCommand: (command, options) => {
      void Renderer.Component.terminalStore.sendCommand(command, options);
    },
  };
}
