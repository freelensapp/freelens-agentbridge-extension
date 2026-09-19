import { describe, expect, it } from "vitest";
import { agentBridgeProviders, getAgentBridgeProvider } from "./agentbridge-providers";

describe("agentBridgeProviders", () => {
  it("lists products in intended order", () => {
    expect(agentBridgeProviders.map(({ id }) => id)).toEqual(["opencode", "claude", "copilot", "codex"]);
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
        artifactSources: [
          { kind: "skill", roots: [".opencode/skills", ".claude/skills", ".agents/skills"], layout: "skill-dir" },
          { kind: "agent", roots: [".opencode/agent", ".opencode/agents"], layout: "markdown" },
        ],
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
        artifactSources: [
          { kind: "skill", roots: [".claude/skills"], layout: "skill-dir" },
          { kind: "agent", roots: [".claude/agents"], layout: "markdown" },
        ],
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
        artifactSources: [
          { kind: "skill", roots: [".github/skills"], layout: "skill-dir" },
          { kind: "agent", roots: [".github/agents"], layout: "markdown" },
        ],
      },
      {
        id: "codex",
        name: "OpenAI Codex CLI",
        executable: "codex",
        versionArgs: ["--version"],
        docsUrl: "https://developers.openai.com/codex/cli/",
        launchArgs: [
          "--sandbox",
          "workspace-write",
          "--ask-for-approval",
          "on-request",
          "-c",
          "sandbox_workspace_write.network_access=true",
        ],
        editors: [
          {
            path: "AGENTS.md",
            title: "Instructions (AGENTS.md)",
            language: "markdown",
            role: "instructions",
          },
          {
            path: ".codex/config.toml",
            title: "Settings (.codex/config.toml)",
            language: "toml",
            role: "settings",
          },
          {
            path: ".agents/skills/build-cluster-map/SKILL.md",
            title: "Skill (build-cluster-map)",
            language: "markdown",
            role: "command",
          },
        ],
        resetPaths: [".codex/config.toml", ".agents/skills/build-cluster-map/SKILL.md"],
        artifactSources: [
          { kind: "skill", roots: [".agents/skills"], layout: "skill-dir" },
          { kind: "agent", roots: [".codex/agents"], layout: "toml-file" },
        ],
      },
    ]);
  });

  // Codex is the only provider that needs launch flags, and both of them are
  // load-bearing: without `--sandbox workspace-write` a non-git workspace starts
  // read-only, and without network access in that sandbox kubectl cannot reach
  // the API server at all. Neither can be seeded into `.codex/config.toml`
  // instead, because Codex ignores a project's `.codex/` layer until the user
  // trusts the directory — which has not happened yet on the first launch.
  it("launches Codex with a writable, networked sandbox that still asks before acting", () => {
    const launchArgs: readonly string[] = getAgentBridgeProvider("codex").launchArgs;

    expect(launchArgs).toContain("--sandbox");
    expect(launchArgs[launchArgs.indexOf("--sandbox") + 1]).toBe("workspace-write");
    expect(launchArgs[launchArgs.indexOf("--ask-for-approval") + 1]).toBe("on-request");
    expect(launchArgs).toContain("sandbox_workspace_write.network_access=true");

    // A flag carrying a space would be split by the shell command builder, which
    // joins argv on " ".
    for (const arg of launchArgs) expect(arg).not.toMatch(/\s/);

    // `never` would run mutations unattended, and the retired `untrusted` /
    // `on-failure` values can stop Codex from starting at all.
    expect(launchArgs).not.toContain("never");
    expect(launchArgs.join(" ")).not.toMatch(/--yolo|dangerously|full-auto|untrusted|on-failure/);
  });

  it("gives only Codex launch arguments", () => {
    for (const provider of agentBridgeProviders) {
      if (provider.id !== "codex") expect(provider.launchArgs).toEqual([]);
    }
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

  it("declares a skill and an agent artifact source for every provider", () => {
    for (const provider of agentBridgeProviders) {
      expect(provider.artifactSources.map(({ kind }) => kind)).toEqual(["skill", "agent"]);
    }
  });

  it("uses safe relative artifact roots", () => {
    for (const provider of agentBridgeProviders) {
      for (const source of provider.artifactSources) {
        expect(source.roots.length).toBeGreaterThan(0);
        expect(new Set(source.roots)).toHaveLength(source.roots.length);
        expect(["skill-dir", "markdown", "toml-file"]).toContain(source.layout);

        for (const root of source.roots) {
          expect(root).not.toContain("\0");
          expect(root.split(/[\\/]/)).not.toContain("..");
          expect(root).not.toMatch(/^(?:[\\/]|[A-Za-z]:)/);

          // An empty or "." segment resolves back to the workdir itself, which
          // would scan the whole workspace instead of one artifact directory.
          for (const segment of root.split(/[\\/]/)) {
            expect(segment).not.toBe("");
            expect(segment).not.toBe(".");
          }
        }
      }
    }
  });

  it("never scans the same root under two kinds", () => {
    for (const provider of agentBridgeProviders) {
      const roots = provider.artifactSources.flatMap((source) => [...source.roots]);

      expect(new Set(roots)).toHaveLength(roots.length);
    }
  });

  // Skills are a directory standard (`<name>/SKILL.md`) every provider follows;
  // custom agents are one file each, and the file format is the provider's own —
  // markdown with frontmatter everywhere except Codex, whose subagents are TOML.
  it("uses the skill-dir layout for skills and a flat-file layout for agents", () => {
    for (const provider of agentBridgeProviders) {
      for (const source of provider.artifactSources) {
        if (source.kind === "skill") expect(source.layout).toBe("skill-dir");
        else expect(["markdown", "toml-file"]).toContain(source.layout);
      }
    }
  });

  it("scans Codex subagents as TOML and everyone else's as markdown", () => {
    for (const provider of agentBridgeProviders) {
      const agents = provider.artifactSources.find(({ kind }) => kind === "agent");

      expect(agents?.layout).toBe(provider.id === "codex" ? "toml-file" : "markdown");
    }
  });

  it("rejects unknown providers", () => {
    expect(() => getAgentBridgeProvider("unknown")).toThrowError(new Error("Unsupported AI CLI provider: unknown"));
  });
});
