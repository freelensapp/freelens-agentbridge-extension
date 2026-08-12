import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { useEffect, useRef, useState } from "react";
import { agentBridgeProviders, getAgentBridgeProvider } from "../common/agentbridge-providers";
import { CapabilitiesSection } from "./capabilities-section";
import { HarnessArtifactsSection, HarnessInventoryChips } from "./harness-artifacts-section";
import { loadHarnessInventory, opensCoalesceWindow, shouldRefresh, summarizeInventory } from "./harness-inventory";
import { launchProviderSession } from "./launch-session";
import { ProviderFileEditor } from "./provider-file-editor";
import { loadProvider, loadSelectedProvider, saveSelectedProvider } from "./provider-selection";
import { createRendererLaunchDeps } from "./renderer-launch";

import type { AgentBridgeProviderId } from "../common/agentbridge-providers";
import type { HarnessInventoryResult } from "../common/harness-artifacts";
import type { ProviderLoadResult } from "./provider-selection";

const CHANNEL_PREFIX = "agentbridge-extension:";

type PageState = { status: "idle" | "loading" } | ProviderLoadResult;

interface AgentBridgePageProps {
  extension: Renderer.LensExtension;
}

export const AgentBridgePage = observer(function AgentBridgePage({ extension: _extension }: AgentBridgePageProps) {
  const clusterId = Renderer.Catalog.getActiveCluster()?.id;
  const [selection, setSelection] = useState<{ clusterId?: string; providerId?: AgentBridgeProviderId }>(() => ({
    clusterId,
    providerId: clusterId ? loadSelectedProvider(clusterId) : undefined,
  }));
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [retry, setRetry] = useState(0);
  const [launching, setLaunching] = useState(false);
  const generation = useRef(0);
  const providerId = selection.clusterId === clusterId ? selection.providerId : undefined;
  const provider = providerId ? getAgentBridgeProvider(providerId) : undefined;
  const hasCurrentSelection = selection.clusterId === clusterId;
  const currentRequest = useRef({ clusterId, providerId });

  currentRequest.current = { clusterId, providerId };

  useEffect(() => {
    generation.current++;
    setState({ status: "idle" });
    setSelection({ clusterId, providerId: clusterId ? loadSelectedProvider(clusterId) : undefined });
    setRetry(0);
  }, [clusterId]);

  useEffect(() => {
    const request = ++generation.current;

    if (!clusterId || !providerId) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    void loadProvider(
      clusterId,
      providerId,
      ipcRenderer.invoke,
      () =>
        generation.current === request &&
        currentRequest.current.clusterId === clusterId &&
        currentRequest.current.providerId === providerId,
    ).then((result) => {
      if (result) setState(result);
    });

    return () => {
      generation.current++;
    };
  }, [clusterId, providerId, retry]);

  function selectProvider(nextProviderId: AgentBridgeProviderId) {
    if (!clusterId || (state.status === "loading" && nextProviderId === providerId)) return;
    generation.current++;
    setState({ status: "idle" });
    saveSelectedProvider(clusterId, nextProviderId);
    setSelection({ clusterId, providerId: nextProviderId });
    setRetry(0);
  }

  function retryProvider() {
    generation.current++;
    setRetry((current) => current + 1);
  }

  const [inventory, setInventory] = useState<HarnessInventoryResult | undefined>(undefined);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  // Relative ages are pinned to the moment a scan landed, so rows do not drift
  // on unrelated re-renders.
  const [scanNow, setScanNow] = useState(() => Date.now());
  const lastScanAt = useRef<number | undefined>(undefined);
  // A ref, not `inventoryLoading`: restoring the window fires `focus` and
  // `visibilitychange` in the same tick, and the state update from the first
  // handler is not visible to the second. Without this both would reach the main
  // process, which runs the scan synchronously and start to finish.
  const scanInFlight = useRef(false);
  // The inventory needs its own request counter: `generation` belongs to the
  // provider check above, and bumping it here would cancel that in-flight load.
  // The cluster/provider staleness check reuses the page's `currentRequest` ref.
  const inventoryRequest = useRef(0);

  function refreshInventory(force = false) {
    if (!clusterId || !providerId || state.status !== "ready") return;
    // A focus/visibility handler registered for an earlier selection can still
    // fire between a selection change and its effect re-subscribing. The ref is
    // always the live selection, so a stale closure becomes a no-op here rather
    // than starting a scan that would only be thrown away.
    if (currentRequest.current.clusterId !== clusterId || currentRequest.current.providerId !== providerId) return;

    if (
      !shouldRefresh({
        lastScanAtMs: lastScanAt.current,
        nowMs: Date.now(),
        scanInFlight: scanInFlight.current,
        force,
      })
    )
      return;

    const request = ++inventoryRequest.current;

    scanInFlight.current = true;
    setInventoryLoading(true);
    void loadHarnessInventory(
      clusterId,
      providerId,
      ipcRenderer.invoke,
      () =>
        inventoryRequest.current === request &&
        currentRequest.current.clusterId === clusterId &&
        currentRequest.current.providerId === providerId,
    ).then((result) => {
      // Clearing the spinner is gated on the request, not on the result: a
      // discarded stale response must not leave it spinning forever. A
      // superseded request leaves both flags to its successor, which owns them.
      if (inventoryRequest.current !== request) return;
      scanInFlight.current = false;
      setInventoryLoading(false);
      if (!result) return;
      // Only a successful scan opens the coalescing window and pins the
      // relative-age clock; a failure stays immediately retryable.
      if (opensCoalesceWindow(result)) {
        lastScanAt.current = Date.now();
        setScanNow(lastScanAt.current);
      }
      setInventory(result);
    });
  }

  // Declared before the scan effect on purpose: both react to
  // [clusterId, providerId] and React runs effects in declaration order, so this
  // reset always lands before the scan it would otherwise clobber. A fresh
  // selection has no inventory yet; drop the previous provider's numbers rather
  // than showing them against the new one.
  useEffect(() => {
    inventoryRequest.current++;
    lastScanAt.current = undefined;
    // The bump above orphans any in-flight scan, so its response will never
    // clear the flag: release it here or the new selection could never scan.
    scanInFlight.current = false;
    setInventory(undefined);
    setInventoryLoading(false);
    setArtifactsExpanded(false);
  }, [clusterId, providerId]);

  // Mount, cluster switch, provider switch, Reset (which bumps `retry`) and the
  // transition into "ready" — refreshInventory is a no-op until the provider
  // check succeeds, so `state.status` has to be a dependency. Scans stay
  // coalesced: the two moments that must always rescan (a new selection, and a
  // completed Reset) clear `lastScanAt` first, and redundant status churn within
  // the coalescing window is dropped.
  useEffect(() => {
    refreshInventory();
  }, [clusterId, providerId, retry, state.status]);

  // The agent mutates these files in a terminal tab the extension does not
  // observe, so the panel is stale the moment /build-cluster-map finishes.
  // Coming back to the page is the cheapest reliable moment to rescan.
  useEffect(() => {
    const onFocus = () => refreshInventory();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshInventory();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clusterId, providerId, state.status]);

  function launch() {
    if (!provider || state.status !== "ready") return;
    setLaunching(true);
    launchProviderSession(createRendererLaunchDeps(), {
      workdir: state.workdir,
      providerId: provider.id,
      platform: process.platform,
      title: `${provider.name} Session`,
      onSettled: () => setLaunching(false),
    });
  }

  async function reveal() {
    if (!clusterId || !provider) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reveal-workspace`, clusterId, provider.id)) as {
      ok: boolean;
      error?: string;
    };

    if (!result.ok) Renderer.Component.Notifications.error(`Reveal failed: ${result.error ?? "unknown"}`);
  }

  async function openInEditor() {
    if (!clusterId || !provider) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}open-in-editor`, clusterId, provider.id)) as {
      ok: boolean;
      error?: string;
    };

    if (!result.ok) Renderer.Component.Notifications.error(`Open in editor failed: ${result.error ?? "unknown"}`);
  }

  async function reset() {
    if (!clusterId || !provider || state.status !== "ready") return;
    const ok = await Renderer.Component.ConfirmDialog.confirm({
      message: `Reset ${provider.name} managed paths (${provider.resetPaths.join(", ")})? This preserves instructions and unrelated files.`,
      labelOk: "Reset",
      labelCancel: "Cancel",
    });

    if (!ok) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reset-provider`, clusterId, provider.id)) as {
      ok: boolean;
      error?: string;
    };

    if (!result.ok) {
      Renderer.Component.Notifications.error(`Reset failed: ${result.error ?? "unknown"}`);
      return;
    }
    // A reset is a known mutation, so it must not be swallowed by the coalescing
    // window of a scan that ran seconds ago, nor answered by a scan that started
    // before the reset: orphan that one so its pre-reset numbers cannot land and
    // hold the in-flight gate shut. retryProvider re-runs the scan effect below.
    inventoryRequest.current++;
    scanInFlight.current = false;
    lastScanAt.current = undefined;
    retryProvider();
  }

  const providerOptions = agentBridgeProviders.map((candidate) => ({ value: candidate.id, label: candidate.name }));

  return (
    <div style={{ height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      <div
        style={{
          padding: "var(--padding, 16px)",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexWrap: "wrap",
          gap: "24px",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            flex: "1 1 560px",
            minWidth: "min(100%, 560px)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <Renderer.Component.SubTitle title={provider ? `${provider.name} Session` : "Freelens Agent Bridge"}>
            {hasCurrentSelection && state.status === "ready" && (
              <>
                <Renderer.Component.StatusBrick className="running" /> {provider?.name} v{state.version}
                {inventory?.status === "ok" && (
                  <HarnessInventoryChips
                    summary={summarizeInventory(inventory.groups, scanNow)}
                    onSelect={() => setArtifactsExpanded(true)}
                  />
                )}
              </>
            )}
            {hasCurrentSelection && state.status === "loading" && (
              <>
                <Renderer.Component.StatusBrick className="waiting" /> Checking {provider?.name}...
              </>
            )}
            {hasCurrentSelection && (state.status === "missing" || state.status === "error") && (
              <Renderer.Component.StatusBrick className="failed" />
            )}
          </Renderer.Component.SubTitle>

          <p style={{ margin: 0 }}>Select an AI CLI for this cluster. Provider workspaces are isolated per cluster.</p>
          <div style={{ maxWidth: "420px", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <Renderer.Component.Select
              id="agentbridge-provider-select"
              themeName="lens"
              placeholder="Select an AI CLI provider..."
              isDisabled={!clusterId}
              options={providerOptions}
              value={providerId ?? null}
              onChange={(option: { value: AgentBridgeProviderId } | null) => option && selectProvider(option.value)}
            />
            <p style={{ margin: 0, fontSize: "0.85em", opacity: 0.7 }}>
              CLI permissions are convenience guardrails. Kubernetes RBAC and kubeconfig permissions remain the security
              boundary.
            </p>
          </div>

          {!clusterId && <p style={{ margin: 0 }}>No active cluster. Open a cluster first.</p>}
          {hasCurrentSelection && state.status === "missing" && provider && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <Renderer.Component.Icon material="error_outline" />
              <span>{provider.name} not found on PATH</span>
              <Renderer.Component.Button plain href={provider.docsUrl} target="_blank">
                {provider.name} docs
              </Renderer.Component.Button>
              {state.error && <span>{state.error}</span>}
              <Renderer.Component.Button outlined label="Retry" onClick={retryProvider} />
            </div>
          )}
          {hasCurrentSelection && state.status === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <Renderer.Component.Icon material="error_outline" />
                <span>{provider ? `${provider.name}: ${state.error}` : state.error}</span>
                <Renderer.Component.Button outlined label="Retry" onClick={retryProvider} />
              </div>
              {state.error.includes("timed out") && (
                <p style={{ margin: 0 }}>
                  You can increase the version probe timeout under Preferences, in the Extensions tab.
                </p>
              )}
            </div>
          )}
          {hasCurrentSelection && state.status === "ready" && provider && clusterId && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Renderer.Component.Button
                    primary
                    label={`Open ${provider.name} session`}
                    onClick={launch}
                    disabled={launching}
                    waiting={launching}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
                  <Renderer.Component.Button outlined label="Reveal workdir" onClick={() => void reveal()} />
                  <Renderer.Component.Button outlined onClick={() => void openInEditor()}>
                    <Renderer.Component.Icon material="code" small />
                    Open in editor
                  </Renderer.Component.Button>
                  <Renderer.Component.Button outlined onClick={() => void reset()}>
                    <Renderer.Component.Icon material="restart_alt" small />
                    Reset
                  </Renderer.Component.Button>
                </div>
              </div>
              <HarnessArtifactsSection
                result={inventory}
                loading={inventoryLoading}
                expanded={artifactsExpanded}
                onToggle={() => setArtifactsExpanded((value) => !value)}
                onRefresh={() => refreshInventory(true)}
                nowMs={scanNow}
              />
              {provider.editors.map((editor) => (
                <ProviderFileEditor key={editor.path} clusterId={clusterId} providerId={provider.id} editor={editor} />
              ))}
            </>
          )}
        </div>

        {hasCurrentSelection && state.status === "ready" && provider && clusterId && (
          <aside
            style={{
              flex: "1 1 300px",
              minWidth: "280px",
              maxWidth: "360px",
              position: "sticky",
              top: 0,
            }}
          >
            <CapabilitiesSection providerId={provider.id} />
          </aside>
        )}
      </div>
    </div>
  );
});
