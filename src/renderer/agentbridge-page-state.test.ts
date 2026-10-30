import { describe, expect, it } from "vitest";
import { createAgentBridgePageState, REFRESH_COALESCE_MS } from "./agentbridge-page-state";

import type { IpcChannel, IpcInvoke } from "../common/ipc-channels";
import type { StorageLike } from "./provider-selection";

interface PendingCall {
  readonly channel: IpcChannel;
  readonly args: unknown[];
  resolve(value: unknown): void;
  reject(error: unknown): void;
  settled: boolean;
}

// Every invoke stays pending until the test answers it, so each race is
// staged explicitly.
function createFakeInvoke() {
  const calls: PendingCall[] = [];
  const invoke = ((channel: IpcChannel, ...args: unknown[]) =>
    new Promise((resolve, reject) => {
      calls.push({ channel, args, resolve, reject, settled: false });
    })) as IpcInvoke;

  function pending(channel: IpcChannel): PendingCall[] {
    return calls.filter((call) => call.channel === channel && !call.settled);
  }

  function take(channel: IpcChannel, index: number): PendingCall {
    const call = pending(channel)[index];

    if (!call) throw new Error(`No pending ${channel} call at ${index}`);
    call.settled = true;
    return call;
  }

  return {
    invoke,
    calls,
    pending,
    count: (channel: IpcChannel) => calls.filter((call) => call.channel === channel).length,
    async resolve(channel: IpcChannel, value: unknown, index = 0) {
      take(channel, index).resolve(value);
      await flush();
    },
    async reject(channel: IpcChannel, error: unknown, index = 0) {
      take(channel, index).reject(error);
      await flush();
    },
  };
}

async function flush() {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const READY = { status: "ready", version: "1.2.3" };
const WORKSPACE = { workdir: "/work/cluster-a/claude", seeded: false };
const INVENTORY = { status: "ok", groups: [] };

function setup({ saved }: { saved?: Record<string, string> } = {}) {
  const ipc = createFakeInvoke();
  const storage = new MemoryStorage();
  const clock = { nowMs: 1_000_000 };

  for (const [clusterId, providerId] of Object.entries(saved ?? {})) {
    storage.setItem(`agentbridge-extension:selected-provider:${clusterId}`, providerId);
  }

  const state = createAgentBridgePageState({ invoke: ipc.invoke, storage, now: () => clock.nowMs });

  return { ipc, storage, clock, state };
}

// Drives cluster-a/claude to "ready" with its first scan landed.
async function setupReady() {
  const context = setup({ saved: { "cluster-a": "claude" } });

  context.state.setCluster("cluster-a");
  await context.ipc.resolve("check-provider", READY);
  await context.ipc.resolve("prepare-workspace", WORKSPACE);
  await context.ipc.resolve("list-provider-artifacts", INVENTORY);
  return context;
}

describe("provider selection", () => {
  it("stays idle without invoking main when the cluster has no saved provider", () => {
    const { ipc, state } = setup();

    state.setCluster("cluster-a");

    expect(state.getSnapshot()).toMatchObject({
      clusterId: "cluster-a",
      providerId: undefined,
      provider: { status: "idle" },
    });
    expect(ipc.calls).toHaveLength(0);
  });

  it("restores each cluster's saved provider", () => {
    const { state } = setup({ saved: { "cluster-a": "opencode", "cluster-b": "claude" } });

    state.setCluster("cluster-a");
    expect(state.getSnapshot().providerId).toBe("opencode");
    state.setCluster("cluster-b");
    expect(state.getSnapshot().providerId).toBe("claude");
  });

  it("persists a selection for the active cluster only", () => {
    const { storage, state } = setup();

    state.setCluster("cluster-a");
    state.selectProvider("codex");

    expect(storage.getItem("agentbridge-extension:selected-provider:cluster-a")).toBe("codex");
    expect(storage.values.size).toBe(1);
  });

  it("ignores a selection while no cluster is active", () => {
    const { ipc, state } = setup();

    state.setCluster(undefined);
    state.selectProvider("claude");

    expect(state.getSnapshot().providerId).toBeUndefined();
    expect(ipc.calls).toHaveLength(0);
  });

  it("does not restart a check when the active cluster is set again", () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    state.setCluster("cluster-a");

    expect(ipc.count("check-provider")).toBe(1);
  });

  it("ignores re-selecting the provider that is being checked", () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    state.selectProvider("claude");

    expect(ipc.count("check-provider")).toBe(1);
  });

  it("notifies subscribers with a new snapshot", () => {
    const { state } = setup();
    const snapshots: unknown[] = [];
    const unsubscribe = state.subscribe(() => snapshots.push(state.getSnapshot()));

    state.setCluster("cluster-a");
    unsubscribe();
    state.selectProvider("claude");

    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots).not.toContain(state.getSnapshot());
  });
});

