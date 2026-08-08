import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeProviderWorkdir } from "./get-provider-workdir";
import { openWorkspaceInEditor, pathToEditorUri, type Spawn } from "./open-in-editor";
import { prepareProviderWorkspace } from "./provider-files";

const roots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "open-in-editor-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A fake child process that, on the next tick (after openWorkspaceInEditor has
// attached its listeners), emits one of:
//   "spawn"        - launcher started (POSIX success signal)
//   { exit }       - process exited with a code (Windows success/failure signal)
//   { error }      - spawn-level failure, e.g. ENOENT when the binary is missing
function fakeSpawn(outcome: "spawn" | { exit: number } | { error: Error }): {
  spawn: Spawn;
  child: EventEmitter & { unref: () => void };
} {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  const spawn = vi.fn(() => {
    process.nextTick(() => {
      if (outcome === "spawn") child.emit("spawn");
      else if ("error" in outcome) child.emit("error", outcome.error);
      else child.emit("exit", outcome.exit);
    });
    return child;
  }) as unknown as Spawn;

  return { spawn, child };
}

describe("pathToEditorUri", () => {
  it("encodes a POSIX path with spaces", () => {
    expect(pathToEditorUri("vscode", "/home/user/My Work/dir")).toBe("vscode://file/home/user/My%20Work/dir");
  });

  it("encodes a Windows path with a drive letter", () => {
    expect(pathToEditorUri("vscode", "C:\\Users\\a b")).toBe("vscode://file/C%3A/Users/a%20b");
  });

  it("honours a custom scheme", () => {
    expect(pathToEditorUri("cursor", "/tmp/x")).toBe("cursor://file/tmp/x");
  });
});

describe("openWorkspaceInEditor", () => {
  it("launches the editor CLI with the verified workdir", async () => {
    const userData = createRoot();
    const { workdir } = prepareProviderWorkspace(userData, "cluster-1", "claude");
    const { spawn } = fakeSpawn("spawn");
    const openExternal = vi.fn();

    await expect(
      openWorkspaceInEditor(userData, "cluster-1", "claude", {
        editorCommand: "code",
        editorUriScheme: "vscode",
        spawn,
        openExternal,
        platform: "linux",
      }),
    ).resolves.toEqual({ ok: true });

    expect(spawn).toHaveBeenCalledWith("code", [path.resolve(workdir)], {
      detached: true,
      stdio: "ignore",
      shell: false,
    });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("quotes the command and workdir behind a shell on Windows and succeeds on exit 0", async () => {
    const userData = createRoot();
    const { workdir } = prepareProviderWorkspace(userData, "cluster-1", "claude");
    const { spawn } = fakeSpawn({ exit: 0 });
    const openExternal = vi.fn();

    await expect(
      openWorkspaceInEditor(userData, "cluster-1", "claude", {
        editorCommand: "code",
        editorUriScheme: "vscode",
        spawn,
        openExternal,
        platform: "win32",
      }),
    ).resolves.toEqual({ ok: true });

    expect(spawn).toHaveBeenCalledWith(`"code" "${path.resolve(workdir)}"`, [], {
      detached: true,
      stdio: "ignore",
      shell: true,
    });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("falls back to the URI handler when the Windows shell exits non-zero (binary not on PATH)", async () => {
    const userData = createRoot();
    const { workdir } = prepareProviderWorkspace(userData, "cluster-1", "claude");
    // 9009 is cmd.exe's exit code for "'code' is not recognized ...".
    const { spawn } = fakeSpawn({ exit: 9009 });
    const openExternal = vi.fn().mockResolvedValue(undefined);

    await expect(
      openWorkspaceInEditor(userData, "cluster-1", "claude", {
        editorCommand: "code",
        editorUriScheme: "vscode",
        spawn,
        openExternal,
        platform: "win32",
      }),
    ).resolves.toEqual({ ok: true });

    expect(openExternal).toHaveBeenCalledWith(pathToEditorUri("vscode", path.resolve(workdir)));
  });

  it("falls back to the URI handler when the editor binary is missing", async () => {
    const userData = createRoot();
    const { workdir } = prepareProviderWorkspace(userData, "cluster-1", "claude");
    const enoent = Object.assign(new Error("spawn code ENOENT"), { code: "ENOENT" });
    const { spawn } = fakeSpawn({ error: enoent });
    const openExternal = vi.fn().mockResolvedValue(undefined);

    await expect(
      openWorkspaceInEditor(userData, "cluster-1", "claude", {
        editorCommand: "code",
        editorUriScheme: "vscode",
        spawn,
        openExternal,
        platform: "linux",
      }),
    ).resolves.toEqual({ ok: true });

    expect(openExternal).toHaveBeenCalledWith(pathToEditorUri("vscode", path.resolve(workdir)));
  });

  it("reports an error when both the CLI and the URI fallback fail", async () => {
    const userData = createRoot();
    prepareProviderWorkspace(userData, "cluster-1", "claude");
    const { spawn } = fakeSpawn({ error: new Error("spawn code ENOENT") });
    const openExternal = vi.fn().mockRejectedValue(new Error("no handler"));

    const result = await openWorkspaceInEditor(userData, "cluster-1", "claude", {
      editorCommand: "code",
      editorUriScheme: "vscode",
      spawn,
      openExternal,
      platform: "linux",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("spawn code ENOENT");
    expect(result.error).toContain("no handler");
  });

  it("rejects a workdir whose sessions root escapes user data", async () => {
    const userData = createRoot();
    const outside = createRoot();
    const sessionsRoot = path.join(userData, "agentbridge-sessions");
    symlinkSync(outside, sessionsRoot, process.platform === "win32" ? "junction" : "dir");
    mkdirSync(computeProviderWorkdir(userData, "cluster-1", "claude"), { recursive: true });
    const { spawn } = fakeSpawn("spawn");
    const openExternal = vi.fn();

    await expect(
      openWorkspaceInEditor(userData, "cluster-1", "claude", {
        editorCommand: "code",
        editorUriScheme: "vscode",
        spawn,
        openExternal,
        platform: "linux",
      }),
    ).resolves.toEqual({ ok: false, error: "Forbidden path" });

    expect(spawn).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});
