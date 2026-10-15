import { describe, expect, it, vi } from "vitest";
import { launchProviderSession } from "./launch-session";

import type { LaunchSessionDeps } from "./launch-session";

function createDeps(sendCommand: LaunchSessionDeps["sendCommand"] = vi.fn(async () => {})) {
  const deps: LaunchSessionDeps = {
    createTerminalTab: vi.fn(() => ({ id: "tab-1" })),
    sendCommand,
  };
  return { deps, sendCommand: vi.mocked(sendCommand) };
}

describe("launchProviderSession", () => {
  it("opens a tab with the session title and sends the boot command to it", async () => {
    const { deps, sendCommand } = createDeps();
    const onSettled = vi.fn();

    await launchProviderSession(deps, {
      workdir: "/w",
      providerId: "claude",
      shell: "posix",
      title: "Claude Code Session",
      onSettled,
    });

    expect(deps.createTerminalTab).toHaveBeenCalledWith({ title: "Claude Code Session" });
    expect(sendCommand).toHaveBeenCalledTimes(1);
    expect(sendCommand.mock.calls[0][0]).toMatch(/^cd "\/w" && .* claude/);
    expect(sendCommand.mock.calls[0][1]).toEqual({ tabId: "tab-1", enter: true });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  // The host's sendCommand resolves once the shell is ready and the command is
  // typed; the button stays busy until then.
  it("settles only after the host has sent the command", async () => {
    let finishSending!: () => void;
    const { deps } = createDeps(() => new Promise<void>((resolve) => (finishSending = resolve)));
    const onSettled = vi.fn();

    const launched = launchProviderSession(deps, {
      workdir: "/w",
      providerId: "opencode",
      shell: "posix",
      title: "session",
      onSettled,
    });

    await Promise.resolve();
    expect(onSettled).not.toHaveBeenCalled();

    finishSending();
    await launched;
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("settles when sending fails, so the button does not stay busy", async () => {
    const { deps } = createDeps(vi.fn(async () => Promise.reject(new Error("no terminal"))));
    const onSettled = vi.fn();

    await expect(
      launchProviderSession(deps, { workdir: "/w", providerId: "codex", shell: "windows", title: "s", onSettled }),
    ).rejects.toThrow("no terminal");
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
