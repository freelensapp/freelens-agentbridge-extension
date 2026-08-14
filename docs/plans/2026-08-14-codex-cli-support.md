# Codex CLI Support — Findings Report and Implementation Plan

- **Issue:** [#23](https://github.com/freelensapp/freelens-agentbridge-extension/issues/23)
- **Date:** 2026-08-14
- **Status:** proposed — research complete, awaiting review before implementation
- **Backlog item:** `docs/backlog.md` §4a ("More providers — … Codex CLI …")
- **Codex baseline researched:** `@openai/codex` **v0.147.0** (GitHub tag `rust-v0.147.0`)

---

## 0. Executive summary

Adding OpenAI Codex CLI is **not** the pure registry addition `docs/backlog.md` §4a assumes.
The registry, the workspace machinery, launch, reset, reveal, open-in-editor and the artifact
scanner are all genuinely provider-agnostic and need no code change. But Codex differs from the
three existing providers on four axes that the current abstractions do not cover:

| # | Codex reality | What it breaks |
|---|---|---|
| 1 | Project config is **TOML** (`.codex/config.toml`) | `EditorDefinition.language` is `"json" \| "markdown"`; Monaco 0.52.2 ships **no TOML grammar** |
| 2 | Project config is **silently ignored until the directory is trusted** | Every seeded guardrail is inert on first launch; the workspace is a fresh non-git dir under `userData` |
| 3 | `workspace-write` sandbox has **`network_access = false` by default** | `kubectl` cannot reach the cluster API server — the extension's entire purpose |
| 4 | Project-local slash commands **do not exist** (custom prompts are global-only and deprecated) | `/build-cluster-map` must ship as a **skill**, and `capability-hints.ts` must stop claiming otherwise |

None of these is fatal. Items 1, 3 and 4 have clean solutions inside the existing design. Item 2
is a UX problem that needs documentation (and, optionally, a later opt-in action). One further
finding — item 5 in §3 — is a genuine **open question that requires an empirical test against a
real Codex install** before the flagship `build-cluster-map` capability can be called supported.

---

## 1. How Codex maps onto the provider contract

The registry entry is the complete set of assumptions the extension makes about a CLI. Codex
against each field:

| Field | Value for Codex | Verified? |
|---|---|---|
| `executable` | `codex` (npm `bin: { "codex": "bin/codex.js" }`) | ✅ npm registry metadata |
| `versionArgs` | `["--version"]` → prints `codex-cli 0.147.0`, exits 0, **no login required** | ✅ flag documented; exact string partially corroborated |
| `launchArgs` | `[]` — bare `codex` opens the interactive TUI rooted at CWD | ✅ docs: "Open a project directory and run `codex`" |
| `docsUrl` | `https://developers.openai.com/codex/cli` | ✅ |
| instructions file | **`AGENTS.md`** — read from project root down to CWD, closest wins. `CODEX.md` **does not exist** | ✅ |
| project config | **`.codex/config.toml`** — real, layered, closest-wins, **trusted projects only** | ✅ |
| command allowlist | **`.codex/rules/*.rules`** — Starlark, project-local, trusted-only, marked **experimental** | ✅ |
| skills | **`.agents/skills/<name>/SKILL.md`** (documented, recommended) and `.codex/skills/` (real in source, undocumented) | ✅ source `codex-rs/ext/skills/src/host_roots.rs` |
| custom agents | `.codex/agents/*.toml` — project-local, but **TOML, not markdown-with-frontmatter** | ✅ |
| env inheritance | `[shell_environment_policy] inherit` defaults to `"all"` → **`KUBECONFIG` is inherited** | ✅ |

`VERSION_RE = /\d+\.\d+\.\d+/` in `src/main/check-provider.ts:8` matches `codex-cli 0.147.0`
cleanly, so the readiness probe renders `Codex CLI v0.147.0` with no code change.

### Proposed registry entry

```ts
{
  id: "codex",
  name: "Codex CLI",
  executable: "codex",
  versionArgs: ["--version"],
  docsUrl: "https://developers.openai.com/codex/cli",
  launchArgs: [],
  editors: [
    { path: "AGENTS.md", title: "Instructions (AGENTS.md)", language: "markdown", role: "instructions" },
    { path: ".codex/config.toml", title: "Settings (.codex/config.toml)", language: "toml", role: "settings" },
    { path: ".codex/rules/agentbridge.rules", title: "Permissions (.codex/rules/agentbridge.rules)", language: "starlark", role: "permissions" },
    { path: ".agents/skills/build-cluster-map/SKILL.md", title: "Skill (build-cluster-map)", language: "markdown", role: "command" },
  ],
  resetPaths: [
    ".codex/config.toml",
    ".codex/rules/agentbridge.rules",
    ".agents/skills/build-cluster-map/SKILL.md",
  ],
  artifactSources: [
    { kind: "skill", roots: [".agents/skills", ".codex/skills"], layout: "skill-dir" },
    { kind: "agent", roots: [".codex/agents"], layout: "markdown" },
  ],
}
```

Note this is the **first provider with four editors** (the other three have exactly three). No
test asserts a count of editors, so this is allowed — but it is a new shape, and the README
prose "the two managed files" (`README.md:53, 69-73, 189-191`) becomes wrong at three
`resetPaths`.

---

## 2. Feature-by-feature compatibility matrix

Every user-facing feature of the extension, assessed against Codex.

| # | Feature | Verdict | Notes |
|---|---|---|---|
| 1 | Provider selection (per cluster, `localStorage`) | ✅ **Works unchanged** | Registry data only |
| 2 | Readiness / version probe | ✅ **Works unchanged** | `codex --version` is non-interactive, exits 0, semver-shaped |
| 3 | Workspace preparation & isolation | ⚠️ **Works, with a caveat** | Codex is CWD-rooted and tolerates a non-git dir. But `~/.codex/` global state (auth, `AGENTS.md`, prompts, `default.rules`) is shared across clusters — same as the existing `~/.claude` caveat already documented |
| 4a | Instructions editor | ✅ **Works** | `AGENTS.md` is exactly the contract. ⚠️ Codex *also* merges `~/.codex/AGENTS.md`, and truncates past `project_doc_max_bytes` (32 KiB) — relevant once `/build-cluster-map` starts appending cluster maps |
| 4b | Settings editor | ⚠️ **Needs a new `language`** | `.codex/config.toml` is TOML. `EditorDefinition.language` must gain `"toml"`, and Monaco needs a grammar (see §3.1) |
| 4c | Permissions editor | ⚠️ **Needs a new `language` + accepts experimental risk** | `.codex/rules/*.rules` is Starlark. This is the only true analogue of Claude's `permissions.allow`, and it is marked preview |
| 4d | Command editor | ⚠️ **Re-shaped as a skill** | Project-local slash commands do not exist in Codex. Ships as `.agents/skills/build-cluster-map/SKILL.md`, the Copilot pattern |
| 5 | Monaco + debounced autosave | ✅ **Works unchanged** | Once the language union is widened |
| 6 | Reset to defaults | ✅ **Works unchanged** | Three managed paths instead of two |
| 7 | Reveal workdir | ✅ **Works unchanged** | No provider knowledge |
| 8 | Open in external editor | ✅ **Works unchanged** | No provider knowledge |
| 9 | Launch session in Freelens terminal | ⚠️ **Works only with a correct seeded config** | `KUBECONFIG` inherits fine; the sandbox does **not** allow network by default (§3.2). First launch also hits the trust prompt (§3.3) |
| 10 | Capability hints rail | ❌ **Must be edited or it lies** | `capability-hints.ts:85-91` returns `/build-cluster-map` for every non-Copilot provider. Codex needs `$build-cluster-map` |
| 11 | `build-cluster-map` capability | ⚠️ **Blocked on one unverified sandbox behaviour** | See §3.5 — the agent may not be able to write into `.agents/` |
| 12 | Harness artifacts — **skills** | ✅ **Works unchanged** | `.agents/skills/<name>/SKILL.md` is exactly the `skill-dir` layout, with YAML frontmatter `name`/`description` |
| 12b | Harness artifacts — **agents** | ❌ **Will always report 0** | Codex custom agents are `.codex/agents/*.toml`; the `markdown` layout scans `<root>/*.md`. See §3.4 |
| 13 | Extension preferences | ✅ **Works** | Copy-only change to the probe-timeout hint |
| 14 | Backlog 1b (curated subagents) | ⚠️ **Possible, different format** | Codex subagents are TOML, not markdown |
| 14b | Backlog 2a ("Ask the agent" from a resource) | ✅ **Better than the others** | `codex "prompt"` takes a positional initial prompt |
| 14c | Backlog 3b (transcript viewer) | ⚠️ | `codex exec --json` / `resume` exist, but the interactive session log format is undocumented |

---

## 3. The five real problems, and what to do about them

### 3.1 TOML has no Monaco grammar — verified in this repo

`EditorDefinition.language` is typed `"json" | "markdown"`
(`src/common/agentbridge-providers.ts:8`) and passed straight to Monaco
(`src/renderer/provider-file-editor.tsx:132`). Codex needs TOML, and — verified against the
installed `node_modules/monaco-editor@0.52.2/esm/vs/basic-languages/` — Monaco ships **no
`toml`**. It does ship `ini` (which does *not* claim the `.toml` extension) and `python`.

**Recommendation:** keep the registry semantically honest and translate at the Monaco boundary.

```ts
// src/common/agentbridge-providers.ts
export type EditorLanguage = "json" | "markdown" | "toml" | "starlark";
```

```ts
// src/renderer/provider-file-editor.tsx — Monaco 0.52.2 has no toml/starlark grammar.
// ini is a close-enough highlighter for TOML; Starlark is a Python dialect.
const MONACO_LANGUAGE: Record<EditorLanguage, string> = {
  json: "json",
  markdown: "markdown",
  toml: "ini",
  starlark: "python",
};
```

Rejected alternative: registering a Monarch tokenizer for real TOML. More code, more bundle,
and `ini` already highlights sections, keys, strings and comments correctly for the shapes we
seed.

### 3.2 The default sandbox blocks `kubectl` — the most important finding

In `workspace-write`, **outbound network is off by default** (`config.schema.json` gives
`network_access` a literal `"default": false`). On Linux the seccomp filter blocks every socket
family except `AF_UNIX`, so a TCP connection to `https://<apiserver>:6443` fails outright;
macOS Seatbelt is deny-by-default. An extension whose entire purpose is pointing an agent at a
cluster would ship broken.

The seeded `.codex/config.toml` therefore **must** contain:

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"

[sandbox_workspace_write]
network_access = true
```

**Trap:** Codex has a second, newer permission system (`default_permissions` +
`[permissions.<name>]`). The two **do not compose** — if any active layer sets `sandbox_mode`,
or `--sandbox` is passed, Codex silently ignores `default_permissions`. Pick one axis. This plan
picks legacy `sandbox_mode`, because it is the documented default, is not beta, and keeps
`$HOME/.kube/config` readable (under permission profiles, reads are deny-by-default and
`~/.kube` would need an explicit grant).

### 3.3 Project config is inert until the directory is trusted

`.codex/config.toml`, `.codex/rules/` and project hooks are **silently ignored** in an
untrusted directory. Our workspace is a fresh, non-git directory under Electron `userData` with
a hashed cluster id in its path, so Codex will show a "Do you trust the contents of this
directory?" prompt on first launch — and there are reports of it firing even under
`--dangerously-bypass-approvals-and-sandbox` (openai/codex#14345).

Until the user answers yes, **every guardrail this extension seeds does nothing**, with no
error anywhere.

**Recommendation:** document it loudly (README + the seeded `AGENTS.md` header + a note near
the launch button), and do **not** auto-write trust. The only programmatic fix is appending

```toml
[projects."/abs/path/to/workdir"]
trust_level = "trusted"
```

to `~/.codex/config.toml` — which is outside the workspace containment boundary and would
violate `ARCHITECTURE.md`'s constraint that the extension only writes declared paths inside the
verified workdir. If it is wanted later, it should be an explicit, clearly-labelled user action
("Trust this workspace in Codex"), never a silent side effect of selecting a provider.

### 3.4 Codex custom agents are TOML, so the artifact panel will report 0 forever

`artifactSources` supports exactly two layouts: `skill-dir` (`<root>/<name>/SKILL.md`) and
`markdown` (`<root>/<name>.md`). Codex subagents live at `.codex/agents/*.toml` with top-level
`name` / `description` keys — neither layout matches, and
`src/main/read-frontmatter.ts` parses YAML frontmatter, not TOML.

Worse, `src/common/agentbridge-providers.test.ts:176` hard-asserts
`layout === (kind === "skill" ? "skill-dir" : "markdown")`, so a new layout cannot be added
without touching that test.

**Recommendation:** Phase 1 declares `.codex/agents` with `layout: "markdown"` and accepts that
the Agents count stays 0 (it will still pick up any `.md` a user drops there). Phase 3 adds a
`toml-file` layout plus a minimal top-level-key reader. Shipping a permanently-empty Agents
group is acceptable only because the section already hides zero-count kinds — but it must be
noted in `docs/features/harness-artifacts.md` rather than left as a silent lie.

### 3.5 ⚠️ OPEN QUESTION — can the agent write into `.agents/skills/`?

The Codex sandbox docs state that inside a writable root, `.git`, **`.codex` and `.agents` are
re-bound read-only**. Both documented skill roots (`.agents/skills`, `.codex/skills`) sit under
those prefixes.

If that re-bind applies as written, the `build-cluster-map` capability — whose whole output is
`\`.agents/skills/ns-map-<namespace>/SKILL.md\`` files — **cannot write its results** under the
default `workspace-write` sandbox. Three possible outcomes:

1. `approval_policy = "on-request"` makes Codex escalate and ask the user per write → capability
   works, but with one prompt per namespace. Acceptable but noisy.
2. Listing the path in `[sandbox_workspace_write] writable_roots` overrides the re-bind →
   clean fix, one extra config line.
3. Neither works → the capability must write somewhere else, and no *other* location is a
   documented Codex skill root. That would mean shipping `build-cluster-map` for Codex as
   "generates a map into `AGENTS.md` only, no per-namespace skills".

**This cannot be resolved from documentation and must be tested against a real Codex install
before Phase 2 is committed.** It is the single highest-value verification in this plan.

---

## 4. Implementation plan

Every task ends green: `pnpm test`, `pnpm type:check`, `pnpm lint:check`.
Per `GOTCHAS.md:25`, restart Freelens completely after any `src/main/` change when smoke-testing.

### Phase 0 — Verify against a real Codex install (blocking for Phase 2)

- [ ] Install `@openai/codex` and record `codex --version` output verbatim; confirm
      `VERSION_RE` matches and that the probe exits 0 within the default 15 s timeout without login.
- [ ] Create a scratch non-git directory, run `codex`, and record the exact trust prompt and
      whether `.codex/config.toml` is honoured before/after trusting.
- [ ] With `sandbox_mode = "workspace-write"` and `network_access = true`, confirm
      `kubectl get ns` reaches a real cluster from inside a session.
- [ ] **Resolve §3.5:** attempt to write `.agents/skills/probe/SKILL.md` from inside a session
      and record which of outcomes 1/2/3 occurs.
- [ ] Confirm a `.agents/skills/<name>/SKILL.md` seeded before launch is discovered
      (`/skills`, `$<name>` mention).
- [ ] Confirm `.codex/rules/agentbridge.rules` loads (`codex execpolicy check --rules … -- kubectl get pods`).

### Phase 1 — Provider registration (no capability yet)

- [ ] Widen `EditorLanguage` to `"json" | "markdown" | "toml" | "starlark"` in
      `src/common/agentbridge-providers.ts`, and add the `MONACO_LANGUAGE` map in
      `src/renderer/provider-file-editor.tsx` (§3.1). Colocated test for the map.
- [ ] Append the `codex` entry from §1 to `agentBridgeProviders`.
- [ ] Update `src/common/agentbridge-providers.test.ts:6` (exact id array) and the whole-registry
      `toEqual` literal at `:16-117`.
- [ ] Create `src/main/scaffolds/codex/`:
  - `AGENTS.md` — must match all six regexes in `scaffold-source.test.ts:41-51`
    (`inherited…KUBECONFIG`, `inspect…before…mutat`, `explicit namespace`,
    `ask before…destructive…availability`, `RBAC…credentials…security boundary`,
    `cluster notes`). Add a Codex-specific note about the trust prompt.
  - `.codex/config.toml` — the §3.2 block, plus `[shell_environment_policy] inherit = "all"`
    and `ignore_default_excludes` set **explicitly** (its default is contradictory between
    docs and source).
  - `.codex/rules/agentbridge.rules` — `prefix_rule(...)` entries mirroring
    `allowedBashCommands` in `scaffold-source.test.ts:7-24`, using `decision = "allow"` for the
    read-only `kubectl`/`helm` verbs. Note argv-**prefix** semantics: `["kubectl","get"]`, not
    `kubectl get *` — Codex rules have no wildcards.
  - `.agents/skills/build-cluster-map/SKILL.md` — see Phase 2.
- [ ] Add a `codex` branch to `capability-hints.ts:85-91`:
      `{ verb: "Ask Codex", command: "$build-cluster-map" }`. **Do not leave the default
      branch to handle it** — it would advertise a slash command Codex does not have.
- [ ] Add a Codex-specific scaffold test next to the OpenCode/Claude/Copilot ones at
      `scaffold-source.test.ts:103-133`: assert the config sets `network_access = true`, sets
      `sandbox_mode`, does **not** set `default_permissions` (§3.2 mutual exclusion), and does
      not match `/danger-full-access|yolo|bypass/i`.
- [ ] `README.md`: intro (`:8-10`), "Three providers" → "Four" (`:41`), install list (`:83-85`),
      seeded-files table (`:174-178`, **asserted**), Reset section bullet (`:189-198`,
      **asserted** — must be inside that slice), and a new `### Codex CLI` configuration
      subsection. Fix "the two managed files" prose, now wrong at three `resetPaths`.
- [ ] `src/renderer/harness-artifacts-section.tsx:186` — add `~/.codex` / `~/.agents` to the
      "not counted" note.
- [ ] `src/renderer/settings-page.tsx` — add Codex CLI to the probe-timeout hint.
- [ ] `ARCHITECTURE.md`, `CONTRIBUTING.md:8`, `docs/features/harness-artifacts.md` (provider
      table `:66-70`, the "only Copilot" claim `:87-89`, "All three providers" `:197`),
      `docs/features/capability-registry.md`.
- [ ] Optional: `package.json` keyword `"codex"` — **requires** the matching edit at
      `src/package-metadata.test.ts:20-31` (exact array compare).

### Phase 2 — `build-cluster-map` for Codex (gated on Phase 0)

- [ ] Author `.agents/skills/build-cluster-map/SKILL.md`, modelled on the Copilot `SKILL.md`.
      Frontmatter: `description` (**required** by Codex), `name` optional.
- [ ] Must satisfy `scaffold-source.test.ts:53-89`: `read-only`, `never…secret…value`,
      `ns-map-<namespace>`, `cluster-map-<cluster>`, both `AGENTBRIDGE CLUSTER MAP` markers, and
      **every backticked `…/SKILL.md` path under the primary skill root `.agents/skills/`**.
- [ ] Namespace exploration: Codex *has* multi-agent (`spawn_agent`/`wait_agent`, bounded by
      `max_concurrent_threads_per_session`, default 6) but never auto-delegates, and
      openai/codex#26363 reports `agent_type` being dropped so `.codex/agents/*.toml` agents
      may be unselectable. **Recommendation: write the exploration step sequentially
      (Copilot-style), with an explicit "if subagents are available, spawn one per namespace,
      at most 5 concurrent" opener.** A silently-broken fan-out produces nothing;
      `scaffold-source.test.ts:91-101` only asserts fan-out wording for `opencode`/`claude`, so
      sequential passes CI.
- [ ] Merge target is `AGENTS.md` between the two markers. Note the 32 KiB
      `project_doc_max_bytes` truncation ceiling — keep the merged block compact.
- [ ] Apply the outcome of §3.5: if writes into `.agents/` need it, add `writable_roots` to the
      seeded config and cover it in the scaffold test.

### Phase 3 — Follow-ups (separate issues, not required to ship)

- [ ] `layout: "toml-file"` for `artifactSources` + a top-level-key reader, so Codex subagents
      are counted (§3.4). Requires relaxing `agentbridge-providers.test.ts:176`.
- [ ] An explicit, opt-in "Trust this workspace in Codex" action (§3.3).
- [ ] Curated Codex subagents at `.codex/agents/*.toml` (backlog §1b).
- [ ] Backlog §4b (`launchArgs`/model in the UI) becomes more valuable with Codex, whose
      `-c key=value`, `--sandbox` and `--profile` flags are genuinely useful per-session.

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| §3.5 `.agents/` is read-only to the agent | Medium | **High** — flagship capability produces nothing | Phase 0 blocks Phase 2 on an empirical test |
| Trust prompt leaves all guardrails inert | **High** | Medium — silently unsafe-feeling session | Document prominently; consider Phase 3 opt-in action |
| `.codex/rules/` is preview and may break | Medium | Medium — permission editor stops working | It is one editor; the config-only fallback (drop the `permissions` editor, keep three) is a small revert |
| Codex ships breaking config changes | **High** — repo is moving fast, `docs/*.md` are now stubs | Medium | Pin the researched version (0.147.0) in the scaffold comments; re-verify on report |
| `bash -lc` pipe normalization bug (openai/codex#13175) | Medium | Low | Rules may not match `kubectl get pods \| grep x`; falls back to a prompt, which is safe |
| Login shell overrides inherited `PATH` (openai/codex#8922) | Low | Medium | Same class of issue the POSIX launch command's `PATH="$PATH"` already addresses |

---

## 6. Sources

Primary docs now live at `learn.chatgpt.com/docs/*` (`developers.openai.com/codex/*` 308-redirects
there; appending `.md` returns raw markdown). `github.com/openai/codex/docs/*.md` are one-line stubs.

- `https://github.com/openai/codex` · `https://registry.npmjs.org/@openai/codex/latest`
- `learn.chatgpt.com/docs/codex/cli` · `/developer-commands` · `/non-interactive-mode`
- `/agent-configuration/agents-md` · `/agent-configuration/rules` · `/agent-configuration/subagents`
- `/config-file/config-basic` · `/config-advanced` · `/config-reference` · `/config-sample`
- `/sandboxing` · `/agent-approvals-security` · `/permissions` · `/build-skills` · `/extend/mcp`
- `raw.githubusercontent.com/openai/codex/main/codex-rs/core/config.schema.json` (`network_access` default `false`)
- `codex-rs/ext/skills/src/host_roots.rs` (skill discovery roots)
- Issues: openai/codex #26363, #23487, #20210, #15980, #15214, #14345, #13373, #13175, #8922, #4410
