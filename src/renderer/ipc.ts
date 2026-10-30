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

// The host types `invoke` as `Promise<any>`; the contract in `ipc-channels.ts`
// is what main's handlers are typed against, so this is the one place the
// result is trusted to match it.
export const invoke: IpcInvoke = (channel, ...args) => AgentBridgeRendererIpc.getInstance().invoke(channel, ...args);
