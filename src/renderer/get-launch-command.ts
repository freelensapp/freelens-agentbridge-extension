import { getAgentBridgeProvider } from "../common/agentbridge-providers";

import type { AgentBridgeProvider } from "../common/agentbridge-providers";

type LaunchCommandBuilder = (workdir: string, command: string) => string;

function quoteWindowsDoubleQuotedLiteral(value: string): string {
  return value.replace(/[`"$]/g, "`$&");
}

function quotePosixDoubleQuotedLiteral(value: string): string {
  return value.replace(/["\\$`]/g, "\\$&");
}

// Wraps an inline prompt argument in the platform's double-quote style with the
// matching escaping, so the whole prompt (which contains spaces and, for
// slash-command providers, a leading `/`) reaches the CLI as a single argument.
function quoteInlineArg(value: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? `"${quoteWindowsDoubleQuotedLiteral(value)}"`
    : `"${quotePosixDoubleQuotedLiteral(value)}"`;
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

// Builds the shell command that boots the provider CLI. When `prompt` is set it
// is appended as an inline argument (behind the provider's `promptFlag`) so a
// bundled command/skill runs immediately, instead of being typed into the REPL
// after boot — that keystroke-after-delay approach was unreliable because the
// CLI prompt is not necessarily accepting input when the shell reports ready.
export function buildLaunchCommand(
  workdir: string,
  provider: AgentBridgeProvider,
  platform: NodeJS.Platform,
  prompt?: string,
): string {
  const parts = [provider.executable, ...provider.launchArgs];

  if (prompt && prompt.trim().length > 0) {
    parts.push(...provider.promptFlag, quoteInlineArg(prompt, platform));
  }

  return launchCommandBuilders[platform](workdir, parts.join(" "));
}

export function getLaunchCommand(
  workdir: string,
  providerId: string,
  platform: NodeJS.Platform,
  prompt?: string,
): string {
  return buildLaunchCommand(workdir, getAgentBridgeProvider(providerId), platform, prompt);
}
