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

export function buildLaunchCommand(workdir: string, provider: AgentBridgeProvider, platform: NodeJS.Platform): string {
  const command = [provider.executable, ...provider.launchArgs].join(" ");

  return launchCommandBuilders[platform](workdir, command);
}

export function getLaunchCommand(workdir: string, providerId: string, platform: NodeJS.Platform): string {
  return buildLaunchCommand(workdir, getAgentBridgeProvider(providerId), platform);
}
