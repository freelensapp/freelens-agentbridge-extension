import { getAgentBridgeProvider } from "../common/agentbridge-providers";

import type { AgentBridgeProvider } from "../common/agentbridge-providers";

type LaunchCommandBuilder = (workdir: string, command: string) => string;

function quoteWindowsDoubleQuotedLiteral(value: string): string {
  return value.replace(/[`"$]/g, "`$&");
}

function quotePosixDoubleQuotedLiteral(value: string): string {
  return value.replace(/["\\$`]/g, "\\$&");
}

function getWindowsLaunchCommand(workdir: string, command: string): string {
  return `Set-Location -LiteralPath "${quoteWindowsDoubleQuotedLiteral(workdir)}" -ErrorAction Stop ; $fullPath = $env:Path ; Remove-Item Env:Path -ErrorAction SilentlyContinue ; [Environment]::SetEnvironmentVariable("Path", $fullPath, "Process") ; ${command}`;
}

function getPosixLaunchCommand(workdir: string, command: string): string {
  return `cd "${quotePosixDoubleQuotedLiteral(workdir)}" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" ${command}`;
}

// The shell Freelens opens in its terminal: PowerShell on Windows, a POSIX shell
// everywhere else. The renderer has no `process.platform`; the page reads
// `Common.App.isWindows`.
export type LaunchShell = "posix" | "windows";

const launchCommandBuilders: Record<LaunchShell, LaunchCommandBuilder> = {
  posix: getPosixLaunchCommand,
  windows: getWindowsLaunchCommand,
};

// Builds the shell command that boots the provider CLI in its workspace with an
// inherited KUBECONFIG/PATH. The session is plain interactive — the user drives
// it, including running the bundled cluster-map command themselves.
export function buildLaunchCommand(workdir: string, provider: AgentBridgeProvider, shell: LaunchShell): string {
  const parts = [provider.executable, ...provider.launchArgs];

  return launchCommandBuilders[shell](workdir, parts.join(" "));
}

export function getLaunchCommand(workdir: string, providerId: string, shell: LaunchShell): string {
  return buildLaunchCommand(workdir, getAgentBridgeProvider(providerId), shell);
}
