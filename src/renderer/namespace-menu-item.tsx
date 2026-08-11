import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { getClusterMapCommand } from "./cluster-map-command";
import { launchProviderSession } from "./launch-session";
import { loadSelectedProvider } from "./provider-selection";
import { createRendererLaunchDeps } from "./renderer-launch";

const CHANNEL_PREFIX = "agentbridge-extension:";

const {
  Component: { Icon, MenuItem, Notifications },
} = Renderer;

export interface NamespaceMenuItemProps {
  object: { getName(): string };
  toolbar?: boolean;
}

// Context-menu entry on Namespace objects. Reuses the cluster's selected
// provider and launches a session that refreshes the map for just this
// namespace (single-namespace, idempotent refresh).
export function NamespaceMapMenuItem({ object, toolbar }: NamespaceMenuItemProps) {
  async function run() {
    const clusterId = Renderer.Catalog.getActiveCluster()?.id;
    const namespace = object.getName();

    if (!clusterId) {
      Notifications.error("No active cluster.");
      return;
    }

    const providerId = loadSelectedProvider(clusterId);
    if (!providerId) {
      Notifications.info("Open Freelens Agent Bridge and select a provider for this cluster first.");
      return;
    }

    try {
      const workspace = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}prepare-workspace`, clusterId, providerId)) as {
        workdir: string;
      };

      launchProviderSession(createRendererLaunchDeps(), {
        workdir: workspace.workdir,
        providerId,
        platform: process.platform,
        title: `Agent Bridge — map ${namespace}`,
        followUpCommand: getClusterMapCommand(providerId, namespace),
      });
    } catch (error) {
      Notifications.error(`Failed to prepare workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <MenuItem onClick={() => void run()}>
      <Icon
        material="map"
        interactive={toolbar}
        tooltip={toolbar ? "Build / refresh Agent Bridge map for this namespace" : undefined}
      />
      <span className="title">Build / refresh Agent Bridge map</span>
    </MenuItem>
  );
}
