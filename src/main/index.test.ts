import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkProvider: vi.fn(),
  createIpc: vi.fn(),
  getPath: vi.fn(() => "/user-data"),
  handle: vi.fn(),
  listProviderArtifacts: vi.fn(),
  openExternal: vi.fn(),
  openPath: vi.fn(),
  openWorkspaceInEditor: vi.fn(),
  prepareProviderWorkspace: vi.fn(),
  readExtensionSettings: vi.fn(() => ({ probeTimeoutMs: 15_000, editorCommand: "code", editorUriScheme: "vscode" })),
  readProviderFile: vi.fn(),
  resetIpc: vi.fn(),
  resetProvider: vi.fn(),
  revealProviderWorkspace: vi.fn(),
  writeExtensionSettings: vi.fn((_userData: string, settings: unknown) => settings),
  writeProviderFile: vi.fn(),
}));

// The host's `Main.Ipc` is a singleton per subclass, created with the
// extension; the host prefixes the channels and removes the handlers itself.
vi.mock("@freelensapp/extensions", () => ({
  Main: {
    LensExtension: class {},
    Ipc: class {
      static createInstance(extension: unknown) {
        mocks.createIpc(extension);
        return { handle: mocks.handle };
      }

      static resetInstance() {
        mocks.resetIpc();
      }
    },
  },
}));

vi.mock("electron", () => ({
  app: { getPath: mocks.getPath },
  shell: { openPath: mocks.openPath, openExternal: mocks.openExternal },
}));

vi.mock("./check-provider", () => ({ checkProvider: mocks.checkProvider }));
vi.mock("./harness-artifacts", () => ({ listProviderArtifacts: mocks.listProviderArtifacts }));
vi.mock("./open-in-editor", () => ({ openWorkspaceInEditor: mocks.openWorkspaceInEditor }));
vi.mock("./extension-settings-store", () => ({
  readExtensionSettings: mocks.readExtensionSettings,
  writeExtensionSettings: mocks.writeExtensionSettings,
}));
vi.mock("./provider-files", () => ({
  prepareProviderWorkspace: mocks.prepareProviderWorkspace,
  readProviderFile: mocks.readProviderFile,
  resetProvider: mocks.resetProvider,
  revealProviderWorkspace: mocks.revealProviderWorkspace,
  writeProviderFile: mocks.writeProviderFile,
}));

import { ipcChannels } from "../common/ipc-channels";
import AgentBridgeMainExtension from "./index";

type Handler = (...args: unknown[]) => unknown;

function getHandler(channel: string): Handler {
  const call = mocks.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);

  if (!call) throw new Error(`Missing IPC handler: ${channel}`);
  return call[1] as Handler;
}

describe("AgentBridgeMainExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers every channel on the extension's own Ipc and forwards to the workspace bridge", async () => {
    const extension = new AgentBridgeMainExtension({} as never);

    extension.onActivate();

    expect(mocks.createIpc).toHaveBeenCalledWith(extension);
    // Unprefixed: the host derives the prefix from the extension's id.
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual([
      "check-provider",
      "prepare-workspace",
      "read-provider-file",
      "write-provider-file",
      "reveal-workspace",
      "open-in-editor",
      "reset-provider",
      "get-settings",
      "set-settings",
      "list-provider-artifacts",
    ]);
    expect(Object.values(ipcChannels).sort()).toEqual(mocks.handle.mock.calls.map(([channel]) => channel).sort());

    await getHandler(ipcChannels.checkProvider)({}, "claude");
    await getHandler(ipcChannels.prepareWorkspace)({}, "cluster-1", "claude");
    await getHandler(ipcChannels.readProviderFile)({}, "cluster-1", "claude", "CLAUDE.md");
    await getHandler(ipcChannels.writeProviderFile)({}, "cluster-1", "claude", "CLAUDE.md", "rules");
    await getHandler(ipcChannels.revealWorkspace)({}, "cluster-1", "claude");
    await getHandler(ipcChannels.openInEditor)({}, "cluster-1", "claude");
    await getHandler(ipcChannels.resetProvider)({}, "cluster-1", "claude");
    await getHandler(ipcChannels.getSettings)({});
    await getHandler(ipcChannels.setSettings)({}, { probeTimeoutMs: 30_000 });
    await getHandler(ipcChannels.listProviderArtifacts)({}, "cluster-1", "claude");

    expect(mocks.checkProvider).toHaveBeenCalledWith("claude", undefined, 15_000);
    expect(mocks.readExtensionSettings).toHaveBeenCalledWith("/user-data");
    expect(mocks.writeExtensionSettings).toHaveBeenCalledWith("/user-data", { probeTimeoutMs: 30_000 });
    expect(mocks.prepareProviderWorkspace).toHaveBeenCalledWith("/user-data", "cluster-1", "claude");
    expect(mocks.readProviderFile).toHaveBeenCalledWith("/user-data", "cluster-1", "claude", "CLAUDE.md");
    expect(mocks.writeProviderFile).toHaveBeenCalledWith("/user-data", "cluster-1", "claude", "CLAUDE.md", "rules");
    expect(mocks.revealProviderWorkspace).toHaveBeenCalledWith("/user-data", "cluster-1", "claude", mocks.openPath);
    expect(mocks.openWorkspaceInEditor).toHaveBeenCalledWith("/user-data", "cluster-1", "claude", {
      editorCommand: "code",
      editorUriScheme: "vscode",
      openExternal: mocks.openExternal,
    });
    expect(mocks.resetProvider).toHaveBeenCalledWith("/user-data", "cluster-1", "claude");
    expect(mocks.listProviderArtifacts).toHaveBeenCalledWith("/user-data", "cluster-1", "claude");
  });

  // A reload under `pnpm dev`, or disabling and enabling the extension, runs
  // onDeactivate before the next onActivate.
  it("drops its Ipc on deactivation so the next activation can create it again", () => {
    const extension = new AgentBridgeMainExtension({} as never);

    extension.onActivate();
    extension.onDeactivate();
    extension.onActivate();

    expect(mocks.resetIpc).toHaveBeenCalledTimes(1);
    expect(mocks.createIpc).toHaveBeenCalledTimes(2);
  });

  it("returns reset errors to renderer", async () => {
    mocks.resetProvider.mockImplementation(() => {
      throw new Error("Unsupported AI CLI provider: unknown");
    });
    const extension = new AgentBridgeMainExtension({} as never);

    extension.onActivate();

    await expect(getHandler(ipcChannels.resetProvider)({}, "cluster-1", "unknown")).resolves.toEqual({
      ok: false,
      error: "Unsupported AI CLI provider: unknown",
    });
  });
});
