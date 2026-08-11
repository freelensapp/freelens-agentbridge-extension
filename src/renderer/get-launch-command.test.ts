import { describe, expect, it } from "vitest";
import { type AgentBridgeProvider, agentBridgeProviders } from "../common/agentbridge-providers";
import { buildLaunchCommand, getLaunchCommand } from "./get-launch-command";

describe("getLaunchCommand", () => {
  const posixPlatforms: NodeJS.Platform[] = [
    "aix",
    "android",
    "cygwin",
    "darwin",
    "freebsd",
    "haiku",
    "linux",
    "netbsd",
    "openbsd",
    "sunos",
  ];

  it("uses each provider executable on every POSIX platform without expanding workspace literals", () => {
    const workdir = '/tmp/$USER/`touch`/$(echo pwn)/"quote"/slash\\dir';

    for (const provider of agentBridgeProviders) {
      for (const platform of posixPlatforms) {
        expect(getLaunchCommand(workdir, provider.id, platform)).toBe(
          'cd "/tmp/\\$USER/\\`touch\\`/\\$(echo pwn)/\\"quote\\"/slash\\\\dir" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" ' +
            provider.executable,
        );
      }
    }
  });

  it("keeps Windows PowerShell workspace paths literal", () => {
    const command = getLaunchCommand("C:\\Users\\$name\\`temp\\cluster-*", "opencode", "win32");

    expect(command).toBe(
      'Set-Location -LiteralPath "C:\\Users\\`$name\\``temp\\cluster-*" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; opencode',
    );
  });

  it("appends trusted static launch arguments", () => {
    const provider: AgentBridgeProvider = {
      id: "test",
      name: "Test",
      executable: "test-cli",
      versionArgs: [],
      docsUrl: "https://example.com",
      launchArgs: ["--continue"],
      editors: [],
      resetPaths: [],
    };

    expect(buildLaunchCommand("/tmp/session", provider, "linux")).toBe(
      'cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" test-cli --continue',
    );
  });
});
