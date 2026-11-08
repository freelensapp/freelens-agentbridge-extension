import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type AgentBridgeProviderId,
  agentBridgeProviders,
  getAgentBridgeProvider,
} from "../common/agentbridge-providers";

// The provider each cluster's page opens on, keyed by cluster ID. It lives here
// and not in the renderer's localStorage: every renderer origin carries the
// host proxy's port, which changes on each start, and the host clears
// localStorage at startup anyway.
const SELECTIONS_FILE = "agentbridge-provider-selections.json";

function readSelections(userData: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(userData, SELECTIONS_FILE), "utf8"));

    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function readSelectedProvider(userData: string, clusterId: unknown): AgentBridgeProviderId | null {
  if (typeof clusterId !== "string") return null;
  const selections = readSelections(userData);
  const providerId = Object.hasOwn(selections, clusterId) ? selections[clusterId] : undefined;

  return agentBridgeProviders.find(({ id }) => id === providerId)?.id ?? null;
}

export function writeSelectedProvider(userData: string, clusterId: unknown, providerId: unknown): void {
  if (typeof clusterId !== "string" || clusterId === "") throw new Error("Invalid cluster id");
  const provider = getAgentBridgeProvider(String(providerId));
  // Object.fromEntries defines own properties, so a cluster id such as
  // `__proto__` stays a plain key instead of replacing the prototype.
  const selections = Object.fromEntries([
    ...Object.entries(readSelections(userData)).filter(([key]) => key !== clusterId),
    [clusterId, provider.id],
  ]);

  mkdirSync(userData, { recursive: true });
  writeFileSync(path.join(userData, SELECTIONS_FILE), `${JSON.stringify(selections, null, 2)}\n`, "utf8");
}
