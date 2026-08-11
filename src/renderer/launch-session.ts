import { getLaunchCommand } from "./get-launch-command";

export interface TerminalApiLike {
  isReady?: boolean;
}

export interface LaunchSessionDeps {
  createTerminalTab(options: { title: string }): { id: string };
  getTerminalApi(tabId: string): TerminalApiLike | undefined;
  sendCommand(command: string, options: { tabId: string; enter: boolean }): void;
}

export interface LaunchSessionOptions {
  workdir: string;
  providerId: string;
  platform: NodeJS.Platform;
  title: string;
  readyTimeoutMs?: number;
  onSettled?: () => void;
}

// Opens a terminal tab and sends the boot command once the terminal is ready.
// The session is plain interactive; the user drives the CLI themselves.
export function launchProviderSession(deps: LaunchSessionDeps, options: LaunchSessionOptions): void {
  const tabId = deps.createTerminalTab({ title: options.title }).id;
  const bootCommand = getLaunchCommand(options.workdir, options.providerId, options.platform);
  const readyTimeoutMs = options.readyTimeoutMs ?? 15_000;
  let sent = false;
  let timeoutId: ReturnType<typeof setTimeout>;

  const send = () => {
    if (sent) return;
    sent = true;
    clearInterval(poll);
    clearTimeout(timeoutId);
    deps.sendCommand(bootCommand, { tabId, enter: true });
    options.onSettled?.();
  };

  const poll = setInterval(() => {
    if (deps.getTerminalApi(tabId)?.isReady) send();
  }, 100);

  timeoutId = setTimeout(send, readyTimeoutMs);
}
