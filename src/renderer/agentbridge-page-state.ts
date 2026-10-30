import { ipcChannels } from "../common/ipc-channels";
import { loadSelectedProvider, saveSelectedProvider } from "./provider-selection";

import type { AgentBridgeProviderId, ProviderCheckResult } from "../common/agentbridge-providers";
import type { HarnessInventoryResult } from "../common/harness-artifacts";
import type { ActionResult, IpcInvoke } from "../common/ipc-channels";
import type { StorageLike } from "./provider-selection";

// Everything the cluster page knows besides what it renders: the provider
// selected for the active cluster, that provider's readiness, and the workspace
// artifact inventory. React-free, so the races between them are tested in Node
// through this interface.

// Refreshes fire on selection, reset, window focus and tab visibility, so
// several can land at once; anything inside this window after a successful
// scan reuses the result.
export const REFRESH_COALESCE_MS = 2_000;

export type ProviderLoadResult =
  | { status: "ready"; version: string; workdir: string }
  | Exclude<ProviderCheckResult, { status: "ready" }>;

export type ProviderState = { status: "idle" | "loading" } | ProviderLoadResult;

export interface AgentBridgePageSnapshot {
  readonly clusterId?: string;
  readonly providerId?: AgentBridgeProviderId;
  readonly provider: ProviderState;
  // Undefined until the first scan of the current selection lands.
  readonly inventory?: HarnessInventoryResult;
  readonly inventoryLoading: boolean;
  readonly artifactsExpanded: boolean;
  // Relative ages are pinned to the moment a scan landed, so rows do not drift
  // on unrelated re-renders.
  readonly scanNowMs: number;
}

export interface AgentBridgePageStateDeps {
  readonly invoke: IpcInvoke;
  readonly storage?: StorageLike;
  readonly now?: () => number;
}

