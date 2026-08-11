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
  // Optional prompt invoking a bundled command/skill. It is passed inline on the
  // launch command line (behind the provider's prompt flag), so the CLI runs it
  // as soon as it boots rather than relying on keystrokes typed into the REPL
  // after a delay — that timing-based approach dropped the command when the CLI
  // prompt was not yet accepting input.
  promptCommand?: string;
  readyTimeoutMs?: number;
  onSettled?: () => void;
}

// Opens a terminal tab and sends the boot command once the terminal is ready.
// When a prompt command is supplied it is baked into the boot command so the
// bundled command/skill runs immediately. Shared by the Agent Bridge page and
// the Namespace context-menu entry.
export function launchProviderSession(deps: LaunchSessionDeps, options: LaunchSessionOptions): void {
  const tabId = deps.createTerminalTab({ title: options.title }).id;
  const bootCommand = getLaunchCommand(options.workdir, options.providerId, options.platform, options.promptCommand);
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
