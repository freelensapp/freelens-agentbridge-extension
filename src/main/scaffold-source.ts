import { getAgentBridgeProvider } from "../common/agentbridge-providers";

// Every file under `scaffolds/`, embedded into `dist/main.js` as text at build
// time. The ESM main bundle has no `__dirname` to find files shipped next to it,
// and data in the bundle needs no copy step and no path resolution at runtime.
// `exhaustive` is what makes the glob match the provider directories that start
// with a dot (`.claude/`, `.codex/`, `.opencode/`, `.pi/`, ...).
const scaffoldFiles = import.meta.glob<string>("./scaffolds/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
  exhaustive: true,
});

const SCAFFOLDS_PREFIX = "./scaffolds/";

// The relative path of each scaffold file, as `<provider>/<path in workspace>`,
// with its contents.
export function listScaffoldFiles(): [string, string][] {
  return Object.entries(scaffoldFiles).map(([key, content]) => [key.slice(SCAFFOLDS_PREFIX.length), content]);
}

// The contents of a provider's scaffold file, by its path relative to the
// provider's scaffold directory, with `/` separators as the registry writes
// them.
export function readScaffoldFile(providerId: string, relativePath: string): string {
  const key = `${SCAFFOLDS_PREFIX}${getAgentBridgeProvider(providerId).id}/${relativePath}`;
  const content = scaffoldFiles[key];

  if (content === undefined) throw new Error(`Missing scaffold: ${key.slice(SCAFFOLDS_PREFIX.length)}`);
  return content;
}
