import { spawn as realSpawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { checkProvider } from "./check-provider";
import type { ChildProcess } from "node:child_process";

type Spawn = typeof realSpawn;

interface FakeChild {
  child: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function makeFakeChild({ stdout = "", stderr = "", exitCode = 0, complete = true } = {}): FakeChild {
  const child = new EventEmitter() as ChildProcess;
  const streams = { stdout: new EventEmitter(), stderr: new EventEmitter() };
  const kill = vi.fn();

  Object.assign(child, { ...streams, kill });

  if (complete) {
    queueMicrotask(() => {
      streams.stdout.emit("data", Buffer.from(stdout));
      streams.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", exitCode);
    });
  }

  return { child, ...streams, kill };
}

describe("checkProvider", () => {
  it.each(["linux", "win32"] as const)("probes every registry provider on %s", async (platform) => {
    const spawn = vi.fn((_: string, __: readonly string[]) => makeFakeChild({ stdout: "CLI 1.2.3" }).child);

    for (const provider of agentBridgeProviders) {
      await expect(checkProvider(provider.id, spawn as unknown as Spawn, 5_000, platform)).resolves.toEqual({
        status: "ready",
        version: "1.2.3",
      });
    }

    expect(spawn.mock.calls).toEqual(
      agentBridgeProviders.map((provider) => [
        provider.executable,
        provider.versionArgs,
        { shell: platform === "win32" },
      ]),
    );
  });

  it.each([
    [
      "synchronous spawn error",
      () => {
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      },
    ],
    [
      "child error",
      () => {
        const fake = makeFakeChild({ complete: false });
        queueMicrotask(() => fake.child.emit("error", Object.assign(new Error("not found"), { code: "ENOENT" })));
        return fake.child;
      },
    ],
  ])("returns missing for ENOENT from %s", async (_, spawn) => {
    await expect(checkProvider("opencode", spawn as Spawn)).resolves.toEqual({
      status: "missing",
      error: "OpenCode not found on PATH (ENOENT)",
    });
  });

  it("reports generic child errors", async () => {
    const fake = makeFakeChild({ complete: false });
    const spawn = vi.fn(() => fake.child);

    queueMicrotask(() => fake.child.emit("error", new Error("permission denied")));

    await expect(checkProvider("opencode", spawn as Spawn)).resolves.toEqual({
      status: "error",
      error: "OpenCode probe failed: permission denied",
    });
  });

  it("returns missing for Windows command-not-found output", async () => {
    const spawn = vi.fn(
      () => makeFakeChild({ stderr: "'opencode' is not recognized as a command", exitCode: 1 }).child,
    );

    await expect(checkProvider("opencode", spawn as Spawn, 5_000, "win32")).resolves.toEqual({
      status: "missing",
      error: "OpenCode not found on PATH",
    });
  });

  it("reports Windows configuration errors containing not found", async () => {
    const spawn = vi.fn(() => makeFakeChild({ stderr: "configuration file not found", exitCode: 1 }).child);

    await expect(checkProvider("opencode", spawn as Spawn, 5_000, "win32")).resolves.toEqual({
      status: "error",
      error: "OpenCode --version exited with code 1: configuration file not found",
    });
  });

  it("reports nonzero exits with stderr", async () => {
    const spawn = vi.fn(() => makeFakeChild({ stderr: "broken install\n", exitCode: 7 }).child);

    await expect(checkProvider("opencode", spawn as Spawn)).resolves.toEqual({
      status: "error",
      error: "OpenCode --version exited with code 7: broken install",
    });
  });

  it("reports other spawn errors", async () => {
    const spawn = vi.fn(() => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    });

    await expect(checkProvider("opencode", spawn as Spawn)).resolves.toEqual({
      status: "error",
      error: "OpenCode probe failed: permission denied",
    });
  });

  it("omits separator for nonzero exits without stderr", async () => {
    const spawn = vi.fn(() => makeFakeChild({ exitCode: 7 }).child);

    await expect(checkProvider("opencode", spawn as Spawn)).resolves.toEqual({
      status: "error",
      error: "OpenCode --version exited with code 7",
    });
  });

  it("finds semver from stderr", async () => {
    const spawn = vi.fn(() => makeFakeChild({ stderr: "OpenCode v4.5.6" }).child);

    await expect(checkProvider("opencode", spawn as Spawn)).resolves.toEqual({ status: "ready", version: "4.5.6" });
  });

  it.each([
    ["non-semver output", "development ", "build", "development build"],
    ["empty output", "", "", "unknown"],
  ])("uses %s when no semver exists", async (_, stdout, stderr, version) => {
    const spawn = vi.fn(() => makeFakeChild({ stdout, stderr }).child);

    await expect(checkProvider("opencode", spawn as Spawn)).resolves.toEqual({ status: "ready", version });
  });

  it("validates provider before spawning", async () => {
    const spawn = vi.fn();

    await expect(checkProvider("unknown", spawn as Spawn)).rejects.toThrow("Unsupported AI CLI provider: unknown");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("kills probe when timeout expires", async () => {
    vi.useFakeTimers();
    const fake = makeFakeChild({ complete: false });
    const spawn = vi.fn(() => fake.child);

    fake.kill.mockImplementation(() => {
      fake.child.emit("error", Object.assign(new Error("kill failed"), { code: "EACCES" }));
      return true;
    });

    try {
      const result = checkProvider("opencode", spawn as Spawn, 123);

      await vi.advanceTimersByTimeAsync(123);
      await expect(result).resolves.toEqual({
        status: "error",
        error: "OpenCode version probe timed out after 123ms",
      });
      expect(fake.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
