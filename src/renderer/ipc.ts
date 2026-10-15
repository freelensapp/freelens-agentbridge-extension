import { Renderer } from "@freelensapp/extensions";

import type { IpcInvoke } from "../common/ipc-channels";

// Reaches this extension's own main entry. The host prefixes every channel with
// one derived from the extension's id, so the names in `ipcChannels` match the
// handlers `AgentBridgeMainIpc` registers.
class AgentBridgeRendererIpc extends Renderer.Ipc {}

export function activateIpc(extension: Renderer.LensExtension): void {
  AgentBridgeRendererIpc.createInstance(extension);
}

export function deactivateIpc(): void {
  AgentBridgeRendererIpc.resetInstance();
}

export const invoke: IpcInvoke = (channel, ...args) => AgentBridgeRendererIpc.getInstance().invoke(channel, ...args);
