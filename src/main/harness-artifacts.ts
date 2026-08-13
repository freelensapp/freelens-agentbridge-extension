import { lstatSync, opendirSync, realpathSync } from "node:fs";
import path from "node:path";
import { getAgentBridgeProvider } from "../common/agentbridge-providers";
import { buildArtifactGroup, MAX_ARTIFACTS_PER_KIND, MAX_ENTRIES_SCANNED } from "../common/harness-artifacts";
import { isInside, resolveVerifiedWorkdir } from "./provider-files";
import { readFrontmatter } from "./read-frontmatter";
import type { Dirent, Stats } from "node:fs";

import type { AgentBridgeProvider } from "../common/agentbridge-providers";
import type {
  ArtifactScanTotals,
  ArtifactSource,
  HarnessArtifact,
  HarnessArtifactGroup,
  HarnessInventoryResult,
} from "../common/harness-artifacts";

// Read-only inventory of what a provider workspace currently contains.
//
// This is a NARROWER capability than the declared-file editors, not a wider one:
// it lists directories, lstats entries and reads a bounded head of each artifact
// for its frontmatter. It never reads a file body, never writes, and never leaves
// the workdir that resolveVerifiedWorkdir already containment-checked.
//
// Zero provider knowledge lives here: every root and layout comes from
// provider.artifactSources in src/common/agentbridge-providers.ts.

function toWorkspaceRelative(workdir: string, target: string): string {
  return path.relative(workdir, target).split(path.sep).join("/");
}

// Resolve a declared root to the real directory the scan may list, or undefined
// when it must be skipped.
//
// The check is on the root's REAL path, not on the path we built: declared roots
// never contain "..", so a lexical check can never fail and would be dead code.
// The reachable attack is a root (or one of its parents) that is ITSELF a
// symlink out of the workspace — `opendirSync` follows it happily, and the scan
// would list and lstat an out-of-workspace tree. The per-entry check downstream
// would still discard those results, but the listing itself is an existence
// oracle, so the containment decision has to happen before the directory is
// opened.
//
// Everything below the returned directory is therefore rooted inside the
// workdir, and only symlinks below it can still escape.
function resolveRootDir(workdir: string, root: string): string | undefined {
  // Split on both separators, matching the registry's own validation rule
  // (agentbridge-providers.test.ts checks segments against /[\\/]/) and
  // assertDeclaredPath: a root declared with backslashes must resolve to the
  // same directory here that the registry believes it validated.
  const rootDir = path.resolve(workdir, ...root.split(/[\\/]+/));
  let realRootDir: string;

  try {
    realRootDir = realpathSync(rootDir);
  } catch {
    // Most roots simply do not exist (ENOENT): an absent root contributes
    // nothing and is not an error.
    return undefined;
  }

  return isInside(workdir, realRootDir) ? realRootDir : undefined;
}

// A directory entry contributes at most one artifact file, decided by layout.
function artifactFileFor(source: ArtifactSource, rootDir: string, entry: Dirent): string | undefined {
  if (source.layout === "skill-dir") {
    return entry.isDirectory() ? path.join(rootDir, entry.name, "SKILL.md") : undefined;
  }

  return entry.isFile() && entry.name.toLowerCase().endsWith(".md") ? path.join(rootDir, entry.name) : undefined;
}