describe("provider check", () => {
  it("probes, prepares the workspace, then scans it", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    expect(state.getSnapshot().provider).toEqual({ status: "loading" });
    expect(ipc.calls[0]).toMatchObject({ channel: "check-provider", args: ["claude"] });

    await ipc.resolve("check-provider", READY);
    expect(ipc.calls[1]).toMatchObject({ channel: "prepare-workspace", args: ["cluster-a", "claude"] });

    await ipc.resolve("prepare-workspace", WORKSPACE);
    expect(state.getSnapshot().provider).toEqual({ status: "ready", version: "1.2.3", workdir: WORKSPACE.workdir });
    expect(ipc.calls[2]).toMatchObject({ channel: "list-provider-artifacts", args: ["cluster-a", "claude"] });
    expect(state.getSnapshot().inventoryLoading).toBe(true);

    await ipc.resolve("list-provider-artifacts", INVENTORY);
    expect(state.getSnapshot()).toMatchObject({ inventory: INVENTORY, inventoryLoading: false });
  });

  it("neither prepares nor scans a missing provider", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "opencode" } });

    state.setCluster("cluster-a");
    await ipc.resolve("check-provider", { status: "missing", error: "not found" });

    expect(state.getSnapshot().provider).toEqual({ status: "missing", error: "not found" });
    expect(ipc.calls).toHaveLength(1);
  });

  it("reports a probe failure verbatim, without naming the provider", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    await ipc.reject("check-provider", new Error("EACCES: permission denied"));

    expect(state.getSnapshot().provider).toEqual({ status: "error", error: "EACCES: permission denied" });
  });

  it("reports a workspace preparation failure", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    await ipc.resolve("check-provider", READY);
    await ipc.reject("prepare-workspace", new Error("Forbidden path"));

    expect(state.getSnapshot().provider).toEqual({ status: "error", error: "Forbidden path" });
  });

  it("discards the previous provider's probe when the selection changes mid-check", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    state.selectProvider("opencode");
    await ipc.resolve("check-provider", READY, 0);

    expect(state.getSnapshot()).toMatchObject({ providerId: "opencode", provider: { status: "loading" } });
    expect(ipc.count("prepare-workspace")).toBe(0);

    await ipc.resolve("check-provider", { status: "missing", error: "not found" });
    expect(state.getSnapshot().provider).toEqual({ status: "missing", error: "not found" });
  });

  it("discards a workspace that lands after the cluster changed", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    await ipc.resolve("check-provider", READY);
    state.setCluster("cluster-b");
    await ipc.resolve("prepare-workspace", WORKSPACE);

    expect(state.getSnapshot()).toMatchObject({ clusterId: "cluster-b", provider: { status: "idle" } });
    expect(ipc.count("list-provider-artifacts")).toBe(0);
  });

  it("checks the provider again on retry", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    await ipc.resolve("check-provider", { status: "error", error: "version probe timed out" });
    state.retry();

    expect(state.getSnapshot().provider).toEqual({ status: "loading" });
    expect(ipc.count("check-provider")).toBe(2);
  });
});

