# Pi coding agent as a fifth provider — findings and implementation plan

Issue: [#58](https://github.com/freelensapp/freelens-agentbridge-extension/issues/58).
Date: 2026-09-20. Target CLI: **Pi 0.86.1** (`@earendil-works/pi-coding-agent`).

This document is research + plan only. It changes no product code.

## 1. Scope

Add Pi (<https://pi.dev>) as a fifth provider, at **feature parity with the four
providers already shipped** — OpenCode, Claude Code, GitHub Copilot CLI and
OpenAI Codex CLI — and define the test and regression-test work that makes the
addition safe.

Every factual claim about Pi below is either quoted from the docs shipped inside
the published npm package (`node_modules/@earendil-works/pi-coding-agent/docs/`,
the same text as the upstream repository) or observed by running the CLI. Claims
that could not be verified are collected in §9.

## 2. Which "Pi"

`pi` is ambiguous on npm; installing the wrong one ships a wrong README line.

| Package                            | What it is                                                  |
| ---------------------------------- | ----------------------------------------------------------- |
| `@earendil-works/pi-coding-agent`  | **The one.** bin `pi`, v0.86.1, `engines.node >= 22.19.0`     |
| `@mariozechner/pi-coding-agent`    | Same project, previous scope, **deprecated** at 0.73.1        |
| `@mariozechner/pi`                 | **Not the agent** — a vLLM GPU-pod manager, bin `pi-pods`     |

Verified with `npm view`:

```console
$ npm view @earendil-works/pi-coding-agent version bin engines
version = '0.86.1'
bin = { pi: 'dist/bundle/cli.js' }
engines = { node: '>=22.19.0' }

$ npm view @mariozechner/pi-coding-agent deprecated
'please use @earendil-works/pi-coding-agent instead going forward'

$ npm view @mariozechner/pi bin
bin = { 'pi-pods': 'dist/cli.js' }
```

Home: <https://pi.dev> · Source: <https://github.com/earendil-works/pi> ·
Docs: <https://pi.dev/docs/latest>.

Install lines for the README, in the order they should be offered:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
curl -fsSL https://pi.dev/install.sh | sh          # wrapper around the npm install
powershell -c "irm https://pi.dev/install.ps1 | iex"
brew install pi-coding-agent                       # homebrew/core; lags npm
```

Node 22.19 is above the extension's own floor (Node >= 22), so no host
requirement changes. A `legacy-node20` dist-tag exists at 0.74.2 for Node 20
hosts; its backport policy is undocumented, so the README should not promise it.

## 3. Pi's design, in one paragraph

Pi deliberately ships a small core and pushes everything else into extensions,
skills, prompt templates and packages. From `docs/usage.md`:

> It intentionally does not include built-in MCP, sub-agents, permission popups,
> plan mode, to-dos, or background bash. You can build or install those workflows
> as extensions or packages, or use external tools such as containers and tmux.

Two consequences dominate this plan: there is **no declarative permission file**
(§5.4) and there is **no sub-agent artifact kind** (§5.8).

## 4. What the extension supports today

The provider abstraction (`src/common/agentbridge-providers.ts`) is one registry
entry per provider, and every feature below is derived from it rather than
branched per provider:

1. provider picker with per-cluster persistence (`localStorage`);
2. readiness probe — `<executable> <versionArgs>` in the main process;
3. isolated per-cluster workspace under `userData/agentbridge-sessions/`;
4. seeded **instructions** file (role `instructions`);
5. seeded **permissions/settings** file (role `permissions` or `settings`);
6. seeded **`/build-cluster-map` capability** (role `command`);
7. Monaco editors for every declared file, debounced IPC saves;
8. **Reset** — delete and re-seed exactly `resetPaths`;
9. launch into a Freelens terminal with the cluster's `KUBECONFIG` inherited;
10. **harness inventory** — read-only scan of `artifactSources` (skills, agents);
11. capability hints (`src/renderer/capability-hints.ts`);
12. reveal workdir, open in external editor, probe timeout, stale-main-process
    guard — all provider-independent.

## 5. Feature-by-feature parity for Pi

| # | Feature | Pi | How |
| - | ------- | -- | --- |
| 1 | Provider picker + persistence | ✅ | registry-driven, no work |
| 2 | Readiness probe | ✅ | `pi --version` → `0.86.1`, exit 0, no key, no network |
| 3 | Isolated workspace | ✅ | cwd *is* the project root for Pi: context walk-up, `.pi/` resolution and per-cwd session storage all key off it |
| 4 | Instructions | ✅ | `AGENTS.md` native (also reads `CLAUDE.md`), and **not** trust-gated |
| 5 | Permissions / guardrail | ✅ *via extension* | no permission file exists; the `tool_call` hook blocks — see §5.4 |
| 6 | `/build-cluster-map` | ✅ | `.pi/prompts/build-cluster-map.md` → a real `/build-cluster-map` slash command |
| 7 | Monaco editors | ✅ | `markdown` + `json` + **`typescript`** (new language id — §5.5) |
| 8 | Reset | ✅ | three managed files |
| 9 | Launch with inherited `KUBECONFIG` | ✅ | plain `pi`, no launch args; bash tool inherits the process environment |
| 10 | Inventory — skills | ✅ | Agent Skills standard; roots `.pi/skills`, `.agents/skills`, layout `skill-dir` |
| 10 | Inventory — agents | ❌ | Pi has no sub-agent concept — first provider with no agent kind (§5.8) |
| 11 | Capability hint | ✅ | default `/`-command branch; only the test expectation changes |
| 12 | Reveal / editor / timeout / stale-main guard | ✅ | provider-independent |
| — | Parallel cluster mapping | ❌ | sequential scaffold, like Copilot CLI's |
| — | MCP | ❌ | not built in; `docs/backlog.md` already rules a k8s MCP server out of scope |

### 5.1 Readiness probe

```console
$ pi --version
0.86.1                      # exit 0

$ pi version
No API key found for the selected model. …   # exit 1 — parsed as a prompt
```

`versionArgs: ["--version"]`. `pi version` is **not** a subcommand — Pi's
subcommands are only `install`, `remove`/`uninstall`, `update`, `list`,
`config`, `auth`, and its usage is `pi [options] [--] [@files...] [messages...]`,
so a bare word is a prompt. The `--version` branch fires straight after argument
parsing, before any runtime, auth or network, which is what makes it a clean
probe. The bare-semver output is observed on 0.86.1, not a documented guarantee;
the probe only needs exit 0 and degrades gracefully, so this is not load-bearing.

Worth knowing, though out of scope here: `ready` means *the binary exists*, not
*the user is logged in*. Pi starts fine with no credentials and simply shows "No
models available. Use `/login`". Pi is the only one of the five with a
first-class auth probe — `pi auth check --provider <p> --json --no-refresh`,
exit 0/1/2 — so if the extension ever wants a "signed in" hint, Pi is where it
would prototype. Backlog material, not this change.

### 5.2 Workspace and configuration layout

| Path | Scope | Trust-gated |
| ---- | ----- | ----------- |
| `~/.pi/agent/settings.json`, `auth.json`, `trust.json`, `sessions/` | global | n/a |
| `.pi/settings.json` | project | **yes** |
| `.pi/extensions/*.ts`, `.pi/extensions/*/index.ts` | project | **yes** |
| `.pi/prompts/*.md` | project | **yes** |
| `.pi/skills/`, `.agents/skills/` (cwd **and ancestors**) | project | **yes** |
| `.pi/themes/`, `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md` | project | **yes** |
| `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md` | project, walks up from cwd | **no** |

Project settings override global settings, merging nested objects — except
arrays: "A project `defaultTools` array replaces the global array"
(`docs/settings.md`). Paths inside `.pi/settings.json` resolve relative to `.pi`.
A *bare* `.pi/` directory with none of the files above is not a project resource
and does not trigger the trust prompt.

The global directory is `~/.pi/agent` (there is no XDG `~/.config/pi` support);
`PI_CODING_AGENT_DIR` overrides it. Pointing that at the per-cluster workspace
would isolate Pi completely, but it also isolates `auth.json` — the user would
have to `/login` again for every cluster — so the plan leaves it alone.
Credentials stay global and shared, as they are for the other four providers.

### 5.3 Project trust

`docs/security.md` is explicit:

> Project trust controls whether pi loads project-local settings, resources,
> packages, and extensions. It is not a sandbox and it does not restrict what
> the model can ask tools to do after you start working in a directory.

- Interactive startup **asks once** and stores the answer by canonical (realpath)
  directory in `~/.pi/agent/trust.json` — a flat `{ "<abs dir>": true | false }`
  map. The closest saved decision on the current *or a parent* path wins, so the
  prompt's "Trust parent folder" option would trust every provider workspace of
  that cluster at once; plain "Trust" records only this workspace. There are also
  session-only options that record nothing. `/trust` sets the decision later, but
  does not reload the running session.
- `AGENTS.md` loads regardless of trust.
- Non-interactive modes (`-p`, `--mode json`, `--mode rpc`) never prompt and fall
  back to global `defaultProjectTrust` (`ask` default, `always`, `never`).
- `--approve` / `-a` and `--no-approve` / `-na` override for one run.

**Decision: `launchArgs: []`.** Unlike Codex — whose sandbox would leave
`kubectl` without network and whose config is inert until trusted — Pi's default
launch works, and the trust prompt is a single keypress that is then remembered
per workspace. Passing `--approve` would silently trust executable
`.pi/extensions/*.ts` on every launch to save that keypress, which is the wrong
trade for a directory the agent itself can write to. This also keeps the
"only Codex has launch arguments" invariant intact
(`agentbridge-providers.test.ts:184`).

The counter-argument is real and was weighed: the first launch of every new
cluster workspace blocks on a modal, and `--approve` is per-run and persists
nothing, so it would never widen trust beyond the session. It is rejected
because what it auto-trusts is *executable TypeScript in a directory the agent
writes to*, and because the modal is once per workspace, not once per launch.

What an untrusted workspace actually looks like was measured (§8.4): Pi falls
back to its four built-in tools (`read`, `bash`, `edit`, `write`), loads no
skills, registers no `/build-cluster-map` — typing it sends the literal text to
the model — and does not execute the guard.

The cost to state in the README: **until the workspace is trusted, the seeded
guardrail extension does not load** — the session still runs, ungated, with
`AGENTS.md` as its only instruction. Decline trust and you get fewer guardrails,
not more.

### 5.4 The guardrail — the one real design decision

Pi has no `permissions.allow`, no `permission.bash`, no `approval_policy`, and
no sandbox. `docs/security.md`:

> Pi does not include a built-in sandbox. Built-in tools can read files, write
> files, edit files, and run shell commands with the permissions of the pi
> process. […] This is intentional.

There are three levers, in ascending order of strength:

1. **`AGENTS.md` prose** — advisory only. Every provider already gets this.
2. **`defaultTools`** in `.pi/settings.json` — chooses which built-ins start
   enabled, from `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`,
   `ls` (default: `read`, `bash`, `edit`, `write`). It is a coarse on/off switch,
   not a policy: it cannot tell `kubectl get` from `kubectl delete`, and
   `docs/settings.md` notes extension and SDK tools remain enabled regardless —
   so it is **not** a security boundary.
3. **The `tool_call` extension hook** — a real, blocking pre-execution
   interceptor, and the structural equivalent of a Claude Code `PreToolUse` hook.
   From `docs/extensions.md`: "Fired after `tool_execution_start`, before the
   tool executes. **Can block.**", returning
   `{ block: true, reason?: string, terminate?: boolean }`. `ctx.ui.select` /
   `ctx.ui.confirm` give a genuine approval prompt when `ctx.hasUI`. Pi ships
   `examples/extensions/permission-gate.ts` doing exactly this for `rm -rf`,
   `sudo` and `chmod 777`.

**Decision: seed `.pi/extensions/kubectl-guard.ts` as the provider's
`permissions` file.** Confirmed by the maintainer on issue #58 (2026-09-20):
ship the guard extension. It is the only mechanism that reaches parity with the other
four providers' "ask before a mutation" behaviour, it is editable in Monaco like
every other managed file, and Reset restores it.

The trade-offs, to be written into the file's header comment and the README:

- it is **executable TypeScript in a directory the agent can also write to**.
  The guard is a convenience, not a boundary: the kubeconfig and Kubernetes RBAC
  remain the only enforcement boundary, exactly as
  `ARCHITECTURE.md` already states for the other providers' permission files;
- it is trust-gated (§5.3), so it is inert until the workspace is trusted;
- **a syntax error in it aborts the whole session.** Measured (§8.4): a broken
  `.pi/extensions/*.ts` in a trusted project exits 1 with
  `Failed to load extension … ParseError: Missing semicolon` and the hint
  `Start without extensions using "pi -ne"`. One editable file can therefore
  break launch, which no other provider's managed file can do. Mitigations, all
  cheap: keep the guard small and dependency-free, wire Monaco's TypeScript
  syntax diagnostics (§5.5), document `pi -ne`, and point at **Reset**;
- the model can be prompt-injected into writing a second extension that
  overrides it; pair a cluster session with a read-only context when that matters.

Rejected alternative — seed no extension and rely on `AGENTS.md` +
`defaultTools`. It is simpler and carries no executable code, but it ships Pi
with strictly weaker guardrails than the other four providers, which is the
opposite of the parity this issue asks for. If the maintainers prefer it, the
change is mechanical: drop editor 3 below, drop `.pi/extensions` from
`resetPaths`, and keep `.pi/settings.json` as role `permissions`.

### 5.5 Monaco and the `typescript` language

`EditorDefinition.language` is currently `"json" | "markdown" | "toml"` and is a
*syntax name* mapped in `src/renderer/editor-language.ts` to an id Monaco
actually registers. `editor-language.test.ts` computes the registered set from
the installed `monaco-editor` package plus `RICH_LANGUAGES`, which already
includes `typescript` — so adding `typescript: "typescript"` to the map is
legal and highlighted, not silently plain like TOML was.

`provider-file-editor.tsx` currently wires one generic `editor.worker` for every
language, while Monaco's TypeScript mode wants its own `ts.worker` for
diagnostics. That detail stops being cosmetic once §8.4 is taken into account:
**a guard file with a syntax error makes Pi abort at startup with exit 1**, so
in-editor syntax diagnostics are the difference between seeing a red squiggle
and seeing a session that will not start. Preference order, therefore:

- **B (recommended).** Register the real worker by label —
  `monaco-editor/esm/vs/language/typescript/ts.worker?worker`, selected in
  `MonacoEnvironment.getWorker(_, label)` — and then turn **semantic** validation
  off while keeping **syntax** validation on:
  `typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })`.
  The guard's only import is an `import type` from
  `@earendil-works/pi-coding-agent`, which is not installed in the workspace, so
  semantic diagnostics would be pure false positives while syntax diagnostics
  catch the one class of error that actually breaks a session.
  Cost: one more worker chunk in the CJS/`preserveModules` build described in
  `electron.vite.config.js`; verify it loads in the packaged extension, not just
  in dev.
- **A (fallback).** If the worker cannot be made to load, disable the language
  service entirely (`noSemanticValidation: true, noSyntaxValidation: true`) and
  keep tokenizer-based highlighting only. Then say plainly in the README that a
  broken guard file stops Pi from starting and that `pi -ne` skips extensions —
  and rely on **Reset** as the recovery path.

### 5.6 A `.ts` file inside `src/main/scaffolds/` — the trap

The guard scaffold is the first non-data file the repository would ship as a
scaffold, and three tool configurations would pick it up as **project source**:

| Config | Current value | Effect on `scaffolds/pi/extensions/kubectl-guard.ts` |
| ------ | ------------- | ---------------------------------------------------- |
| `tsconfig.json` | `include: ["*.ts", "*.tsx", "src/**/*", "test/**/*"]` | `pnpm type:check` fails — `@earendil-works/pi-coding-agent` is not a dependency, and it never should be |
| `knip.jsonc` | `project: [… "src/**/*.{ts,tsx}"]` | reported as an unused file |
| `biome.jsonc` | `files.includes: ["**", …]` | formatted and linted as project code |

Two ways out, both cheap:

- **A (recommended).** Add `"exclude": ["src/main/scaffolds/**"]` to
  `tsconfig.json` and `"!src/main/scaffolds/**"` to knip's `project`. Leave
  Biome on — it does not resolve imports, so it formats the guard to house style
  without complaining, which is what we want for a file contributors will edit.
  The scaffold stays a real, readable `.ts` file.
- **B.** Store it as `extensions/kubectl-guard.ts.txt` and seed it through the
  existing `EditorDefinition.source` indirection (the same mechanism Claude
  Code's flat `commands/build-cluster-map.md` already uses). No tool config
  changes at all, at the cost of an odd extension in the source tree and no
  syntax highlighting while maintaining it.

Whichever is chosen, `pnpm build` must still land the file verbatim: the
`copy-scaffold` plugin is a plain `cpSync(src, dest, { recursive: true })`, so
dotted directories and `.ts` files copy as-is — but this needs confirming in
`out/main/scaffolds/pi/` and in `npm pack --dry-run` (the package ships
`out/**/*` only).

### 5.7 Cluster-map capability

Pi has project-local slash commands: `.pi/prompts/<name>.md` becomes `/<name>`,
with `description` and `argument-hint` frontmatter and `$1` / `$@` /
`${1:-default}` argument substitution (`docs/prompt-templates.md`). Discovery in
`prompts/` is non-recursive, which the flat seeded path already satisfies.

So `clusterMapHint.getInvocation` needs **no new branch** — Pi falls through to
the default `{ verb: "Run", command: "/build-cluster-map" }`. Only the
invariant test at `capability-hints.test.ts:44` changes, since it currently
hardcodes `claude`/`opencode` as the slash-command providers.

The skill *content* does change relative to Claude/OpenCode/Codex: Pi has no
sub-agents, so the map is explored **sequentially**, exactly as Copilot CLI's
scaffold does.

### 5.8 Harness inventory

- **Skills** — Pi implements the Agent Skills standard (`SKILL.md` with `name` +
  `description` frontmatter), scanning `.pi/skills/` and `.agents/skills/` in cwd
  and ancestors, both project-trusted. That is the existing `skill-dir` layout
  and the existing frontmatter reader; no new code.
  Roots: `[".pi/skills", ".agents/skills"]`, primary first.
- **Agents** — Pi has none. From the upstream README: "**No sub-agents.** There's
  many ways to do this. Spawn pi instances via tmux, or build your own with
  extensions, or install a package that does it your way." Third-party packages
  exist (`pi-subagents`, `@tintinweb/pi-subagents`) but define no standard
  directory, so there is nothing authoritative to scan.

Declaring an agent root anyway would report an authoritative "0 agents" forever —
the Codex TOML gotcha in reverse. The renderer already handles a missing kind:
`summarizeInventory` filters `count > 0` and `harness-artifacts-section.tsx`
returns `null` for empty groups. So this is a **test-and-docs change**: relax
`declares a skill and an agent artifact source for every provider`
(`agentbridge-providers.test.ts:206`) and the Codex-vs-rest agent-layout
assertion at `:255` to tolerate a provider with no agent source.

### 5.9 Launch and environment

`buildLaunchCommand` joins `[executable, ...launchArgs]` and runs

```sh
cd "<workdir>" && KUBECONFIG="$KUBECONFIG" PATH="$PATH" pi
```

Pi's bash tool spreads `process.env` verbatim (`{ ...process.env }`, with only
Pi's own managed bin directory prepended to `PATH`, plus injected
`PI_SESSION_ID` / `PI_PROVIDER` / `PI_MODEL` markers), so `kubectl` sees the
cluster's kubeconfig exactly as it does for the other four providers. There is
no `--cwd` flag — the caller must set the child's working directory, which the
existing `cd "<workdir>" && …` launch command already does.

One startup side effect to mention in the README: on first interactive launch Pi
downloads `fd` and `ripgrep` into `~/.pi/agent/bin`. Behind a blocked network
that surfaces as `Warning: Failed to download fd: fetch failed`, which is
cosmetic — install system `fd`/`rg`, or set `PI_OFFLINE=1`, to silence it. This
is a per-user, one-time event, not per workspace, so it does not belong in
`launchArgs`.

Windows is native (`docs/windows.md`): Pi uses
Git Bash by default, with `shellPath` to point at another bash and a `powershell`
tool selectable through `defaultTools`. The PowerShell launch path in
`get-launch-command.ts` therefore needs no Pi-specific branch.

## 6. Proposed registry entry

```ts
{
  id: "pi",
  name: "Pi",
  executable: "pi",
  // `pi version` is parsed as a prompt and exits 1; `--version` prints the
  // bare semver and exits 0 without an API key or network.
  versionArgs: ["--version"],
  docsUrl: "https://pi.dev/",
  // Pi's trust prompt appears once per workspace and is remembered in
  // ~/.pi/agent/trust.json. `--approve` would trust executable project files
  // on every launch to save that one keypress; a cluster session does not
  // need it, so Codex stays the only provider with launch arguments.
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
  resetPaths: [
    ".pi/extensions/kubectl-guard.ts",
    ".pi/settings.json",
    ".pi/prompts/build-cluster-map.md",
  ],
  artifactSources: [{ kind: "skill", roots: [".pi/skills", ".agents/skills"], layout: "skill-dir" }],
}
```

### 6.1 Pi breaks the "every provider has exactly three files" shape

Every provider shipped so far declares **three** editors — instructions,
permissions/settings, command — of which **two** are reset:

| Provider | Editors | Reset paths |
| --- | --- | --- |
| OpenCode | 3 | 2 |
| Claude Code | 3 | 2 |
| GitHub Copilot CLI | 3 | 2 |
| OpenAI Codex CLI | 3 | 2 |
| **Pi** | **4** | **3** |

Pi needs a fourth because its guardrail (§5.4) and its settings are two
different files: the blocking `tool_call` hook must live in
`.pi/extensions/*.ts`, while `defaultTools` / `sessionDir` must live in
`.pi/settings.json`. Every other provider expresses both in one file.

Nothing in the code cares. `resetPaths` is `readonly string[]`, the confirm
dialog interpolates the list (`agentbridge-page.tsx:234` —
`` `Reset ${provider.name} managed paths (${provider.resetPaths.join(", ")})?` ``),
and `provider-files.ts:208` loops. The editors panel renders one tab per entry.
The only thing that hardcodes the number **two** is English prose in the README,
in exactly two places:

- `README.md:74` — "**Reset** — restore the two managed files — the
  permission/settings file and the `/build-cluster-map` command";
- `README.md:206` — "**Reset** removes and re-seeds the two managed files of the
  selected provider".

`readme-docs.test.ts` already pins that prose to the registry, but only
partially: it asserts every `resetPaths` entry is named in the Reset section
(`:40`) and that Reset is never described as touching a *single* file (`:53`,
regex `/only the managed (permission|settings) file/i`). A stale "two" would
pass all three tests while telling the user that Reset destroys fewer files than
it does — the same class of drift the file's header comment was written about.

**Decision: make the prose count-agnostic rather than teach it to count.**
(Confirmed by the maintainer on issue #58, 2026-09-20: "do not hardcode number
of seeded files".)

1. Reword both sentences to "the managed files" and let the per-provider list
   below them carry the specifics (it already enumerates paths per provider, so
   Pi just gets a three-path bullet).
2. Widen the tripwire in `readme-docs.test.ts:53` to catch any hardcoded count,
   so the next provider with a different shape fails loudly instead of silently:

   ```ts
   it("never hardcodes how many files Reset destroys", () => {
     expect(readme).not.toMatch(/only the managed (permission|settings) file/i);
     // "the two managed files" was correct for four providers and wrong for the
     // fifth; the registry is the only place allowed to know the count.
     expect(resetSection()).not.toMatch(/\b(one|two|three|four|five)\b managed/i);
   });
   ```

3. The seeded-files table in the "Configuring your agent" section gets a Pi row
   listing four files; no column change is needed, the cell is a list.

This is T8 in §7, and it is the whole of the "shape decision" — no source
change, no registry change, two sentences and one assertion.

Seeded `.pi/settings.json`:

```json
{
  "defaultTools": ["read", "bash", "edit", "write", "grep", "find", "ls"],
  "sessionDir": ".pi/sessions"
}
```

`sessionDir` keeps a cluster's transcripts inside that cluster's workspace
instead of the default `~/.pi/agent/sessions/<encoded-cwd>/`, which matches the
extension's per-cluster isolation and makes "Reveal workdir" show the whole
session. `.pi/sessions` is not seeded, not declared and not scanned — Pi creates
it. Precedence is `--session-dir` > `PI_CODING_AGENT_SESSION_DIR` > this
setting, so a user who prefers the global store can still override it.

## 7. Implementation plan

Tasks are ordered so the test suite is green at the end of each one.

**T1 — Registry.** Add the entry above to `src/common/agentbridge-providers.ts`
after `codex`. Add `"typescript"` to `EditorDefinition["language"]` and to
`MONACO_LANGUAGE` in `src/renderer/editor-language.ts`.
*Done when:* `agentbridge-providers.test.ts` and `editor-language.test.ts` pass
with their updated literals.

**T2 — Relax the cross-provider artifact invariants.**
`agentbridge-providers.test.ts:206` → every provider declares a skill source;
an agent source is optional, and when present is `toml-file` for Codex and
`markdown` otherwise (`:255`). Keep the "never scans the same root under two
kinds" and "safe relative roots" assertions as they are.

**T3 — Scaffolds** under `src/main/scaffolds/pi/` (the directory name must equal
the provider id — `resolveProviderScaffold`):

- `AGENTS.md` — copy Codex's, which already satisfies the six regexes in
  `scaffold-source.test.ts:41`, plus a short paragraph naming the guard
  extension and the trust prompt.
- `.pi/extensions/kubectl-guard.ts` — a `tool_call` handler that matches
  mutating `kubectl`/`helm` verbs, asks via `ctx.ui.select` when `ctx.hasUI`,
  and returns `{ block: true, reason }` otherwise; a header comment explaining
  the trust gate, that it is a convenience and not a boundary, and how to widen
  or remove it.
- `.pi/settings.json` — as above.
- `.pi/prompts/build-cluster-map.md` — Copilot's sequential cluster-map body,
  with `description` + `argument-hint: "[namespace]"` frontmatter, writing into
  `.pi/skills/ns-map-<namespace>/SKILL.md` and
  `.pi/skills/cluster-map-<cluster>/SKILL.md` (the **primary** declared skill
  root — `scaffold-source.test.ts:68` pins this), and merging the navigation
  block into `AGENTS.md` between the existing
  `<!-- BEGIN AGENTBRIDGE CLUSTER MAP -->` markers.

**T4 — Capability hint.** No source change. Update
`capability-hints.test.ts:44` to expect a slash command for `claude`, `opencode`
and `pi`.

**T5 — Scaffold tests.** Add `pi` to the sequential/parallel expectations in
`scaffold-source.test.ts:91` (Pi belongs with Copilot, not with the
subagent-capable three) and add the Pi-specific block described in §8.

**T6 — Renderer copy.** `harness-artifacts-section.tsx:186` lists `~/.claude`,
`~/.opencode`, `~/.github` as "not counted" homes; add `~/.pi/agent`.

**T7 — `package.json`.** Add a `pi` keyword (`"pi-coding-agent"` reads better
than a bare `"pi"` and matches the `claude-code` / `github-copilot` /
`openai-codex` pattern) and mirror it in `src/package-metadata.test.ts`.

**T8 — Documentation.**
`README.md`: intro provider list; "Four providers" → "Five"; install list;
seeded-files table (a Pi row listing four files — the cell is a list, no column
change); **both** "the two managed files" sentences (`README.md:74` and `:206`)
reworded per §6.1, plus the widened tripwire in `readme-docs.test.ts`;
a new `### Pi (.pi/extensions/kubectl-guard.ts, .pi/settings.json and AGENTS.md)`
section covering the trust prompt, the absence of a sandbox, and that the guard
is convenience-only.
`ARCHITECTURE.md` L5 and L82 provider lists. `CONTRIBUTING.md` prerequisites.
`docs/features/harness-artifacts.md` registry table (Pi's agents cell is "—",
with the reason) and the "Adding a provider or a root" note.
`docs/features/capability-registry.md` slash-command guideline.
`docs/backlog.md` §4a candidates and §4b's "Codex is now the one provider with
non-empty `launchArgs`" sentence, widened per §10.1.

**T8a — Model policy in the README.** The `**Bring your own model**` Features
bullet quoted in §10.1, plus one sentence in the Pi section pointing at `/model`
and `pi --provider … --model …`. Cross-provider copy, not a Pi footnote.

**T8b — Model-policy tripwire.** The `never pins a model in any scaffold`
assertion in §10.1, added beside the existing scaffold checks. It passes today
against all four shipped providers — verified with
`grep -rn "model" src/main/scaffolds/`, which returns nothing — so it is a
regression guard from the moment it lands, not a new constraint.

**T9 — Verification.** `pnpm test && pnpm type:check && pnpm lint:check &&
pnpm build`, then the manual matrix in §8.3. **Quit Freelens fully and reopen**
before smoke-testing — a window reload keeps the old main process, which throws
`Unsupported AI CLI provider: pi` (`GOTCHAS.md` L39; the renderer already
rewrites that message).

**T10 — `GOTCHAS.md`.** Append the ones already known to bite, with the verified
version (0.86.1) named: a `.ts` scaffold enters `tsc`/knip's program unless
excluded (§5.6); a syntax error in the guard aborts the session with exit 1
(`pi -ne` or Reset to recover); an untrusted workspace silently loses the guard,
the skills and the slash command; a skill without `description` is dropped
without a warning; `defaultTools` in project settings *replaces* rather than
merges the user's global array; and `sessionDir` applies even untrusted.

## 8. Testing plan

### 8.1 Tripwires — tests that fail if a step is forgotten

These already exist and are the reason a half-done provider cannot merge:

| Test | Fails unless |
| ---- | ------------ |
| `agentbridge-providers.test.ts:5` `lists products in intended order` | `"pi"` is appended to the id array |
| `:15` `defines exact provider metadata` | the whole Pi literal is duplicated in the `toEqual` |
| `:184` `gives only Codex launch arguments` | `launchArgs` stays `[]` |
| `:190` safe relative editor/reset paths | no `..`, no absolute path; `resetPaths ⊆ editors` |
| `:206` / `:255` artifact-kind invariants | relaxed in **T2** |
| `scaffold-source.test.ts:32` | every declared editor file exists under `src/main/scaffolds/pi/` |
| `:41` six instruction regexes | `AGENTS.md` keeps all six guidance topics |
| `:53` cluster-map regexes | the prompt template says read-only, never Secret values, `ns-map-<namespace>`, `cluster-map-<cluster>`, both map markers |
| `:68` | every `` `…/SKILL.md` `` path in the template is under a declared skill root, and the primary root is used |
| `provider-files.test.ts:38` | all four files seed, and re-seeding does not clobber edits |
| `check-provider.test.ts:36` | `pi --version` is probed on linux and win32 |
| `get-launch-command.test.ts:19` | the POSIX command is exactly `… && KUBECONFIG=… PATH=… pi` |
| `editor-language.test.ts:43` | `typescript` maps to something the bundled Monaco registers |
| `capability-hints.test.ts:44` | updated in **T4** |
| `stale-main-process.test.ts:37` | free — `Unsupported AI CLI provider: pi` already matches |
| `readme-docs.test.ts:27` / `:40` | every Pi seeded path and every Pi reset path appears in README, in the right section |
| `package-metadata.test.ts:13` | the keyword literal matches `package.json` |

### 8.2 New unit tests

Colocated, Vitest, injected boundaries, never invoking the real CLI — per
`TESTING.md`.

1. **`src/common/agentbridge-providers.test.ts`** — the Pi literal; plus a focused
   test that Pi declares no agent artifact source and *why* (a comment pointing
   at upstream's "No sub-agents"), so a future contributor does not "fix" it.
2. **`src/main/scaffold-source.test.ts`**, a `describe("Pi")` block:
   - `.pi/settings.json` parses as JSON, `defaultTools` ⊆ the eight documented
     built-ins, and includes `read` and `bash` (a cluster session is useless
     without them);
   - `sessionDir` stays inside the workspace (relative, no `..`);
   - `kubectl-guard.ts` registers `pi.on("tool_call"`, returns `block: true`,
     matches at least `delete`, `apply`, `scale`, `drain`, `exec`, and mentions
     that it is not a security boundary;
   - the guard has no import with side effects — only `import type`, so a
     missing `@earendil-works/pi-coding-agent` in the workspace cannot break
     startup;
   - the prompt template's own frontmatter parses and has `description`, and its
     body tells the agent to give every generated `SKILL.md` both `name` and
     `description` — Pi drops a description-less skill silently (§8.4);
   - the template body says the exploration is sequential (Pi has no
     sub-agents) — the mirror of the Copilot assertion.
2b. **`src/main/scaffold-source.test.ts`**, cross-provider — the
   `never pins a model in any scaffold` tripwire from §10.1 (T8b). Unlike the
   rest of this list it asserts something about all five providers, and it is
   green against the four shipped ones before Pi lands.
3. **`src/renderer/editor-language.test.ts`** — `monacoLanguageFor("typescript")`
   is `"typescript"`, and `typescript` is in the bundled set.
4. **`src/renderer/harness-inventory.test.ts`** — an inventory result whose
   groups contain only `skill` renders one chip, no "agents" chip, and no crash;
   this is the first provider to exercise that path for real.
5. **`src/main/harness-artifacts.test.ts`** — a Pi fixture: a skill under
   `.pi/skills/<name>/SKILL.md` and one under `.agents/skills/<name>/SKILL.md`,
   asserting both are found, deduped by name with `.pi/skills` winning, and that
   `origin` is `generated` (Pi's seeded files are not inside a scanned root).

### 8.3 Manual smoke matrix (Freelens, after a full quit and reopen)

| # | Check | Expected |
| - | ----- | -------- |
| 1 | Pi not on `PATH` | `missing` state, docs link to pi.dev |
| 2 | Pi installed | `ready` + `0.86.1` |
| 3 | First open of a cluster | four files seeded; `Reveal workdir` shows `AGENTS.md`, `.pi/{extensions,settings.json,prompts}` |
| 4 | Edit each of the four in Monaco | saves debounce; TypeScript file is highlighted; no worker errors in devtools |
| 5 | Reset | the three managed files return to scaffold content; `AGENTS.md` edits survive |
| 6 | Launch | terminal opens in the workspace; Pi's trust prompt appears **once**; accept |
| 7 | In session: `kubectl get pods -A` | runs; no prompt |
| 8 | In session: ask for a `kubectl delete` | guard prompts; declining blocks the call with the reason |
| 9 | `/build` autocomplete | `/build-cluster-map` is offered with its description and `[namespace]` hint |
| 10 | Run `/build-cluster-map` on a small cluster | writes `.pi/skills/ns-map-*/SKILL.md`; merges the map block into `AGENTS.md` |
| 11 | Reopen the page | inventory shows the new skills, **no** agents chip |
| 12 | Decline trust on a fresh workspace | session still starts, with Pi's four default tools; guard does **not** load, `/build-cluster-map` is sent to the model as literal text, skills are not offered — confirms the README warning |
| 13 | Break the guard file on purpose (drop a `;`) and launch | Pi exits 1 with a parse error; Reset (or `pi -ne`) recovers — the README must say so |
| 14 | Second cluster | separate workdir, separate trust decision, separate sessions |
| 15 | Windows | `pi` launches through the PowerShell command path |

### 8.4 Verification already performed against the real CLI

Pi 0.86.1 was installed into a throwaway prefix and driven against a **local
stub model server** (an OpenAI-compatible endpoint declared in
`~/.pi/agent/models.json` with a literal `apiKey`, replaying a scripted tool call
and dumping each request body). That is worth keeping: it turns "does the seeded
workspace actually work?" into a repeatable, offline, credential-free check, and
it is the only way to exercise the guard without a real provider account.

Confirmed with a candidate workspace (`AGENTS.md`, `.pi/settings.json`,
`.pi/prompts/build-cluster-map.md`, `.pi/skills/…/SKILL.md`,
`.pi/extensions/kubectl-guard.ts`):

| Claim | Evidence |
| ----- | -------- |
| `pi --version` is the probe | `0.86.1`, exit 0, offline, no key |
| `pi version` is not | exit 1 — parsed as a prompt |
| Malformed project settings are reported | `Warning: Invalid settings file …: Expected ',' …`, printed before the API-key check |
| The guard blocks a mutating command | stub emitted `bash{"command":"kubectl delete pod nginx -n default"}`; the next request carried `{"role":"tool","content":"Mutating kubectl blocked in non-interactive mode"}` — the reason reaches the model verbatim |
| Non-mutating commands are untouched | the following `bash` call ran and returned its output |
| `AGENTS.md` reaches the system prompt | `<project_instructions path="…/AGENTS.md">` inside `<project_context>` |
| Skills are advertised | `<available_skills><skill><name>…</name><description>…` |
| The prompt template is a real command | `/build-cluster-map kube-system` arrived at the model as the expanded body with `${1:-…}` substituted |
| `KUBECONFIG` survives into tool calls | bash tool echoed the parent's `KUBECONFIG`, a custom var, and the workspace as `PWD` |
| Trust changes behaviour measurably | untrusted: Pi's four default tools, no skills, no commands, extension not executed; trusted: the seven `defaultTools`, skills and commands present |
| The interactive trust prompt | `Trust project folder? …` with Trust / Trust parent folder / Trust (session only) / Do not trust / Do not trust (session only); choosing Trust wrote `{"<dir>": true}` to `~/.pi/agent/trust.json` |
| `--approve` never persists | `trust.json` stayed absent across repeated `--approve` runs |
| A broken extension is fatal | exit 1, `Failed to load extension … ParseError`, hint `pi -ne` |

Two Pi behaviours found this way that the scaffolds must respect:

1. **A skill whose frontmatter lacks `description` is silently dropped** — no
   warning in `-p` mode. The cluster-map template must therefore *require* both
   `name` and `description` in the skills it writes, and the scaffold test should
   assert the seeded example carries them.
2. **`sessionDir` is honoured even when the project is untrusted**, while
   `defaultTools` from the same file is not — an untrusted workspace still gets
   `.pi/sessions/` created. Harmless here (that is where we want sessions
   anyway), possibly an upstream inconsistency; worth a `GOTCHAS.md` line rather
   than a workaround.

Not exercised: the interactive `ctx.ui.select` branch of the guard (only the
non-interactive block path was driven), `/trust`, `defaultProjectTrust`, Windows,
and any real model provider.

## 9. Regression testing

The whole point of the registry is that a fifth provider changes no shared
logic; the risk is therefore concentrated in the places this plan *does* touch.

1. **Baseline.** `pnpm test:unit` today is **338 tests in 26 files, green**
   (verified 2026-09-20 on `main`). After the change the count only grows; any
   *changed* existing assertion must be one of the four listed in §8.1 as
   deliberately relaxed (`:206`, `:255`, `capability-hints.test.ts:44`,
   `scaffold-source.test.ts:91`) plus the two literal registries
   (provider metadata, package keywords). **Any other diff in an existing test is
   a regression, not a test update.**
2. **The four existing providers must be byte-identical.** Diff review:
   `git diff -- src/main/scaffolds/{opencode,claude,copilot,codex}` must be
   empty, and the four existing entries in the provider registry unchanged.
3. **The relaxed invariants must still bite.** After T2, add a negative case: a
   synthetic provider with an agent source of the wrong layout still fails. A
   relaxation that accepts everything is worse than the constraint it replaced.
4. **Monaco.** The TypeScript language service is global state. Re-check the
   existing JSON/markdown/ini editors after wiring it — especially that the JSON
   editor still validates and that no editor logs worker errors.
5. **Editor count.** `agentbridge-page.tsx:382` maps `provider.editors` to a
   stack of mounted `ProviderFileEditor`s, so Pi mounts **four Monaco instances**
   on one page instead of three. Check page scroll length and first-paint time,
   and re-check the other providers after the TypeScript language registration.
6. **Reset scope.** Three reset paths is also a first; confirm Reset still
   removes *only* `resetPaths` and leaves `AGENTS.md`, `.pi/skills/` and
   `.pi/sessions/` untouched.
7. **Build.** `pnpm build` must copy `src/main/scaffolds/pi/` — including the
   dotted `.pi/` directory and the `.ts` file — into `out/main/scaffolds/pi/`.
   A `.ts` file inside a scaffold tree is new; confirm the copy plugin does not
   treat it as source to compile, and that the file lands verbatim in the packed
   npm tarball (`npm pack --dry-run`).
8. **Stale main process.** After upgrading in place, a *reloaded* window throws
   `Unsupported AI CLI provider: pi`; the renderer must show the "restart
   Freelens" hint, not a raw error.
9. **Re-run the stub-model check (§8.4) whenever the Pi scaffolds change.** It is
   offline and needs no credentials, and it is the only thing that catches a
   guard that stopped blocking, a prompt template that stopped expanding, or a
   skill that silently fails to load — none of which any unit test can see,
   because unit tests deliberately never invoke a real CLI.
10. **Pin the Pi version the scaffolds were verified against** (0.86.1) in the
    `GOTCHAS.md` entry, so a future behaviour change has something to diff
    against.

## 10. Open questions

Three questions were put to the maintainer on issue #58 and answered on
2026-09-20. They are recorded as **decided** below; what remains open is
genuinely unverified behaviour, not design.

**Decided.**

- **Guard extension: yes.** Pi's guardrail is
  `.pi/extensions/kubectl-guard.ts` — the first executable file this extension
  seeds, with the trade-offs in §5.4 written into the file header and the
  README. The no-extension fallback in §5.4 is retained only as documentation
  of the path not taken.
- **The four-editor / three-reset shape:** make the README prose
  count-agnostic and widen the tripwire — §6.1. No source or registry change.
  Maintainer, 2026-09-20: "do not hardcode number of seeded files."
- **Model pinning: no — for every provider, not just Pi.** The extension seeds
  behaviour and never a model; §10.1 now states that as a policy, advertises it
  in the README (T8a) and enforces it with a tripwire (T8b).

**Still open — unverified behaviour, not design.**

1. **The guard's non-interactive branch.** Pi sets `hasUI` only for the
   interactive runtime, so in `-p` / `--mode json` the guard's `!ctx.hasUI`
   path — block with a reason — is what runs. The extension always launches Pi
   interactively, so this is defensive; it was not exercised end to end.
2. **`defaultTools` validation.** Documented as built-ins only; whether an
   unknown name is rejected, ignored or accepted was not traced in source. The
   seeded list uses only documented names, so this is informational. Upstream
   `settings.md` confirms the replace-not-merge semantics assumed in §6 ("a
   project `defaultTools` array replaces the global array").
3. **Pi's model/provider fallback with no configuration at all** — undocumented
   upstream, see §10.1. Only affects the README sentence, not a seeded value.
4. **Windows launch** was not exercised. Pi is natively supported there
   (`docs/windows.md`), and the launch path is provider-independent.

### 10.1 Model policy — AgentBridge configures the agent, never picks its brain

An earlier revision of this section framed model-agnosticism as a Pi
peculiarity: "the other four CLIs each come from a model vendor … choosing the
CLI *was* choosing the model." The maintainer rejected that on issue #58, and
was right on both counts — OpenCode and Copilot CLI are model-agnostic too, and
the property is a selling point rather than a problem. That framing is withdrawn
and replaced by what follows. The *decision* is unchanged; the reason is now a
cross-provider policy instead of a Pi exception.

**What is actually true, re-verified 2026-09-20:**

| Provider | Choose the model vendor? | Who owns the credential | Project file can pin a model |
| --- | --- | --- | --- |
| OpenCode | **Yes** — AI SDK + models.dev, "75+ LLM providers", local Ollama/LM Studio, custom `provider` blocks with `baseURL` | user's own keys in `auth.json`, or OAuth reuse of ChatGPT / Claude Pro-Max / **GitHub Copilot** / GitLab Duo, or OpenCode Zen | `model: "provider/model"` in `.opencode/opencode.json` — **a file we seed** |
| Claude Code | **No** — Anthropic models only; Bedrock and Vertex are the same models on other clouds, and routing to non-Claude models through a gateway is explicitly unsupported | Anthropic subscription, API key, or the cloud account | `model` in `.claude/settings.json` |
| GitHub Copilot CLI | **Yes** — GitHub's curated multi-vendor list (Claude Opus 5 / Sonnet 5 / Fable, GPT-5.x and GPT-6, Gemini Flash, Kimi K3, MAI), **plus BYOK** via `COPILOT_PROVIDER_BASE_URL` / `_API_KEY` / `COPILOT_MODEL` | one Copilot subscription pays for every hosted model (AI credits since 2026-06-01); the list varies by plan and org policy | `model` in `.github/copilot/settings.json` — **a file we seed** |
| OpenAI Codex CLI | **Partly** — `[model_providers.*]` with a `base_url` can point it elsewhere, but only at Responses-API endpoints (`wire_api = "chat"` is gone) | ChatGPT sign-in or an OpenAI API key; custom providers use `env_key` | `model` yes, **vendor no**: a project `.codex/config.toml` ignores `model_provider` and `model_providers` |
| Pi | **Yes, by design** — model-agnostic harness, switchable mid-session with `/model` or `Ctrl+L` | user's own keys or OAuth | `defaultProvider` + `defaultModel` in `.pi/settings.json` |

So **four of five** let the user choose the vendor, and **five of five** honour a
model pinned from a project-scoped file — in three of those five the file is one
this extension already writes. Pi is not the odd one out. It is the fifth
instance of a situation that has existed since the first provider shipped, and
that the extension has silently handled the same way every time.

**The real finding: the policy already exists — undocumented and untested.**
`grep -rn "model" src/main/scaffolds/` returns nothing. Not one of the four
shipped scaffolds names a model, a provider or an endpoint, even though three of
them are written in files whose format supports it. Everything the extension
seeds is *behaviour*: which `kubectl` verbs may run unattended, what the agent
should know about the cluster, where skills belong. So the rule to write down is
not "Pi is an exception", it is:

> **AgentBridge configures the agent's behaviour. It never chooses the model.**

**Why that is a strength and not a gap** — three concrete reasons, which is also
the argument for saying it out loud in the README:

1. **Seeding a workspace never disturbs a working setup.** Whatever the user
   picked with their CLI's own picker (`/models` on OpenCode, `/model`
   elsewhere), or in their global settings, or with `--model`, is what answers
   inside a Freelens session. The extension writes into the *project* layer,
   which on every one of the five CLIs outranks the user's global layer — so a
   pin here would silently beat a choice the user made deliberately.
2. **A wrong pin is a startup failure, not a fallback.** OpenCode's
   `defaultModel()` returns a configured `model` immediately and skips the
   last-used and auto-selection paths, so an uncredentialed pin throws
   `ProviderModelNotFoundError` — whose message says "Model not found" and never
   mentions the missing key. Pi's equivalent complaint is upstream issue
   [#21](https://github.com/earendil-works/pi/issues/21). On Copilot CLI the pin
   can be perfectly valid and still fail, because an org admin disabled that
   model for the seat. In all three cases the extension would have turned a
   working CLI into a broken one by writing a file the user never asked for.
3. **It is what makes the product composable.** The value proposition is one
   Kubernetes guardrail set and one cluster-map workflow over *any* agent and
   *any* model those agents can reach. The feature list currently advertises
   "Four providers"; what it actually delivers is five providers multiplied by
   whatever each of them can talk to — which, counting OpenCode and Pi alone, is
   most of the commercial and local model landscape.

**Consequences for this plan.**

- The seeded `.pi/settings.json` stays exactly as §6 shows it (`defaultTools` +
  `sessionDir`), for the same reason the other four scaffolds are model-free.
- **T8a (new)** — README gains a `**Bring your own model**` bullet in Features,
  stating the policy once for all five providers rather than as a Pi footnote:

  ```md
  - **Bring your own model** — the extension seeds behaviour, never a model.
    Four of the five CLIs let you choose the vendor (OpenCode and Pi with your
    own API keys or OAuth, Copilot CLI from GitHub's curated list under one
    subscription, Codex CLI through a custom provider); Claude Code runs
    Anthropic models. Whatever you selected in your CLI's own model picker is
    what answers in a Freelens session — no seeded file overrides it.
  ```

  The Pi section gets one sentence pointing at `/model`, `Ctrl+L` and
  `pi --provider … --model …`; the other provider sections are unchanged.
- **T8b (new)** — turn the policy into a tripwire, next to the existing scaffold
  assertions in `scaffold-source.test.ts`, so the next provider cannot quietly
  break it:

  ```ts
  it("never pins a model in any scaffold", () => {
    // Behaviour is the extension's to seed; the model is the user's to choose.
    // A pin in the project layer outranks the user's own picker on all five
    // CLIs, and an uncredentialed pin is a startup failure, not a fallback
    // (OpenCode ProviderModelNotFoundError, pi#21). One pattern per provider's
    // model key: JSON for OpenCode/Copilot/Pi, TOML for Codex.
    const pinsAModel =
      /"(model|small_model|defaultModel|defaultProvider)"\s*:|^\s*model(_provider)?\s*=|\[model_providers\./m;

    for (const [path, body] of everyScaffoldFile()) {
      expect(pinsAModel.test(body), `${path} pins a model`).toBe(false);
    }
  });
  ```

- `docs/backlog.md` §4b stays the home for *user-chosen* model selection, and is
  widened: it is no longer "Codex needs `--model`" but "all five providers
  expose a model choice the UI does not surface", with reason 2 above as the
  reason it must be a UI control with the user's credentials in view rather than
  a constant in a scaffold.

*Two corrections to earlier comments on issue #58.* Pi does not "default to
`google`" — upstream documents no default provider, and the historical hardcoded
default was `claude-sonnet-4-5`; what 0.86.1 does with zero configuration is
unverified and version-dependent. And the claim that OpenCode is "configurable
but account-driven" and Copilot "GitHub's model backend" understated both: they
are genuinely multi-vendor, which is the point of this section.

*Two incidental findings, neither actionable here.* Codex removed the
`chat/completions` wire API (hard error since 2026-02-01), which cannot affect
the extension because no scaffold declares a `[model_providers.*]` block —
verified by the same grep. And `sst/opencode` now redirects to
`anomalyco/opencode`, while the Codex and Claude Code documentation both moved
hosts; the registry's `docsUrl`s still redirect correctly, but a link-rot sweep
is worth a separate backlog line.

## 11. Sources

- Docs shipped in the package (identical to upstream
  `packages/coding-agent/docs/`): `settings.md`, `security.md`, `extensions.md`,
  `skills.md`, `prompt-templates.md`, `usage.md`, `sessions.md`, `windows.md`,
  `quickstart.md`, `packages.md`, `containerization.md`.
- `examples/extensions/permission-gate.ts`, `confirm-destructive.ts`,
  `protected-paths.ts` — the shipped guardrail patterns.
- <https://pi.dev> · <https://github.com/earendil-works/pi> ·
  <https://www.npmjs.com/package/@earendil-works/pi-coding-agent> ·
  <https://agentskills.io/specification>.
- For §10.1, one source per row of the table, all re-checked 2026-09-20:
  - Pi — upstream `docs/settings.md` (scope table and precedence;
    `defaultProvider` / `defaultModel` are project-scoped), `docs/models.md`,
    `docs/providers.md` (credential resolution order),
    <https://github.com/earendil-works/pi/issues/21> (startup failure when the
    default model's key is absent).
  - OpenCode — <https://opencode.ai/docs/providers/> ("75+ LLM providers",
    `auth.json`, OAuth reuse incl. GitHub Copilot and Claude Pro/Max),
    <https://opencode.ai/docs/models/> (resolution order: `--model` → config →
    last used → internal priority), <https://opencode.ai/docs/config/> (project
    config merges over global), <https://opencode.ai/docs/troubleshooting/>
    (`ProviderModelNotFoundError`), <https://opencode.ai/docs/zen/>. The repo
    now lives at <https://github.com/anomalyco/opencode>.
  - Copilot CLI —
    <https://docs.github.com/en/copilot/reference/ai-models/supported-models>
    (curated per-client list; "An enterprise or organization administrator must
    still enable each model"),
    <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models>,
    <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>
    (settings precedence, `.github/copilot/settings.json` as repository
    settings),
    <https://docs.github.com/en/billing/concepts/product-billing/github-copilot-billing>
    (AI credits).
  - Codex CLI — <https://learn.chatgpt.com/docs/config-file/config-basic>
    (precedence; project `.codex/config.toml` only when trusted),
    <https://learn.chatgpt.com/docs/config-file/config-advanced>
    (`[model_providers.*]`),
    <https://learn.chatgpt.com/docs/config-file/config-reference>
    (`model_provider` / `model_providers` ignored in project config;
    `wire_api` — "`responses` is the only supported value"),
    <https://github.com/openai/codex/discussions/7782> (chat/completions
    removal).
  - Claude Code — <https://code.claude.com/docs/en/llm-gateway> ("doesn't
    support routing Claude Code to non-Claude models through any gateway"),
    <https://code.claude.com/docs/en/amazon-bedrock>,
    <https://code.claude.com/docs/en/google-vertex-ai>,
    <https://code.claude.com/docs/en/settings> (settings precedence,
    `.claude/settings.json` accepts `model`).
- Observed behaviour of `pi` 0.86.1 as quoted in §5.1 and §8.4.
