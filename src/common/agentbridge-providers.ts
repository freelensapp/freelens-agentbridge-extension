import type { ArtifactSource } from "./harness-artifacts";

export type EditorRole = "instructions" | "permissions" | "settings" | "command";

export interface EditorDefinition {
  readonly path: string;
  readonly title: string;
  // Syntax of the declared file, not a Monaco language id: Monaco 0.52.2 ships
  // no TOML grammar, so the renderer maps these to the closest one it has (see
  // src/renderer/editor-language.ts).
  readonly language: "json" | "markdown" | "toml" | "typescript";
  readonly role: EditorRole;
  // Optional scaffold-relative source path when the bundled source file lives at
  // a different location than the seeded target `path`. Used for the Claude Code
  // command, whose seeded target is under `.claude/` while its source is kept
  // flat under `commands/`. Defaults to `path` when omitted.
  readonly source?: string;
}

export interface AgentBridgeProvider {
  readonly id: string;
  readonly name: string;
  readonly executable: string;
  readonly versionArgs: readonly string[];
  readonly docsUrl: string;
  readonly launchArgs: readonly string[];
  readonly editors: readonly EditorDefinition[];
  // Directories scanned to report what the workspace actually contains. Purely
  // informational: unlike `editors`, these paths are never read for content and
  // never written. See src/main/harness-artifacts.ts.
  readonly artifactSources: readonly ArtifactSource[];
  readonly resetPaths: readonly string[];
}

export const agentBridgeProviders = [
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
    // The only provider that needs launch flags, for two reasons that both come
    // down to "the seeded config file cannot be relied on at launch":
    //
    //   - Codex loads a project's `.codex/` layer only once the user has trusted
    //     the directory, and it asks for that on first launch. Every guardrail
    //     seeded into `.codex/config.toml` is therefore inert until then.
    //   - Its `workspace-write` sandbox sets `network_access = false` by
    //     default, and a `kubectl` that cannot reach the API server makes a
    //     cluster session pointless.
    //
    // CLI flags outrank every config layer and need no trust decision, so the
    // two settings a session cannot work without are passed here. Approvals stay
    // `on-request`, which is what keeps mutations in front of the user.
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
      // Codex has no project-local slash commands — `~/.codex/prompts/` is
      // global-only and deprecated in favour of skills — so the cluster-map
      // capability ships as a skill, as it does on Copilot CLI.
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
    // `pi version` is parsed as a prompt — Pi's subcommands are `install`,
    // `remove`, `update`, `list`, `config` and `auth` — and exits 1 asking for an
    // API key. `--version` is handled straight after argument parsing, before any
    // runtime, auth or network, so it is the only clean probe.
    versionArgs: ["--version"],
    docsUrl: "https://pi.dev/",
    // Pi's trust prompt appears once per workspace and is remembered in
    // ~/.pi/agent/trust.json, and its default launch already works — unlike
    // Codex, there is no sandbox to widen. `--approve` would auto-trust the
    // executable `.pi/extensions/*.ts` below on every launch to save that one
    // keypress, which is the wrong trade for a directory the agent can write to.
    launchArgs: [],
    editors: [
      {
        path: "AGENTS.md",
        title: "Instructions (AGENTS.md)",
        language: "markdown",
        role: "instructions",
      },
      // Pi is the only provider whose guardrail cannot be declarative: it ships
      // no permission file, no approval policy and no sandbox ("tools run with
      // the permissions of the pi process. This is intentional"). Its one
      // blocking pre-execution interceptor is an extension's `tool_call` hook,
      // so the permissions file here is executable TypeScript. That also makes
      // it the only managed file that can stop a session from starting — a
      // syntax error aborts Pi with exit 1 (`pi -ne` or Reset to recover).
      {
        path: ".pi/extensions/kubectl-guard.ts",
        title: "Permissions (.pi/extensions/kubectl-guard.ts)",
        language: "typescript",
        role: "permissions",
      },
      // Separate from the guard because `defaultTools` and `sessionDir` are
      // settings Pi reads as JSON; every other provider expresses permissions
      // and settings in one file, Pi needs two.
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
    // No `agent` source on purpose, and this is the one provider where that is
    // correct rather than an oversight: Pi ships no sub-agent concept ("No
    // sub-agents. There's many ways to do this. Spawn pi instances via tmux, or
    // build your own with extensions"), and third-party packages that add them
    // define no standard directory. Declaring a root anyway would report an
    // authoritative "0 agents" forever.
    artifactSources: [{ kind: "skill", roots: [".pi/skills", ".agents/skills"], layout: "skill-dir" }],
  },
] as const satisfies readonly AgentBridgeProvider[];

export type AgentBridgeProviderId = (typeof agentBridgeProviders)[number]["id"];

export type ProviderCheckResult =
  | { status: "ready"; version: string }
  | { status: "missing"; error: string }
  | { status: "error"; error: string };

export interface PrepareWorkspaceResult {
  workdir: string;
  seeded: boolean;
}

export function getAgentBridgeProvider(providerId: string): (typeof agentBridgeProviders)[number] {
  const provider = agentBridgeProviders.find(({ id }) => id === providerId);

  if (!provider) {
    throw new Error(`Unsupported AI CLI provider: ${providerId}`);
  }

  return provider;
}
