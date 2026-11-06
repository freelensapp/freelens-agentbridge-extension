import { Common, Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { agentBridgeProviders, getAgentBridgeProvider } from "../common/agentbridge-providers";
import styles from "./agentbridge-page.module.scss";
import { createAgentBridgePageState } from "./agentbridge-page-state";
import { BridgeHeader } from "./bridge-header";
import { Glyph } from "./glyph";
import { formatRelativeAge } from "./harness-inventory";
import { invoke } from "./ipc";
import { launchProviderSession } from "./launch-session";
import { defaultSelection, groupEditors, isProbeTimeout, managedCapabilityNoun } from "./page-model";
import { ProviderMark } from "./provider-marks";
import { createRendererLaunchDeps } from "./renderer-launch";
import { WorkspaceExplorer } from "./workspace-explorer";

import type { AgentBridgeProvider } from "../common/agentbridge-providers";
import type { AgentBridgePageSnapshot, AgentBridgePageState, ProviderState } from "./agentbridge-page-state";
import type { BridgeCluster } from "./bridge-header";
import type { ExplorerSelection } from "./page-model";

const LAUNCH_SHORTCUT = Common.App.isMac ? "⌘ Enter" : "Ctrl Enter";

// The id and name come from the cluster DTO; the avatar's colour seed and icon
// from the catalog entity, the same values the host's sidebar avatar uses, so
// both show one avatar.
function activeCluster(): { id: string; bridge: BridgeCluster } | undefined {
  const cluster = Renderer.Catalog.getActiveCluster();

  if (!cluster) return undefined;

  const entity = Renderer.Catalog.activeCluster.get();
  const sameEntity = entity?.getId() === cluster.id ? entity : undefined;

  return {
    id: cluster.id,
    bridge: {
      name: cluster.name,
      contextName: cluster.contextName,
      colorHash: `${cluster.name}-${sameEntity?.metadata.source}`,
      iconSrc: sameEntity?.spec.icon?.src,
      iconBackground: sameEntity?.spec.icon?.background,
    },
  };
}

// Renders the page state and forwards user intent to it; the provider check,
// the inventory scan and the races between them live in agentbridge-page-state.ts.
export const AgentBridgePage = observer(function AgentBridgePage() {
  const cluster = activeCluster();
  const clusterId = cluster?.id;
  const [pageState] = useState(() => createAgentBridgePageState({ invoke }));
  const snapshot = useSyncExternalStore(pageState.subscribe, pageState.getSnapshot);
  // Until the effect below catches up with a cluster switch, the snapshot still
  // describes the previous cluster: render nothing of it.
  const hasCurrentSelection = snapshot.clusterId === clusterId;
  const providerId = hasCurrentSelection ? snapshot.providerId : undefined;
  const provider = providerId ? getAgentBridgeProvider(providerId) : undefined;
  const state = snapshot.provider;
  const workdir = hasCurrentSelection && state.status === "ready" ? state.workdir : undefined;

  useEffect(() => {
    pageState.setCluster(clusterId);
  }, [clusterId]);

  useEffect(() => () => pageState.dispose(), []);

  // The agent mutates these files in a terminal tab the extension does not
  // observe, so the explorer is stale the moment /build-cluster-map finishes.
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

  return (
    <div className={styles.page}>
      <BridgeHeader
        cluster={cluster?.bridge}
        providers={agentBridgeProviders}
        selectedId={providerId}
        providerReady={hasCurrentSelection && state.status === "ready"}
        onSelect={pageState.selectProvider}
        workdir={workdir}
      />
      {!clusterId ? (
        <div className={styles.body}>
          <p className={styles.lede}>Open a cluster first: every session runs against the cluster on screen.</p>
        </div>
      ) : provider && hasCurrentSelection ? (
        <ProviderView
          // A new provider or cluster starts on its instructions file.
          key={`${clusterId}/${provider.id}`}
          clusterId={clusterId}
          clusterName={cluster?.bridge.name ?? clusterId}
          provider={provider}
          snapshot={snapshot}
          pageState={pageState}
        />
      ) : (
        <div className={styles.body}>
          <Intro clusterName={cluster?.bridge.name ?? clusterId} />
        </div>
      )}
    </div>
  );
});

function Intro({ clusterName }: { clusterName: string }) {
  return (
    <section className={styles.intro} aria-labelledby="agentbridge-intro">
      <h2 id="agentbridge-intro">Choose a provider for {clusterName}</h2>
      <p>Pick one above. The choice is remembered for this cluster.</p>
      <ul>
        <li>
          <Glyph material="folder_open" />
          <span>
            <strong>A workspace of its own</strong>
            AgentBridge creates a folder for this cluster and provider, seeded with instructions and guardrails. Your
            edits are never overwritten.
          </span>
        </li>
        <li>
          <Glyph material="terminal" />
          <span>
            <strong>A session in the dock</strong>
            Open session starts the CLI in a Freelens terminal tab, already pointed at this cluster.
          </span>
        </li>
        <li>
          <Glyph material="shield" />
          <span>
            <strong>Asks before it changes anything</strong>
            The seeded guardrails let read-only kubectl and helm commands run and ask before the rest. Kubernetes RBAC
            stays the security boundary.
          </span>
        </li>
      </ul>
    </section>
  );
}

interface ProviderViewProps {
  clusterId: string;
  clusterName: string;
  provider: AgentBridgeProvider;
  snapshot: AgentBridgePageSnapshot;
  pageState: AgentBridgePageState;
}

function ProviderView({ clusterId, clusterName, provider, snapshot, pageState }: ProviderViewProps) {
  const state = snapshot.provider;
  const ready = state.status === "ready";
  const [selection, setSelection] = useState<ExplorerSelection | undefined>(() =>
    defaultSelection(groupEditors(provider.editors)),
  );
  const [launching, setLaunching] = useState(false);
  const [launchedAt, setLaunchedAt] = useState<number>();
  const [, setTick] = useState(0);

  // Keeps "started just now" honest while the page stays open.
  useEffect(() => {
    if (launchedAt === undefined) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 30_000);

    return () => clearInterval(timer);
  }, [launchedAt]);

  function launch() {
    if (state.status !== "ready" || launching) return;
    setLaunching(true);
    launchProviderSession(createRendererLaunchDeps(), {
      workdir: state.workdir,
      providerId: provider.id,
      shell: Common.App.isWindows ? "windows" : "posix",
      title: `${provider.name} · ${clusterName}`,
      onSettled: () => setLaunching(false),
    })
      .then(() => setLaunchedAt(Date.now()))
      .catch((error: unknown) => {
        Renderer.Component.Notifications.error(
          `Could not open the ${provider.name} session: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  // Ctrl/⌘ Enter opens a session from anywhere on the page except a text field
  // or an editor, where the keys already mean something.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(Common.App.isMac ? event.metaKey : event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;

      if (target?.closest(".monaco-editor, input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      event.preventDefault();
      launch();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  async function reveal() {
    const result = await pageState.revealWorkspace();

    if (!result.ok) Renderer.Component.Notifications.error(`Could not reveal the workspace: ${result.error}`);
  }

  async function openInEditor() {
    const result = await pageState.openInEditor();

    if (!result.ok)
      Renderer.Component.Notifications.error(`Could not open the workspace in an editor: ${result.error}`);
  }

  async function reset() {
    if (!ready) return;
    const ok = await Renderer.Component.ConfirmDialog.confirm({
      message: <ResetMessage provider={provider} />,
      labelOk: "Reset files",
      labelCancel: "Cancel",
      okButtonProps: { accent: true },
    });

    if (!ok) return;
    const result = await pageState.reset();

    if (result.ok) {
      Renderer.Component.Notifications.ok(
        `${provider.name} guardrails and ${managedCapabilityNoun(groupEditors(provider.editors))} reset to their bundled versions.`,
      );
    } else {
      Renderer.Component.Notifications.error(`Reset failed: ${result.error}`);
    }
  }

  return (
    <div className={styles.body}>
      <section className={styles.session} data-status={state.status} aria-label={`${provider.name} session`}>
        <span className={styles.sessionMark} aria-hidden>
          <ProviderMark providerId={provider.id} width={22} height={22} />
        </span>
        <div className={styles.sessionText}>
          <h2>
            {provider.name}
            {state.status === "ready" && <span className={styles.version}>{state.version}</span>}
          </h2>
          <ProviderStatus provider={provider} state={state} onRetry={pageState.retry} />
        </div>
        <div className={styles.sessionActions}>
          {ready ? (
            <>
              <ActionButton icon="folder_open" label="Reveal" onClick={() => void reveal()} />
              <ActionButton icon="code" label="Open in editor" onClick={() => void openInEditor()} />
              <ActionButton icon="restart_alt" label="Reset…" danger onClick={() => void reset()} />
            </>
          ) : state.status === "missing" ? (
            <>
              <ActionButton icon="open_in_new" label="Installation guide" href={provider.docsUrl} />
              <ActionButton icon="refresh" label="Check again" onClick={pageState.retry} />
            </>
          ) : state.status === "error" ? (
            <ActionButton icon="refresh" label="Check again" onClick={pageState.retry} />
          ) : null}
        </div>
        <div className={styles.launch}>
          <Renderer.Component.Button
            primary
            className={styles.launchButton}
            onClick={launch}
            disabled={!ready || launching}
            waiting={launching}
          >
            <Glyph material="terminal" small />
            Open {provider.name} session
          </Renderer.Component.Button>
          <span className={launchedAt !== undefined && !launching ? styles.launched : styles.launchHint} role="status">
            {!ready ? null : launching ? (
              `Starting ${provider.executable} in a terminal tab below…`
            ) : launchedAt !== undefined ? (
              <>
                <Glyph material="check_circle" smallest />
                Started {formatRelativeAge(launchedAt, Date.now())}. Closing its tab ends it.
              </>
            ) : (
              <>
                or press <kbd>{LAUNCH_SHORTCUT}</kbd>
              </>
            )}
          </span>
        </div>
      </section>

      {ready ? (
        <WorkspaceExplorer
          clusterId={clusterId}
          provider={provider}
          inventory={snapshot.inventory}
          inventoryLoading={snapshot.inventoryLoading}
          scanNowMs={snapshot.scanNowMs}
          onRescan={() => pageState.refreshInventory({ force: true })}
          selection={selection}
          onSelect={setSelection}
          onOpenInEditor={() => void openInEditor()}
        />
      ) : state.status === "missing" || state.status === "error" ? (
        <Blocked provider={provider} state={state} />
      ) : (
        <div className={styles.explorer} aria-busy="true">
          <div className={styles.explorerNav}>
            <span className={styles.skeleton} />
            <span className={styles.skeleton} />
            <span className={styles.skeleton} />
          </div>
          <div className={styles.pane} />
        </div>
      )}
    </div>
  );
}

function ProviderStatus({
  provider,
  state,
  onRetry,
}: {
  provider: AgentBridgeProvider;
  state: ProviderState;
  onRetry: () => void;
}) {
  const executable = <code>{provider.executable}</code>;

  switch (state.status) {
    case "ready":
      return (
        <p className={styles.sessionStatus} role="status">
          <span className={styles.statusDot} data-status="ready" aria-hidden />
          Ready · found {executable} on your PATH
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRetry}
            aria-label={`Check ${provider.name} again`}
            title={`Check ${provider.name} again`}
          >
            <Glyph material="refresh" small />
          </button>
        </p>
      );
    case "missing":
      return (
        <p className={styles.sessionStatus} role="status">
          <span className={styles.statusDot} data-status="missing" aria-hidden />
          Not installed · no {executable} on the PATH Freelens sees
        </p>
      );
    case "error":
      return (
        <p className={styles.sessionStatus} role="status">
          <span className={styles.statusDot} data-status="error" aria-hidden />
          Did not answer its version check
        </p>
      );
    default:
      return (
        <p className={styles.sessionStatus} role="status">
          <span className={styles.statusDot} data-status="loading" aria-hidden />
          Checking · running {executable} <code>{provider.versionArgs.join(" ")}</code>
        </p>
      );
  }
}

function Blocked({ provider, state }: { provider: AgentBridgeProvider; state: { status: string; error: string } }) {
  const missing = state.status === "missing";

  return (
    <section className={styles.blocked} aria-labelledby="agentbridge-blocked">
      <span className={styles.blockedMark} aria-hidden>
        <ProviderMark providerId={provider.id} width={36} height={36} />
      </span>
      <h2 id="agentbridge-blocked">
        {missing ? `${provider.name} is not installed` : `${provider.name} did not answer`}
      </h2>
      {missing ? (
        <p>
          AgentBridge looks for <code>{provider.executable}</code> on the PATH Freelens sees and never installs or
          updates CLIs. Install it with the official guide, then check again. Its workspace is created the first time it
          answers.
        </p>
      ) : (
        <>
          <p className={styles.error}>
            <code>{state.error}</code>
          </p>
          {isProbeTimeout(state.error) && (
            <p>
              Slow first runs are common. Raise <strong>Version probe timeout</strong> in Preferences, under Extensions
              → @freelensapp/agentbridge-extension, then check again.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// A host Button drawn as a bordered secondary action, with an optional icon.
function ActionButton({
  icon,
  label,
  onClick,
  danger,
  href,
}: {
  icon?: string;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  href?: string;
}) {
  return (
    <Renderer.Component.Button
      outlined
      className={danger ? styles.danger : styles.secondary}
      onClick={onClick}
      href={href}
      target={href ? "_blank" : undefined}
    >
      {icon && <Glyph material={icon} smallest />}
      {label}
    </Renderer.Component.Button>
  );
}

function ResetMessage({ provider }: { provider: AgentBridgeProvider }) {
  const noun = managedCapabilityNoun(groupEditors(provider.editors));

  return (
    <div className={styles.resetMessage}>
      <strong>
        Reset the {provider.name} guardrails and {noun}?
      </strong>
      <span>These files go back to their bundled versions, and your edits to them are lost:</span>
      <ul>
        {provider.resetPaths.map((path) => (
          <li key={path}>
            <code>{path}</code>
          </li>
        ))}
      </ul>
      <span>The instructions file, skills, agents and everything else in the workspace stay as they are.</span>
    </div>
  );
}
