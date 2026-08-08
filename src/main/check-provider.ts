import { spawn as realSpawn } from "node:child_process";
import { getAgentBridgeProvider, type ProviderCheckResult } from "../common/agentbridge-providers";
import { DEFAULT_PROBE_TIMEOUT_MS } from "../common/extension-settings";
import type { ChildProcess } from "node:child_process";

type Spawn = typeof realSpawn;

const VERSION_RE = /\d+\.\d+\.\d+/;
const WINDOWS_COMMAND_NOT_FOUND_RE = /not recognized as (?:an? )?(?:internal or external )?command/i;

export function checkProvider(
  providerId: string,
  spawn: Spawn = realSpawn,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  platform: NodeJS.Platform = process.platform,
): Promise<ProviderCheckResult> {
  let provider;

  try {
    provider = getAgentBridgeProvider(providerId);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve) => {
    let child: ChildProcess;
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    let stdout = "";
    let stderr = "";

    const settle = (result: ProviderCheckResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const spawnError = (error: unknown) => {
      const { code } = (typeof error === "object" && error ? error : {}) as NodeJS.ErrnoException;
      const message = error instanceof Error ? error.message : String(error);

      if (code === "ENOENT") {
        settle({
          status: "missing",
          error: `${provider.name} not found on PATH${code ? ` (${code})` : ""}`,
        });
        return;
      }

      settle({ status: "error", error: `${provider.name} probe failed: ${message}` });
    };

    try {
      child = spawn(provider.executable, provider.versionArgs, { shell: platform === "win32" });
    } catch (error) {
      spawnError(error);
      return;
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", spawnError);
    child.on("close", (code: number | null) => {
      const output = `${stdout}${stderr}`;

      if (code === 0) {
        settle({ status: "ready", version: output.match(VERSION_RE)?.[0] ?? (output.trim() || "unknown") });
      } else if (platform === "win32" && WINDOWS_COMMAND_NOT_FOUND_RE.test(output)) {
        settle({ status: "missing", error: `${provider.name} not found on PATH` });
      } else {
        const error = stderr.trim();

        settle({
          status: "error",
          error: `${provider.name} --version exited with code ${code}${error ? `: ${error}` : ""}`,
        });
      }
    });

    timeout = setTimeout(() => {
      settle({ status: "error", error: `${provider.name} version probe timed out after ${timeoutMs}ms` });
      child.kill();
    }, timeoutMs);
  });
}
