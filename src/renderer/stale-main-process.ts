import { agentBridgeProviders } from "../common/agentbridge-providers";

// Freelens re-requires the renderer entry on every window reload, but the main
// process keeps its extension instance for the life of the app: ExtensionLoader
// skips any extension already in `extensionInstances` (extension-loader.ts,
// `alreadyInit`), so `onActivate` never runs again and Node's require cache
// keeps serving the `src/main` bundle loaded at startup. Installing an update or
// rebuilding while Freelens is open therefore leaves a new renderer talking to
// an old main process. Nothing in the renderer can recover from that, so the
// only useful error is the one that names the remedy.
//
// It surfaces in two shapes, and both must be caught: a renderer that gained a
// channel since startup gets Electron's "no handler" error, and a renderer that
// gained a *provider* since startup reaches a handler that does exist but whose
// registry is older than the id it was just handed.

// The sentence every call site ends on. Shared so the two wordings cannot drift
// apart on the one detail that matters: a window reload is not the remedy.
export const FULL_RESTART_REMEDY = "Quitting and reopening Freelens is required — a window reload only updates the UI.";

// Electron's wording when `ipcRenderer.invoke` reaches a channel nobody handles.
// Matched on the stable fragment: the full string embeds the channel name.
const NO_HANDLER_PATTERN = /No handler registered/i;

// `getAgentBridgeProvider`'s throw, reached through any channel that takes a
// provider id. The main process wraps it, so this is a substring match.
const UNSUPPORTED_PROVIDER_PATTERN = /Unsupported AI CLI provider: (\S+)/;

export function isStaleMainProcessError(message: string): boolean {
  if (NO_HANDLER_PATTERN.test(message)) {
    return true;
  }

  const providerId = UNSUPPORTED_PROVIDER_PATTERN.exec(message)?.[1];

  // Only an id this renderer itself offers proves the two sides disagree about
  // the registry. Any other id — a hand-edited localStorage entry, a provider
  // dropped from a later build — is a genuine programmer error, and rewriting it
  // into a restart instruction would send the user to reboot over nothing.
  return providerId !== undefined && agentBridgeProviders.some(({ id }) => id === providerId);
}

// `remedy` is the whole replacement sentence rather than a subject fragment: the
// two call sites describe different losses ("the scanner" vs "this provider"),
// and a shared template that fits both ends up fitting neither.
export function describeStaleMainProcessError(message: string, remedy: string): string {
  return isStaleMainProcessError(message) ? remedy : message;
}
