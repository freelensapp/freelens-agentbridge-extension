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

const launchCommandBuilders: Record<NodeJS.Platform, LaunchCommandBuilder> = {
  aix: getPosixLaunchCommand,
  android: getPosixLaunchCommand,
  cygwin: getPosixLaunchCommand,
  darwin: getPosixLaunchCommand,
  freebsd: getPosixLaunchCommand,
  haiku: getPosixLaunchCommand,
  linux: getPosixLaunchCommand,
  netbsd: getPosixLaunchCommand,
  openbsd: getPosixLaunchCommand,
  sunos: getPosixLaunchCommand,
  win32: getWindowsLaunchCommand,
};

export function getDefaultProviderCommand(provider: AgentBridgeProvider): string {
  return [provider.executable, ...provider.launchArgs].join(" ");
}

// Builds the shell command that boots the provider CLI in its workspace with an
// inherited KUBECONFIG/PATH. The session is plain interactive — the user drives
// it, including running the bundled cluster-map command themselves.
//
// `customCommand` is the user's "Launch command" preference. It replaces only
// the `<executable> <launchArgs>` tail, verbatim: the workspace `cd` and the
// environment prefix stay, so an alias or wrapper still starts in the right
// directory against the right cluster. Blank means the registry default.
export function buildLaunchCommand(
  workdir: string,
  provider: AgentBridgeProvider,
  platform: NodeJS.Platform,
  customCommand?: string,
): string {
  const command = customCommand?.trim() || getDefaultProviderCommand(provider);

  return launchCommandBuilders[platform](workdir, command);
}

export function getLaunchCommand(
  workdir: string,
  providerId: string,
  platform: NodeJS.Platform,
  customCommand?: string,
): string {
  return buildLaunchCommand(workdir, getAgentBridgeProvider(providerId), platform, customCommand);
}
