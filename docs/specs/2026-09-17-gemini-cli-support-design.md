# Gemini CLI Support — Findings And Design

**Issue:** [#55](https://github.com/freelensapp/freelens-agentbridge-extension/issues/55) ·
**Backlog item:** 4a (*More providers*) ·
**Plan:** [`docs/plans/2026-09-17-gemini-cli-support.md`](../plans/2026-09-17-gemini-cli-support.md)

**Verified against:** `@google/gemini-cli@0.60.0` (binary `gemini`), installed and
exercised locally on 2026-09-17. Every claim marked ✅ below was observed
directly — either from `gemini --help` / a real run, or read out of the shipped
bundle (`bundle/chunk-*.js`, `bundle/policies/*.toml`). Claims marked ⚠️ are
inference and are flagged as such.

## Verdict

Gemini CLI can support **every** feature this extension has. It is the closest
match to Claude Code of any provider considered so far: it has native slash
commands, native skills (`SKILL.md`), native subagents, a workspace-scoped
permission model, and it treats the current working directory as the project
root. Nothing in the extension's architecture has to change.

Two findings are non-obvious and would each silently break the integration if
missed. They are the real content of this document:

1. **Folder trust blocks the whole workspace layer.** Gemini CLI refuses to run
   in an untrusted directory, and the extension creates a brand-new directory
   per cluster. Until the folder is trusted, *workspace settings, workspace
   policies, project commands, project skills, project agents and project hooks
   are all skipped* — which means the seeded guardrails silently do nothing.
2. **`tools.allowed` in `settings.json` is the wrong mechanism.** It does not
   mean "allow these, ask for the rest" (Claude Code / OpenCode semantics). It
   injects a narrowing **DENY** for every other shell command, so
   `kubectl apply` would become un-runnable even with user approval. The
   equivalent of the other providers' permission file is a **workspace policy
   TOML**, not a settings key.

## 1. How the extension abstracts providers today

Relevant because it determines how much work a new provider is.

`src/common/agentbridge-providers.ts` is the single source of provider
knowledge. Everything else is generic:

| Concern | Mechanism | Per-provider code needed |
| --- | --- | --- |
| Availability probe | `executable` + `versionArgs`, `src/main/check-provider.ts` | none |
| Workspace + seeding | `editors[]` + `src/main/scaffolds/<id>/`, `src/main/provider-files.ts` | none |
| Launch | `executable` + `launchArgs`, `src/renderer/get-launch-command.ts` | none |
| Editors | `editors[].language` (`json` \| `markdown`), Monaco | none |
| Artifact inventory | `artifactSources[]`, `src/main/harness-artifacts.ts` | none |
| Reset | `resetPaths[]` | none |
| Provider picker, docs link, titles | `agentBridgeProviders` in `src/renderer/agentbridge-page.tsx:259` | none |
| Capability hints | `getInvocation(providerId)` in `src/renderer/capability-hints.ts` | one branch, only if invocation differs |

A repo-wide search for hardcoded provider ids outside the registry finds exactly
two functional sites: the Copilot branch in `capability-hints.ts:86` and the
legacy OpenCode workspace migration in `provider-files.ts:75`. `EditorRole` is
metadata only — the renderer never reads it.

So adding Gemini CLI is: one registry entry, one scaffold directory, and
whatever the two findings above force.

## 2. Feature-by-feature parity

| # | Extension feature | Works with Gemini CLI? | Notes |
| --- | --- | --- | --- |
| 1 | Provider selection, persisted per cluster | ✅ yes, free | Registry-driven (`localStorage`), no code. |
| 2 | Availability check (`<exe> --version`) | ✅ yes, free | `gemini --version` → `0.60.0` on stdout, exit `0`. Matches `VERSION_RE = /\d+\.\d+\.\d+/` in `check-provider.ts:8`. |
| 3 | One-click session in a Freelens terminal | ✅ yes, **plus `--skip-trust`** | Bare `gemini` is interactive; CWD is the project root. See §3. |
| 4 | `KUBECONFIG` / `PATH` inheritance | ✅ yes | The `run_shell_command` tool inherits the process environment. Caveat: `--sandbox` / `tools.sandbox` runs tools in a container and would **not** see the host kubeconfig — do not enable it. |
| 5 | Isolated per-cluster workspace | ✅ yes, free | Gemini resolves `.gemini/` from CWD; no global state per project except a temp/session dir keyed by project path. |
| 6 | Seeded instructions file | ✅ yes | `GEMINI.md`, discovered hierarchically from CWD upward plus `~/.gemini/GEMINI.md`. Renameable via `context.fileName`; leave it at the default. |
| 7 | Seeded permission file | ✅ yes, **as a policy TOML** | `.gemini/policies/*.toml`. See §4 — this is finding #2. |
| 8 | Seeded `/build-cluster-map` command | ✅ yes, native | `.gemini/commands/build-cluster-map.toml`. Native slash command, so the invocation hint stays `/build-cluster-map` (unlike Copilot). |
| 9 | Command arguments (`$ARGUMENTS`) | ✅ yes | `{{args}}` placeholder. Also `!{shell}` and `@{file}` injection, which we do not need. |
| 10 | Parallel subagent exploration | ✅ yes | Built-in `generalist` agent (`A general-purpose AI agent with access to all tools`) invoked via the `invoke_agent` tool; the shipped system prompt explicitly endorses parallel subagents for independent read-only tasks. So the cluster-map command keeps the Claude-style "one subagent per namespace, at most 5 in parallel" wording rather than the Copilot sequential wording. |
| 11 | In-app Monaco editors | ⚠️ needs a small change | Two of the three files are TOML. `EditorDefinition.language` is `"json" \| "markdown"`, and **Monaco ships no TOML grammar** (verified: `monaco-editor/esm/vs/basic-languages/` has `ini` and `yaml`, no `toml`). See §5. |
| 12 | Workspace artifact inventory (skills) | ✅ yes, free | `.gemini/skills/<name>/SKILL.md` with YAML frontmatter `name`/`description` — byte-for-byte the extension's existing `skill-dir` layout. Verified with `gemini skills list`. `.agents/skills/` is also scanned by Gemini and can be declared as a secondary root. |
| 13 | Workspace artifact inventory (agents) | ✅ yes, free | `.gemini/agents/*.md`, markdown + YAML frontmatter, files starting with `_` ignored. Exactly the extension's `markdown` layout. |
| 14 | Reveal workdir | ✅ yes, free | Path-only, provider-agnostic. |
| 15 | Open in editor | ✅ yes, free | Path-only, provider-agnostic. |
| 16 | Reset managed paths | ✅ yes, free | `resetPaths` are plain files. |
| 17 | Configurable probe timeout / external editor | ✅ yes, free | Provider-agnostic. Only the prose at `src/renderer/settings-page.tsx:154` names providers. |

### Gemini-only capabilities (out of scope, worth knowing)

`gemini mcp add|list|enable|disable` (MCP servers in `mcpServers`),
`gemini extensions ...`, `gemini hooks migrate` (imports Claude Code hooks),
`gemini skills install|link`, `-r/--resume` + `--list-sessions` (session
persistence, which is backlog item 3b), `--approval-mode plan` (a read-only
plan mode), `--worktree`, `-o json|stream-json`. None are required for parity.

## 3. Finding #1 — folder trust blocks the workspace layer

`security.folderTrust.enabled` defaults to **`true`** in 0.60.0 (verified in the
settings schema). The extension's whole premise is a *fresh* directory per
cluster and provider, so every first launch starts untrusted.

Observed in an empty temp workspace:

```console
$ gemini -p "hi"
Gemini CLI is not running in a trusted directory. To proceed, either use
`--skip-trust`, set the `GEMINI_CLI_TRUST_WORKSPACE=true` environment variable,
or trust this directory in interactive mode.

$ gemini skills list                     # workspace held one seeded skill
Skipping project agents due to untrusted folder.
Project hooks disabled because the folder is not trusted.
No skills discovered.

$ GEMINI_CLI_TRUST_WORKSPACE=true gemini skills list
Discovered Agent Skills:
demo [Enabled]
  Location: /tmp/gtest/.gemini/skills/demo/SKILL.md
```

In the shipped code, workspace settings are merged only when trusted
(`mergeSettings(system, systemDefaults, user, workspaceSettings, isTrusted)`),
the TOML command loader returns `[]` when untrusted, skill discovery returns
early when untrusted, and the workspace policy directory is gated on
`config.isTrustedFolder()`.

**Consequence:** without trust, the extension's seeded permission file, command
and skills are *silently inert*. The user gets an unguarded agent while the UI
claims "Safe by default". Trusting the folder is therefore the **safer** state
here, not the riskier one — a point worth stating plainly in the README.

**Decision: `launchArgs: ["--skip-trust"]`.**

- It needs zero changes to `get-launch-command.ts`, which already only joins
  `executable` + `launchArgs`.
- It is scoped to the single session — it writes nothing to
  `~/.gemini/trustedFolders.json`, so the extension keeps its "workspace only"
  constraint (ARCHITECTURE.md) and never mutates user-global Gemini config.
- It is **not** a permission bypass. `--skip-trust` only enables the workspace
  config layer. Auto-approving tools is `--yolo` / `--approval-mode yolo`, which
  we must never pass.
- The directory being trusted was created and seeded by the extension itself
  from bundled scaffolds, for one specific cluster.

Rejected alternatives: writing `~/.gemini/trustedFolders.json` from the main
process (mutates user-global state, out of the declared workspace boundary);
setting `GEMINI_CLI_TRUST_WORKSPACE=true` in the launch command (needs a new
per-provider env mechanism in `get-launch-command.ts` *and* a second PowerShell
code path, for no benefit over the flag); leaving the prompt to the user
(silently unguarded sessions if they decline, plus a confusing prompt in a
directory they did not create).

## 4. Finding #2 — the permission file must be a policy TOML

Claude Code and OpenCode both get "allow these read-only commands, **ask** for
everything else". Gemini CLI has two mechanisms and only one of them does that.

### `tools.allowed` in `.gemini/settings.json` — do not use

`tools.allowed: ["run_shell_command(kubectl get)", ...]` parses as expected
(`/^([a-zA-Z0-9_-]+)\((.*)\)$/` → an allow rule with a command-prefix args
pattern), but the mapper is called with `addDefaultDenyForTools = true`, which
appends:

```js
{ toolName: "run_shell_command", decision: "deny", priority: priority - 0.01 }
```

Settings-derived rules live in the **user tier (≈4.3)**; the shipped default
`run_shell_command → ask_user` lives in the **default tier (1.010)**. The
narrowing deny therefore outranks the default ask, and every shell command that
is not on the list is **hard-denied** — the user is never asked and cannot
approve. That directly contradicts the extension's documented behaviour ("asks
for your approval for everything else"). It also trips Gemini's own project
security review: a workspace `settings.json` with a non-empty `tools.allowed`
is reported as *"This project auto-approves certain tools"*.

### `.gemini/policies/<name>.toml` — use this

Workspace policies are tier 3 TOML files. Allow-only rules raise the decision
for the listed prefixes and leave everything else on the default
`ask_user`, which is exactly the Claude/OpenCode model:

```toml
# .gemini/policies/agentbridge.toml
[[rule]]
toolName = "run_shell_command"
commandPrefix = ["kubectl get", "kubectl describe", "kubectl logs", "..."]
decision = "allow"
priority = 50
```

Schema (from the shipped `PolicyRuleSchema`): `toolName` (string or array,
required), `decision` (`allow` | `deny` | `ask_user`, required), `priority`
(integer 0–999, required), and optionally `commandPrefix` (string or array — only
valid with `toolName = "run_shell_command"`), `commandRegex`, `argsPattern`
(mutually exclusive with the two previous), `modes`, `mcpName`, `subagent`,
`interactive`, `allowRedirection`, `denyMessage`. A file is
`{ rule = [...], safety_checker = [...] }`; a policy *directory* loads every
`*.toml` in it.

Matching is safer than a naive prefix test, which is worth knowing before
writing the rules: Gemini parses the command into sub-commands and evaluates
each one, so `kubectl get pods; rm -rf /` does not ride in on the `kubectl get`
allow, and an `allow` whose command contains redirection is downgraded to
`ask_user` unless the rule sets `allowRedirection`.

New or changed workspace policy files are auto-accepted in 0.60.0
(`autoAcceptWorkspacePolicies = true`, hardcoded), so editing this file in the
in-app Monaco editor does not produce a re-acceptance prompt on the next
session. ⚠️ This is a hardcoded constant rather than a documented setting, so it
could change; if it ever becomes a prompt, the symptom is a one-time
confirmation after every edit and after first seeding.

### Not `.gemini/settings.json` at all?

Correct — the Gemini provider needs no `settings.json` scaffold. Seeding an
empty one (as the Copilot provider does) would add a file with nothing in it
that Gemini reads; seeding a non-empty one risks the security warning above.
Three editors, matching every other provider: instructions, permissions,
command.

## 5. Finding #3 — TOML in the Monaco editor

Two of the three declared files are TOML (`.gemini/policies/agentbridge.toml`,
`.gemini/commands/build-cluster-map.toml`). Today:

- `EditorDefinition.language` is the union `"json" | "markdown"`
  (`src/common/agentbridge-providers.ts:8`), so the registry entry will not
  type-check without widening it.
- `src/renderer/provider-file-editor.tsx:132` passes `editor.language`
  straight to Monaco's `language` prop.
- Monaco has **no TOML grammar**. Verified against the installed
  `monaco-editor`: `esm/vs/basic-languages/` contains `ini` and `yaml`, no
  `toml`. An unknown language id silently renders as plaintext — no error, just
  no highlighting.

**Decision:** widen the union to `"json" | "markdown" | "toml"` for registry
expressiveness, and map `toml` → Monaco's `ini` grammar at the single render
site. INI covers what these files actually contain — comments, `[[rule]]`
headers, `key = "value"`, arrays of strings — and it is already bundled, so
there is no bundle-size or worker cost. A real Monarch grammar for TOML can
replace the mapping later without touching the registry.

⚠️ `ini` will not highlight TOML multi-line basic strings (`"""…"""`) as one
token, and the command scaffold's `prompt` is exactly that. It is a cosmetic
defect in one file, not a correctness one; call it out so the next reader does
not treat it as a bug.

## 6. Cluster-map command, translated

Gemini's TOML command schema is strict: `prompt` (required string) and
`description` (optional string). Nothing else. Consequences for the scaffold:

- Claude's `allowed-tools:` frontmatter has **no equivalent** — per-command tool
  gating does not exist in Gemini. Tool gating lives in the policy file, which
  is the same file for every command. This is a real narrowing versus Claude
  Code: the cluster-map command cannot tighten its own permissions. Given the
  policy file already limits shell access to read-only `kubectl`/`helm`, the
  effective guardrail is unchanged; only the belt-and-braces second layer is
  gone. State it in the docs and move on.
- Claude's `$ARGUMENTS` becomes `{{args}}` (optional namespace argument).
- The body is a TOML multi-line basic string (`prompt = """…"""`). Because the
  body contains `<!-- BEGIN AGENTBRIDGE CLUSTER MAP -->` markers and backticked
  paths, use `'''…'''` (multi-line *literal* string) so nothing in the markdown
  is interpreted as a TOML escape.
- Skill output paths become `.gemini/skills/ns-map-<namespace>/SKILL.md` and
  `.gemini/skills/cluster-map-<cluster>/SKILL.md`. `src/main/scaffold-source.test.ts:68`
  already asserts, for every provider, that every `` `…/SKILL.md` `` path in the
  command scaffold sits under that provider's declared skill roots, and that the
  two canonical paths are present verbatim — so getting this wrong fails the
  suite rather than silently producing invisible skills (GOTCHAS.md, 2026-08-13).
- Subagent wording stays Claude-style (see §2 row 10): `invoke_agent` with the
  built-in `generalist` agent, one per namespace, at most 5 in parallel. Note
  that `src/main/scaffold-source.test.ts:91` currently hardcodes the provider
  list for that assertion — extend it to include `gemini`.

## 7. Registry entry

```ts
{
  id: "gemini",
  name: "Gemini CLI",
  executable: "gemini",
  versionArgs: ["--version"],
  docsUrl: "https://geminicli.com/docs/get-started/installation/",
  // Gemini CLI refuses to run in an untrusted directory, and every workspace
  // the extension creates is new. Without trust it also silently ignores the
  // seeded policy, command and skills — so this flag is what makes the
  // guardrails effective, not a bypass of them. Session-scoped: it writes
  // nothing to ~/.gemini/trustedFolders.json.
  launchArgs: ["--skip-trust"],
  editors: [
    {
      path: "GEMINI.md",
      title: "Instructions (GEMINI.md)",
      language: "markdown",
      role: "instructions",
    },
    {
      path: ".gemini/policies/agentbridge.toml",
      title: "Permissions (.gemini/policies/agentbridge.toml)",
      language: "toml",
      role: "permissions",
    },
    {
      path: ".gemini/commands/build-cluster-map.toml",
      title: "Command (/build-cluster-map)",
      language: "toml",
      role: "command",
    },
  ],
  resetPaths: [
    ".gemini/policies/agentbridge.toml",
    ".gemini/commands/build-cluster-map.toml",
  ],
  artifactSources: [
    { kind: "skill", roots: [".gemini/skills", ".agents/skills"], layout: "skill-dir" },
    { kind: "agent", roots: [".gemini/agents"], layout: "markdown" },
  ],
}
```

Scaffold files, mirroring the layout the seeder expects (flat `source` override
is not needed — every path is seedable as-is):

```text
src/main/scaffolds/gemini/GEMINI.md
src/main/scaffolds/gemini/.gemini/policies/agentbridge.toml
src/main/scaffolds/gemini/.gemini/commands/build-cluster-map.toml
```

## 8. Tests the new provider must satisfy

`src/main/scaffold-source.test.ts` uses `it.each(agentBridgeProviders)`, so five
assertions apply to Gemini automatically the moment the registry entry lands:
every declared editor file exists in the scaffold; the instructions file matches
six required regexes (inherited `KUBECONFIG`, inspect-before-mutate, explicit
namespace, ask-before-destructive, RBAC-as-security-boundary, cluster notes);
the command scaffold is read-only, forbids secret values, names
`ns-map-<namespace>` and `cluster-map-<cluster>`, and contains both cluster-map
markers; and every `SKILL.md` path in the command sits under a declared skill
root.

`src/readme-docs.test.ts` additionally fails until README documents every
`editors[].path` in backticks and every `resetPaths` entry inside the Reset
section.

Two tests need editing rather than just passing: the hardcoded
`["opencode", "claude"]` subagent list (`scaffold-source.test.ts:91`) and the
provider-keyword assertion in `src/package-metadata.test.ts:20`, which pins
`package.json` keywords to an exact array.

## 9. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `--skip-trust` reads as "disable a security feature" in review | medium | Document §3 verbatim in the README: without it the seeded guardrails are inert, and it is not `--yolo`. |
| Gemini CLI is pre-1.0 and moving fast; policy engine and settings v2 are recent | medium | Pin the verified version in the docs; the `--allowed-tools` flag is already deprecated in favour of the policy engine, so the TOML choice is the forward-compatible one. |
| TOML highlighting via the `ini` grammar is approximate | low | Cosmetic; §5. |
| Workspace policy auto-accept is a hardcoded constant | low | ⚠️ Symptom is a one-time prompt; note it in GOTCHAS if it ever appears. |
| No per-command tool gating | low | §6; the policy file is still enforced. |
| `tools.sandbox` / `--sandbox` would hide the host kubeconfig | low | Never set it; the scaffold does not. |
