import {
  type AgentBridgeProviderId,
  agentBridgeProviders,
  type PrepareWorkspaceResult,
  type ProviderCheckResult,
} from "../common/agentbridge-providers";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ProviderLoadResult =
  | { status: "ready"; version: string; workdir: string }
  | Exclude<ProviderCheckResult, { status: "ready" }>;

export type IpcInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

const channelPrefix = "agentbridge-extension:";

function storageKey(clusterId: string): string {
  return `agentbridge-extension:selected-provider:${clusterId}`;
}

function isProviderId(value: string): value is AgentBridgeProviderId {
  return agentBridgeProviders.some((provider) => provider.id === value);
}

export function loadSelectedProvider(clusterId: string, storage?: StorageLike): AgentBridgeProviderId | undefined {
  const key = storageKey(clusterId);

  try {
    const providerId = (storage ?? globalThis.localStorage)?.getItem(key);

    if (!providerId) {
      return undefined;
    }
    if (isProviderId(providerId)) {
      return providerId;
    }

    (storage ?? globalThis.localStorage)?.removeItem(key);
  } catch {
    // Storage is optional in renderer environments with privacy restrictions.
  }

  return undefined;
}

export function saveSelectedProvider(
  clusterId: string,
  providerId: AgentBridgeProviderId,
  storage?: StorageLike,
): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(storageKey(clusterId), providerId);
  } catch {
    // Keep selection in caller state when persistence is unavailable.
  }
}

export async function loadProvider(
  clusterId: string,
  providerId: AgentBridgeProviderId,
  invoke: IpcInvoke,
  isCurrent: () => boolean,
): Promise<ProviderLoadResult | undefined> {
  let check: ProviderCheckResult;

  try {
    check = (await invoke(`${channelPrefix}check-provider`, providerId)) as ProviderCheckResult;
  } catch (error) {
    return isCurrent() ? { status: "error", error: error instanceof Error ? error.message : String(error) } : undefined;
  }

  if (!isCurrent()) {
    return undefined;
  }
  if (check.status !== "ready") {
    return check;
  }

  try {
    const workspace = (await invoke(
      `${channelPrefix}prepare-workspace`,
      clusterId,
      providerId,
    )) as PrepareWorkspaceResult;

    return isCurrent() ? { status: "ready", version: check.version, workdir: workspace.workdir } : undefined;
  } catch (error) {
    return isCurrent() ? { status: "error", error: error instanceof Error ? error.message : String(error) } : undefined;
  }
}