describe("inventory scan", () => {
  it("does not scan before the provider is ready", () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    state.refreshInventory({ force: true });

    expect(ipc.count("list-provider-artifacts")).toBe(0);
  });

  it("reuses a successful scan inside the coalescing window", async () => {
    const { ipc, clock, state } = await setupReady();

    clock.nowMs += REFRESH_COALESCE_MS - 1;
    state.refreshInventory();
    expect(ipc.count("list-provider-artifacts")).toBe(1);

    clock.nowMs += 1;
    state.refreshInventory();
    expect(ipc.count("list-provider-artifacts")).toBe(2);
  });

  it("lets an explicit refresh through the coalescing window", async () => {
    const { ipc, state } = await setupReady();

    state.refreshInventory({ force: true });

    expect(ipc.count("list-provider-artifacts")).toBe(2);
  });

  // Restoring the window fires `focus` and `visibilitychange` in the same tick.
  it("starts one scan for two refreshes in the same tick", async () => {
    const { ipc, clock, state } = await setupReady();

    clock.nowMs += REFRESH_COALESCE_MS;
    state.refreshInventory();
    state.refreshInventory();

    expect(ipc.count("list-provider-artifacts")).toBe(2);
  });

  it("applies only the latest of two overlapping scans", async () => {
    const { ipc, state } = await setupReady();
    const stale = { status: "ok", groups: [{ kind: "skill", count: 1 }] };
    const fresh = { status: "ok", groups: [{ kind: "skill", count: 2 }] };

    state.refreshInventory({ force: true });
    state.refreshInventory({ force: true });
    await ipc.resolve("list-provider-artifacts", stale, 0);
    expect(state.getSnapshot()).toMatchObject({ inventory: INVENTORY, inventoryLoading: true });

    await ipc.resolve("list-provider-artifacts", fresh, 0);
    expect(state.getSnapshot()).toMatchObject({ inventory: fresh, inventoryLoading: false });
  });

  it("keeps a failed scan immediately retryable", async () => {
    const { ipc, clock, state } = await setupReady();

    clock.nowMs += REFRESH_COALESCE_MS;
    state.refreshInventory();
    await ipc.resolve("list-provider-artifacts", { status: "error", error: "Forbidden path" });
    expect(state.getSnapshot().inventory).toEqual({ status: "error", error: "Forbidden path" });

    state.refreshInventory();
    expect(ipc.count("list-provider-artifacts")).toBe(3);
  });

  it("turns a rejected scan into an error result", async () => {
    const { ipc, state } = await setupReady();

    state.refreshInventory({ force: true });
    await ipc.reject("list-provider-artifacts", "channel closed");

    expect(state.getSnapshot()).toMatchObject({
      inventory: { status: "error", error: "channel closed" },
      inventoryLoading: false,
    });
  });

  it("pins the relative-age clock to the moment a successful scan landed", async () => {
    const { ipc, clock, state } = await setupReady();
    const landedAt = clock.nowMs;

    clock.nowMs += 60_000;
    expect(state.getSnapshot().scanNowMs).toBe(landedAt);

    state.refreshInventory();
    await ipc.resolve("list-provider-artifacts", INVENTORY);
    expect(state.getSnapshot().scanNowMs).toBe(clock.nowMs);
  });

  it("drops the previous provider's inventory and in-flight scan on a new selection", async () => {
    const { ipc, state } = await setupReady();

    state.setArtifactsExpanded(true);
    state.refreshInventory({ force: true });
    state.selectProvider("opencode");
    expect(state.getSnapshot()).toMatchObject({
      inventory: undefined,
      inventoryLoading: false,
      artifactsExpanded: false,
    });

    await ipc.resolve("list-provider-artifacts", { status: "ok", groups: [{ kind: "skill", count: 9 }] });
    expect(state.getSnapshot().inventory).toBeUndefined();

    // The orphaned scan released its in-flight gate: the new provider scans as
    // soon as it is ready, inside the old coalescing window.
    await ipc.resolve("check-provider", READY);
    await ipc.resolve("prepare-workspace", { workdir: "/work/cluster-a/opencode", seeded: true });
    expect(ipc.pending("list-provider-artifacts")).toHaveLength(1);
    expect(ipc.pending("list-provider-artifacts")[0]?.args).toEqual(["cluster-a", "opencode"]);
  });
});

