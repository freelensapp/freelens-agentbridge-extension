import { Main } from "@freelensapp/extensions";
import { app, shell } from "electron";
import { ipcChannels } from "../common/ipc-channels";
import { checkProvider } from "./check-provider";
import { readExtensionSettings, writeExtensionSettings } from "./extension-settings-store";
import { listProviderArtifacts } from "./harness-artifacts";
import { openWorkspaceInEditor } from "./open-in-editor";
import {
  prepareProviderWorkspace,
  readProviderFile,
  resetProvider,
  revealProviderWorkspace,
  writeProviderFile,
} from "./provider-files";

// The host prefixes every channel with one derived from the extension's id and
// removes the handlers when the extension is deactivated, so a reload under
// `pnpm dev` replaces them rather than colliding with the previous build's.
export class AgentBridgeMainIpc extends Main.Ipc {}

// Workspaces and settings stay under Electron's userData, where the v1 releases
// kept them, so an upgrade finds the files a user already edited.
const userData = () => app.getPath("userData");

export default class AgentBridgeMainExtension extends Main.LensExtension {
  onActivate() {
    const ipc = AgentBridgeMainIpc.createInstance(this);

    ipc.handle(ipcChannels.checkProvider, (_event, providerId: string) =>
      checkProvider(providerId, undefined, readExtensionSettings(userData()).probeTimeoutMs),
    );
    ipc.handle(ipcChannels.prepareWorkspace, (_event, clusterId: string, providerId: string) =>
      prepareProviderWorkspace(userData(), clusterId, providerId),
    );
    ipc.handle(ipcChannels.readProviderFile, (_event, clusterId: string, providerId: string, relativePath: string) =>
      readProviderFile(userData(), clusterId, providerId, relativePath),
    );
    ipc.handle(
      ipcChannels.writeProviderFile,
      (_event, clusterId: string, providerId: string, relativePath: string, content: string) =>
        writeProviderFile(userData(), clusterId, providerId, relativePath, content),
    );
    ipc.handle(ipcChannels.revealWorkspace, (_event, clusterId: string, providerId: string) =>
      revealProviderWorkspace(userData(), clusterId, providerId, shell.openPath),
    );
    ipc.handle(ipcChannels.openInEditor, (_event, clusterId: string, providerId: string) => {
      const settings = readExtensionSettings(userData());
      return openWorkspaceInEditor(userData(), clusterId, providerId, {
        editorCommand: settings.editorCommand,
        editorUriScheme: settings.editorUriScheme,
        openExternal: shell.openExternal,
      });
    });
    ipc.handle(ipcChannels.resetProvider, (_event, clusterId: string, providerId: string) => {
      try {
        resetProvider(userData(), clusterId, providerId);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    });
    ipc.handle(ipcChannels.getSettings, () => readExtensionSettings(userData()));
    ipc.handle(ipcChannels.setSettings, (_event, settings: unknown) => writeExtensionSettings(userData(), settings));
    // Metadata only: the scan root is always the verified workdir for this
    // cluster and provider, never a path the renderer supplies.
    ipc.handle(ipcChannels.listProviderArtifacts, (_event, clusterId: string, providerId: string) =>
      listProviderArtifacts(userData(), clusterId, providerId),
    );
  }

  onDeactivate() {
    // The host has already taken the handlers back out; dropping the singleton
    // lets a later activation of this same instance register them again.
    AgentBridgeMainIpc.resetInstance();
  }
}
