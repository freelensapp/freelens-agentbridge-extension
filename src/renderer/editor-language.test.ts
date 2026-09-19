import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { monacoLanguageFor } from "./editor-language";

// Language ids registered by monaco-editor outside `basic-languages`, which has
// only the tokenizer-based grammars.
const RICH_LANGUAGES = ["json", "typescript", "javascript", "css", "html"];

// The language ids the bundled Monaco actually registers, read from the
// installed package rather than hardcoded: an upgrade that finally ships a TOML
// grammar should make the mapping below reviewable, not silently stale.
function bundledMonacoLanguages(): Set<string> {
  const basicLanguages = path.join(process.cwd(), "node_modules/monaco-editor/esm/vs/basic-languages");
  const directories = readdirSync(basicLanguages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // A path that resolved to nothing would make the assertion below vacuous.
  expect(directories.length).toBeGreaterThan(0);

  return new Set([...directories, ...RICH_LANGUAGES]);
}

describe("monacoLanguageFor", () => {
  it("passes through the languages Monaco has", () => {
    expect(monacoLanguageFor("json")).toBe("json");
    expect(monacoLanguageFor("markdown")).toBe("markdown");
  });

  // Monaco 0.52.2 has no TOML grammar and does not fall back when handed an
  // unregistered id — it renders plain, unhighlighted text. `ini` is the closest
  // grammar it does have: `# comments`, `[table]` headers and `key = value`.
  it("renders TOML with Monaco's ini grammar", () => {
    expect(monacoLanguageFor("toml")).toBe("ini");
  });

  it("confirms the bundled Monaco still has no TOML grammar", () => {
    expect(bundledMonacoLanguages().has("toml")).toBe(false);
  });

  it("never returns a language the bundled Monaco does not register", () => {
    const registered = bundledMonacoLanguages();

    for (const provider of agentBridgeProviders) {
      for (const editor of provider.editors) {
        expect(registered.has(monacoLanguageFor(editor.language)), `${provider.id}: ${editor.path}`).toBe(true);
      }
    }
  });
});
