import { createHash } from "node:crypto";
import path from "node:path";
import { getAgentBridgeProvider } from "../common/agentbridge-providers";

const MAX_CLUSTER_PREFIX = 96;

export function getSafeClusterKey(clusterId: string): string {
  const prefix = clusterId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, MAX_CLUSTER_PREFIX) || "cluster";
  const digest = createHash("sha256").update(clusterId).digest("hex").slice(0, 12);

  return `${prefix}-${digest}`;
}

export function computeProviderWorkdir(userData: string, clusterId: string, providerId: string): string {
  const provider = getAgentBridgeProvider(providerId);

  return path.join(userData, "agentbridge-sessions", getSafeClusterKey(clusterId), provider.id);
}