describe("actions", () => {
  it("reveals and opens the selected workspace", async () => {
    const { ipc, state } = await setupReady();

    const reveal = state.revealWorkspace();
    await ipc.resolve("reveal-workspace", { ok: true });
    const open = state.openInEditor();
    await ipc.resolve("open-in-editor", { ok: false, error: "no editor" });

    await expect(reveal).resolves.toEqual({ ok: true });
    await expect(open).resolves.toEqual({ ok: false, error: "no editor" });
    expect(ipc.calls.find((call) => call.channel === "reveal-workspace")?.args).toEqual(["cluster-a", "claude"]);
  });

  it("turns a rejected action into a failed result", async () => {
    const { ipc, state } = await setupReady();

    const reveal = state.revealWorkspace();
    await ipc.reject("reveal-workspace", new Error("No handler registered"));

    await expect(reveal).resolves.toEqual({ ok: false, error: "No handler registered" });
  });

  it("refuses an action without a selected provider", async () => {
    const { ipc, state } = setup();

    state.setCluster("cluster-a");

    await expect(state.reset()).resolves.toMatchObject({ ok: false });
    expect(ipc.calls).toHaveLength(0);
  });

  it("checks again and rescans after a reset, inside the coalescing window", async () => {
    const { ipc, state } = await setupReady();

    const reset = state.reset();
    await ipc.resolve("reset-provider", { ok: true });

    await expect(reset).resolves.toEqual({ ok: true });
    expect(state.getSnapshot().provider).toEqual({ status: "loading" });
    await ipc.resolve("check-provider", READY);
    await ipc.resolve("prepare-workspace", WORKSPACE);
    expect(ipc.count("list-provider-artifacts")).toBe(2);
  });

  it("never lets a scan that started before a reset land after it", async () => {
    const { ipc, state } = await setupReady();
    const preReset = { status: "ok", groups: [{ kind: "skill", count: 5 }] };

    state.refreshInventory({ force: true });
    const reset = state.reset();
    await ipc.resolve("reset-provider", { ok: true });
    await reset;
    await ipc.resolve("list-provider-artifacts", preReset);

    expect(state.getSnapshot().inventory).toEqual(INVENTORY);
    await ipc.resolve("check-provider", READY);
    await ipc.resolve("prepare-workspace", WORKSPACE);
    expect(ipc.pending("list-provider-artifacts")).toHaveLength(1);
  });

  it("leaves the provider alone when a reset fails", async () => {
    const { ipc, state } = await setupReady();

    const reset = state.reset();
    await ipc.resolve("reset-provider", { ok: false, error: "Forbidden path" });

    await expect(reset).resolves.toEqual({ ok: false, error: "Forbidden path" });
    expect(state.getSnapshot().provider).toMatchObject({ status: "ready" });
    expect(ipc.count("check-provider")).toBe(1);
  });

  it("does not re-check the old selection when it changed during a reset", async () => {
    const { ipc, state } = await setupReady();

    const reset = state.reset();
    state.selectProvider("opencode");
    await ipc.resolve("reset-provider", { ok: true });
    await reset;

    expect(ipc.count("check-provider")).toBe(2);
    expect(ipc.pending("check-provider")[0]?.args).toEqual(["opencode"]);
  });
});

describe("dispose", () => {
  it("drops every in-flight result and starts over on the next setCluster", async () => {
    const { ipc, state } = setup({ saved: { "cluster-a": "claude" } });

    state.setCluster("cluster-a");
    state.dispose();
    await ipc.resolve("check-provider", READY);

    expect(state.getSnapshot().provider).toEqual({ status: "idle" });
    expect(ipc.count("prepare-workspace")).toBe(0);

    state.setCluster("cluster-a");
    expect(ipc.count("check-provider")).toBe(2);
  });
});
