import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultExtensionSettings, MIN_PROBE_TIMEOUT_MS } from "../common/extension-settings";
import { readExtensionSettings, writeExtensionSettings } from "./extension-settings-store";

describe("extension settings store", () => {
  let userData: string;

  beforeEach(() => {
    userData = mkdtempSync(path.join(tmpdir(), "agentbridge-settings-"));
  });

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it("returns defaults when no settings file exists", () => {
    expect(readExtensionSettings(userData)).toEqual(defaultExtensionSettings);
  });

  it("returns defaults when the settings file is corrupt", () => {
    writeFileSync(path.join(userData, "agentbridge-extension-settings.json"), "{not json", "utf8");

    expect(readExtensionSettings(userData)).toEqual(defaultExtensionSettings);
  });

  it("round-trips written settings", () => {
    expect(writeExtensionSettings(userData, { probeTimeoutMs: 30_000 })).toEqual({
      ...defaultExtensionSettings,
      probeTimeoutMs: 30_000,
    });
    expect(readExtensionSettings(userData)).toEqual({ ...defaultExtensionSettings, probeTimeoutMs: 30_000 });
  });

  it("normalizes settings before writing", () => {
    expect(writeExtensionSettings(userData, { probeTimeoutMs: 1 })).toEqual({
      ...defaultExtensionSettings,
      probeTimeoutMs: MIN_PROBE_TIMEOUT_MS,
    });

    const stored = JSON.parse(readFileSync(path.join(userData, "agentbridge-extension-settings.json"), "utf8"));

    expect(stored).toEqual({ ...defaultExtensionSettings, probeTimeoutMs: MIN_PROBE_TIMEOUT_MS });
  });

  it("merges partial updates over stored settings", () => {
    writeExtensionSettings(userData, { editorCommand: "codium" });
    writeExtensionSettings(userData, { probeTimeoutMs: 12_000 });

    expect(readExtensionSettings(userData)).toEqual({
      ...defaultExtensionSettings,
      editorCommand: "codium",
      probeTimeoutMs: 12_000,
    });
  });

  it("creates the user data directory when missing", () => {
    const nested = path.join(userData, "nested");

    expect(writeExtensionSettings(nested, { probeTimeoutMs: 12_000 })).toEqual({
      ...defaultExtensionSettings,
      probeTimeoutMs: 12_000,
    });
    expect(readExtensionSettings(nested)).toEqual({ ...defaultExtensionSettings, probeTimeoutMs: 12_000 });
  });
});
