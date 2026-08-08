import { Main } from "@freelensapp/extensions";
import { app, ipcMain, shell } from "electron";
import { checkProvider } from "./check-provider";
import { readExtensionSettings, writeExtensionSettings } from "./extension-settings-store";
import { openWorkspaceInEditor } from "./open-in-editor";
import {
  prepareProviderWorkspace,
  readProviderFile,
  resetProvider,
  revealProviderWorkspace,
  writeProviderFile,
} from "./provider-files";

// ponytail: extension uses raw electron ipcMain directly instead of the
// Main.Ipc abstraction exported by @freelensapp/extensions. Reason: Main.Ipc
// is published as the ABSTRACT CLASS IpcMain (not an instance); its `handle`
// method is an instance method, so Main.Ipc.handle(...) does not typecheck
// against @freelensapp/extensions@1.10.2's declarations. Raw ipcMain +
// hardcoded channel prefix is the minimal working interface. Upgrade path: if
// a future Freelens release exposes a concrete per-extension IpcMain instance
// (e.g. `Main.Ipc.getInstance(...).handle(...)`), switch back to get the
// auto-prefixed channel + auto-cleanup disposers. Channel prefix below is
// unique enough to avoid collisions with other extensions.
const CHANNEL_PREFIX = "agentbridge-extension:";

export default class AgentBridgeMainExtension extends Main.LensExtension {
  async onActivate() {
    const channels = [
      "check-provider",
      "prepare-workspace",
      "read-provider-file",
      "write-provider-file",
      "reveal-workspace",
      "open-in-editor",
      "reset-provider",
      "get-settings",
      "set-settings",
    ];

    for (const channel of channels) ipcMain.removeHandler(`${CHANNEL_PREFIX}${channel}`);

    ipcMain.handle(`${CHANNEL_PREFIX}check-provider`, (_event, providerId: string) =>
      checkProvider(providerId, undefined, readExtensionSettings(app.getPath("userData")).probeTimeoutMs),
    );
    ipcMain.handle(`${CHANNEL_PREFIX}prepare-workspace`, (_event, clusterId: string, providerId: string) =>
      prepareProviderWorkspace(app.getPath("userData"), clusterId, providerId),
    );
    ipcMain.handle(
      `${CHANNEL_PREFIX}read-provider-file`,
      (_event, clusterId: string, providerId: string, relativePath: string) =>
        readProviderFile(app.getPath("userData"), clusterId, providerId, relativePath),
    );
    ipcMain.handle(
      `${CHANNEL_PREFIX}write-provider-file`,
      (_event, clusterId: string, providerId: string, relativePath: string, content: string) =>
        writeProviderFile(app.getPath("userData"), clusterId, providerId, relativePath, content),
    );
    ipcMain.handle(`${CHANNEL_PREFIX}reveal-workspace`, (_event, clusterId: string, providerId: string) =>
      revealProviderWorkspace(app.getPath("userData"), clusterId, providerId, shell.openPath),
    );
    ipcMain.handle(`${CHANNEL_PREFIX}open-in-editor`, (_event, clusterId: string, providerId: string) => {
      const settings = readExtensionSettings(app.getPath("userData"));
      return openWorkspaceInEditor(app.getPath("userData"), clusterId, providerId, {
        editorCommand: settings.editorCommand,
        editorUriScheme: settings.editorUriScheme,
        openExternal: shell.openExternal,
      });
    });
    ipcMain.handle(`${CHANNEL_PREFIX}reset-provider`, (_event, clusterId: string, providerId: string) => {
      try {
        resetProvider(app.getPath("userData"), clusterId, providerId);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    });
    ipcMain.handle(`${CHANNEL_PREFIX}get-settings`, () => readExtensionSettings(app.getPath("userData")));
    ipcMain.handle(`${CHANNEL_PREFIX}set-settings`, (_event, settings: unknown) =>
      writeExtensionSettings(app.getPath("userData"), settings),
    );
  }
}