export interface AgentBridgePageState {
  getSnapshot(): AgentBridgePageSnapshot;
  subscribe(listener: () => void): () => void;
  // Follows the host's active cluster. Restores that cluster's saved provider
  // and checks it; calling it again with the same cluster is a no-op.
  setCluster(clusterId: string | undefined): void;
  selectProvider(providerId: AgentBridgeProviderId): void;
  // Checks the selected provider again.
  retry(): void;
  // A no-op unless the provider is ready. Without `force`, a scan already in
  // flight or one that succeeded within REFRESH_COALESCE_MS is reused.
  refreshInventory(options?: { force?: boolean }): void;
  setArtifactsExpanded(expanded: boolean): void;
  revealWorkspace(): Promise<ActionResult>;
  openInEditor(): Promise<ActionResult>;
  // Resets the provider's managed paths, then checks it and rescans. Ask the
  // user first: this does not confirm.
  reset(): Promise<ActionResult>;
  // Drops every in-flight result. A later setCluster starts over.
  dispose(): void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAgentBridgePageState({
  invoke,
  storage,
  now = Date.now,
}: AgentBridgePageStateDeps): AgentBridgePageState {
  let snapshot: AgentBridgePageSnapshot = {
    provider: { status: "idle" },
    inventoryLoading: false,
    artifactsExpanded: false,
    scanNowMs: now(),
  };
  let active = false;
  const listeners = new Set<() => void>();

  // Each async operation keeps its own token; a response is applied only while
  // its token is still the latest. Separate tokens, because a scan must not
  // cancel a provider check and the other way round.
  let checkToken = 0;
  let inventoryToken = 0;
  // Written when a scan starts, not when it lands: restoring the window fires
  // `focus` and `visibilitychange` in the same tick, and both would otherwise
  // reach the main process, which runs the scan synchronously.
  let scanInFlight = false;
  // Completion time of the last *successful* scan; a failure stays immediately
  // retryable.
  let lastScanAtMs: number | undefined;

  function update(patch: Partial<AgentBridgePageSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  // Orphans any in-flight scan, so its result can never land, and releases the
  // in-flight gate it would otherwise hold shut. The next scan always runs.
  function invalidateInventory() {
    inventoryToken++;
    scanInFlight = false;
    lastScanAtMs = undefined;
  }

  function select(clusterId: string | undefined, providerId: AgentBridgeProviderId | undefined) {
    invalidateInventory();
    // A fresh selection has no inventory yet: drop the previous provider's
    // numbers rather than showing them against the new one.
    update({ clusterId, providerId, inventory: undefined, inventoryLoading: false, artifactsExpanded: false });
    checkProvider();
  }

  function checkProvider() {
    const token = ++checkToken;
    const { clusterId, providerId } = snapshot;

    if (!clusterId || !providerId) {
      update({ provider: { status: "idle" } });
      return;
    }

    update({ provider: { status: "loading" } });
    void loadProvider(clusterId, providerId, () => token === checkToken).then((result) => {
      if (!result) return;
      update({ provider: result });
      // The inventory lives in the workspace, which exists only once the
      // provider is ready.
      if (result.status === "ready") refreshInventory();
    });
  }

  async function loadProvider(
    clusterId: string,
    providerId: AgentBridgeProviderId,
    isCurrent: () => boolean,
  ): Promise<ProviderLoadResult | undefined> {
    try {
      const check = await invoke(ipcChannels.checkProvider, providerId);

      if (!isCurrent()) return undefined;
      if (check.status !== "ready") return check;

      const workspace = await invoke(ipcChannels.prepareWorkspace, clusterId, providerId);

      return isCurrent() ? { status: "ready", version: check.version, workdir: workspace.workdir } : undefined;
    } catch (error) {
      // The page renders this as `${provider.name}: ${error}`, so the message
      // must not name the provider again.
      return isCurrent() ? { status: "error", error: describeError(error) } : undefined;
    }
  }

  function refreshInventory({ force = false }: { force?: boolean } = {}) {
    const { clusterId, providerId, provider } = snapshot;

    if (!active || !clusterId || !providerId || provider.status !== "ready") return;
    // The explicit Refresh/Retry buttons must never be swallowed.
    if (!force) {
      if (scanInFlight) return;
      if (lastScanAtMs !== undefined && now() - lastScanAtMs < REFRESH_COALESCE_MS) return;
    }

    const token = ++inventoryToken;

    scanInFlight = true;
    update({ inventoryLoading: true });
    void invoke(ipcChannels.listProviderArtifacts, clusterId, providerId)
      .catch((error: unknown): HarnessInventoryResult => ({ status: "error", error: describeError(error) }))
      .then((inventory) => {
        // A superseded scan leaves the spinner and the gate to its successor,
        // which owns them.
        if (token !== inventoryToken) return;
        scanInFlight = false;
        // Only a successful scan opens the coalescing window and pins the
        // relative-age clock.
        if (inventory.status === "ok") {
          lastScanAtMs = now();
          update({ inventory, inventoryLoading: false, scanNowMs: lastScanAtMs });
        } else {
          update({ inventory, inventoryLoading: false });
        }
      });
  }

  // The current selection, or undefined when there is none to act on.
  function selection(): { clusterId: string; providerId: AgentBridgeProviderId } | undefined {
    const { clusterId, providerId } = snapshot;

    return clusterId && providerId ? { clusterId, providerId } : undefined;
  }

  async function runAction(action: (clusterId: string, providerId: string) => Promise<ActionResult>) {
    const current = selection();

    if (!current) return { ok: false, error: "No provider selected" } satisfies ActionResult;
    try {
      return await action(current.clusterId, current.providerId);
    } catch (error) {
      return { ok: false, error: describeError(error) } satisfies ActionResult;
    }
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setCluster(clusterId) {
      if (active && clusterId === snapshot.clusterId) return;
      active = true;
      select(clusterId, clusterId ? loadSelectedProvider(clusterId, storage) : undefined);
    },

    selectProvider(providerId) {
      const { clusterId } = snapshot;

      if (!clusterId || (snapshot.provider.status === "loading" && providerId === snapshot.providerId)) return;
      saveSelectedProvider(clusterId, providerId, storage);
      select(clusterId, providerId);
    },

    retry: checkProvider,

    refreshInventory,

    setArtifactsExpanded(artifactsExpanded) {
      update({ artifactsExpanded });
    },

    revealWorkspace: () =>
      runAction((clusterId, providerId) => invoke(ipcChannels.revealWorkspace, clusterId, providerId)),

    openInEditor: () => runAction((clusterId, providerId) => invoke(ipcChannels.openInEditor, clusterId, providerId)),

    async reset() {
      const current = selection();
      const result = await runAction((clusterId, providerId) =>
        invoke(ipcChannels.resetProvider, clusterId, providerId),
      );
      const after = selection();

      // A selection that changed while the reset ran has already started its
      // own check and scan.
      if (!result.ok || after?.clusterId !== current?.clusterId || after?.providerId !== current?.providerId) {
        return result;
      }
      // A reset is a known mutation: it must not be swallowed by the coalescing
      // window of a scan that ran seconds ago, nor answered by one that started
      // before it.
      invalidateInventory();
      checkProvider();
      return result;
    },

    dispose() {
      active = false;
      checkToken++;
      invalidateInventory();
      update({ provider: { status: "idle" }, inventoryLoading: false });
    },
  };
}
