export type EditorRole = "instructions" | "permissions" | "settings" | "command";

export interface EditorDefinition {
  readonly path: string;
  readonly title: string;
  readonly language: "json" | "markdown";
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
  // Flag(s) that precede an inline prompt passed on the launch command line so a
  // bundled command/skill can be invoked directly, without typing into the CLI's
  // REPL after boot. An empty array means the prompt is a bare positional
  // argument (Claude Code seeds an interactive session that way). OpenCode's
  // `run` subcommand does not resolve slash commands, so its interactive TUI
  // `--prompt` flag is used instead; Copilot CLI exposes `-p` for one-shot runs.
  readonly promptFlag: readonly string[];
  readonly editors: readonly EditorDefinition[];
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
    promptFlag: ["--prompt"],
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
    promptFlag: [],
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
    promptFlag: ["-p"],
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
