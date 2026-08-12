import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  calls: [] as { mode: "resolve" | "parent"; target: string }[],
  // Paths whose lstat is made to claim "plain file" no matter what they are.
  // The one thing a real filesystem cannot be asked to do is lose a race on
  // demand, so this stands in for a path that was a regular file when it was
  // checked and is something else by the time it is used.
  pretendRegularFiles: new Set<string>(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();

  function record<Fn extends (...args: any[]) => any>(mode: FsCallMode, fn: Fn): Fn {
    return ((...args: Parameters<Fn>) => {
      if (typeof args[0] === "string") fsAudit.calls.push({ mode, target: args[0] });

      return fn(...args);
    }) as Fn;
  }

  const racyLstatSync = ((target: unknown, ...rest: unknown[]) => {
    const stats = (actual.lstatSync as (...args: unknown[]) => unknown)(target, ...rest);

    if (typeof target !== "string" || !fsAudit.pretendRegularFiles.has(target)) return stats;

    return { ...(stats as object), isFile: () => true, isSymbolicLink: () => false };
  }) as typeof actual.lstatSync;

  const mocked = {
    ...actual,
    lstatSync: record("parent", racyLstatSync),
    openSync: record("resolve", actual.openSync),
    readdirSync: record("resolve", actual.readdirSync),
    readFileSync: record("resolve", actual.readFileSync),
    statSync: record("resolve", actual.statSync),
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

afterEach(() => {
  fsAudit.calls.length = 0;
  fsAudit.pretendRegularFiles.clear();
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

  it("never returns file bodies", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeSkill(workdir, ".claude/skills", "secretive", "name: secretive\ndescription: safe");
    writeFileSync(
      path.join(workdir, ".claude/skills/secretive/SKILL.md"),
      "---\nname: secretive\ndescription: safe\n---\nSUPER-SECRET-BODY\n",
      "utf8",
    );

    expect(JSON.stringify(listProviderArtifacts(userData, "cluster-1", "claude"))).not.toContain("SUPER-SECRET-BODY");
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
