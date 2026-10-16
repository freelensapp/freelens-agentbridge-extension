import { getLaunchCommand } from "./get-launch-command";

import type { LaunchShell } from "./get-launch-command";

export interface LaunchSessionDeps {
  createTerminalTab(options: { title: string }): { id: string };
  sendCommand(command: string, options: { tabId: string; enter: boolean }): Promise<void>;
}

export interface LaunchSessionOptions {
  workdir: string;
  providerId: string;
  shell: LaunchShell;
  title: string;
  onSettled?: () => void;
}

// Opens a titled terminal tab and sends the boot command to it. The host's
// `sendCommand` waits for that tab's shell to be ready before it types, so the
// command is not lost to a terminal that is still starting. The session is
// plain interactive; the user drives the CLI themselves.
export async function launchProviderSession(deps: LaunchSessionDeps, options: LaunchSessionOptions): Promise<void> {
  try {
    const tabId = deps.createTerminalTab({ title: options.title }).id;
    const bootCommand = getLaunchCommand(options.workdir, options.providerId, options.shell);

    await deps.sendCommand(bootCommand, { tabId, enter: true });
  } finally {
    options.onSettled?.();
  }
}
