import { Renderer } from "@freelensapp/extensions";
import { makeAutoObservable } from "mobx";

export type SectionTheme = "auto" | "dark" | "light";

const STORAGE_KEY = "agentbridge-extension:section-theme";

// Only Monaco's built-in themes are guaranteed to exist in the extension's own
// Monaco instance. The host's custom `clouds-midnight` is registered against
// the HOST Monaco instance and is unavailable here, so `auto`+dark falls back
// to the built-in `vs-dark`.
// ponytail: built-in themes only; register clouds-midnight locally only if the
// dark-shade mismatch turns out to matter.

function resolveHostMonacoTheme(): string {
  // Defensive: in unit tests the SDK stub may not fully populate Theme.
  const hostTheme = Renderer?.Theme?.activeTheme?.get?.()?.monacoTheme;
  return hostTheme === "vs" ? "vs" : "vs-dark";
}

function isSectionTheme(value: unknown): value is SectionTheme {
  return value === "auto" || value === "dark" || value === "light";
}

// ponytail: localStorage best-effort. On read/write failure (quota, privacy
// mode, absent global) we fall back to in-memory "auto" rather than crashing.
function loadPref(): SectionTheme {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isSectionTheme(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

function savePref(pref: SectionTheme): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, pref);
  } catch {
    // best-effort: keep the in-memory value, drop the persisted write.
  }
}

export class SectionThemeStore {
  pref: SectionTheme = loadPref();

  constructor() {
    makeAutoObservable(this);
  }

  get monacoTheme(): string {
    if (this.pref === "light") return "vs";
    if (this.pref === "dark") return "vs-dark";
    return resolveHostMonacoTheme();
  }

  setPref(next: SectionTheme): void {
    this.pref = next;
    savePref(next);
  }
}

export const sectionThemeStore = new SectionThemeStore();
