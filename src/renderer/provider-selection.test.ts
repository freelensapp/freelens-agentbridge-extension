import { describe, expect, it, vi } from "vitest";
import { loadProvider, loadSelectedProvider, type StorageLike, saveSelectedProvider } from "./provider-selection";

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

const checkChannel = "agentbridge-extension:check-provider";
const prepareChannel = "agentbridge-extension:prepare-workspace";

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

  it("probes and prepares only selected ready provider", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ status: "ready", version: "1.2.3" })
      .mockResolvedValueOnce({ workdir: "/work/cluster-a", seeded: false });

    await expect(loadProvider("cluster-a", "claude", invoke, () => true)).resolves.toEqual({
      status: "ready",
      version: "1.2.3",
      workdir: "/work/cluster-a",
    });
    expect(invoke).toHaveBeenNthCalledWith(1, checkChannel, "claude");
    expect(invoke).toHaveBeenNthCalledWith(2, prepareChannel, "cluster-a", "claude");
  });

  it("does not prepare missing providers", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "missing", error: "not found" });

    await expect(loadProvider("cluster-a", "opencode", invoke, () => true)).resolves.toEqual({
      status: "missing",
      error: "not found",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("drops result when selection changes after probe", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "ready", version: "1.2.3" });

    await expect(loadProvider("cluster-a", "opencode", invoke, () => false)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("drops an in-flight probe result when selection changes", async () => {
    let isCurrent = true;
    let resolveCheck: (result: { status: "ready"; version: string }) => void;
    const check = new Promise<{ status: "ready"; version: string }>((resolve) => {
      resolveCheck = resolve;
    });
    const invoke = vi.fn().mockReturnValue(check);
    const result = loadProvider("cluster-a", "opencode", invoke, () => isCurrent);

    isCurrent = false;
    resolveCheck!({ status: "ready", version: "1.2.3" });

    await expect(result).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("drops result when selection changes after preparation", async () => {
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ status: "ready", version: "1.2.3" })
      .mockResolvedValueOnce({ workdir: "/work/cluster-a", seeded: false });

    await expect(loadProvider("cluster-a", "opencode", invoke, isCurrent)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("only probes newly selected provider", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ status: "missing", error: "not found" })
      .mockResolvedValueOnce({ status: "missing", error: "not found" });

    await loadProvider("cluster-a", "opencode", invoke, () => true);
    await loadProvider("cluster-a", "claude", invoke, () => true);

    expect(invoke).toHaveBeenNthCalledWith(1, checkChannel, "opencode");
    expect(invoke).toHaveBeenNthCalledWith(2, checkChannel, "claude");
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
