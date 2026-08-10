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
  // Optional command typed into the running CLI once it has booted, used to
  // auto-invoke the cluster-map command/skill.
  followUpCommand?: string;
  // Delay after the boot command before the follow-up is sent, giving the CLI's
  // REPL time to accept input. Terminal readiness only signals the shell is up,
  // not that the CLI prompt is ready, so this is a best-effort delay.
  followUpDelayMs?: number;
  readyTimeoutMs?: number;
  onSettled?: () => void;
}

// Opens a terminal tab, sends the boot command once the terminal is ready, then
// optionally types a follow-up command into the running CLI. Shared by the
// Agent Bridge page and the Namespace context-menu entry.
export function launchProviderSession(deps: LaunchSessionDeps, options: LaunchSessionOptions): void {
  const tabId = deps.createTerminalTab({ title: options.title }).id;
  const bootCommand = getLaunchCommand(options.workdir, options.providerId, options.platform);
  const readyTimeoutMs = options.readyTimeoutMs ?? 15_000;
  const followUpDelayMs = options.followUpDelayMs ?? 6_000;
  let sent = false;
  let timeoutId: ReturnType<typeof setTimeout>;

  const send = () => {
    if (sent) return;
    sent = true;
    clearInterval(poll);
    clearTimeout(timeoutId);
    deps.sendCommand(bootCommand, { tabId, enter: true });
    if (options.followUpCommand) {
      const followUp = options.followUpCommand;
      setTimeout(() => deps.sendCommand(followUp, { tabId, enter: true }), followUpDelayMs);
    }
    options.onSettled?.();
  };

  const poll = setInterval(() => {
    if (deps.getTerminalApi(tabId)?.isReady) send();
  }, 100);

  timeoutId = setTimeout(send, readyTimeoutMs);
}
