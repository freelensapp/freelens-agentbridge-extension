import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  defaultExtensionSettings,
  type ExtensionSettings,
  normalizeExtensionSettings,
} from "../common/extension-settings";

const SETTINGS_FILE = "agentbridge-extension-settings.json";

export function readExtensionSettings(userData: string): ExtensionSettings {
  try {
    return normalizeExtensionSettings(JSON.parse(readFileSync(path.join(userData, SETTINGS_FILE), "utf8")));
  } catch {
    return { ...defaultExtensionSettings };
  }
}

export function writeExtensionSettings(userData: string, settings: unknown): ExtensionSettings {
  // Merge partial updates over the currently stored settings so a renderer
  // component that saves only its own field does not reset the others to their
  // defaults.
  const patch = typeof settings === "object" && settings !== null ? settings : {};
  const normalized = normalizeExtensionSettings({ ...readExtensionSettings(userData), ...patch });

  mkdirSync(userData, { recursive: true });
  writeFileSync(path.join(userData, SETTINGS_FILE), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}
