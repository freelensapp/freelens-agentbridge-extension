import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkProvider: vi.fn(),
  getPath: vi.fn(() => "/user-data"),
  handle: vi.fn(),
  listProviderArtifacts: vi.fn(),
  openExternal: vi.fn(),
  openPath: vi.fn(),
  openWorkspaceInEditor: vi.fn(),
  prepareProviderWorkspace: vi.fn(),
  readExtensionSettings: vi.fn(() => ({ probeTimeoutMs: 15_000, editorCommand: "code", editorUriScheme: "vscode" })),
  readProviderFile: vi.fn(),
  removeHandler: vi.fn(),
  resetProvider: vi.fn(),
  revealProviderWorkspace: vi.fn(),
  writeExtensionSettings: vi.fn((_userData: string, settings: unknown) => settings),
  writeProviderFile: vi.fn(),
}));

vi.mock("@freelensapp/extensions", () => ({
  Main: { LensExtension: class {} },
}));

vi.mock("electron", () => ({
  app: { getPath: mocks.getPath },
  ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
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

  it("registers provider-neutral handlers and replaces them on reactivation", async () => {
    const extension = new AgentBridgeMainExtension({} as never);

    await extension.onActivate();
    await extension.onActivate();

    const channels = [
      "agentbridge-extension:check-provider",
      "agentbridge-extension:prepare-workspace",
      "agentbridge-extension:read-provider-file",
      "agentbridge-extension:write-provider-file",
      "agentbridge-extension:reveal-workspace",
      "agentbridge-extension:open-in-editor",
      "agentbridge-extension:reset-provider",
      "agentbridge-extension:get-settings",
      "agentbridge-extension:set-settings",
      "agentbridge-extension:list-provider-artifacts",
    ];
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([...channels, ...channels]);
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual([...channels, ...channels]);

    await getHandler("agentbridge-extension:check-provider")({}, "claude");
    await getHandler("agentbridge-extension:prepare-workspace")({}, "cluster-1", "claude");
    await getHandler("agentbridge-extension:read-provider-file")({}, "cluster-1", "claude", "CLAUDE.md");
    await getHandler("agentbridge-extension:write-provider-file")({}, "cluster-1", "claude", "CLAUDE.md", "rules");
    await getHandler("agentbridge-extension:reveal-workspace")({}, "cluster-1", "claude");
    await getHandler("agentbridge-extension:open-in-editor")({}, "cluster-1", "claude");
    await getHandler("agentbridge-extension:reset-provider")({}, "cluster-1", "claude");
    await getHandler("agentbridge-extension:get-settings")({});
    await getHandler("agentbridge-extension:set-settings")({}, { probeTimeoutMs: 30_000 });
    await getHandler("agentbridge-extension:list-provider-artifacts")({}, "cluster-1", "claude");

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

  it("returns reset errors to renderer", async () => {
    mocks.resetProvider.mockImplementation(() => {
      throw new Error("Unsupported AI CLI provider: unknown");
    });
    const extension = new AgentBridgeMainExtension({} as never);

    await extension.onActivate();

    expect(getHandler("agentbridge-extension:reset-provider")({}, "cluster-1", "unknown")).toEqual({
      ok: false,
      error: "Unsupported AI CLI provider: unknown",
    });
  });
});
