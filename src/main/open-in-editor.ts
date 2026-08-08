import { spawn as nodeSpawn } from "node:child_process";
import { resolveVerifiedWorkdir } from "./provider-files";

// Minimal shape of the child process we rely on: an event emitter that fires
// "spawn" on success and "error" on failure (e.g. ENOENT when the editor
// binary is not on PATH), "exit" with the process exit code, plus unref() so
// the launched editor does not keep the Freelens process alive.
export interface SpawnedProcess {
  once(event: "spawn", listener: () => void): unknown;
  once(event: "exit", listener: (code: number | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  unref?(): void;
}

export type Spawn = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: "ignore"; shell: boolean },
) => SpawnedProcess;

export type OpenExternal = (url: string) => Promise<void>;

export interface OpenInEditorDeps {
  editorCommand: string;
  editorUriScheme: string;
  spawn?: Spawn;
  openExternal: OpenExternal;
  platform?: NodeJS.Platform;
}

// Build a `vscode://file/<path>` style URI. The absolute path is converted to
// forward slashes, given a leading slash, and each segment is percent-encoded
// so spaces, drive-letter colons, and other reserved characters survive.
export function pathToEditorUri(scheme: string, workdir: string): string {
  const forward = workdir.replace(/\\/g, "/");
  const withLeadingSlash = forward.startsWith("/") ? forward : `/${forward}`;
  const encoded = withLeadingSlash.split("/").map(encodeURIComponent).join("/");

  return `${scheme}://file${encoded}`;
}

function launchEditorProcess(spawn: Spawn, editorCommand: string, workdir: string, isWindows: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error?: Error) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve();
    };

    try {
      if (isWindows) {
        // On Windows `code` is a `.cmd` shim that Node refuses to spawn without
        // a shell. editorCommand is allow-listed to a bare token and workdir is
        // a verified path with no shell metacharacters, so quoting the workdir
        // is enough to survive spaces without opening an injection vector.
        const child = spawn(`"${editorCommand}" "${workdir}"`, [], { detached: true, stdio: "ignore", shell: true });

        // The shell (cmd.exe) always spawns successfully, even when the editor
        // binary is not found ("'code' is not recognized ..."), so a "spawn"
        // event is NOT proof the editor launched. code.cmd exits 0 immediately
        // after launching the window and cmd.exe exits non-zero when the binary
        // is missing, so decide success from the exit code. On failure we reject
        // and let the caller fall back to the `vscode://` URI handler, which
        // does not depend on PATH.
        child.once("error", (error) => done(error));
        child.once("exit", (code) =>
          code && code !== 0 ? done(new Error(`"${editorCommand}" exited with code ${code}`)) : done(),
        );
        child.unref?.();
      } else {
        // On macOS/Linux `code` is a real executable, so a successful "spawn"
        // means the launcher started; keep the fire-and-forget behaviour and let
        // an "error" (e.g. ENOENT) trigger the URI fallback.
        const child = spawn(editorCommand, [workdir], { detached: true, stdio: "ignore", shell: false });

        child.once("spawn", () => done());
        child.once("error", (error) => done(error));
        child.unref?.();
      }
    } catch (error) {
      done(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// Open the provider workspace as a project in the configured editor. Tries the
// editor CLI first (reliable "open folder as window" behaviour and real
// success/failure signalling); if the binary cannot be launched, falls back to
// the `<scheme>://file/...` URI handler that the editor registers on install.
export async function openWorkspaceInEditor(
  userData: string,
  clusterId: string,
  providerId: string,
  deps: OpenInEditorDeps,
): Promise<{ ok: boolean; error?: string }> {
  const { editorCommand, editorUriScheme, spawn = nodeSpawn as unknown as Spawn, openExternal } = deps;
  const platform = deps.platform ?? process.platform;

  let workdir: string;
  try {
    workdir = resolveVerifiedWorkdir(userData, clusterId, providerId);
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  }

  try {
    await launchEditorProcess(spawn, editorCommand, workdir, platform === "win32");
    return { ok: true };
  } catch (spawnError: any) {
    try {
      await openExternal(pathToEditorUri(editorUriScheme, workdir));
      return { ok: true };
    } catch (uriError: any) {
      const spawnMessage = spawnError?.message ?? String(spawnError);
      const uriMessage = uriError?.message ?? String(uriError);

      return {
        ok: false,
        error: `Could not launch "${editorCommand}" (${spawnMessage}); ${editorUriScheme}:// fallback failed (${uriMessage}). Install the editor's shell command or set the editor command in Preferences.`,
      };
    }
  }
}
