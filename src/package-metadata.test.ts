import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageMetadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  description: string;
  repository: { url: string };
  keywords: string[];
  scripts: { "build:production": string };
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
        "ai-agent",
        "agentbridge",
      ],
    });
  });

  it("uses a cross-platform production build script", () => {
    expect(packageMetadata.scripts["build:production"]).toBe(
      "cross-env VITE_PRESERVE_MODULES=false electron-vite build",
    );
  });
});
