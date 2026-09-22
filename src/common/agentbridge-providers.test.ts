import { describe, expect, it } from "vitest";
import { agentBridgeProviders, getAgentBridgeProvider } from "./agentbridge-providers";

import type { ArtifactSource } from "./harness-artifacts";

// The artifact-source shape rule, as a predicate rather than inline assertions,
// so that relaxing it for Pi (which has no sub-agents) can be shown to still
// reject a malformed provider. Returns one string per violation.
function artifactSourceProblems(provider: { id: string; artifactSources: readonly ArtifactSource[] }): string[] {
  const problems: string[] = [];
  const kinds = provider.artifactSources.map(({ kind }) => kind);

  if (kinds[0] !== "skill") problems.push("first artifact source must be the skill source");
  else if (kinds.length > 2 || (kinds.length === 2 && kinds[1] !== "agent")) {
    problems.push("expected a skill source optionally followed by one agent source");
  }

  for (const source of provider.artifactSources) {
    const allowed = source.kind === "skill" ? ["skill-dir"] : ["markdown", "toml-file"];

    if (!allowed.includes(source.layout)) problems.push(`${source.kind} source uses layout ${source.layout}`);
  }

  return problems;
}

describe("agentBridgeProviders", () => {
  it("lists products in intended order", () => {
    expect(agentBridgeProviders.map(({ id }) => id)).toEqual(["opencode", "claude", "copilot", "codex", "pi"]);
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
      {
        id: "pi",
        name: "Pi",
        executable: "pi",
        versionArgs: ["--version"],
        docsUrl: "https://pi.dev/",
        launchArgs: [],
        editors: [
          {
            path: "AGENTS.md",
            title: "Instructions (AGENTS.md)",
            language: "markdown",
            role: "instructions",
          },
          {
            path: ".pi/extensions/kubectl-guard.ts",
            title: "Permissions (.pi/extensions/kubectl-guard.ts)",
            language: "typescript",
            role: "permissions",
          },
          {
            path: ".pi/settings.json",
            title: "Settings (.pi/settings.json)",
            language: "json",
            role: "settings",
          },
          {
            path: ".pi/prompts/build-cluster-map.md",
            title: "Command (/build-cluster-map)",
            language: "markdown",
            role: "command",
          },
        ],
        resetPaths: [".pi/extensions/kubectl-guard.ts", ".pi/settings.json", ".pi/prompts/build-cluster-map.md"],
        artifactSources: [{ kind: "skill", roots: [".pi/skills", ".agents/skills"], layout: "skill-dir" }],
      },
    ]);
  });

  // Pi is the first provider whose guardrail cannot be declarative. It ships no
  // permission file, no approval policy and no sandbox — "built-in tools ... run
  // with the permissions of the pi process. This is intentional" — and its only
  // blocking pre-execution interceptor is an extension's `tool_call` hook. So
  // the file in the `permissions` role is executable TypeScript, which nothing
  // else in the registry is, and which the Monaco language map has to know
  // about.
  it("gives Pi an executable permissions file, because Pi has no declarative one", () => {
    const pi = getAgentBridgeProvider("pi");
    const permissions = pi.editors.find(({ role }) => role === "permissions");

    expect(permissions?.path).toBe(".pi/extensions/kubectl-guard.ts");
    expect(permissions?.language).toBe("typescript");

    // And it is reset like every other managed guardrail: a syntax error in it
    // stops Pi from starting, so Reset is the documented recovery path.
    expect(pi.resetPaths).toContain(".pi/extensions/kubectl-guard.ts");
  });

  // Every other provider expresses permissions and settings in one file; Pi
  // cannot, because `defaultTools`/`sessionDir` are JSON settings while the
  // guard must be executable. Four editors and three reset paths are therefore
  // correct for Pi and a mistake for anyone else — asserted here so the shape
  // is a decision on the record rather than an accident.
  it("splits permissions from settings only for Pi", () => {
    for (const provider of agentBridgeProviders) {
      const roles = provider.editors.map(({ role }) => role);
      const expected =
        provider.id === "pi"
          ? ["instructions", "permissions", "settings", "command"]
          : roles.includes("permissions")
            ? ["instructions", "permissions", "command"]
            : ["instructions", "settings", "command"];

      expect(roles, provider.id).toEqual(expected);
    }
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

  // Skills are universal — every one of these CLIs implements the Agent Skills
  // directory standard. Sub-agents are not: Pi ships none by design ("No
  // sub-agents. There's many ways to do this. Spawn pi instances via tmux, or
  // build your own with extensions"), and third-party packages that add them
  // agree on no directory. An `agent` source declared anyway would scan a path
  // nothing ever writes and report an authoritative "0 agents" forever, which
  // reads as a broken scan rather than an absent feature. So the kind is
  // optional — but when it is present it is still second and still a flat-file
  // layout.
  it("declares a skill source for every provider and an agent source where the CLI has one", () => {
    for (const provider of agentBridgeProviders) {
      const kinds = provider.artifactSources.map(({ kind }) => kind);

      expect(kinds, provider.id).toEqual(provider.id === "pi" ? ["skill"] : ["skill", "agent"]);
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
      expect(artifactSourceProblems(provider), provider.id).toEqual([]);
    }
  });

  it("scans Codex subagents as TOML and everyone else's as markdown", () => {
    for (const provider of agentBridgeProviders) {
      const agents = provider.artifactSources.find(({ kind }) => kind === "agent");

      // Pi declares no agent source at all; every provider that declares one
      // still has to name the format its CLI actually writes.
      if (!agents) {
        expect(provider.id).toBe("pi");
        continue;
      }

      expect(agents.layout).toBe(provider.id === "codex" ? "toml-file" : "markdown");
    }
  });

  // Making the agent kind optional must not turn the rule into "anything goes".
  // The same predicate the registry is held to is run against deliberately
  // malformed providers, because a relaxation that accepts everything is worse
  // than the constraint it replaced.
  it("still rejects malformed artifact sources", () => {
    expect(artifactSourceProblems(agentBridgeProviders[4])).toEqual([]);

    expect(
      artifactSourceProblems({
        id: "agent-source-with-a-skill-layout",
        artifactSources: [
          { kind: "skill", roots: [".x/skills"], layout: "skill-dir" },
          { kind: "agent", roots: [".x/agents"], layout: "skill-dir" },
        ],
      }),
    ).toEqual(["agent source uses layout skill-dir"]);

    expect(
      artifactSourceProblems({
        id: "no-skill-source",
        artifactSources: [{ kind: "agent", roots: [".x/agents"], layout: "markdown" }],
      }),
    ).toEqual(["first artifact source must be the skill source"]);

    expect(
      artifactSourceProblems({
        id: "two-agent-sources",
        artifactSources: [
          { kind: "skill", roots: [".x/skills"], layout: "skill-dir" },
          { kind: "agent", roots: [".x/agents"], layout: "markdown" },
          { kind: "agent", roots: [".x/subagents"], layout: "markdown" },
        ],
      }),
    ).toEqual(["expected a skill source optionally followed by one agent source"]);
  });

  it("rejects unknown providers", () => {
    expect(() => getAgentBridgeProvider("unknown")).toThrowError(new Error("Unsupported AI CLI provider: unknown"));
  });
});
