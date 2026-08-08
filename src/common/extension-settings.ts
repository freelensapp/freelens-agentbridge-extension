export interface ExtensionSettings {
  probeTimeoutMs: number;
  editorCommand: string;
  editorUriScheme: string;
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

export const defaultExtensionSettings: ExtensionSettings = {
  probeTimeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
  editorCommand: DEFAULT_EDITOR_COMMAND,
  editorUriScheme: DEFAULT_EDITOR_URI_SCHEME,
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

export function normalizeExtensionSettings(value: unknown): ExtensionSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<
    Record<keyof ExtensionSettings, unknown>
  >;

  return {
    probeTimeoutMs: normalizeProbeTimeoutMs(raw.probeTimeoutMs),
    editorCommand: normalizeEditorCommand(raw.editorCommand),
    editorUriScheme: normalizeEditorUriScheme(raw.editorUriScheme),
  };
}
