import { describe, expect, it } from "vitest";
import { agentBridgeProviders, getAgentBridgeProvider } from "./agentbridge-providers";

describe("agentBridgeProviders", () => {
  it("lists products in intended order", () => {
    expect(agentBridgeProviders.map(({ id }) => id)).toEqual(["opencode", "claude", "copilot"]);
  });

  it("has unique stable IDs", () => {
    const ids = agentBridgeProviders.map(({ id }) => id);

    expect(new Set(ids)).toHaveLength(ids.length);
  });

  it("defines exact provider metadata", () => {
    expect(agentBridgeProviders).toEqual([
      {
        id: "opencode",
        name: "OpenCode",
        executable: "opencode",
        versionArgs: ["--version"],
        docsUrl: "https://opencode.ai/docs/",
        launchArgs: [],
        editors: [
          {
            path: "AGENTS.md",
            title: "Instructions (AGENTS.md)",
            language: "markdown",
            role: "instructions",
          },
          {
            path: ".opencode/opencode.json",
            title: "Permissions (.opencode/opencode.json)",
            language: "json",
            role: "permissions",
          },
          {
            path: ".opencode/command/build-cluster-map.md",
            title: "Command (/build-cluster-map)",
            language: "markdown",
            role: "command",
          },
        ],
        resetPaths: [".opencode/opencode.json", ".opencode/command/build-cluster-map.md"],
      },
      {
        id: "claude",
        name: "Claude Code",
        executable: "claude",
        versionArgs: ["--version"],
        docsUrl: "https://docs.anthropic.com/en/docs/claude-code/setup",
        launchArgs: [],
        editors: [
          {
            path: "CLAUDE.md",
            title: "Instructions (CLAUDE.md)",
            language: "markdown",
            role: "instructions",
          },
          {
            path: ".claude/settings.json",
            title: "Permissions (.claude/settings.json)",
            language: "json",
            role: "permissions",
          },
          {
            path: ".claude/commands/build-cluster-map.md",
            title: "Command (/build-cluster-map)",
            language: "markdown",
            role: "command",
            source: "commands/build-cluster-map.md",
          },
        ],
        resetPaths: [".claude/settings.json", ".claude/commands/build-cluster-map.md"],
      },
      {
        id: "copilot",
        name: "GitHub Copilot CLI",
        executable: "copilot",
        versionArgs: ["--version"],
        docsUrl: "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli",
        launchArgs: [],
        editors: [
          {
            path: ".github/copilot-instructions.md",
            title: "Instructions (.github/copilot-instructions.md)",
            language: "markdown",
            role: "instructions",
          },
          {
            path: ".github/copilot/settings.json",
            title: "Settings (.github/copilot/settings.json)",
            language: "json",
            role: "settings",
          },
          {
            path: ".github/skills/build-cluster-map/SKILL.md",
            title: "Skill (build-cluster-map)",
            language: "markdown",
            role: "command",
          },
        ],
        resetPaths: [".github/copilot/settings.json", ".github/skills/build-cluster-map/SKILL.md"],
      },
    ]);
  });

  it("uses safe relative editor and reset paths", () => {
    for (const provider of agentBridgeProviders) {
      const editorPaths = provider.editors.map(({ path }) => path);

      for (const path of [...editorPaths, ...provider.resetPaths]) {
        expect(path).not.toContain("\0");
        expect(path.split(/[\\/]/)).not.toContain("..");
        expect(path).not.toMatch(/^(?:[\\/]|[A-Za-z]:)/);
      }

      for (const path of provider.resetPaths) {
        expect(editorPaths).toContain(path);
      }
    }
  });

  it("rejects unknown providers", () => {
    expect(() => getAgentBridgeProvider("unknown")).toThrowError(new Error("Unsupported AI CLI provider: unknown"));
  });
});
