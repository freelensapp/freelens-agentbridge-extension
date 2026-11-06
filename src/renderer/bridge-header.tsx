import { Renderer } from "@freelensapp/extensions";
import styles from "./agentbridge-page.module.scss";
import { CopyButton } from "./copy-button";
import { Glyph } from "./glyph";
import { providerShortName, shortenWorkdir } from "./page-model";
import { ProviderMark } from "./provider-marks";

import type { AgentBridgeProvider, AgentBridgeProviderId } from "../common/agentbridge-providers";

export interface BridgeCluster {
  readonly name: string;
  // The kubeconfig context sessions use; worth showing only when it differs
  // from the name.
  readonly contextName?: string;
  readonly colorHash: string;
  readonly iconSrc?: string;
  readonly iconBackground?: string;
}

interface BridgeHeaderProps {
  cluster?: BridgeCluster;
  providers: readonly AgentBridgeProvider[];
  selectedId?: AgentBridgeProviderId;
  // The selected provider's CLI answered its version probe.
  providerReady?: boolean;
  onSelect: (providerId: AgentBridgeProviderId) => void;
  // Present once the selected provider is ready and its workspace exists.
  workdir?: string;
}

// The bridge strip: the cluster Freelens has open, the provider that will run
// against it, and the workspace that connects them. The wires fill in as each
// side is ready, so the strip reads as the product's one idea: this cluster,
// this agent, this workspace.
export function BridgeHeader({ cluster, providers, selectedId, providerReady, onSelect, workdir }: BridgeHeaderProps) {
  const providerLive = selectedId !== undefined && providerReady === true;

  return (
    <header className={styles.bridge}>
      <div className={styles.bridgeSide}>
        <div className={`${styles.node} ${styles.clusterNode}`}>
          {cluster ? (
            <Renderer.Component.Avatar
              title={cluster.name}
              colorHash={cluster.colorHash}
              size={40}
              src={cluster.iconSrc}
              background={cluster.iconBackground}
            />
          ) : (
            <Renderer.Component.Avatar title="??" background="var(--halfGray)" size={40} />
          )}
          <div className={styles.nodeText}>
            <h1 className={styles.nodeTitle} title={cluster?.name}>
              {cluster?.name ?? "No cluster"}
            </h1>
            <span className={styles.nodeCaption}>
              {cluster?.contextName && cluster.contextName !== cluster.name
                ? `Cluster · context ${cluster.contextName}`
                : "Cluster"}
            </span>
          </div>
        </div>

        <span className={styles.wire} data-live={providerLive} aria-hidden />
      </div>

      <ProviderSwitcher providers={providers} selectedId={selectedId} onSelect={onSelect} disabled={!cluster} />

      <div className={styles.bridgeSide}>
        <span className={`${styles.wire} ${styles.wireB}`} data-live={workdir !== undefined} aria-hidden />

        <div className={`${styles.node} ${styles.workspaceNode}`}>
          <span className={styles.workspaceIcon} data-live={workdir !== undefined} aria-hidden>
            <Glyph material="folder_open" />
          </span>
          <div className={styles.nodeText}>
            {workdir ? (
              <span className={styles.workspacePath}>
                <span title={workdir}>{shortenWorkdir(workdir)}</span>
                <CopyButton text={workdir} label="Copy the workspace path" />
              </span>
            ) : (
              <span className={styles.workspacePlaceholder}>{selectedId ? "Not created yet" : "Pick a provider"}</span>
            )}
            <span className={styles.nodeCaption}>Workspace for this cluster</span>
          </div>
        </div>
      </div>
    </header>
  );
}

interface ProviderSwitcherProps {
  providers: readonly AgentBridgeProvider[];
  selectedId?: AgentBridgeProviderId;
  onSelect: (providerId: AgentBridgeProviderId) => void;
  disabled?: boolean;
}

// A radio group, so the arrow keys move between providers the way they do in
// any native one. Each option carries the provider's mark beside its name.
export function ProviderSwitcher({ providers, selectedId, onSelect, disabled }: ProviderSwitcherProps) {
  return (
    <fieldset className={styles.switcher} disabled={disabled}>
      <legend>Provider for this cluster</legend>
      {providers.map((provider) => (
        <label
          key={provider.id}
          className={styles.option}
          data-selected={provider.id === selectedId}
          data-disabled={disabled}
          title={provider.name}
        >
          <input
            type="radio"
            name="agentbridge-provider"
            value={provider.id}
            checked={provider.id === selectedId}
            onChange={() => onSelect(provider.id as AgentBridgeProviderId)}
          />
          <ProviderMark providerId={provider.id} className={styles.optionMark} />
          <span className={styles.optionName} aria-hidden>
            {providerShortName(provider)}
          </span>
          <span className={styles.visuallyHidden}>{provider.name}</span>
        </label>
      ))}
    </fieldset>
  );
}
