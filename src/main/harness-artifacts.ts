import { lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { getAgentBridgeProvider } from "../common/agentbridge-providers";
import { buildArtifactGroup, MAX_ARTIFACTS_PER_KIND } from "../common/harness-artifacts";
import { isInside, resolveVerifiedWorkdir } from "./provider-files";
import { readFrontmatter } from "./read-frontmatter";
import type { Dirent, Stats } from "node:fs";

import type { AgentBridgeProvider } from "../common/agentbridge-providers";
import type {
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
// symlink out of the workspace — `readdirSync` follows it happily, and the scan
// would list and lstat an out-of-workspace tree. The per-entry check downstream
// would still discard those results, but the listing itself is an existence
// oracle, so the containment decision has to happen before the first readdir.
//
// Everything below the returned directory is therefore rooted inside the
// workdir, and only symlinks below it can still escape.
function resolveRootDir(workdir: string, root: string): string | undefined {
  const rootDir = path.resolve(workdir, ...root.split("/"));
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

function fallbackNameFor(source: ArtifactSource, entryName: string): string {
  return source.layout === "skill-dir" ? entryName : entryName.replace(/\.md$/i, "");
}

function scanSource(workdir: string, source: ArtifactSource, seededPaths: ReadonlySet<string>): HarnessArtifactGroup {
  const artifacts: HarnessArtifact[] = [];
  const seenNames = new Set<string>();
  let truncated = false;

  for (const root of source.roots) {
    if (truncated) break;

    const rootDir = resolveRootDir(workdir, root);

    if (!rootDir) continue;

    let entries: Dirent[];

    try {
      entries = readdirSync(rootDir, { withFileTypes: true });
    } catch {
      // A root that is not a directory (ENOTDIR) or not readable (EACCES)
      // simply contributes nothing.
      continue;
    }

    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
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

      const frontmatter = readFrontmatter(realFile);
      const name = frontmatter.name ?? fallbackNameFor(source, entry.name);

      // First root that declares a name wins, which is what makes a multi-root
      // kind safe to declare.
      if (seenNames.has(name)) continue;

      // Deliberately after the dedup check: a duplicate is not an artifact, so
      // it must neither consume cap budget nor report truncation for a workspace
      // from which nothing was actually dropped.
      if (artifacts.length >= MAX_ARTIFACTS_PER_KIND) {
        truncated = true;
        break;
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

  return buildArtifactGroup(source.kind, artifacts, truncated);
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
