import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { resolveProviderScaffold, resolveScaffoldsRoot } from "./scaffold-source";

const allowedBashCommands = [
  "kubectl get",
  "kubectl describe",
  "kubectl logs",
  "kubectl explain",
  "kubectl api-resources",
  "kubectl api-versions",
  "kubectl auth can-i",
  "kubectl top",
  "kubectl version",
  "helm list",
  "helm status",
  "helm get",
  "helm history",
  "helm show",
  "helm search",
  "helm version",
];

describe("provider scaffolds", () => {
  it("uses the bundled scaffolds root unless explicitly overridden", () => {
    expect(resolveScaffoldsRoot("custom")).toBe("custom");
    expect(resolveProviderScaffold("opencode", "custom")).toBe(path.join("custom", "opencode"));
  });

  it.each(agentBridgeProviders)("contains every declared editor file for %s", (provider) => {
    const scaffold = resolveProviderScaffold(provider.id);

    for (const editor of provider.editors) {
      const sourceRel = (editor as { source?: string }).source ?? editor.path;
      expect(existsSync(path.join(scaffold, sourceRel))).toBe(true);
    }
  });

  it.each(agentBridgeProviders)("gives %s required cluster-agent guidance", (provider) => {
    const instructions = provider.editors.find((editor) => editor.role === "instructions");
    const content = readFileSync(path.join(resolveProviderScaffold(provider.id), instructions?.path ?? ""), "utf8");

    expect(content).toMatch(/inherited.*KUBECONFIG/is);
    expect(content).toMatch(/inspect.*before.*mutat/is);
    expect(content).toMatch(/explicit namespace/i);
    expect(content).toMatch(/ask before.*destructive.*availability/is);
    expect(content).toMatch(/RBAC.*credentials.*security boundary/is);
    expect(content).toMatch(/cluster notes/i);
  });

  it.each(agentBridgeProviders)("ships a read-only cluster-map command scaffold for %s", (provider) => {
    const command = provider.editors.find((editor) => editor.role === "command");
    expect(command).toBeDefined();

    const sourceRel = (command as { source?: string; path: string }).source ?? (command as { path: string }).path;
    const content = readFileSync(path.join(resolveProviderScaffold(provider.id), sourceRel), "utf8");

    expect(content).toMatch(/read-only/i);
    expect(content).toMatch(/never.*secret.*value/is);
    expect(content).toMatch(/ns-map-<namespace>/);
    expect(content).toMatch(/cluster-map-<cluster>/);
    expect(content).toContain("<!-- BEGIN AGENTBRIDGE CLUSTER MAP -->");
    expect(content).toContain("<!-- END AGENTBRIDGE CLUSTER MAP -->");
  });

  it.each(agentBridgeProviders)("writes cluster-map skills into a scanned skill root for %s", (provider) => {
    const command = provider.editors.find((editor) => editor.role === "command");
    const sourceRel = (command as { source?: string; path: string }).source ?? (command as { path: string }).path;
    const content = readFileSync(path.join(resolveProviderScaffold(provider.id), sourceRel), "utf8");

    // The command tells the agent where to persist skills; that directory must be
    // one the artifact scanner actually looks at, or the skills stay invisible.
    const skillRoots = provider.artifactSources.find(({ kind }) => kind === "skill")?.roots ?? [];
    expect(skillRoots.length).toBeGreaterThan(0);

    for (const skillPath of content.match(/`[^`]*\/SKILL\.md`/g) ?? []) {
      const rel = skillPath.slice(1, -1);
      expect(
        skillRoots.some((root) => rel.startsWith(`${root}/`)),
        `${rel} is outside ${skillRoots}`,
      ).toBe(true);
    }

    const [primaryRoot] = skillRoots;
    expect(content).toContain(`${primaryRoot}/ns-map-<namespace>/SKILL.md`);
    expect(content).toContain(`${primaryRoot}/cluster-map-<cluster>/SKILL.md`);
  });

  it("caps parallel exploration at 5 subagents for providers that support them", () => {
    // Codex is in this list because its subagents are enabled by default and it
    // delegates when project or skill instructions ask it to; Copilot CLI has no
    // parallel subagents, so its scaffold says "sequentially" instead.
    for (const providerId of ["opencode", "claude", "codex"] as const) {
      const provider = agentBridgeProviders.find((candidate) => candidate.id === providerId);
      const command = provider?.editors.find((editor) => editor.role === "command");
      const sourceRel = (command as { source?: string; path: string }).source ?? (command as { path: string }).path;
      const content = readFileSync(path.join(resolveProviderScaffold(providerId), sourceRel), "utf8");

      expect(content).toMatch(/one subagent per namespace/i);
      expect(content).toMatch(/at most 5 in parallel/i);
    }
  });

  it("limits OpenCode shell permissions to ask plus read-only Kubernetes and Helm commands", () => {
    const config = JSON.parse(
      readFileSync(path.join(resolveProviderScaffold("opencode"), ".opencode/opencode.json"), "utf8"),
    );
    const bash = config.permission.bash;

    expect(bash["*"]).toBe("ask");
    expect(bash).toEqual({
      "*": "ask",
      ...Object.fromEntries(allowedBashCommands.map((command) => [`${command} *`, "allow"])),
    });
  });

  it("allows Claude read-only Kubernetes and Helm commands without bypassing permissions", () => {
    const config = JSON.parse(
      readFileSync(path.join(resolveProviderScaffold("claude"), ".claude/settings.json"), "utf8"),
    );

    expect(JSON.stringify(config)).not.toMatch(/bypass/i);
    expect(config.permissions).toEqual({
      allow: allowedBashCommands.map((command) => `Bash(${command}:*)`),
    });
  });

  it("keeps Copilot settings permission-free", () => {
    const config = JSON.parse(
      readFileSync(path.join(resolveProviderScaffold("copilot"), ".github/copilot/settings.json"), "utf8"),
    );

    expect(config).toEqual({});
  });

  describe("Codex settings", () => {
    const config = readFileSync(path.join(resolveProviderScaffold("codex"), ".codex/config.toml"), "utf8");

    // These three lines have to be active, not commented out: they are the
    // guardrails a user who has trusted the workspace then edits by hand, and
    // the values the launch flags mirror. `network_access` in particular is the
    // difference between a working cluster session and a kubectl that cannot
    // resolve the API server.
    it("seeds an asking, workspace-scoped, networked sandbox", () => {
      expect(config).toMatch(/^approval_policy = "on-request"$/m);
      expect(config).toMatch(/^sandbox_mode = "workspace-write"$/m);
      expect(config).toMatch(/^\[sandbox_workspace_write\]$/m);
      expect(config).toMatch(/^network_access = true$/m);
    });

    it("never seeds an unsandboxed or unattended policy", () => {
      expect(config).not.toMatch(/^\s*sandbox_mode = "danger-full-access"/m);
      expect(config).not.toMatch(/^\s*approval_policy = "never"/m);
      // Retired and deprecated values: `untrusted` can stop Codex from starting.
      expect(config).not.toMatch(/"(untrusted|on-failure)"/);
    });

    // A writable root is an absolute path on the user's machine, which a bundled
    // scaffold cannot know — an active `writable_roots` here would either widen
    // the sandbox to some path this workspace does not own or fail to parse.
    it("leaves writable_roots to the user", () => {
      expect(config).not.toMatch(/^writable_roots/m);
      expect(config).toMatch(/#\s*writable_roots = \[/);
    });

    it("explains that the file is inert until the folder is trusted", () => {
      expect(config).toMatch(/trust/i);
    });
  });

  // Codex reads project config, skills and subagents from `.codex/` and
  // `.agents/`, and keeps both read-only inside a writable workspace. The
  // scaffolds have to say so, because a silently blocked write reads as the
  // agent refusing to work.
  it("tells the Codex session that .agents is read-only inside the sandbox", () => {
    const scaffold = resolveProviderScaffold("codex");
    const skill = readFileSync(path.join(scaffold, ".agents/skills/build-cluster-map/SKILL.md"), "utf8");

    expect(skill).toMatch(/read-only/i);
    expect(skill).toMatch(/\.agents/);
    expect(skill).toMatch(/approval|approve/i);
  });
});