// List at most `budget` entries of a directory, and report whether it held more.
//
// `readdirSync` cannot be used here, and the reason is the same lesson as the
// per-entry budget one layer down: a cap on entries EXAMINED does not bound
// entries LISTED. `readdirSync` materialises the WHOLE directory — one Dirent
// per entry, all resident — and the alphabetical sort that followed it was an
// O(n log n) Intl collation over all of them, both of them completing before the
// budget was consulted even once. Measured, a 100k-entry directory costs ~70 ms
// to list and collate and ~11 MB of resident Dirents, synchronously, inside an
// ipcMain handler on the Electron main process: not a slow query, a frozen
// window. The curve is n log n, so a workspace an agent filled in a loop pays
// seconds. And the scan re-runs on mount, provider switch, cluster switch,
// Reset, window focus and visibilitychange, so alt-tabbing back into Freelens is
// enough to pay it again.
//
// `opendirSync` is a cursor, so the listing itself stops at the budget (~2 ms for
// the same directory) and memory is bounded by the budget rather than by the
// workspace.
//
// The tradeoff is real and deliberate: sorting the full listing made truncation
// alphabetical and stable — always the same first 2000 names — while a bounded
// pull takes entries in directory order, so WHICH entries are dropped is
// arbitrary and may change between refreshes. The group is flagged `truncated`
// and rendered in mtime order either way, so that determinism was never visible
// as an ordering guarantee; it is not worth an unbounded main-process stall.
function listBoundedEntries(rootDir: string, budget: number): { entries: Dirent[]; more: boolean } {
  const dir = opendirSync(rootDir);

  try {
    const entries: Dirent[] = [];

    while (entries.length < budget) {
      const entry = dir.readSync();

      if (entry === null) return { entries, more: false };

      entries.push(entry);
    }

    // One read past the budget, never kept: it is the whole difference between
    // "the directory ended" and "we stopped", which is what `truncated` reports.
    // With a budget of 0 this is the only read performed, which is how an
    // already-exhausted budget still notices that a later root holds entries.
    return { entries, more: dir.readSync() !== null };
  } finally {
    dir.closeSync();
  }
}

function fallbackNameFor(source: ArtifactSource, entryName: string): string {
  if (source.layout === "skill-dir") return entryName;

  // A file named exactly ".md" strips down to nothing, and an artifact row with
  // no label at all is worse than one labelled with its file name.
  return entryName.replace(/\.md$/i, "") || entryName;
}

