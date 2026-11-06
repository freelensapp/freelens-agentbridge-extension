import { CAPABILITY_KIND_LABEL } from "./capability-hints";

import type { HarnessArtifactGroup, HarnessArtifactKind } from "../common/harness-artifacts";

// React-free view logic for the workspace artifact inventory. Kept separate from
// harness-artifacts-section.tsx so it is unit-testable in the node test
// environment, which has no DOM.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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

// Total across kinds, carrying truncation: a truncated kind makes the total a
// floor, so "3" would claim a precision the scan never had.
export function totalLabel(groups: readonly HarnessArtifactGroup[]): string {
  const total = groups.reduce((count, group) => count + group.count, 0);

  return `${total}${groups.some((group) => group.truncated) ? "+" : ""}`;
}
