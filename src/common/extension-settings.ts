import { agentBridgeProviders } from "./agentbridge-providers";

// Per-provider replacement for `<executable> <launchArgs>` in the boot command,
// keyed by provider id. A missing entry means the registry default.
export type LaunchCommands = Partial<Record<string, string>>;

export interface ExtensionSettings {
  probeTimeoutMs: number;
  editorCommand: string;
  editorUriScheme: string;
  launchCommands: LaunchCommands;
}

export const DEFAULT_PROBE_TIMEOUT_MS = 15_000;
export const MIN_PROBE_TIMEOUT_MS = 1_000;
export const MAX_PROBE_TIMEOUT_MS = 300_000;

export const DEFAULT_EDITOR_COMMAND = "code";
export const DEFAULT_EDITOR_URI_SCHEME = "vscode";

// Bare executable name only: no spaces, path separators, or shell metacharacters.
// The command is passed to spawn as argv[0]; this allow-list keeps it from
// smuggling extra arguments or shell syntax into the launcher.
const EDITOR_COMMAND_PATTERN = /^[a-zA-Z0-9._-]+$/;
// A valid URI scheme per RFC 3986: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ).
const EDITOR_URI_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*$/;

export const MAX_LAUNCH_COMMAND_LENGTH = 1_000;
// The launch command is typed into the user's own terminal, so shell syntax
// (aliases, wrappers, env prefixes, extra flags) is deliberately allowed.
// Control characters are not: a newline would press Enter mid-command and run
// the rest as a separate line, outside the `cd <workdir> &&` guard.
const LAUNCH_COMMAND_FORBIDDEN_PATTERN = /[\u0000-\u001f\u007f]/;

export const defaultExtensionSettings: ExtensionSettings = {
  probeTimeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
  editorCommand: DEFAULT_EDITOR_COMMAND,
  editorUriScheme: DEFAULT_EDITOR_URI_SCHEME,
  launchCommands: {},
};

export function normalizeProbeTimeoutMs(value: unknown): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    return DEFAULT_PROBE_TIMEOUT_MS;
  }

  return Math.min(MAX_PROBE_TIMEOUT_MS, Math.max(MIN_PROBE_TIMEOUT_MS, Math.round(parsed)));
}

export function normalizeEditorCommand(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_EDITOR_COMMAND;
  const trimmed = value.trim();

  return EDITOR_COMMAND_PATTERN.test(trimmed) ? trimmed : DEFAULT_EDITOR_COMMAND;
}

export function normalizeEditorUriScheme(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_EDITOR_URI_SCHEME;
  const trimmed = value.trim();

  return EDITOR_URI_SCHEME_PATTERN.test(trimmed) ? trimmed : DEFAULT_EDITOR_URI_SCHEME;
}

// Returns the trimmed command, or "" (use the default) when the value is not a
// usable single-line command.
export function normalizeLaunchCommand(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();

  if (trimmed.length > MAX_LAUNCH_COMMAND_LENGTH || LAUNCH_COMMAND_FORBIDDEN_PATTERN.test(trimmed)) return "";

  return trimmed;
}

// Keeps only known provider ids with a non-empty command, so the stored file
// never carries entries the launcher would ignore.
export function normalizeLaunchCommands(value: unknown): LaunchCommands {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const result: LaunchCommands = {};

  for (const provider of agentBridgeProviders) {
    if (!Object.hasOwn(raw, provider.id)) continue;
    const command = normalizeLaunchCommand(raw[provider.id]);
    if (command) result[provider.id] = command;
  }

  return result;
}

export function normalizeExtensionSettings(value: unknown): ExtensionSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<
    Record<keyof ExtensionSettings, unknown>
  >;

  return {
    probeTimeoutMs: normalizeProbeTimeoutMs(raw.probeTimeoutMs),
    editorCommand: normalizeEditorCommand(raw.editorCommand),
    editorUriScheme: normalizeEditorUriScheme(raw.editorUriScheme),
    launchCommands: normalizeLaunchCommands(raw.launchCommands),
  };
}
