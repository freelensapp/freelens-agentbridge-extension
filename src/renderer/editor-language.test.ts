import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { monacoLanguageFor } from "./editor-language";

// The language ids Monaco registers, read from the installed package, which is
// pinned to the host's version, rather than hardcoded: an upgrade that finally
// ships a TOML grammar should make the mapping below reviewable, not silently
// stale. `plaintext` is built into the editor rather than defined as a language.
function hostMonacoLanguages(): Set<string> {
  const definitions = path.join(process.cwd(), "node_modules/monaco-editor/esm/vs/languages/definitions");
  const directories = readdirSync(definitions, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // A path that resolved to nothing would make the assertions below vacuous.
  expect(directories.length).toBeGreaterThan(0);

  return new Set([...directories, "json", "plaintext"]);
}

describe("monacoLanguageFor", () => {
  it("passes through the languages Monaco has", () => {
    expect(monacoLanguageFor("json")).toBe("json");
    expect(monacoLanguageFor("markdown")).toBe("markdown");
  });

  // Monaco has no TOML grammar and does not fall back when handed an
  // unregistered id — it renders plain, unhighlighted text. `ini` is the closest
  // grammar it does have: `# comments`, `[table]` headers and `key = value`.
  it("renders TOML with Monaco's ini grammar", () => {
    expect(monacoLanguageFor("toml")).toBe("ini");
  });

  it("confirms the host's Monaco still has no TOML grammar", () => {
    expect(hostMonacoLanguages().has("toml")).toBe(false);
  });

  // The `typescript` id brings Monaco's TypeScript language service, whose
  // worker the host does not provide.
  it("shows TypeScript as plain text", () => {
    expect(monacoLanguageFor("typescript")).toBe("plaintext");
  });

  it("never returns a language the host's Monaco does not register", () => {
    const registered = hostMonacoLanguages();

    for (const provider of agentBridgeProviders) {
      for (const editor of provider.editors) {
        expect(registered.has(monacoLanguageFor(editor.language)), `${provider.id}: ${editor.path}`).toBe(true);
      }
    }
  });
});
