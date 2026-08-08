import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setActiveMonacoTheme } from "../../test/freelens-extensions";
import { SectionThemeStore } from "./section-theme";

describe("SectionThemeStore.monacoTheme", () => {
  beforeEach(() => {
    setActiveMonacoTheme("vs-dark");
  });

  it("maps pref 'light' to the built-in 'vs' theme", () => {
    const store = new SectionThemeStore();
    store.setPref("light");
    expect(store.monacoTheme).toBe("vs");
  });

  it("maps pref 'dark' to the built-in 'vs-dark' theme", () => {
    const store = new SectionThemeStore();
    store.setPref("dark");
    expect(store.monacoTheme).toBe("vs-dark");
  });

  it("resolves 'auto' to 'vs' when the host theme is 'vs' (light)", () => {
    setActiveMonacoTheme("vs");
    const store = new SectionThemeStore();
    store.setPref("auto");
    expect(store.monacoTheme).toBe("vs");
  });

  it("resolves 'auto' to 'vs-dark' when the host theme is anything else", () => {
    setActiveMonacoTheme("clouds-midnight");
    const store = new SectionThemeStore();
    store.setPref("auto");
    expect(store.monacoTheme).toBe("vs-dark");
  });

  it("defaults to 'auto' when constructed", () => {
    setActiveMonacoTheme("vs");
    const store = new SectionThemeStore();
    expect(store.pref).toBe("auto");
    expect(store.monacoTheme).toBe("vs");
  });
});

const STORAGE_KEY = "agentbridge-extension:section-theme";

// A minimal in-memory localStorage stand-in for the `node` test environment.
function installFakeStorage(): Record<string, string> {
  const backing: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = String(v);
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
  };
  return backing;
}

describe("SectionThemeStore persistence", () => {
  beforeEach(() => {
    setActiveMonacoTheme("vs-dark");
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
  });

  it("writes the pref to localStorage on setPref", () => {
    const backing = installFakeStorage();
    const store = new SectionThemeStore();
    store.setPref("dark");
    expect(backing[STORAGE_KEY]).toBe("dark");
  });

  it("reads a saved pref at construction", () => {
    const backing = installFakeStorage();
    backing[STORAGE_KEY] = "light";
    const store = new SectionThemeStore();
    expect(store.pref).toBe("light");
  });

  it("falls back to 'auto' for an invalid saved value", () => {
    const backing = installFakeStorage();
    backing[STORAGE_KEY] = "banana";
    const store = new SectionThemeStore();
    expect(store.pref).toBe("auto");
  });

  it("falls back to 'auto' when localStorage.getItem throws", () => {
    (globalThis as any).localStorage = {
      getItem: () => {
        throw new Error("privacy mode");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const store = new SectionThemeStore();
    expect(store.pref).toBe("auto");
  });

  it("does not throw when localStorage.setItem throws", () => {
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
    };
    const store = new SectionThemeStore();
    expect(() => store.setPref("dark")).not.toThrow();
    expect(store.pref).toBe("dark");
  });

  it("defaults to 'auto' when localStorage is entirely absent", () => {
    delete (globalThis as any).localStorage;
    const store = new SectionThemeStore();
    expect(store.pref).toBe("auto");
  });
});
