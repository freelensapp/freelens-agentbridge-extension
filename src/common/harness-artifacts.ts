// Inventory of the artifacts that exist in a provider workspace right now:
// skills and custom agents the extension seeded or the agent generated. This is
// the retrospective counterpart to the forward-looking capability registry
// (src/renderer/capability-hints.ts) — capabilities say what CAN be run, this
// says what EXISTS on disk.
//
// Workspace only, by design. Sessions launch with an inherited HOME, so the
// agent also loads the user's personal ~/.claude; that is deliberately not
// counted here and the UI says so.

export type HarnessArtifactKind = "skill" | "agent";

// Directory layout of one artifact root.
//   "skill-dir" -> <root>/<name>/SKILL.md   (skills, all three providers)
//   "markdown"  -> <root>/<name>.md         (custom agents, all three providers)
export type ArtifactLayout = "skill-dir" | "markdown";

export interface ArtifactSource {
  readonly kind: HarnessArtifactKind;
  // Workspace-relative roots, highest precedence first. A kind with several
  // roots dedups by artifact name: the first root that declares a name wins.
  readonly roots: readonly string[];
  readonly layout: ArtifactLayout;
}

export interface HarnessArtifact {
  readonly kind: HarnessArtifactKind;
  // Frontmatter `name`, falling back to the directory or file name.
  readonly name: string;
  // Frontmatter `description`, trimmed and capped. Absent when unparseable.
  readonly description?: string;
  // Workspace-relative, forward slashes on every platform.
  readonly path: string;
  readonly mtimeMs: number;
  // "seeded" when the extension ships this exact path; "generated" otherwise.
  readonly origin: "seeded" | "generated";
}

// What one kind's scan actually looked at, which is not what it kept: artifacts
// dropped by dedup or by MAX_ARTIFACTS_PER_KIND are counted here too.
//
// This exists because truncation drops artifacts in NAME order while the group
// is displayed in mtime order, so the kept set's mtime range can be arbitrarily
// older than the workspace's real one — a workspace whose five newest skills
// happen to sort last by name would render "updated 20800d ago" seconds after
// they were written. The group reports THIS range so the header cannot lie.
export interface ArtifactScanTotals {
  readonly examined: number;
  readonly newestMtimeMs?: number;
  readonly oldestMtimeMs?: number;
}

export interface HarnessArtifactGroup {
  readonly kind: HarnessArtifactKind;
  readonly count: number;
  // Across every artifact file the scan EXAMINED, not just the kept ones.
  readonly newestMtimeMs?: number;
  readonly oldestMtimeMs?: number;
  // Oldest-first, so a stale straggler is the first row.
  readonly artifacts: readonly HarnessArtifact[];
  // The scan hit MAX_ARTIFACTS_PER_KIND or MAX_ENTRIES_SCANNED; `count` is a
  // floor, not a total.
  readonly truncated: boolean;
  // Artifact files examined for this kind, including those dropped by dedup or
  // by the caps, so `examinedCount >= count`. Optional only so that callers
  // written against the pre-truncation-accounting shape keep compiling.
  readonly examinedCount?: number;
}

export type HarnessInventoryResult =
  | { status: "ok"; groups: readonly HarnessArtifactGroup[] }
  | { status: "error"; error: string };

// Render order of the kind groups.
export const HARNESS_ARTIFACT_KIND_ORDER: readonly HarnessArtifactKind[] = ["skill", "agent"];

// Upper bound per kind. A workspace with more artifacts than this is reported as
// truncated rather than scanned exhaustively.
export const MAX_ARTIFACTS_PER_KIND = 200;

// Upper bound on the directory entries one kind's scan may EXAMINE, across all
// its roots. MAX_ARTIFACTS_PER_KIND bounds the RESULT, which is not the same
// thing: an entry dropped by dedup, or a directory holding no artifact file,
// costs an lstat, a realpath and a bounded head read without ever reaching that
// cap. The scan runs synchronously inside an IPC handler on the Electron main
// process, so unbounded work there is a frozen window, not a slow query.
export const MAX_ENTRIES_SCANNED = 2000;

// The rollup is derived, never scanned separately: one scan serves both the
// header chips and the drill-down list.
//
// `totals` describes everything the scan examined; without it the kept
// artifacts are the only thing there is to report, which is exactly right for a
// caller that did no truncating.
export function buildArtifactGroup(
  kind: HarnessArtifactKind,
  artifacts: readonly HarnessArtifact[],
  truncated = false,
  totals?: ArtifactScanTotals,
): HarnessArtifactGroup {
  const sorted = [...artifacts].sort(
    (left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name),
  );

  return {
    kind,
    count: sorted.length,
    newestMtimeMs: totals?.newestMtimeMs ?? sorted.at(-1)?.mtimeMs,
    oldestMtimeMs: totals?.oldestMtimeMs ?? sorted.at(0)?.mtimeMs,
    artifacts: sorted,
    truncated,
    examinedCount: totals?.examined ?? sorted.length,
  };
}
