import type { EditorDefinition } from "../common/agentbridge-providers";

// Maps a declared file's syntax to a language id the host's Monaco can show.
//
// The two are not the same list. Monaco 0.57 — the version Freelens 2 runs and
// the editors use — ships no TOML grammar at all (its language definitions
// have `ini`, `yaml`, `hcl`, ... and no `toml`), and Monaco does not fall back
// when handed an unregistered id: it silently renders the file as plain text,
// with no highlighting and no bracket matching. Codex's `.codex/config.toml` is
// the first declared file that hits this.
//
// `ini` is the closest grammar Monaco has: it highlights `# comments`,
// `[table]` headers and `key = value` pairs, which is all the seeded Codex
// config uses. It does not know TOML's arrays, dotted keys or multi-line
// strings, so those render unhighlighted rather than wrongly.
//
// TypeScript is shown as plain text. Monaco attaches its TypeScript language
// service to the `typescript` and `javascript` ids, and that service runs in a
// worker the host does not provide: Freelens configures a JSON worker and the
// generic editor worker only. Pi's `.pi/extensions/kubectl-guard.ts` would get
// no diagnostics either way, and every request the service sends to the wrong
// worker fails in the console.
const MONACO_LANGUAGE: Record<EditorDefinition["language"], string> = {
  json: "json",
  markdown: "markdown",
  toml: "ini",
  typescript: "plaintext",
};

export function monacoLanguageFor(language: EditorDefinition["language"]): string {
  return MONACO_LANGUAGE[language];
}
