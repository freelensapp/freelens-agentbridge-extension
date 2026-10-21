import { Common, Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { agentBridgeProviders, getAgentBridgeProvider } from "../common/agentbridge-providers";
import { createAgentBridgePageState } from "./agentbridge-page-state";
import { CapabilitiesSection } from "./capabilities-section";
import { HarnessArtifactsSection, HarnessInventoryChips } from "./harness-artifacts-section";
import { summarizeInventory } from "./harness-inventory";
import { invoke } from "./ipc";
import { launchProviderSession } from "./launch-session";
import { ProviderFileEditor } from "./provider-file-editor";
import { createRendererLaunchDeps } from "./renderer-launch";

import type { AgentBridgeProviderId } from "../common/agentbridge-providers";

// Renders the page state and forwards user intent to it; the provider check,
// the inventory scan and the races between them live in agentbridge-page-state.ts.
export const AgentBridgePage = observer(function AgentBridgePage() {
  const clusterId = Renderer.Catalog.getActiveCluster()?.id;
  const [pageState] = useState(() => createAgentBridgePageState({ invoke }));
  const snapshot = useSyncExternalStore(pageState.subscribe, pageState.getSnapshot);
  const [launching, setLaunching] = useState(false);
  // Until the effect below catches up with a cluster switch, the snapshot still
  // describes the previous cluster: render nothing of it.
  const hasCurrentSelection = snapshot.clusterId === clusterId;
  const providerId = hasCurrentSelection ? snapshot.providerId : undefined;
  const provider = providerId ? getAgentBridgeProvider(providerId) : undefined;
  const { provider: state, inventory, inventoryLoading, artifactsExpanded, scanNowMs: scanNow } = snapshot;

  useEffect(() => {
    pageState.setCluster(clusterId);
  }, [clusterId]);

  useEffect(() => () => pageState.dispose(), []);

  // The agent mutates these files in a terminal tab the extension does not
  // observe, so the panel is stale the moment /build-cluster-map finishes.
  // Coming back to the page is the cheapest reliable moment to rescan.
  useEffect(() => {
    const onFocus = () => pageState.refreshInventory();
    const onVisibility = () => {
      if (document.visibilityState === "visible") pageState.refreshInventory();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function launch() {
    if (!provider || state.status !== "ready") return;
    setLaunching(true);
    launchProviderSession(createRendererLaunchDeps(), {
      workdir: state.workdir,
      providerId: provider.id,
      shell: Common.App.isWindows ? "windows" : "posix",
      title: `${provider.name} Session`,
      onSettled: () => setLaunching(false),
    }).catch((error: unknown) => {
      Renderer.Component.Notifications.error(
        `Opening the ${provider.name} session failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async function reveal() {
    const result = await pageState.revealWorkspace();

    if (!result.ok) Renderer.Component.Notifications.error(`Reveal failed: ${result.error}`);
  }

  async function openInEditor() {
    const result = await pageState.openInEditor();

    if (!result.ok) Renderer.Component.Notifications.error(`Open in editor failed: ${result.error}`);
  }

  async function reset() {
    if (!provider || state.status !== "ready") return;
    const ok = await Renderer.Component.ConfirmDialog.confirm({
      message: `Reset ${provider.name} managed paths (${provider.resetPaths.join(", ")})? This preserves instructions and unrelated files.`,
      labelOk: "Reset",
      labelCancel: "Cancel",
    });

    if (!ok) return;
    const result = await pageState.reset();

    if (!result.ok) Renderer.Component.Notifications.error(`Reset failed: ${result.error}`);
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
                    onSelect={() => pageState.setArtifactsExpanded(true)}
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
              onChange={(option: { value: AgentBridgeProviderId } | null) =>
                option && pageState.selectProvider(option.value)
              }
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
              <Renderer.Component.Button outlined label="Retry" onClick={pageState.retry} />
            </div>
          )}
          {hasCurrentSelection && state.status === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <Renderer.Component.Icon material="error_outline" />
                <span>{provider ? `${provider.name}: ${state.error}` : state.error}</span>
                <Renderer.Component.Button outlined label="Retry" onClick={pageState.retry} />
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
                onToggle={() => pageState.setArtifactsExpanded(!artifactsExpanded)}
                onRefresh={() => pageState.refreshInventory({ force: true })}
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
