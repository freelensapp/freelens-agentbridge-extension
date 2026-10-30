import { describe, expect, it, vi } from "vitest";
import { loadSelectedProvider, type StorageLike, saveSelectedProvider } from "./provider-selection";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly removeItem = vi.fn((key: string) => this.values.delete(key));

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("provider selection", () => {
  it("has no selection on first visit", () => {
    expect(loadSelectedProvider("cluster-a", new MemoryStorage())).toBeUndefined();
  });

  it("restores selections per cluster", () => {
    const storage = new MemoryStorage();

    saveSelectedProvider("cluster-a", "opencode", storage);
    saveSelectedProvider("cluster-b", "claude", storage);

    expect(loadSelectedProvider("cluster-a", storage)).toBe("opencode");
    expect(loadSelectedProvider("cluster-b", storage)).toBe("claude");
  });

  it("removes invalid saved providers", () => {
    const storage = new MemoryStorage();
    const key = "agentbridge-extension:selected-provider:cluster-a";

    storage.setItem(key, "removed-provider");

    expect(loadSelectedProvider("cluster-a", storage)).toBeUndefined();
    expect(storage.removeItem).toHaveBeenCalledWith(key);
  });

  it("tolerates unavailable storage", () => {
    const storage: StorageLike = {
      getItem() {
        throw new Error("unavailable");
      },
      setItem() {
        throw new Error("unavailable");
      },
      removeItem() {
        throw new Error("unavailable");
      },
    };

    expect(loadSelectedProvider("cluster-a", storage)).toBeUndefined();
    expect(() => saveSelectedProvider("cluster-a", "opencode", storage)).not.toThrow();
  });
});
