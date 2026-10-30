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

import type { ActionResult, IpcHandlers } from "../common/ipc-channels";

// The host prefixes every channel with one derived from the extension's id and
// removes the handlers when the extension is deactivated, so a reload under
// `pnpm dev` replaces them rather than colliding with the previous build's.
export class AgentBridgeMainIpc extends Main.Ipc {}

// Workspaces and settings stay under Electron's userData, where the v1 releases
// kept them, so an upgrade finds the files a user already edited.
const userData = () => app.getPath("userData");

// Builds the `ActionResult` for an action whose failure the user can act on, so
// the error reaches the renderer as data rather than as a rejected invoke.
async function toActionResult(action: () => unknown): Promise<ActionResult> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function createHandlers(): IpcHandlers {
  return {
    "check-provider": (providerId) =>
      checkProvider(providerId, undefined, readExtensionSettings(userData()).probeTimeoutMs),
    "prepare-workspace": (clusterId, providerId) => prepareProviderWorkspace(userData(), clusterId, providerId),
    "read-provider-file": (clusterId, providerId, relativePath) =>
      readProviderFile(userData(), clusterId, providerId, relativePath),
    "write-provider-file": (clusterId, providerId, relativePath, content) =>
      writeProviderFile(userData(), clusterId, providerId, relativePath, content),
    "reveal-workspace": (clusterId, providerId) =>
      revealProviderWorkspace(userData(), clusterId, providerId, shell.openPath),
    "open-in-editor": (clusterId, providerId) => {
      const settings = readExtensionSettings(userData());
      return openWorkspaceInEditor(userData(), clusterId, providerId, {
        editorCommand: settings.editorCommand,
        editorUriScheme: settings.editorUriScheme,
        openExternal: shell.openExternal,
      });
    },
    "reset-provider": (clusterId, providerId) => toActionResult(() => resetProvider(userData(), clusterId, providerId)),
    "get-settings": () => readExtensionSettings(userData()),
    // The renderer's patch is untrusted: the store normalizes whatever arrives.
    "set-settings": (settings) => writeExtensionSettings(userData(), settings),
    // Metadata only: the scan root is always the verified workdir for this
    // cluster and provider, never a path the renderer supplies.
    "list-provider-artifacts": (clusterId, providerId) => listProviderArtifacts(userData(), clusterId, providerId),
  };
}

export default class AgentBridgeMainExtension extends Main.LensExtension {
  onActivate() {
    const ipc = AgentBridgeMainIpc.createInstance(this);
    const handlers = createHandlers();

    for (const channel of Object.values(ipcChannels)) {
      const handler = handlers[channel] as (...args: unknown[]) => unknown;

      ipc.handle(channel, (_event, ...args) => handler(...args));
    }
  }

  onDeactivate() {
    // The host has already taken the handlers back out; dropping the singleton
    // lets a later activation of this same instance register them again.
    AgentBridgeMainIpc.resetInstance();
  }
}