function scanSource(workdir: string, source: ArtifactSource, seededPaths: ReadonlySet<string>): HarnessArtifactGroup {
  const artifacts: HarnessArtifact[] = [];
  const seenNames = new Set<string>();
  // Every artifact file examined, kept or not: see ArtifactScanTotals. Tracked
  // here rather than derived from `artifacts` because the whole point is to
  // describe what truncation threw away.
  const totals: { examined: number; newestMtimeMs?: number; oldestMtimeMs?: number } = { examined: 0 };
  let entriesScanned = 0;
  let truncated = false;

  for (const root of source.roots) {
    // No early `break` on an exhausted budget: a root skipped without listing is
    // a root whose entries were dropped, and leaving `truncated` false there had
    // the header claim an authoritative count. The budget is per KIND across
    // roots, so with three declared roots that is reachable. Falling through
    // instead costs one `readSync` per remaining root — see listBoundedEntries,
    // which reports `more` for a budget of 0 without listing anything.
    const rootDir = resolveRootDir(workdir, root);

    // An absent root dropped nothing, so it never reports truncation.
    if (!rootDir) continue;

    let listing: { entries: Dirent[]; more: boolean };

    try {
      // The work budget, charged for EVERY entry considered and enforced on the
      // LISTING, not just on the loop below. MAX_ARTIFACTS_PER_KIND bounds the
      // result and cannot bound the work: entries dropped by dedup, and
      // directories holding no artifact file, never reach it, so a workspace of
      // 200k such entries would keep this synchronous handler lstat-ing,
      // realpath-ing and head-reading until the window unfroze.
      listing = listBoundedEntries(rootDir, MAX_ENTRIES_SCANNED - entriesScanned);
    } catch {
      // A root that is not a directory (ENOTDIR) or not readable (EACCES)
      // simply contributes nothing.
      continue;
    }

    if (listing.more) truncated = true;

    // Bounded by the budget, so the collation cost is bounded with it. In place:
    // the array never left listBoundedEntries.
    listing.entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of listing.entries) {
      entriesScanned++;

      // Dirent.isSymbolicLink() has lstat semantics: an entry that is itself a
      // link is rejected before it is ever resolved. Defence in depth — the
      // isDirectory()/isFile() tests below are lstat-based too, so they already
      // reject links — but it states the rule where a reader looks for it.
      if (entry.isSymbolicLink()) continue;

      const file = artifactFileFor(source, rootDir, entry);

      if (!file) continue;

      let stats: Stats;

      try {
        stats = lstatSync(file);
      } catch {
        continue;
      }

      // lstat, never stat: isFile() is false both for a symlinked SKILL.md
      // (which must not be followed, not even for its mtime) and for a
      // directory that happens to be named like an artifact file.
      if (!stats.isFile()) continue;

      // A hardlink has no real path of its own, so realpathSync — which only
      // resolves symlinks — reports this in-workspace path for a file whose
      // bytes live anywhere on the volume, and every containment check below
      // passes on a fabricated path. Link count is the only signal that exists,
      // and it necessarily also excludes hardlinks between two workspaces; no
      // symlink check can catch either case, and a generated artifact is never
      // hardlinked.
      if (stats.nlink > 1) continue;

      // Everything below is a real artifact file of this kind, so it counts
      // towards the totals even if dedup or the cap drops it: the header's
      // "updated N ago" must describe the workspace, not the kept subset.
      totals.examined++;
      totals.newestMtimeMs = Math.max(totals.newestMtimeMs ?? stats.mtimeMs, stats.mtimeMs);
      totals.oldestMtimeMs = Math.min(totals.oldestMtimeMs ?? stats.mtimeMs, stats.mtimeMs);

      let realFile: string;

      try {
        realFile = realpathSync(file);
      } catch {
        continue;
      }

      // Unreachable while the guards above hold, and kept anyway: it is the last
      // line of defence against a path that changes shape between the lstat and
      // this resolution.
      if (!isInside(workdir, realFile)) continue;

      // `stats` travels with the path: readFrontmatter opens by name, which is
      // an independent third resolution, and only the identity we already
      // lstat-ed and containment-checked may be read.
      const frontmatter = readFrontmatter(realFile, stats);
      const name = frontmatter.name ?? fallbackNameFor(source, entry.name);

      // First root that declares a name wins, which is what makes a multi-root
      // kind safe to declare.
      if (seenNames.has(name)) continue;

      // Deliberately after the dedup check: a duplicate is not an artifact, so
      // it must neither consume cap budget nor report truncation for a workspace
      // from which nothing was actually dropped.
      //
      // `continue`, not `break`: the entry budget already bounds the scan, and
      // stopping here would leave the totals — and therefore the header's mtime
      // range — describing only the alphabetically-first artifacts.
      if (artifacts.length >= MAX_ARTIFACTS_PER_KIND) {
        truncated = true;
        continue;
      }

      seenNames.add(name);

      const relativePath = toWorkspaceRelative(workdir, realFile);

      artifacts.push({
        kind: source.kind,
        name,
        ...(frontmatter.description === undefined ? {} : { description: frontmatter.description }),
        path: relativePath,
        mtimeMs: stats.mtimeMs,
        origin: seededPaths.has(relativePath) ? "seeded" : "generated",
      });
    }
  }

  return buildArtifactGroup(source.kind, artifacts, truncated, totals satisfies ArtifactScanTotals);
}

function emptyInventory(provider: AgentBridgeProvider): HarnessInventoryResult {
  return { status: "ok", groups: provider.artifactSources.map((source) => buildArtifactGroup(source.kind, [])) };
}

export function listProviderArtifacts(userData: string, clusterId: string, providerId: string): HarnessInventoryResult {
  // Invalid programmer input throws, matching the rest of the main process.
  const provider = getAgentBridgeProvider(providerId);

  try {
    let workdir: string;

    try {
      workdir = resolveVerifiedWorkdir(userData, clusterId, provider.id);
    } catch (error: any) {
      // An unprepared workspace is empty, not broken.
      if (error?.code === "ENOENT") return emptyInventory(provider);
      throw error;
    }

    const seededPaths = new Set(provider.editors.map((editor) => editor.path.split(/[\\/]+/).join("/")));

    return { status: "ok", groups: provider.artifactSources.map((source) => scanSource(workdir, source, seededPaths)) };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}
