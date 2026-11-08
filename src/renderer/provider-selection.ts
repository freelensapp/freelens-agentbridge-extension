import { ipcChannels } from "../common/ipc-channels";

import type { AgentBridgeProviderId } from "../common/agentbridge-providers";
import type { IpcInvoke } from "../common/ipc-channels";

// The provider each cluster's page opens on. Main keeps it under userData: the
// renderer's localStorage does not survive a restart, because every renderer
// origin carries the host proxy's port, which changes on each start.
export interface ProviderSelectionStore {
  load(clusterId: string): Promise<AgentBridgeProviderId | undefined>;
  save(clusterId: string, providerId: AgentBridgeProviderId): Promise<void>;
}

export function createProviderSelectionStore(invoke: IpcInvoke): ProviderSelectionStore {
  return {
    async load(clusterId) {
      try {
        return (await invoke(ipcChannels.getSelectedProvider, clusterId)) ?? undefined;
      } catch {
        // Without a saved selection the page asks for a provider again.
        return undefined;
      }
    },

    async save(clusterId, providerId) {
      try {
        await invoke(ipcChannels.setSelectedProvider, clusterId, providerId);
      } catch {
        // The page state keeps the selection for this session.
      }
    },
  };
}
