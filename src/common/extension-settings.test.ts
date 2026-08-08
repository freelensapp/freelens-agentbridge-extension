import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_COMMAND,
  DEFAULT_EDITOR_URI_SCHEME,
  DEFAULT_PROBE_TIMEOUT_MS,
  defaultExtensionSettings,
  MAX_PROBE_TIMEOUT_MS,
  MIN_PROBE_TIMEOUT_MS,
  normalizeEditorCommand,
  normalizeEditorUriScheme,
  normalizeExtensionSettings,
  normalizeProbeTimeoutMs,
} from "./extension-settings";

describe("normalizeProbeTimeoutMs", () => {
  it.each([
    ["a number in range", 20_000, 20_000],
    ["a numeric string", "8000", 8_000],
    ["a fractional number", 7_500.4, 7_500],
    ["a value below the minimum", 10, MIN_PROBE_TIMEOUT_MS],
    ["a value above the maximum", 10_000_000, MAX_PROBE_TIMEOUT_MS],
  ])("clamps %s", (_, input, expected) => {
    expect(normalizeProbeTimeoutMs(input)).toBe(expected);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a non-numeric string", "soon"],
    ["an empty string", ""],
    ["an object", {}],
  ])("falls back to the default for %s", (_, input) => {
    expect(normalizeProbeTimeoutMs(input)).toBe(DEFAULT_PROBE_TIMEOUT_MS);
  });
});

describe("normalizeEditorCommand", () => {
  it.each([
    ["a bare command", "code", "code"],
    ["a scoped variant", "code-insiders", "code-insiders"],
    ["a codium binary", "codium", "codium"],
    ["surrounding whitespace", "  cursor  ", "cursor"],
  ])("keeps %s", (_, input, expected) => {
    expect(normalizeEditorCommand(input)).toBe(expected);
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["an argument injection", "code --wait"],
    ["a path separator", "/usr/bin/code"],
    ["a shell metacharacter", "code;rm"],
    ["a non-string", 42],
    ["undefined", undefined],
  ])("falls back to the default for %s", (_, input) => {
    expect(normalizeEditorCommand(input)).toBe(DEFAULT_EDITOR_COMMAND);
  });
});

describe("normalizeEditorUriScheme", () => {
  it.each([
    ["the default scheme", "vscode", "vscode"],
    ["a fork scheme", "cursor", "cursor"],
    ["a scheme with allowed symbols", "vscode-insiders", "vscode-insiders"],
    ["surrounding whitespace", "  vscodium  ", "vscodium"],
  ])("keeps %s", (_, input, expected) => {
    expect(normalizeEditorUriScheme(input)).toBe(expected);
  });

  it.each([
    ["an empty string", ""],
    ["a leading digit", "1code"],
    ["a slash", "vscode/file"],
    ["a colon", "vscode:"],
    ["a non-string", {}],
  ])("falls back to the default for %s", (_, input) => {
    expect(normalizeEditorUriScheme(input)).toBe(DEFAULT_EDITOR_URI_SCHEME);
  });
});

describe("normalizeExtensionSettings", () => {
  it("keeps valid settings", () => {
    expect(
      normalizeExtensionSettings({ probeTimeoutMs: 30_000, editorCommand: "codium", editorUriScheme: "vscodium" }),
    ).toEqual({ probeTimeoutMs: 30_000, editorCommand: "codium", editorUriScheme: "vscodium" });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "settings"],
    ["an empty object", {}],
    ["an object with junk", { probeTimeoutMs: "junk", editorCommand: "code --wait", extra: true }],
  ])("returns defaults for %s", (_, input) => {
    expect(normalizeExtensionSettings(input)).toEqual(defaultExtensionSettings);
  });
});
