import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ARTIFACTS_PER_KIND, MAX_ENTRIES_SCANNED } from "../common/harness-artifacts";
import { listProviderArtifacts } from "./harness-artifacts";
import { isInside, prepareProviderWorkspace } from "./provider-files";

import type { HarnessArtifactGroup, HarnessInventoryResult } from "../common/harness-artifacts";

// Filesystem calls the scanner makes, recorded so a test can assert the spec's
// hardest rule directly: the scan never lists, stats or reads anything that
// resolves outside the workdir. Nothing here changes behaviour — every wrapper
// delegates to the real implementation.
//
// "resolve" calls follow symlinks in every segment (readdir, open), so the whole
// path must land inside the workdir. "parent" calls do not follow the final
// segment (lstat), so a link inside the workdir is legitimate and only the
// containing directory has to be inside.
type FsCallMode = "resolve" | "parent";

const fsAudit = vi.hoisted(() => ({
  calls: [] as { fn: string; mode: "resolve" | "parent"; target: string }[],
  // Every `Dir.readSync()` the scan performs. `calls` records that a directory
  // was opened; only this records how much of it was pulled, which is the whole
  // claim of the entry budget — a cursor opened on a million-entry directory is
  // free, reading it to the end is not.
  dirReads: 0,
  // Paths whose lstat is made to claim "plain file" no matter what they are.
  // The one thing a real filesystem cannot be asked to do is lose a race on
  // demand, so this stands in for a path that was a regular file when it was
  // checked and is something else by the time it is used.
  pretendRegularFiles: new Set<string>(),
  // Real path -> the swap to perform the instant `realpathSync` hands that path
  // back. Same idea, one step later in the pipeline: it opens the window
  // between the scan's containment decision and the read that trusts it.
  swapOnRealpath: new Map<string, () => void>(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();

  function record<Fn extends (...args: any[]) => any>(name: string, mode: FsCallMode, fn: Fn): Fn {
    return ((...args: Parameters<Fn>) => {
      if (typeof args[0] === "string") fsAudit.calls.push({ fn: name, mode, target: args[0] });

      return fn(...args);
    }) as Fn;
  }

  const racyLstatSync = ((target: unknown, ...rest: unknown[]) => {
    const stats = (actual.lstatSync as (...args: unknown[]) => unknown)(target, ...rest);

    if (typeof target !== "string" || !fsAudit.pretendRegularFiles.has(target)) return stats;

    return { ...(stats as object), isFile: () => true, isSymbolicLink: () => false };
  }) as typeof actual.lstatSync;

  const racyRealpathSync = ((target: unknown, ...rest: unknown[]) => {
    const resolved = (actual.realpathSync as (...args: unknown[]) => unknown)(target, ...rest);

    if (typeof resolved === "string") {
      const swap = fsAudit.swapOnRealpath.get(resolved);

      // One-shot: the containment check has just passed on this path, and
      // whatever the caller does with it next is racing the swap.
      if (swap) {
        fsAudit.swapOnRealpath.delete(resolved);
        swap();
      }
    }

    return resolved;
  }) as unknown as typeof actual.realpathSync;

  // Counts entries actually pulled off the cursor. `bufferSize: 1` keeps the
  // count honest: at the default the libuv layer prefetches 32 entries per
  // syscall, so a scan could over-read by 31 and the audit would never see it.
  const countingOpendirSync = ((target: unknown, options?: object) => {
    const dir = (actual.opendirSync as (...args: unknown[]) => import("node:fs").Dir)(target, {
      ...options,
      bufferSize: 1,
    });
    const readSync = dir.readSync.bind(dir);

    dir.readSync = () => {
      fsAudit.dirReads++;
      return readSync();
    };

    return dir;
  }) as typeof actual.opendirSync;

  const mocked = {
    ...actual,
    lstatSync: record("lstatSync", "parent", racyLstatSync),
    openSync: record("openSync", "resolve", actual.openSync),
    opendirSync: record("opendirSync", "resolve", countingOpendirSync),
    readdirSync: record("readdirSync", "resolve", actual.readdirSync),
    readFileSync: record("readFileSync", "resolve", actual.readFileSync),
    realpathSync: Object.assign(racyRealpathSync, { native: actual.realpathSync.native }),
    statSync: record("statSync", "resolve", actual.statSync),
  };

  return { ...mocked, default: mocked };
});

const roots: string[] = [];

function createUserData(): string {
  const root = mkdtempSync(path.join(tmpdir(), "harness-artifacts-"));
  roots.push(root);
  return root;
}

// Every test needs a prepared workspace; seeding also gives us the one file the
// registry declares, which is what "seeded" origin is derived from.
function createWorkspace(providerId: string): { userData: string; workdir: string } {
  const userData = createUserData();
  const { workdir } = prepareProviderWorkspace(userData, "cluster-1", providerId);
  return { userData, workdir };
}

function writeSkill(workdir: string, root: string, name: string, frontmatter = `name: ${name}`): string {
  const dir = path.join(workdir, ...root.split("/"), name);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  writeFileSync(file, `---\n${frontmatter}\n---\nbody for ${name}\n`, "utf8");
  return file;
}

function writeAgent(workdir: string, root: string, name: string, frontmatter = `name: ${name}`): string {
  const dir = path.join(workdir, ...root.split("/"));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  writeFileSync(file, `---\n${frontmatter}\n---\nbody for ${name}\n`, "utf8");
  return file;
}

function setMtime(file: string, seconds: number): void {
  utimesSync(file, seconds, seconds);
}

function groupsOf(result: HarnessInventoryResult): readonly HarnessArtifactGroup[] {
  if (result.status !== "ok") throw new Error(`Expected ok inventory, got: ${result.error}`);
  return result.groups;
}

function groupFor(result: HarnessInventoryResult, kind: "skill" | "agent"): HarnessArtifactGroup {
  const group = groupsOf(result).find((candidate) => candidate.kind === kind);
  if (!group) throw new Error(`Missing group: ${kind}`);
  return group;
}

// Scans under audit call this first so only the scan's own syscalls are judged,
// not the fixture setup that ran before it.
function scanWithAudit(userData: string, clusterId: string, providerId: string): HarnessInventoryResult {
  fsAudit.calls.length = 0;
  fsAudit.dirReads = 0;

  return listProviderArtifacts(userData, clusterId, providerId);
}

// Must be called while the fixture still exists, since it re-resolves the paths
// the scan touched.
function expectNoAccessOutside(workdir: string): void {
  const escapes = fsAudit.calls.filter(({ mode, target }) => {
    const probe = mode === "resolve" ? target : path.dirname(target);

    try {
      return !isInside(workdir, realpathSync(probe));
    } catch {
      // A path that no longer resolves was never enumerated either.
      return false;
    }
  });

  expect(escapes).toEqual([]);
}

function callsTo(name: string): { fn: string; mode: FsCallMode; target: string }[] {
  return fsAudit.calls.filter(({ fn }) => fn === name);
}

afterEach(() => {
  fsAudit.calls.length = 0;
  fsAudit.dirReads = 0;
  fsAudit.pretendRegularFiles.clear();
  fsAudit.swapOnRealpath.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("listProviderArtifacts", () => {
  it("reports empty groups for an unprepared workspace", () => {
    const result = listProviderArtifacts(createUserData(), "cluster-1", "claude");

    expect(groupsOf(result).map(({ kind, count }) => ({ kind, count }))).toEqual([
      { kind: "skill", count: 0 },
      { kind: "agent", count: 0 },
    ]);
  });

  it("reports empty groups for a prepared workspace with no artifacts", () => {
    const { userData } = createWorkspace("claude");

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill").count).toBe(0);
  });

  it("discovers skills laid out as <root>/<name>/SKILL.md", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeSkill(workdir, ".claude/skills", "ns-map-kube-system", "name: ns-map-kube-system\ndescription: kube-system");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill");

    expect(group.count).toBe(1);
    expect(group.artifacts[0]).toMatchObject({
      kind: "skill",
      name: "ns-map-kube-system",
      description: "kube-system",
      path: ".claude/skills/ns-map-kube-system/SKILL.md",
      origin: "generated",
    });
  });

  it("discovers custom agents laid out as <root>/<name>.md", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeAgent(workdir, ".claude/agents", "reviewer");

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "agent").artifacts[0]).toMatchObject({
      kind: "agent",
      name: "reviewer",
      path: ".claude/agents/reviewer.md",
    });
  });

  it("ignores a skill directory with no SKILL.md and non-markdown agent files", () => {
    const { userData, workdir } = createWorkspace("claude");
    mkdirSync(path.join(workdir, ".claude/skills/empty"), { recursive: true });
    mkdirSync(path.join(workdir, ".claude/agents"), { recursive: true });
    writeFileSync(path.join(workdir, ".claude/agents/notes.txt"), "not an agent", "utf8");

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").count).toBe(0);
    expect(groupFor(result, "agent").count).toBe(0);
  });

  it("ignores an artifact path that is a directory rather than a file", () => {
    const { userData, workdir } = createWorkspace("claude");
    // A directory named SKILL.md must not be lstat-ed into an artifact.
    mkdirSync(path.join(workdir, ".claude/skills/dir-not-file/SKILL.md"), { recursive: true });

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill").count).toBe(0);
  });

  it("falls back to the path name when frontmatter has no name", () => {
    const { userData, workdir } = createWorkspace("claude");
    mkdirSync(path.join(workdir, ".claude/skills/no-frontmatter"), { recursive: true });
    writeFileSync(path.join(workdir, ".claude/skills/no-frontmatter/SKILL.md"), "# no frontmatter\n", "utf8");
    // Valid frontmatter, but without the `name` field.
    writeAgent(workdir, ".claude/agents", "unnamed", "mode: subagent");

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").artifacts[0].name).toBe("no-frontmatter");
    expect(groupFor(result, "skill").artifacts[0].description).toBeUndefined();
    expect(groupFor(result, "agent").artifacts[0].name).toBe("unnamed");
  });

  // Stripping ".md" off a file named exactly ".md" leaves nothing to render, so
  // the row would appear with no label at all.
  it("keeps the entry name when stripping the suffix would leave it empty", () => {
    const { userData, workdir } = createWorkspace("claude");
    mkdirSync(path.join(workdir, ".claude/agents"), { recursive: true });
    writeFileSync(path.join(workdir, ".claude/agents/.md"), "# no frontmatter\n", "utf8");

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "agent").artifacts[0].name).toBe(".md");
  });

  it("takes mtime from the artifact file and orders artifacts oldest-first", () => {
    const { userData, workdir } = createWorkspace("claude");
    setMtime(writeSkill(workdir, ".claude/skills", "newest"), 3_000);
    setMtime(writeSkill(workdir, ".claude/skills", "oldest"), 1_000);
    setMtime(writeSkill(workdir, ".claude/skills", "middle"), 2_000);

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill");

    expect(group.artifacts.map(({ name }) => name)).toEqual(["oldest", "middle", "newest"]);
    expect(group.oldestMtimeMs).toBe(1_000_000);
    expect(group.newestMtimeMs).toBe(3_000_000);
  });

  it("classifies a registry-declared artifact as seeded and its siblings as generated", () => {
    const { userData, workdir } = createWorkspace("copilot");
    writeSkill(workdir, ".github/skills", "ns-map-default");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "copilot"), "skill");
    const origins = Object.fromEntries(group.artifacts.map(({ name, origin }) => [name, origin]));

    expect(origins["build-cluster-map"]).toBe("seeded");
    expect(origins["ns-map-default"]).toBe("generated");
  });

  it("dedups by name across roots, first root wins", () => {
    const { userData, workdir } = createWorkspace("opencode");
    setMtime(writeSkill(workdir, ".opencode/skills", "shared"), 1_000);
    setMtime(writeSkill(workdir, ".claude/skills", "shared"), 2_000);
    writeSkill(workdir, ".agents/skills", "only-in-third");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "opencode"), "skill");

    expect(group.count).toBe(2);
    expect(group.artifacts.find(({ name }) => name === "shared")?.path).toBe(".opencode/skills/shared/SKILL.md");
  });

  it("skips symlinked entries and artifacts that resolve outside the workdir", () => {
    const { userData, workdir } = createWorkspace("claude");
    const outside = createUserData();
    mkdirSync(path.join(outside, "evil"), { recursive: true });
    writeFileSync(path.join(outside, "evil/SKILL.md"), "---\nname: evil\n---\n", "utf8");
    writeFileSync(path.join(outside, "secret.md"), "---\nname: secret\n---\n", "utf8");

    mkdirSync(path.join(workdir, ".claude/skills"), { recursive: true });
    mkdirSync(path.join(workdir, ".claude/agents"), { recursive: true });
    symlinkSync(path.join(outside, "evil"), path.join(workdir, ".claude/skills/linked"), "dir");
    symlinkSync(path.join(outside, "secret.md"), path.join(workdir, ".claude/agents/linked.md"), "file");

    // A real directory whose SKILL.md is itself a symlink escaping the workdir.
    mkdirSync(path.join(workdir, ".claude/skills/sneaky"), { recursive: true });
    symlinkSync(path.join(outside, "evil/SKILL.md"), path.join(workdir, ".claude/skills/sneaky/SKILL.md"), "file");

    const result = scanWithAudit(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").count).toBe(0);
    expect(groupFor(result, "agent").count).toBe(0);
    expectNoAccessOutside(workdir);
  });

  it("does not follow a symlinked artifact file even when its target is inside the workdir", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeSkill(workdir, ".claude/skills", "real");
    writeAgent(workdir, ".claude/agents", "real-agent");
    mkdirSync(path.join(workdir, ".claude/skills/aliased"), { recursive: true });
    // lstat, never stat: a link is not a file, so it is never counted and its
    // target's mtime is never reported as the alias's own. Both layouts.
    symlinkSync(
      path.join(workdir, ".claude/skills/real/SKILL.md"),
      path.join(workdir, ".claude/skills/aliased/SKILL.md"),
      "file",
    );
    symlinkSync(
      path.join(workdir, ".claude/agents/real-agent.md"),
      path.join(workdir, ".claude/agents/aliased-agent.md"),
      "file",
    );

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").artifacts.map(({ name }) => name)).toEqual(["real"]);
    expect(groupFor(result, "agent").artifacts.map(({ name }) => name)).toEqual(["real-agent"]);
  });

  it("re-checks containment when an artifact stops being the plain file lstat saw", () => {
    const { userData, workdir } = createWorkspace("claude");
    const outside = createUserData();
    writeFileSync(path.join(outside, "SKILL.md"), "---\nname: raced\n---\n", "utf8");
    mkdirSync(path.join(workdir, ".claude/skills/raced"), { recursive: true });
    const artifact = path.join(workdir, ".claude/skills/raced/SKILL.md");
    symlinkSync(path.join(outside, "SKILL.md"), artifact, "file");
    // Every earlier guard is satisfied: a real root, a real directory entry and
    // an lstat that reports a plain file. Only re-resolving the path before use
    // keeps the out-of-workspace file out of the inventory.
    fsAudit.pretendRegularFiles.add(artifact);

    const result = scanWithAudit(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").count).toBe(0);
    expectNoAccessOutside(workdir);
  });

  // A hardlink has no separate real path, so realpathSync — which resolves
  // symlinks — reports the in-workspace path and every containment check passes
  // while the bytes belong to a file outside the workspace entirely.
  it("skips an artifact file with more than one hard link", () => {
    const { userData, workdir } = createWorkspace("claude");
    const outside = createUserData();
    const secret = path.join(outside, "secret.md");
    writeFileSync(secret, "---\nname: hardlinked-secret\ndescription: outside the workspace\n---\n", "utf8");

    mkdirSync(path.join(workdir, ".claude/skills/pwned"), { recursive: true });
    mkdirSync(path.join(workdir, ".claude/agents"), { recursive: true });
    linkSync(secret, path.join(workdir, ".claude/skills/pwned/SKILL.md"));
    linkSync(secret, path.join(workdir, ".claude/agents/pwned.md"));

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").count).toBe(0);
    expect(groupFor(result, "agent").count).toBe(0);
    expect(JSON.stringify(result)).not.toContain("hardlinked-secret");
  });

  it("skips a hard-linked artifact even when its other link is inside the workdir", () => {
    const { userData, workdir } = createWorkspace("claude");
    const real = writeSkill(workdir, ".claude/skills", "real");
    mkdirSync(path.join(workdir, ".claude/skills/twin"), { recursive: true });
    // Nothing distinguishes this from the escaping case above: a second link is
    // invisible from the path side, so link count is the only signal there is.
    // Excluding cross-workspace hardlinks too is the price, and no symlink check
    // could have caught either.
    linkSync(real, path.join(workdir, ".claude/skills/twin/SKILL.md"));

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill").count).toBe(0);
  });

  // The scan resolved and containment-checked this path; readFrontmatter then
  // opens it again, which is an independent third resolution. Only an open that
  // refuses to follow a symlink and re-identifies the descriptor closes that
  // window.
  it("does not read a file swapped for a symlink after its path was resolved", () => {
    const { userData, workdir } = createWorkspace("claude");
    const outside = createUserData();
    writeFileSync(path.join(outside, "secret.md"), "---\nname: outside-secret\n---\n", "utf8");
    const artifact = realpathSync(writeSkill(workdir, ".claude/skills", "raced"));

    fsAudit.swapOnRealpath.set(artifact, () => {
      rmSync(artifact);
      symlinkSync(path.join(outside, "secret.md"), artifact, "file");
    });

    const group = groupFor(scanWithAudit(userData, "cluster-1", "claude"), "skill");

    // The entry is still counted — it was a real file when it was checked — but
    // its metadata now comes from the directory name, never from the file the
    // attacker substituted.
    expect(group.artifacts.map(({ name }) => name)).toEqual(["raced"]);
    expect(JSON.stringify(group)).not.toContain("outside-secret");
  });

  it("skips a declared root that is itself a symlink escaping the workdir", () => {
    const { userData, workdir } = createWorkspace("claude");
    const outside = createUserData();
    mkdirSync(path.join(outside, "evil"), { recursive: true });
    writeFileSync(path.join(outside, "evil/SKILL.md"), "---\nname: evil\n---\n", "utf8");

    // The root itself is the link, so every entry below it is a real directory
    // holding a real file: only a check on the ROOT's real path can stop the
    // scan from listing and stat-ing an out-of-workspace tree.
    mkdirSync(path.join(workdir, ".claude"), { recursive: true });
    symlinkSync(outside, path.join(workdir, ".claude/skills"), "dir");

    const result = scanWithAudit(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").count).toBe(0);
    expectNoAccessOutside(workdir);
  });

  it("scans a root symlinked to another directory inside the workdir and reports its real path", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeSkill(workdir, ".claude/real-skills", "linked-root-skill");
    symlinkSync(path.join(workdir, ".claude/real-skills"), path.join(workdir, ".claude/skills"), "dir");

    const group = groupFor(scanWithAudit(userData, "cluster-1", "claude"), "skill");

    expect(group.artifacts.map(({ name, path: relativePath }) => [name, relativePath])).toEqual([
      ["linked-root-skill", ".claude/real-skills/linked-root-skill/SKILL.md"],
    ]);
    expectNoAccessOutside(workdir);
  });

  it("caps a kind at 200 artifacts and flags the result as truncated", () => {
    const { userData, workdir } = createWorkspace("claude");
    for (let index = 0; index < 201; index++) {
      writeSkill(workdir, ".claude/skills", `skill-${String(index).padStart(3, "0")}`);
    }

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill");

    expect(group.count).toBe(200);
    expect(group.truncated).toBe(true);
  });

  it("does not flag exactly 200 artifacts as truncated", () => {
    const { userData, workdir } = createWorkspace("claude");
    for (let index = 0; index < 200; index++) {
      writeSkill(workdir, ".claude/skills", `skill-${String(index).padStart(3, "0")}`);
    }

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill").truncated).toBe(false);
  });

  // The cap bounds the RESULT; this bounds the WORK. Dedup drops and entries
  // that hold no artifact file never reach the cap, so without a second budget a
  // workspace can make this synchronous main-process handler lstat, realpath and
  // head-read every one of hundreds of thousands of entries.
  it("bounds the entries it examines, not just the artifacts it keeps", () => {
    const { userData, workdir } = createWorkspace("claude");
    const total = MAX_ENTRIES_SCANNED + 100;

    for (let index = 0; index < total; index++) {
      writeSkill(workdir, ".claude/skills", `dup-${String(index).padStart(5, "0")}`, "name: same-name");
    }

    const group = groupFor(scanWithAudit(userData, "cluster-1", "claude"), "skill");

    // One artifact kept out of 2100 directories: the per-kind cap never fires,
    // which is exactly why it cannot be the thing that bounds the scan.
    expect(group.count).toBe(1);
    // Syscalls, not wall-clock time: the cost is what the handler did, and a
    // timing assertion would be a flake on a busy CI machine.
    expect(callsTo("openSync").length).toBeLessThanOrEqual(MAX_ENTRIES_SCANNED);
    expect(callsTo("lstatSync").length).toBeLessThanOrEqual(MAX_ENTRIES_SCANNED);
    expect(group.truncated).toBe(true);
  });

  // One layer up from the test above, and the same lesson: a cap on entries
  // EXAMINED does not bound entries LISTED. `readdirSync` materialises the whole
  // directory and the alphabetical sort walks all of it, both before the budget
  // is consulted once — so the loop was bounded while the syscall in front of it
  // was not. Only a cursor makes the listing itself stop.
  it("stops listing a directory at the entry budget instead of materialising it", () => {
    const { userData, workdir } = createWorkspace("claude");
    const total = MAX_ENTRIES_SCANNED + 100;

    // Plain files, not skill directories: the skill-dir layout ignores them, so
    // they cost nothing but a budget charge each — which is precisely the case
    // MAX_ARTIFACTS_PER_KIND cannot bound.
    mkdirSync(path.join(workdir, ".claude/skills"), { recursive: true });
    for (let index = 0; index < total; index++) {
      writeFileSync(path.join(workdir, ".claude/skills", `not-a-skill-${String(index).padStart(5, "0")}`), "", "utf8");
    }

    const group = groupFor(scanWithAudit(userData, "cluster-1", "claude"), "skill");

    // Without this the assertion below is vacuous: reintroducing `readdirSync`
    // would leave zero cursor reads and a listing bounded by nothing.
    expect(callsTo("readdirSync")).toEqual([]);
    // The budget, plus the single read past it that distinguishes "the directory
    // ended" from "we stopped".
    expect(fsAudit.dirReads).toBeLessThanOrEqual(MAX_ENTRIES_SCANNED + 1);
    expect(group.count).toBe(0);
    expect(group.truncated).toBe(true);
  });

  // The budget is per KIND across roots, so it can run out at a root boundary
  // rather than mid-root. Skipping the remaining roots there is correct; doing it
  // silently is not — the header would print an authoritative count for a scan
  // that never looked at a whole directory.
  it("reports truncation when the budget runs out before a later root is listed", () => {
    const { userData, workdir } = createWorkspace("opencode");

    // Exactly the budget, in entries that yield no artifact: the per-kind cap
    // never fires, so truncation can only come from the entry budget.
    mkdirSync(path.join(workdir, ".opencode/skills"), { recursive: true });
    for (let index = 0; index < MAX_ENTRIES_SCANNED; index++) {
      writeFileSync(
        path.join(workdir, ".opencode/skills", `not-a-skill-${String(index).padStart(5, "0")}`),
        "",
        "utf8",
      );
    }
    // Third declared root, never reached.
    writeSkill(workdir, ".agents/skills", "dropped-with-the-root");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "opencode"), "skill");

    expect(group.count).toBe(0);
    expect(group.truncated).toBe(true);
  });

  // The mirror image: an exhausted budget must not invent truncation for roots
  // that hold nothing, or every workspace with a large first root would report a
  // floor it does not have.
  it("does not report truncation when the unlisted roots are empty or absent", () => {
    const { userData, workdir } = createWorkspace("opencode");

    mkdirSync(path.join(workdir, ".opencode/skills"), { recursive: true });
    for (let index = 0; index < MAX_ENTRIES_SCANNED; index++) {
      writeFileSync(
        path.join(workdir, ".opencode/skills", `not-a-skill-${String(index).padStart(5, "0")}`),
        "",
        "utf8",
      );
    }
    // Second root exists but is empty; the third does not exist at all.
    mkdirSync(path.join(workdir, ".claude/skills"), { recursive: true });

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "opencode"), "skill").truncated).toBe(false);
  });

  // Truncation drops artifacts in NAME order while the group is displayed in
  // MTIME order, so the kept set's range says nothing about the workspace. Here
  // the five newest skills sort last by name and are exactly the ones dropped.
  it("reports the true mtime range and examined count for a truncated kind", () => {
    const { userData, workdir } = createWorkspace("claude");
    const total = MAX_ARTIFACTS_PER_KIND + 5;

    for (let index = 0; index < total; index++) {
      const file = writeSkill(workdir, ".claude/skills", `skill-${String(index).padStart(3, "0")}`);

      setMtime(file, index < MAX_ARTIFACTS_PER_KIND ? 1_000 : 2_000_000_000);
    }

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill");

    expect(group.count).toBe(MAX_ARTIFACTS_PER_KIND);
    expect(group.truncated).toBe(true);
    expect(group.examinedCount).toBe(total);
    expect(group.newestMtimeMs).toBe(2_000_000_000_000);
    expect(group.oldestMtimeMs).toBe(1_000_000);
  });

  it("reports the examined count as the artifact count for an untruncated kind", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeSkill(workdir, ".claude/skills", "one");
    writeSkill(workdir, ".claude/skills", "two");

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill").examinedCount).toBe(2);
  });

  it("does not let a deduped name consume cap budget or fake truncation", () => {
    const { userData, workdir } = createWorkspace("opencode");
    for (let index = 0; index < 200; index++) {
      writeSkill(workdir, ".opencode/skills", `skill-${String(index).padStart(3, "0")}`);
    }
    // Same name as an artifact the first root already contributed: it is dropped
    // by dedup, so it is not a 201st artifact and nothing was truncated.
    writeSkill(workdir, ".claude/skills", "skill-000");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "opencode"), "skill");

    expect(group.count).toBe(200);
    expect(group.truncated).toBe(false);
  });

  // The canary is shaped `description: <secret>` and sits in a document with no
  // closing delimiter, because that is the only shape a `key: value` reader can
  // actually capture. A canary without a colon in it would make this test pass
  // by construction, whatever the reader did.
  it("never returns file bodies", () => {
    const { userData, workdir } = createWorkspace("claude");
    mkdirSync(path.join(workdir, ".claude/skills/secretive"), { recursive: true });
    writeFileSync(
      path.join(workdir, ".claude/skills/secretive/SKILL.md"),
      "---\n# Deployment notes\n\nSome prose here.\ndescription: SUPER-SECRET-BODY\n\nmore prose\n",
      "utf8",
    );
    // Same canary in the other layout, and in a file whose real frontmatter
    // closed long before the body line.
    writeAgent(workdir, ".claude/agents", "closed", "name: closed\ndescription: safe");
    writeFileSync(
      path.join(workdir, ".claude/agents/closed.md"),
      "---\nname: closed\ndescription: safe\n---\ndescription: SUPER-SECRET-BODY\n",
      "utf8",
    );

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").artifacts[0].name).toBe("secretive");
    expect(groupFor(result, "skill").artifacts[0].description).toBeUndefined();
    expect(groupFor(result, "agent").artifacts[0].description).toBe("safe");
    expect(JSON.stringify(result)).not.toContain("SUPER-SECRET-BODY");
  });

  it("returns an error result when the workspace fails its containment check", () => {
    const userData = createUserData();
    const outside = createUserData();
    // A sessions root that escapes userData is refused by resolveVerifiedWorkdir;
    // that is a real failure, not an empty workspace.
    symlinkSync(outside, path.join(userData, "agentbridge-sessions"), "dir");

    expect(listProviderArtifacts(userData, "cluster-1", "claude")).toEqual({
      status: "error",
      error: "Forbidden path",
    });
  });

  it("throws for an unknown provider", () => {
    expect(() => listProviderArtifacts(createUserData(), "cluster-1", "unknown")).toThrowError(
      new Error("Unsupported AI CLI provider: unknown"),
    );
  });
});
