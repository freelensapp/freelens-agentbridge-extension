import type { PrepareWorkspaceResult, ProviderCheckResult } from "./agentbridge-providers";
import type { ExtensionSettings } from "./extension-settings";
import type { HarnessInventoryResult } from "./harness-artifacts";

// The channels the main process handles and the renderer invokes. Both sides
// go through their own `Ipc` subclass of the extension API, which prefixes every
// channel with one derived from the extension's id, so these names only have to
// be unique within this extension.
export const ipcChannels = {
  checkProvider: "check-provider",
  prepareWorkspace: "prepare-workspace",
  readProviderFile: "read-provider-file",
  writeProviderFile: "write-provider-file",
  revealWorkspace: "reveal-workspace",
  openInEditor: "open-in-editor",
  resetProvider: "reset-provider",
  getSettings: "get-settings",
  setSettings: "set-settings",
  listProviderArtifacts: "list-provider-artifacts",
} as const;

// The outcome of an action the user can retry. Main builds it at the handler
// seam instead of letting the error cross IPC as a rejection.
export type ActionResult = { ok: true } | { ok: false; error: string };

export interface ProviderFileContent {
  content: string;
  exists: boolean;
}

export interface ProviderFileWrite {
  ok: true;
  bytes: number;
}

// The one contract both processes are typed against: per channel, the
// arguments the renderer sends and the result main resolves with. A change here
// fails to compile on whichever side has not followed.
export interface IpcContract {
  "check-provider": { args: [providerId: string]; result: ProviderCheckResult };
  "prepare-workspace": { args: [clusterId: string, providerId: string]; result: PrepareWorkspaceResult };
  "read-provider-file": {
    args: [clusterId: string, providerId: string, relativePath: string];
    result: ProviderFileContent;
  };
  "write-provider-file": {
    args: [clusterId: string, providerId: string, relativePath: string, content: string];
    result: ProviderFileWrite;
  };
  "reveal-workspace": { args: [clusterId: string, providerId: string]; result: ActionResult };
  "open-in-editor": { args: [clusterId: string, providerId: string]; result: ActionResult };
  "reset-provider": { args: [clusterId: string, providerId: string]; result: ActionResult };
  "get-settings": { args: []; result: ExtensionSettings };
  // Main merges the patch over the stored settings and normalizes it, so a
  // renderer that saves only its own field does not reset the others.
  "set-settings": { args: [settings: Partial<ExtensionSettings>]; result: ExtensionSettings };
  "list-provider-artifacts": { args: [clusterId: string, providerId: string]; result: HarnessInventoryResult };
}

export type IpcChannel = keyof IpcContract;
export type IpcArgs<C extends IpcChannel> = IpcContract[C]["args"];
export type IpcResult<C extends IpcChannel> = IpcContract[C]["result"];

export type IpcInvoke = <C extends IpcChannel>(channel: C, ...args: IpcArgs<C>) => Promise<IpcResult<C>>;

// Main's side of the contract. Arguments arrive from the renderer unchecked at
// runtime, so a handler still validates them before any side effect.
export type IpcHandlers = {
  [C in IpcChannel]: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>;
};
