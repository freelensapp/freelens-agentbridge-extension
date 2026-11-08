import { describe, expect, it, vi } from "vitest";
import { createProviderSelectionStore } from "./provider-selection";

import type { IpcInvoke } from "../common/ipc-channels";

describe("provider selection store", () => {
  it("loads a cluster's selection from main", async () => {
    const invoke = vi.fn(async () => "opencode") as unknown as IpcInvoke;

    await expect(createProviderSelectionStore(invoke).load("cluster-a")).resolves.toBe("opencode");
    expect(invoke).toHaveBeenCalledWith("get-selected-provider", "cluster-a");
  });

  it("has no selection when main has none", async () => {
    const invoke = vi.fn(async () => null) as unknown as IpcInvoke;

    await expect(createProviderSelectionStore(invoke).load("cluster-a")).resolves.toBeUndefined();
  });

  it("saves a cluster's selection in main", async () => {
    const invoke = vi.fn(async () => undefined) as unknown as IpcInvoke;

    await createProviderSelectionStore(invoke).save("cluster-a", "claude");

    expect(invoke).toHaveBeenCalledWith("set-selected-provider", "cluster-a", "claude");
  });

  it("tolerates main failing to load or save", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("unavailable");
    }) as unknown as IpcInvoke;
    const store = createProviderSelectionStore(invoke);

    await expect(store.load("cluster-a")).resolves.toBeUndefined();
    await expect(store.save("cluster-a", "opencode")).resolves.toBeUndefined();
  });
});
