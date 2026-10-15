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

export type IpcChannel = (typeof ipcChannels)[keyof typeof ipcChannels];

export type IpcInvoke = (channel: IpcChannel, ...args: unknown[]) => Promise<unknown>;
