import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { computeProviderWorkdir } from "./get-provider-workdir";
import {
  prepareProviderWorkspace,
  readProviderFile,
  resetProvider,
  revealProviderWorkspace,
  writeProviderFile,
} from "./provider-files";

const roots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "provider-workspace-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("provider workspaces", () => {
  it.each(agentBridgeProviders)("seeds each provider's declared files without clobbering them", (provider) => {
    const userData = createRoot();
    const first = prepareProviderWorkspace(userData, "cluster-1", provider.id);

    expect(first.seeded).toBe(true);
    for (const editor of provider.editors) {
      const target = path.join(first.workdir, editor.path);
      expect(existsSync(target)).toBe(true);
      writeFileSync(target, `edited ${editor.path}`, "utf8");
    }

    expect(prepareProviderWorkspace(userData, "cluster-1", provider.id)).toEqual({
      workdir: first.workdir,
      seeded: false,
    });
    for (const editor of provider.editors) {
      expect(readFileSync(path.join(first.workdir, editor.path), "utf8")).toBe(`edited ${editor.path}`);
    }
  });

  it("resets only registered reset paths", () => {
    const userData = createRoot();
    const { workdir } = prepareProviderWorkspace(userData, "cluster-1", "opencode");
    const instructions = path.join(workdir, "AGENTS.md");
    const unrelated = path.join(workdir, "notes.md");
    writeFileSync(instructions, "keep instructions", "utf8");
    writeFileSync(unrelated, "keep notes", "utf8");

    resetProvider(userData, "cluster-1", "opencode");

    expect(readFileSync(instructions, "utf8")).toBe("keep instructions");
    expect(readFileSync(unrelated, "utf8")).toBe("keep notes");
    expect(existsSync(path.join(workdir, ".opencode", "opencode.json"))).toBe(true);
  });

  it("migrates a collision-safe legacy OpenCode workspace", () => {
    const userData = createRoot();
    const clusterId = "legacy-cluster";
    const legacyWorkdir = path.join(userData, "opencode-sessions", clusterId);
    const targetWorkdir = computeProviderWorkdir(realpathSync(userData), clusterId, "opencode");
    mkdirSync(path.join(legacyWorkdir, ".opencode"), { recursive: true });
    writeFileSync(path.join(legacyWorkdir, "AGENTS.md"), "# legacy\n", "utf8");
    writeFileSync(path.join(legacyWorkdir, ".opencode", "opencode.json"), "{}\n", "utf8");

    expect(prepareProviderWorkspace(userData, clusterId, "opencode")).toEqual({
      workdir: targetWorkdir,
      seeded: false,
    });
    expect(readFileSync(path.join(targetWorkdir, "AGENTS.md"), "utf8")).toBe("# legacy\n");
    expect(existsSync(legacyWorkdir)).toBe(false);
  });

  it.each([
    "../escape",
    "dir/../file",
    "bad\0path",
    path.resolve(path.sep, "absolute"),
  ])("rejects unsafe declared paths: %s", (relPath) => {
    const userData = createRoot();
    prepareProviderWorkspace(userData, "cluster-1", "opencode");

    expect(() => readProviderFile(userData, "cluster-1", "opencode", relPath)).toThrow(/Forbidden path/);
  });

  it("rejects writes to paths not declared by provider", () => {
    const userData = createRoot();
    prepareProviderWorkspace(userData, "cluster-1", "opencode");

    expect(() => writeProviderFile(userData, "cluster-1", "opencode", "notes.md", "no")).toThrow(/Forbidden path/);
  });

  it("rejects a declared file whose parent symlink escapes the workdir", () => {
    const userData = createRoot();
    const outside = createRoot();
    const { workdir } = prepareProviderWorkspace(userData, "cluster-1", "opencode");
    const opencodeDir = path.join(workdir, ".opencode");
    rmSync(opencodeDir, { recursive: true, force: true });
    symlinkSync(outside, opencodeDir, process.platform === "win32" ? "junction" : "dir");

    expect(() => writeProviderFile(userData, "cluster-1", "opencode", ".opencode/opencode.json", "{}")).toThrow(
      /Forbidden path/,
    );
    expect(lstatSync(opencodeDir).isSymbolicLink()).toBe(true);
  });

  it("rejects every managed operation when the computed workdir escapes sessions", () => {
    const userData = createRoot();
    const outside = createRoot();
    const workdir = computeProviderWorkdir(userData, "cluster-1", "opencode");
    mkdirSync(path.dirname(workdir), { recursive: true });
    symlinkSync(outside, workdir, process.platform === "win32" ? "junction" : "dir");

    for (const operation of [
      () => prepareProviderWorkspace(userData, "cluster-1", "opencode"),
      () => readProviderFile(userData, "cluster-1", "opencode", "AGENTS.md"),
      () => writeProviderFile(userData, "cluster-1", "opencode", "AGENTS.md", "unsafe"),
      () => resetProvider(userData, "cluster-1", "opencode"),
    ]) {
      expect(operation).toThrow(/Forbidden path/);
    }
  });

  it("rejects a symlinked cluster-key parent before creating a provider workdir outside sessions", () => {
    const userData = createRoot();
    const outside = createRoot();
    const workdir = computeProviderWorkdir(userData, "cluster-1", "opencode");
    const clusterDir = path.dirname(workdir);
    mkdirSync(path.dirname(clusterDir), { recursive: true });
    symlinkSync(outside, clusterDir, process.platform === "win32" ? "junction" : "dir");

    expect(() => prepareProviderWorkspace(userData, "cluster-1", "opencode")).toThrow(/Forbidden path/);
    expect(existsSync(path.join(outside, "opencode"))).toBe(false);
  });

  it("rejects managed operations when sessions root is symlinked outside user data", () => {
    const userData = createRoot();
    const outside = createRoot();
    symlinkSync(
      outside,
      path.join(userData, "agentbridge-sessions"),
      process.platform === "win32" ? "junction" : "dir",
    );

    for (const operation of [
      () => prepareProviderWorkspace(userData, "cluster-1", "opencode"),
      () => readProviderFile(userData, "cluster-1", "opencode", "AGENTS.md"),
      () => writeProviderFile(userData, "cluster-1", "opencode", "AGENTS.md", "unsafe"),
      () => resetProvider(userData, "cluster-1", "opencode"),
    ]) {
      expect(operation).toThrow(/Forbidden path/);
    }
  });

  it("does not reveal a workdir when sessions root is symlinked outside user data", async () => {
    const userData = createRoot();
    const outside = createRoot();
    const sessionsRoot = path.join(userData, "agentbridge-sessions");
    symlinkSync(outside, sessionsRoot, process.platform === "win32" ? "junction" : "dir");
    mkdirSync(computeProviderWorkdir(userData, "cluster-1", "opencode"), { recursive: true });
    let opened = false;

    await expect(
      revealProviderWorkspace(userData, "cluster-1", "opencode", async () => {
        opened = true;
        return "";
      }),
    ).resolves.toEqual({ ok: false, error: "Forbidden path" });

    expect(opened).toBe(false);
  });

  it("reveals computed real provider workdir", async () => {
    const userData = createRoot();
    const { workdir } = prepareProviderWorkspace(userData, "cluster-1", "claude");
    let revealed = "";

    await expect(
      revealProviderWorkspace(userData, "cluster-1", "claude", async (selected) => {
        revealed = selected;
        return "";
      }),
    ).resolves.toEqual({ ok: true });

    expect(revealed).toBe(path.resolve(workdir));
  });
});
