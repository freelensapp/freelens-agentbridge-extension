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

export interface HarnessArtifactGroup {
  readonly kind: HarnessArtifactKind;
  readonly count: number;
  readonly newestMtimeMs?: number;
  readonly oldestMtimeMs?: number;
  // Oldest-first, so a stale straggler is the first row.
  readonly artifacts: readonly HarnessArtifact[];
  // The scan hit MAX_ARTIFACTS_PER_KIND; `count` is a floor, not a total.
  readonly truncated: boolean;
}

export type HarnessInventoryResult =
  | { status: "ok"; groups: readonly HarnessArtifactGroup[] }
  | { status: "error"; error: string };

// Render order of the kind groups.
export const HARNESS_ARTIFACT_KIND_ORDER: readonly HarnessArtifactKind[] = ["skill", "agent"];

// Upper bound per kind. A workspace with more artifacts than this is reported as
// truncated rather than scanned exhaustively.
export const MAX_ARTIFACTS_PER_KIND = 200;

// The rollup is derived, never scanned separately: one scan serves both the
// header chips and the drill-down list.
export function buildArtifactGroup(
  kind: HarnessArtifactKind,
  artifacts: readonly HarnessArtifact[],
  truncated = false,
): HarnessArtifactGroup {
  const sorted = [...artifacts].sort(
    (left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name),
  );

  return {
    kind,
    count: sorted.length,
    newestMtimeMs: sorted.at(-1)?.mtimeMs,
    oldestMtimeMs: sorted.at(0)?.mtimeMs,
    artifacts: sorted,
    truncated,
  };
}
