import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageMetadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  description: string;
  repository: { url: string };
  keywords: string[];
  type: string;
  main: string;
  renderer: string;
  engines: { freelens: string };
};

describe("package metadata", () => {
  it("identifies Freelens Agent Bridge extension and its providers", () => {
    expect(packageMetadata).toMatchObject({
      name: "@freelensapp/agentbridge-extension",
      description: "Freelens extension for per-cluster AI CLI sessions",
      repository: {
        url: "git+https://github.com/freelensapp/freelens-agentbridge-extension.git",
      },
      keywords: [
        "extension",
        "freelensapp",
        "lens",
        "openlens",
        "freelens",
        "opencode",
        "claude-code",
        "github-copilot",
        "openai-codex",
        "pi-coding-agent",
        "ai-agent",
        "agentbridge",
      ],
    });
  });

  // Freelens 2 refuses an extension at discovery unless engines.freelens admits
  // 2.x, and reloads a rebuilt main entry under `pnpm dev` only when it is ESM.
  it("declares a Freelens 2 extension with ESM entry points in dist", () => {
    expect(packageMetadata).toMatchObject({
      type: "module",
      main: "dist/main.js",
      renderer: "dist/renderer.js",
      engines: { freelens: "^2.0.0" },
    });
  });
});
