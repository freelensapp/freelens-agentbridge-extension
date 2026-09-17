# Gemini CLI Support Implementation Plan

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax for tracking.
> Implement task-by-task; every task ends green.

**Spec:** [`docs/specs/2026-09-17-gemini-cli-support-design.md`](../specs/2026-09-17-gemini-cli-support-design.md) ·
**Issue:** [#55](https://github.com/freelensapp/freelens-agentbridge-extension/issues/55)

**Goal:** Add Google's Gemini CLI (`gemini`) as a fourth provider, at full
feature parity with Claude Code — seeded instructions, a permission file that
allows read-only `kubectl`/`helm` and asks for everything else, a native
`/build-cluster-map` slash command, and a workspace artifact inventory that sees
Gemini's skills and subagents.

**Architecture:** One registry entry in `src/common/agentbridge-providers.ts`
plus one scaffold directory. The only generic code that changes is the editor
language union (TOML) and its single Monaco render site. No new IPC channel, no
new UI component, no provider branching in main or renderer logic.

**Tech stack:** TypeScript 5.9, Node >= 22, React 17, Monaco, Vitest 4,
Biome 2.5.

---

## Global constraints

- **Registry-only provider knowledge.** ARCHITECTURE.md: "Add providers by
  extending shared registry and adding matching scaffold files, rather than
  branching UI or file logic." The one permitted branch is a capability-hint
  invocation, and Gemini does not need one (its slash command is native).
- **Never pass `--yolo` or `--approval-mode yolo`,** and never set
  `tools.sandbox` / `--sandbox` (the sandbox hides the host kubeconfig).
- **Do not write anything outside the workspace.** No touching
  `~/.gemini/trustedFolders.json`, `~/.gemini/settings.json`, or any user-global
  Gemini state.
- **Do not use `tools.allowed` in a workspace `settings.json`** — it hard-denies
  unlisted shell commands. See the spec, §4.
- **The permission file only works because `--policy` points at it.** Workspace
  policy auto-discovery is disabled by a hardcoded constant in 0.60.0 (spec
  §4.1), so seeding the TOML without the launch arg is a no-op. Do not "tidy up"
  that flag.
- **Before starting, read spec §10** (the reported Antigravity transition and
  consumer-tier cutoff) and confirm the provider is still worth shipping.
- **Seeding copies files, not directories** (`provider-files.ts:155`), so every
  declared editor path must be a single file that exists in the scaffold.
- **Biome:** 2-space indent, LF, 120 columns, double quotes, semicolons,
  trailing commas, organized imports; `node:` prefix for built-ins; import order
  Node → `@freelensapp` → packages → relative, type-only last.
- **Naming:** kebab-case files, colocated `<module>.test.ts(x)`, camelCase
  functions/variables, PascalCase types, UPPER_SNAKE_CASE shared constants.
- **Every task ends green:** `pnpm test`, `pnpm type:check`, `pnpm lint:check`.
  Run `pnpm install` once before Task 1.

---

## File structure

### Created

| File | Responsibility |
| --- | --- |
| `src/main/scaffolds/gemini/GEMINI.md` | Seeded cluster-agent instructions. Must satisfy the six regexes in `scaffold-source.test.ts:41`. |
| `src/main/scaffolds/gemini/.gemini/policies/agentbridge.toml` | Policy file (loaded via `--policy`): allow read-only `kubectl`/`helm` prefixes, leave everything else on the shipped `ask_user` default. |
| `src/main/scaffolds/gemini/.gemini/commands/build-cluster-map.toml` | Native `/build-cluster-map` slash command (`description` + `prompt`). |

### Modified

| File | Change |
| --- | --- |
| `src/common/agentbridge-providers.ts` | Widen `EditorDefinition.language` to include `"toml"`; append the `gemini` registry entry. |
| `src/renderer/provider-file-editor.tsx` | Map the `toml` language id to Monaco's bundled `ini` grammar. |
| `src/main/scaffold-source.test.ts` | Add `gemini` to the hardcoded subagent-wording provider list; add a Gemini policy-TOML assertion. |
| `src/package-metadata.test.ts` | Add the `gemini-cli` keyword to the pinned array. |
| `package.json` | Add the `gemini-cli` keyword. |
| `README.md` | Four providers; install link; seeded-file table row; Reset section paths; a Gemini permissions subsection; the folder-trust explanation. |
| `src/renderer/settings-page.tsx` | Probe-timeout help text naming the providers. |
| `ARCHITECTURE.md` | Overview and external-dependencies lines that enumerate providers. |
| `docs/backlog.md` | Drop Gemini CLI from item 4a. |
| `GOTCHAS.md` | Append the folder-trust and `tools.allowed` gotchas. |

---

## Task 1 — `toml` as an editor language

- [ ] Widen `EditorDefinition.language` in `src/common/agentbridge-providers.ts`
      to `"json" | "markdown" | "toml"`.
- [ ] In `src/renderer/provider-file-editor.tsx`, map the language id to a
      Monaco grammar id at the one place `editor.language` is passed to
      `<Monaco language=...>`. Monaco bundles no TOML grammar (verified:
      `monaco-editor/esm/vs/basic-languages/` has `ini`, no `toml`), and an
      unknown id degrades silently to plaintext — so map `toml` → `ini`. Keep
      the mapping a small exported pure function.
- [ ] Add a colocated unit test for the mapping function: `toml` → `ini`,
      `json` → `json`, `markdown` → `markdown`. (The component itself is not
      unit-testable — Vitest runs in `node` with no DOM, per TESTING.md.)
- [ ] Comment *why* the mapping exists, including that `ini` does not tokenize
      TOML multi-line strings, so the next reader does not file it as a bug.

**Verify:** `pnpm type:check`, `pnpm test`, `pnpm lint:check`.

## Task 2 — Instructions scaffold

- [ ] Create `src/main/scaffolds/gemini/GEMINI.md` modelled on
      `src/main/scaffolds/claude/CLAUDE.md`.
- [ ] It must match all six regexes asserted for every provider in
      `src/main/scaffolds`-land (`scaffold-source.test.ts:41`): inherited
      `KUBECONFIG`, inspect before mutating, explicit namespace, ask before
      destructive/availability-affecting changes, RBAC + credentials as a
      security boundary, and a "Cluster Notes" section.
- [ ] Keep the `## Cluster Notes` heading — the cluster-map command merges its
      navigation block into this file.

**Verify:** the scaffold tests cannot run until Task 4 adds the registry entry;
review by hand here and confirm in Task 4.

## Task 3 — Permission and command scaffolds

- [ ] Create `src/main/scaffolds/gemini/.gemini/policies/agentbridge.toml` with
      **allow-only** rules — one `[[rule]]` block with
      `toolName = "run_shell_command"`, `decision = "allow"`,
      `priority = 50`, and a `commandPrefix` array covering exactly the sixteen
      prefixes already pinned in `scaffold-source.test.ts:7`
      (`kubectl get|describe|logs|explain|api-resources|api-versions|auth can-i|top|version`,
      `helm list|status|get|history|show|search|version`).
      Add **no** `deny` rule and **no** catch-all: unlisted shell commands must
      fall through to Gemini's shipped `run_shell_command → ask_user` default.
- [ ] Head the file with a comment explaining that it is loaded via the
      `--policy` launch arg (workspace-tier auto-discovery is dead — spec §4.1),
      that it therefore lands in the user tier while unmatched commands stay on
      the tier-1 `ask_user` default, and why `tools.allowed` in `settings.json`
      is deliberately not used.
- [ ] Verify the file loads clean: from the scaffold directory, run
      `gemini --policy .gemini/policies/agentbridge.toml --list-sessions` and
      confirm no `Policy file error` appears. Temporarily corrupting a
      `decision` value should produce one — that is the check that the file is
      actually being read rather than silently skipped.
- [ ] Create `src/main/scaffolds/gemini/.gemini/commands/build-cluster-map.toml`
      by translating `src/main/scaffolds/claude/commands/build-cluster-map.md`:
  - [ ] `description = "..."` and `prompt = '''…'''` — a multi-line **literal**
        string, so backticks, `<!-- … -->` markers and backslashes pass through
        untouched. These two keys are the entire schema; there is no
        `allowed-tools` equivalent.
  - [ ] `$ARGUMENTS` → `{{args}}`.
  - [ ] Skill paths → `.gemini/skills/ns-map-<namespace>/SKILL.md` and
        `.gemini/skills/cluster-map-<cluster>/SKILL.md`.
  - [ ] Instructions file references → `GEMINI.md`.
  - [ ] Subagents: `invoke_agent` with the built-in `generalist` agent, "one
        subagent per namespace", "at most 5 in parallel" — keep that wording
        verbatim, Task 6 asserts it.
  - [ ] Keep the read-only rules, the "never record Secret values" rule, and
        both `<!-- BEGIN/END AGENTBRIDGE CLUSTER MAP -->` markers.
- [ ] Sanity-check both files parse as TOML.

## Task 4 — Registry entry

- [ ] Append the `gemini` entry to `agentBridgeProviders` exactly as given in
      the spec, §7: `executable: "gemini"`, `versionArgs: ["--version"]`,
      `docsUrl: "https://geminicli.com/docs/get-started/installation/"`,
      `launchArgs: ["--skip-trust", "--policy", ".gemini/policies/agentbridge.toml"]`,
      the three editors, the two `resetPaths`, and `artifactSources` with skill
      roots `[".gemini/skills", ".agents/skills"]` and agent root
      `.gemini/agents`.
- [ ] Comment both launch args with their findings: `--skip-trust` because
      Gemini CLI refuses to run in an untrusted directory and silently ignores
      the seeded command and skills until trusted (session-scoped, and not
      `--yolo`); `--policy` because workspace-tier policy discovery is disabled
      by a hardcoded constant, so the permission file is never opened without
      it.
- [ ] Keep `.gemini/skills` as `roots[0]`: that slot doubles as the directory
      the cluster-map command writes into (asserted by
      `scaffold-source.test.ts`), and the command should write to the
      provider-native path. `.agents/skills` is the cross-tool interop path and
      wins in Gemini's own precedence, but the extension only ever writes one of
      the two.
- [ ] Add a `src/common/agentbridge-providers.test.ts` case pinning the Gemini
      entry's shape, in the style of the existing provider cases.

**Verify:** `pnpm test` — the five `it.each(agentBridgeProviders)` scaffold
assertions now cover Gemini, and `src/readme-docs.test.ts` starts failing until
Task 7.

## Task 5 — Capability hint

- [ ] Confirm no change is needed: `clusterMapHint.getInvocation` already
      returns `/build-cluster-map` for every provider except `copilot`, and
      Gemini's slash command is native.
- [ ] Add an assertion to `src/renderer/capability-hints.test.ts` that
      `getInvocation("gemini")` yields `Run /build-cluster-map`, so a future
      refactor cannot silently drop it.

## Task 6 — Test updates

- [ ] `src/main/scaffold-source.test.ts:91` — add `"gemini"` to the hardcoded
      `["opencode", "claude"]` list for the parallel-subagent wording.
- [ ] `src/main/scaffold-source.test.ts` — add a Gemini case, mirroring the
      OpenCode and Claude permission tests: parse the policy TOML, assert the
      `commandPrefix` set equals `allowedBashCommands`, assert `decision` is
      `"allow"`, and assert the file contains **no** `deny` decision and no
      `tools.allowed` (that combination is what would hard-deny everything
      else).
- [ ] `src/package-metadata.test.ts` — add `"gemini-cli"` to the pinned keyword
      array, and add the same keyword to `package.json`.

**Verify:** `pnpm test`, `pnpm type:check`, `pnpm lint:check`.

## Task 7 — Documentation

- [ ] `README.md`:
  - [ ] Intro and Features: "Three providers" → four; add Gemini CLI to the
        provider list and to Quick start step 1
        (`[Gemini CLI](https://geminicli.com/docs/get-started/installation/) — gemini`).
  - [ ] Seeded-file table: add the Gemini row with all three paths in backticks
        (`src/readme-docs.test.ts` asserts every `editors[].path` appears).
  - [ ] Reset section: add both Gemini `resetPaths` in backticks (asserted
        separately, against the Reset section only).
  - [ ] New `### Gemini CLI (.gemini/policies/agentbridge.toml)` subsection
        alongside the OpenCode and Claude ones: show the policy snippet, explain
        allow-only + tier fallthrough, state that `tools.allowed` is
        deliberately avoided, and note that because the file is passed with
        `--policy`, a user's own `~/.gemini/policies/` is **not** loaded inside
        AgentBridge sessions.
  - [ ] A short, plain paragraph on folder trust: the extension launches with
        `--skip-trust`; this is not auto-approval (that is `--yolo`, never
        passed); without it Gemini ignores the seeded guardrails entirely.
  - [ ] Requirements: note that Gemini CLI needs its own one-time auth setup
        (`gemini` then pick an auth method, or `GEMINI_API_KEY`) outside
        Freelens, and link spec §10 on the reported consumer-tier cutoff. The
        version probe passes regardless of auth, so a "ready" badge does not
        guarantee a working session.
- [ ] `src/renderer/settings-page.tsx:154` — name Gemini CLI in the probe
      timeout help text.
- [ ] `ARCHITECTURE.md` — update the overview line and the external-dependencies
      line that enumerate the provider CLIs.
- [ ] `docs/backlog.md` — remove Gemini CLI from item 4a (*More providers*).
- [ ] `GOTCHAS.md` — append two entries:
  - Gemini CLI's `security.folderTrust.enabled` defaults to `true`, and an
    untrusted folder does not merely warn — it skips workspace settings,
    policies, commands, skills and hooks, so seeded guardrails are silently
    inert. Fix: launch with `--skip-trust`.
  - `tools.allowed` in a Gemini `settings.json` appends a narrowing DENY for the
    same tool at user-tier priority, so unlisted shell commands are hard-denied
    rather than asked. Fix: express read-only allowances as policy TOML rules and
    let the tier-1 `ask_user` default handle the rest.
  - Gemini CLI 0.60.0 never reads `<workdir>/.gemini/policies/` — a hardcoded
    `disableWorkspacePolicies = true` dead-ends the tier-3 branch, silently and
    with no diagnostic. Fix: pass the file explicitly with
    `--policy <relative-path>`; corrupt a `decision` value to prove the file is
    being read, since a skipped file and a valid file look identical.

**Verify:** `pnpm test` (README tests green), `pnpm lint:check`, and markdown
lint via `pnpm trunk:check` if available.

## Task 8 — Build and manual smoke test

- [ ] `pnpm build` and confirm `out/main/scaffolds/gemini/` contains all three
      files, including the dotted `.gemini/` directory (the `copyScaffold`
      plugin does a plain recursive `cpSync`, so it should — verify, because a
      dot-directory dropped from the package is invisible until a user's first
      session).
- [ ] With `gemini` on `PATH`, in Freelens: select Gemini CLI on a cluster,
      confirm the version probe reports ready, confirm all three files seed and
      open in Monaco with highlighting, open a session and confirm it starts
      with no trust prompt, run `kubectl get pods` (allowed without a prompt)
      and `kubectl apply` (prompts rather than being refused), run
      `/build-cluster-map`, then confirm the artifacts panel counts the
      generated skills. Restart Freelens after main-process changes
      (GOTCHAS.md, 2026-08-13).
- [ ] Press Reset and confirm the dialog names both Gemini paths and that
      `GEMINI.md` survives.

---

## Out of scope

MCP servers (`mcpServers`), Gemini extensions, hooks, session resume
(`--resume`, backlog 3b), model selection (`-m`, backlog 4b), `--approval-mode
plan`, and seeding curated subagents into `.gemini/agents/` (backlog 1b). All
are available in Gemini CLI and none are needed for parity.
