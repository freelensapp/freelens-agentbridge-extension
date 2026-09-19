import type { EditorDefinition } from "../common/agentbridge-providers";

// Maps a declared file's syntax to a language id Monaco actually has.
//
// The two are not the same list. Monaco 0.52.2 — the version this extension
// bundles — ships no TOML grammar at all (`monaco-editor/esm/vs/basic-languages`
// has `ini`, `yaml`, `hcl`, ... and no `toml`), and Monaco does not fall back
// when handed an unregistered id: it silently renders the file as plain text,
// with no highlighting and no bracket matching. Codex's `.codex/config.toml` is
// the first declared file that hits this.
//
// `ini` is the closest grammar Monaco has: it highlights `# comments`,
// `[table]` headers and `key = value` pairs, which is all the seeded Codex
// config uses. It does not know TOML's arrays, dotted keys or multi-line
// strings, so those render unhighlighted rather than wrongly.
const MONACO_LANGUAGE: Record<EditorDefinition["language"], string> = {
  json: "json",
  markdown: "markdown",
  toml: "ini",
};

export function monacoLanguageFor(language: EditorDefinition["language"]): string {
  return MONACO_LANGUAGE[language];
}
