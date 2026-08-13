import { HARNESS_ARTIFACT_KIND_ORDER } from "../common/harness-artifacts";
import { CAPABILITY_KIND_LABEL, defaultIconForKind } from "./capability-hints";

import type { HarnessArtifactGroup, HarnessArtifactKind, HarnessInventoryResult } from "../common/harness-artifacts";
import type { IpcInvoke } from "./provider-selection";

// React-free view logic for the workspace artifact inventory. Kept separate from
// harness-artifacts-section.tsx so it is unit-testable in the node test
// environment, which has no DOM.

const CHANNEL_PREFIX = "agentbridge-extension:";

// Refreshes fire on mount, provider switch, reset, window focus and tab
// visibility, so several can land at once; anything inside this window after a
// successful scan reuses the result.
const REFRESH_COALESCE_MS = 2_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Singular label per kind, for chip text. The plural comes from
// CAPABILITY_KIND_LABEL, which the capabilities rail already owns.
const ARTIFACT_KIND_SINGULAR: Record<HarnessArtifactKind, string> = {
  skill: "skill",
  agent: "agent",
};

export interface InventoryChip {
  readonly kind: HarnessArtifactKind;
  readonly label: string;
  readonly count: number;
  readonly truncated: boolean;
}

export interface InventorySummary {
  // Non-empty kinds only, in registry order.
  readonly chips: readonly InventoryChip[];
  readonly totalCount: number;
  // Age of the newest artifact across all kinds: "when did anything last change".
  readonly ageLabel?: string;
}

export function iconForArtifactKind(kind: HarnessArtifactKind): string {
  return defaultIconForKind(kind);
}

export function labelForArtifactKind(kind: HarnessArtifactKind): string {
  return CAPABILITY_KIND_LABEL[kind];
}

export function formatRelativeAge(mtimeMs: number, nowMs: number): string {
  // Clock skew between the filesystem and the renderer must not surface as a
  // negative age.
  const elapsed = Math.max(0, nowMs - mtimeMs);

  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;

  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

export function chipLabel(kind: HarnessArtifactKind, count: number, truncated: boolean): string {
  const noun = count === 1 ? ARTIFACT_KIND_SINGULAR[kind] : `${ARTIFACT_KIND_SINGULAR[kind]}s`;

  return `${count}${truncated ? "+" : ""} ${noun}`;
}

export function summarizeInventory(groups: readonly HarnessArtifactGroup[], nowMs: number): InventorySummary {
  const ordered = HARNESS_ARTIFACT_KIND_ORDER.flatMap((kind) => groups.filter((group) => group.kind === kind));
  const newest = ordered.reduce<number | undefined>(
    (latest, group) =>
      group.newestMtimeMs === undefined ? latest : Math.max(latest ?? group.newestMtimeMs, group.newestMtimeMs),
    undefined,
  );

  return {
    chips: ordered
      .filter((group) => group.count > 0)
      .map((group) => ({
        kind: group.kind,
        label: chipLabel(group.kind, group.count, group.truncated),
        count: group.count,
        truncated: group.truncated,
      })),
    totalCount: ordered.reduce((total, group) => total + group.count, 0),
    ageLabel: newest === undefined ? undefined : formatRelativeAge(newest, nowMs),
  };
}

// Total across kinds, carrying truncation the same way the header chips do: a
// truncated kind makes the total a floor, so "3" would claim a precision the
// scan never had while the chip beside it already says "2+ skills".
export function totalLabel(groups: readonly HarnessArtifactGroup[]): string {
  const total = groups.reduce((count, group) => count + group.count, 0);

  return `${total}${groups.some((group) => group.truncated) ? "+" : ""}`;
}

export interface RefreshRequest {
  // Completion time of the last *successful* scan; undefined until one lands.
  readonly lastScanAtMs: number | undefined;
  readonly nowMs: number;
  // A scan whose response has not come back yet.
  readonly scanInFlight: boolean;
  // The explicit Refresh/Retry buttons, which must never be swallowed.
  readonly force: boolean;
}

export function shouldRefresh({ lastScanAtMs, nowMs, scanInFlight, force }: RefreshRequest): boolean {
  if (force) return true;
  // Restoring the window fires `focus` and `visibilitychange` in the same tick.
  // `lastScanAtMs` is only written on completion, so the coalescing window below
  // cannot catch the second one and both scans would run in the main process in
  // full; cancelling the loser in the renderer happens far too late.
  if (scanInFlight) return false;

  return lastScanAtMs === undefined || nowMs - lastScanAtMs >= REFRESH_COALESCE_MS;
}

// The coalescing window follows the last *successful* scan (spec §4.6). An
// error result is truthy, so gating on the result alone would let a failure open
// the window and suppress the automatic retry a focus change would otherwise
// trigger.
export function opensCoalesceWindow(result: HarnessInventoryResult | undefined): boolean {
  return result?.status === "ok";
}

// Electron's wording when `ipcMain.invoke` reaches a channel nobody handles.
// Matched on the stable fragment: the full string embeds the channel name.
const NO_HANDLER_PATTERN = /No handler registered/i;

// Freelens re-requires the renderer entry on every window reload, but the main
// process keeps its extension instance for the life of the app: ExtensionLoader
// skips any extension already in `extensionInstances` (extension-loader.ts,
// `alreadyInit`), so `onActivate` — and therefore every `ipcMain.handle` call —
// never runs again. Rebuilding while Freelens is open leaves a new renderer
// talking to an old main process, and any channel added since startup is
// missing. Nothing in the renderer can recover from that, so the only useful
// error is the one that says which button to press.
export function describeInventoryError(message: string): string {
  if (!NO_HANDLER_PATTERN.test(message)) return message;

  return "Workspace artifacts need a full Freelens restart: this session's main process started before the extension gained the scanner. Quitting and reopening Freelens is required — a window reload only updates the UI.";
}

// Mirrors loadProvider in provider-selection.ts: isCurrent() gates every state
// transition so a response for a superseded cluster/provider is discarded.
export async function loadHarnessInventory(
  clusterId: string,
  providerId: string,
  invoke: IpcInvoke,
  isCurrent: () => boolean,
): Promise<HarnessInventoryResult | undefined> {
  try {
    const result = (await invoke(
      `${CHANNEL_PREFIX}list-provider-artifacts`,
      clusterId,
      providerId,
    )) as HarnessInventoryResult;

    return isCurrent() ? result : undefined;
  } catch (error) {
    if (!isCurrent()) return undefined;

    return {
      status: "error",
      error: describeInventoryError(error instanceof Error ? error.message : String(error)),
    };
  }
}
