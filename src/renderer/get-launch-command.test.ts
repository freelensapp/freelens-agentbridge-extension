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
      promptFlag: [],
      editors: [],
      resetPaths: [],
    };

    expect(buildLaunchCommand("/tmp/session", provider, "linux")).toBe(
      'cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" test-cli --continue',
    );
  });

  it("appends an inline prompt as a positional argument when the provider has no prompt flag", () => {
    // Claude Code seeds an interactive session from a bare positional prompt.
    expect(getLaunchCommand("/tmp/session", "claude", "linux", "/build-cluster-map prod")).toBe(
      'cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" claude "/build-cluster-map prod"',
    );
  });

  it("puts the inline prompt behind the provider prompt flag", () => {
    // OpenCode's TUI --prompt resolves slash commands; Copilot uses -p.
    expect(getLaunchCommand("/tmp/session", "opencode", "linux", "/build-cluster-map")).toBe(
      'cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" opencode --prompt "/build-cluster-map"',
    );
    expect(getLaunchCommand("/tmp/session", "copilot", "linux", "Use the build-cluster-map skill.")).toBe(
      'cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" copilot -p "Use the build-cluster-map skill."',
    );
  });

  it("escapes shell metacharacters inside the inline prompt", () => {
    expect(getLaunchCommand("/tmp/session", "claude", "linux", '/x "$(touch pwn)" `id`')).toBe(
      'cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" claude "/x \\"\\$(touch pwn)\\" \\`id\\`"',
    );
  });

  it("quotes the inline prompt for Windows PowerShell", () => {
    expect(getLaunchCommand("C:\\ws", "opencode", "win32", "/build-cluster-map $ns")).toBe(
      'Set-Location -LiteralPath "C:\\ws" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; opencode --prompt "/build-cluster-map `$ns"',
    );
  });
});
