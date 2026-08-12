import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { getAgentBridgeProvider } from "../common/agentbridge-providers";
import { computeProviderWorkdir } from "./get-provider-workdir";
import { resolveProviderScaffold } from "./scaffold-source";

type OpenPath = (path: string) => Promise<string>;

// Exported for the artifact scanner, which needs the same win32-aware
// containment rule. Keep this the single definition.
export function isInside(root: string, candidate: string): boolean {
  const normalize = (value: string) => (process.platform === "win32" ? value.toLowerCase() : value);
  const normalizedRoot = normalize(path.resolve(root));
  const normalizedCandidate = normalize(path.resolve(candidate));

  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function assertDeclaredPath(providerId: string, relPath: string): void {
  const provider = getAgentBridgeProvider(providerId);
  const segments = relPath.split(/[\\/]+/);

  if (
    relPath.includes("\0") ||
    path.isAbsolute(relPath) ||
    path.win32.isAbsolute(relPath) ||
    segments.includes("..") ||
    !provider.editors.some((editor) => editor.path === relPath)
  ) {
    throw new Error("Forbidden path");
  }
}

function getRealSessionsRoot(userData: string, create = false): { userData: string; sessionsRoot: string } {
  const realUserData = realpathSync(userData);
  const sessionsPath = path.join(realUserData, "agentbridge-sessions");
  if (create) mkdirSync(sessionsPath, { recursive: true });
  const realSessionsRoot = realpathSync(sessionsPath);

  if (!isInside(realUserData, realSessionsRoot)) throw new Error("Forbidden path");

  return { userData: realUserData, sessionsRoot: realSessionsRoot };
}

function getWorkdir(userData: string, clusterId: string, providerId: string): string {
  const { userData: realUserData, sessionsRoot } = getRealSessionsRoot(userData, true);
  const workdir = computeProviderWorkdir(realUserData, clusterId, providerId);
  let realParent: string;
  try {
    realParent = realpathSync(nearestExistingParent(workdir));
  } catch {
    throw new Error("Forbidden path");
  }
  if (!isInside(sessionsRoot, realParent)) throw new Error("Forbidden path");

  mkdirSync(workdir, { recursive: true });
  const realWorkdir = realpathSync(workdir);

  if (!isInside(sessionsRoot, realWorkdir)) throw new Error("Forbidden path");

  return realWorkdir;
}

function migrateLegacyOpenCodeWorkspace(userData: string, clusterId: string, providerId: string): void {
  if (providerId !== "opencode" || !/^[a-zA-Z0-9-_]+$/.test(clusterId)) return;

  const { userData: realUserData, sessionsRoot } = getRealSessionsRoot(userData, true);
  const workdir = computeProviderWorkdir(realUserData, clusterId, providerId);
  const legacyWorkdir = path.join(realUserData, "opencode-sessions", clusterId);

  if (existsSync(workdir)) return;

  try {
    if (!lstatSync(legacyWorkdir).isDirectory()) return;
  } catch (error: any) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const realLegacyWorkdir = realpathSync(legacyWorkdir);
  if (!isInside(realUserData, realLegacyWorkdir)) return;

  mkdirSync(path.dirname(workdir), { recursive: true });
  if (!isInside(sessionsRoot, realpathSync(path.dirname(workdir)))) throw new Error("Forbidden path");

  renameSync(realLegacyWorkdir, workdir);
}

function nearestExistingParent(target: string): string {
  let current = path.dirname(target);

  while (true) {
    try {
      lstatSync(current);
      return current;
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw new Error("Forbidden path");
      current = parent;
    }
  }
}

function resolveDeclaredFile(workdir: string, providerId: string, relPath: string): string {
  assertDeclaredPath(providerId, relPath);
  const realWorkdir = realpathSync(workdir);
  const target = path.resolve(realWorkdir, ...relPath.split(/[\\/]+/));

  if (!isInside(realWorkdir, target)) throw new Error("Forbidden path");

  let realParent: string;
  try {
    realParent = realpathSync(nearestExistingParent(target));
  } catch {
    throw new Error("Forbidden path");
  }
  if (!isInside(realWorkdir, realParent)) throw new Error("Forbidden path");

  if (existsSync(target)) {
    let realTarget: string;
    try {
      realTarget = realpathSync(target);
    } catch {
      throw new Error("Forbidden path");
    }
    if (!isInside(realWorkdir, realTarget)) throw new Error("Forbidden path");
  }

  return target;
}

export function prepareProviderWorkspace(
  userData: string,
  clusterId: string,
  providerId: string,
  explicitScaffoldsRoot?: string,
): { workdir: string; seeded: boolean } {
  const provider = getAgentBridgeProvider(providerId);
  migrateLegacyOpenCodeWorkspace(userData, clusterId, provider.id);
  const workdir = getWorkdir(userData, clusterId, provider.id);
  const scaffold = resolveProviderScaffold(provider.id, explicitScaffoldsRoot);
  let seeded = false;

  for (const editor of provider.editors) {
    const target = resolveDeclaredFile(workdir, provider.id, editor.path);
    if (existsSync(target)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    const sourceRel = (editor as { source?: string }).source ?? editor.path;
    copyFileSync(path.join(scaffold, ...sourceRel.split(/[\\/]+/)), target);
    seeded = true;
  }

  return { workdir, seeded };
}

export function readProviderFile(
  userData: string,
  clusterId: string,
  providerId: string,
  relPath: string,
): { content: string; exists: boolean } {
  const workdir = getWorkdir(userData, clusterId, providerId);
  const target = resolveDeclaredFile(workdir, providerId, relPath);

  try {
    return { content: readFileSync(target, "utf8"), exists: true };
  } catch (error: any) {
    if (error?.code === "ENOENT") return { content: "", exists: false };
    throw error;
  }
}

export function writeProviderFile(
  userData: string,
  clusterId: string,
  providerId: string,
  relPath: string,
  content: string,
): { ok: true; bytes: number } {
  const workdir = getWorkdir(userData, clusterId, providerId);
  const target = resolveDeclaredFile(workdir, providerId, relPath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");

  return { ok: true, bytes: Buffer.byteLength(content, "utf8") };
}

export function resetProvider(
  userData: string,
  clusterId: string,
  providerId: string,
  explicitScaffoldsRoot?: string,
): { workdir: string; seeded: boolean } {
  const provider = getAgentBridgeProvider(providerId);
  const workdir = getWorkdir(userData, clusterId, provider.id);

  for (const relPath of provider.resetPaths) {
    const target = resolveDeclaredFile(workdir, provider.id, relPath);
    if (existsSync(target)) rmSync(target, { force: true });
  }

  return prepareProviderWorkspace(userData, clusterId, provider.id, explicitScaffoldsRoot);
}

// Resolve the provider workdir and verify it is contained inside the sessions
// root before it is handed to any launcher (file manager, editor, ...). Throws
// "Forbidden path" if the resolved real path escapes the sessions root. The
// directory must already exist (its real path is resolved via realpathSync).
export function resolveVerifiedWorkdir(userData: string, clusterId: string, providerId: string): string {
  getAgentBridgeProvider(providerId);
  const { userData: realUserData, sessionsRoot } = getRealSessionsRoot(userData);
  const workdir = realpathSync(computeProviderWorkdir(realUserData, clusterId, providerId));
  if (!isInside(sessionsRoot, workdir)) throw new Error("Forbidden path");

  return workdir;
}

export async function revealProviderWorkspace(
  userData: string,
  clusterId: string,
  providerId: string,
  openPath: OpenPath,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const workdir = resolveVerifiedWorkdir(userData, clusterId, providerId);

    const result = await openPath(workdir);
    return result === "" ? { ok: true } : { ok: false, error: result };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}
