import { describe, expect, it } from "vitest";
import { type AgentBridgeProvider, agentBridgeProviders } from "../common/agentbridge-providers";
import { buildLaunchCommand, getDefaultProviderCommand, getLaunchCommand } from "./get-launch-command";

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
            [provider.executable, ...provider.launchArgs].join(" "),
        );
      }
    }
  });

  // Spelled out rather than derived from the registry: these flags are the only
  // thing standing between a Codex session and a read-only, network-less sandbox
  // in which kubectl cannot reach the cluster, and a joined-from-the-registry
  // assertion would follow them wherever they drifted.
  it("starts Codex with a writable, networked sandbox on POSIX and on Windows", () => {
    const codexFlags =
      "codex --sandbox workspace-write --ask-for-approval on-request -c sandbox_workspace_write.network_access=true";

    expect(getLaunchCommand("/tmp/session", "codex", "linux")).toBe(
      `cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" ${codexFlags}`,
    );
    expect(getLaunchCommand("C:\\sessions\\prod", "codex", "win32").endsWith(codexFlags)).toBe(true);
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
      artifactSources: [],
      resetPaths: [],
    };

    expect(buildLaunchCommand("/tmp/session", provider, "linux")).toBe(
      'cd "/tmp/session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" test-cli --continue',
    );
  });

  it("replaces only the provider command with a custom one, keeping the workspace and environment prefix", () => {
    expect(getLaunchCommand("/tmp/$session", "pi", "linux", "STY=agentbridge pi --tui-mode fullscreen")).toBe(
      'cd "/tmp/\\$session" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" STY=agentbridge pi --tui-mode fullscreen',
    );
    expect(getLaunchCommand("C:\\w", "pi", "win32", '$env:STY="agentbridge"; pi')).toBe(
      'Set-Location -LiteralPath "C:\\w" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; $env:STY="agentbridge"; pi',
    );
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ])("uses the registry default when the custom command is %s", (_, customCommand) => {
    for (const provider of agentBridgeProviders) {
      expect(getLaunchCommand("/w", provider.id, "linux", customCommand)).toBe(
        `cd "/w" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" ${getDefaultProviderCommand(provider)}`,
      );
    }
  });
});
