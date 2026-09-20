import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { resolveProviderScaffold, resolveScaffoldsRoot } from "./scaffold-source";

// The cluster-map scaffold of a provider, resolved through the optional
// `source` indirection the registry uses when the bundled path differs from the
// seeded one.
function commandScaffold(providerId: string): string {
  const provider = agentBridgeProviders.find((candidate) => candidate.id === providerId);
  const command = provider?.editors.find((editor) => editor.role === "command");
  const sourceRel = (command as { source?: string; path: string }).source ?? (command as { path: string }).path;

  return readFileSync(path.join(resolveProviderScaffold(providerId), sourceRel), "utf8");
}

// Every bundled scaffold file of every provider, as [relative path, contents].
function everyScaffoldFile(): [string, string][] {
  const root = resolveScaffoldsRoot();

  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = path.join(entry.parentPath, entry.name);

      return [path.relative(root, absolute), readFileSync(absolute, "utf8")];
    });
}

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
    // delegates when project or skill instructions ask it to; Copilot CLI and Pi
    // have no subagents at all, so their scaffolds say "sequentially" instead.
    for (const providerId of ["opencode", "claude", "codex"] as const) {
      const content = commandScaffold(providerId);

      expect(content).toMatch(/one subagent per namespace/i);
      expect(content).toMatch(/at most 5 in parallel/i);
    }
  });

  // The mirror of the test above, and the reason it matters: a scaffold that
  // asks for subagents on a CLI that has none does not fail loudly — the agent
  // improvises, usually by exploring everything in one context until it runs
  // out of room. Pi ships no sub-agent concept at all; Copilot CLI no parallel
  // ones.
  it("explores sequentially for providers without subagents", () => {
    for (const providerId of ["copilot", "pi"] as const) {
      const content = commandScaffold(providerId);

      expect(content, providerId).toMatch(/sequentially/i);
      expect(content, providerId).not.toMatch(/in parallel/i);
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

  describe("Pi scaffolds", () => {
    const scaffold = resolveProviderScaffold("pi");
    const guard = readFileSync(path.join(scaffold, ".pi/extensions/kubectl-guard.ts"), "utf8");
    const settings = JSON.parse(readFileSync(path.join(scaffold, ".pi/settings.json"), "utf8"));

    // The eight built-ins `docs/settings.md` documents. An unknown name here is
    // not a typo the user sees — the tool simply never appears.
    const builtInTools = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"];

    it("enables only documented built-in tools, including the two a cluster session needs", () => {
      expect(Array.isArray(settings.defaultTools)).toBe(true);

      for (const tool of settings.defaultTools) expect(builtInTools).toContain(tool);

      // Without `read` and `bash` there is no kubectl and nothing to read back.
      expect(settings.defaultTools).toContain("read");
      expect(settings.defaultTools).toContain("bash");

      // A project `defaultTools` array *replaces* the global one rather than
      // merging with it, so omitting `powershell` here would silently revoke it
      // from a Windows user who selected it globally — which is exactly what
      // Pi's own Windows documentation tells them to do — and leave them with a
      // `bash` tool that needs a Git Bash they may not have.
      expect(settings.defaultTools).toContain("powershell");
    });

    // `sessionDir` is resolved relative to `.pi`, so an absolute path or a `..`
    // would scatter a cluster's transcripts outside the workspace that Reveal
    // workdir shows and that Reset is scoped to.
    it("keeps session transcripts inside the cluster workspace", () => {
      expect(typeof settings.sessionDir).toBe("string");
      expect(settings.sessionDir.split(/[\\/]/)).not.toContain("..");
      expect(settings.sessionDir).not.toMatch(/^(?:[\\/]|[A-Za-z]:|~)/);
    });

    it("blocks mutating cluster commands through a tool_call hook", () => {
      expect(guard).toMatch(/pi\.on\("tool_call"/);
      expect(guard).toMatch(/block: true/);

      // The verbs that end a session badly. They are checked as words rather
      // than as an allowlist entry because the guard must still name them even
      // if its matching strategy changes.
      for (const verb of ["delete", "apply", "scale", "drain", "exec", "patch", "rollout"]) {
        expect(guard, verb).toMatch(new RegExp(`\\b${verb}\\b`));
      }

      // Blocking with no UI to ask is the safe default; `-p` and `--mode json`
      // have nobody to prompt.
      expect(guard).toMatch(/hasUI/);
      expect(guard).toMatch(/ctx\.ui\.select/);
    });

    it("says plainly that it is not a security boundary", () => {
      expect(guard).toMatch(/not a (security )?boundary/i);
      expect(guard).toMatch(/RBAC/);
      // A syntax error here stops Pi from starting, so the recovery path has to
      // be in the file the user is looking at when that happens.
      expect(guard).toMatch(/pi -ne/);
      expect(guard).toMatch(/Reset/);
    });

    // A runtime import would resolve against the seeded workspace, where
    // `@earendil-works/pi-coding-agent` is not installed — and a failed import
    // in `.pi/extensions/` aborts Pi with exit 1 rather than degrading.
    it("imports nothing at runtime", () => {
      const imports = guard.match(/^\s*import\s.*$/gm) ?? [];

      expect(imports.length).toBeGreaterThan(0);
      for (const line of imports) expect(line).toMatch(/^\s*import type\s/);
    });

    it("ships the cluster-map prompt template as a real slash command", () => {
      const template = readFileSync(path.join(scaffold, ".pi/prompts/build-cluster-map.md"), "utf8");
      const frontmatter = template.match(/^---\n([\s\S]*?)\n---\n/)?.[1];

      expect(frontmatter).toBeDefined();
      expect(frontmatter).toMatch(/^description: \S/m);
      expect(frontmatter).toMatch(/^argument-hint: "\[namespace\]"$/m);

      // Pi drops a skill whose frontmatter has no `description` silently — no
      // warning, the skill just never loads — so the template has to demand both
      // keys of the skills it writes.
      expect(template).toMatch(/name: ns-map-<namespace>/);
      expect(template).toMatch(/description:.*<namespace>/);
      expect(template).toMatch(/description.*without\s+\*?\*?warning/is);
    });
  });

  // AgentBridge configures the agent's behaviour; the model is the user's
  // choice. Every scaffold is written into the *project* layer, which outranks
  // the user's global settings on all five CLIs, so a pin here would silently
  // beat a deliberate choice — and an uncredentialed pin is a startup failure
  // rather than a fallback (OpenCode raises ProviderModelNotFoundError, Pi's
  // equivalent is upstream issue #21, and a Copilot model can be valid yet
  // disabled for the seat). This passed against all four providers before Pi
  // landed, so it is a regression guard, not a new constraint.
  it("never pins a model in any scaffold", () => {
    // One pattern per format a provider's model key could appear in: JSON for
    // OpenCode/Copilot/Pi, TOML for Codex.
    const pinsAModel =
      /"(model|small_model|defaultModel|defaultProvider)"\s*:|^\s*model(_provider)?\s*=|\[model_providers\./m;

    for (const [file, body] of everyScaffoldFile()) {
      expect(pinsAModel.test(body), `${file} pins a model`).toBe(false);
    }
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
