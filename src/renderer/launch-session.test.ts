import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchProviderSession } from "./launch-session";

import type { LaunchSessionDeps, TerminalApiLike } from "./launch-session";

function createDeps(api: TerminalApiLike | undefined) {
  const sendCommand = vi.fn();
  const deps: LaunchSessionDeps = {
    createTerminalTab: vi.fn(() => ({ id: "tab-1" })),
    getTerminalApi: vi.fn(() => api),
    sendCommand,
  };
  return { deps, sendCommand };
}

describe("launchProviderSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the boot command once the terminal is ready", () => {
    const { deps, sendCommand } = createDeps({ isReady: true });
    const onSettled = vi.fn();

    launchProviderSession(deps, {
      workdir: "/w",
      providerId: "claude",
      platform: "linux",
      title: "session",
      onSettled,
    });

    vi.advanceTimersByTime(100);

    expect(sendCommand).toHaveBeenCalledTimes(1);
    expect(sendCommand.mock.calls[0][0]).toContain("claude");
    expect(sendCommand.mock.calls[0][1]).toEqual({ tabId: "tab-1", enter: true });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("falls back to the ready timeout when the terminal never reports ready", () => {
    const { deps, sendCommand } = createDeps(undefined);

    launchProviderSession(deps, {
      workdir: "/w",
      providerId: "opencode",
      platform: "linux",
      title: "session",
      readyTimeoutMs: 5000,
    });

    vi.advanceTimersByTime(4999);
    expect(sendCommand).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it("sends the boot command only once", () => {
    const { deps, sendCommand } = createDeps({ isReady: true });

    launchProviderSession(deps, {
      workdir: "/w",
      providerId: "claude",
      platform: "linux",
      title: "session",
      readyTimeoutMs: 5000,
    });

    vi.advanceTimersByTime(10_000);

    expect(sendCommand).toHaveBeenCalledTimes(1);
  });
});
