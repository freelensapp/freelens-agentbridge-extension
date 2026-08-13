# Design: Display deployed harness artifacts

- **Issue:** [#16](https://github.com/freelensapp/freelens-agentbridge-extension/issues/16)
- **Date:** 2026-08-12
- **Status:** proposed — awaiting user review before `writing-plans`
- **Scope:** Phase 1 only (skills + custom agents, workspace-only, read-only)

## 1. Problem

The extension page is **declaration-driven**: it only knows the three files each provider
declares in `editors` (`src/common/agentbridge-providers.ts`), and `assertDeclaredPath`
(`src/main/provider-files.ts:27`) deliberately refuses to read anything else. Everything the
agent or the user creates afterwards is invisible.

The concrete case: the seeded `/build-cluster-map` command writes
`.claude/skills/ns-map-<namespace>/SKILL.md` (one per namespace) plus
`.claude/skills/cluster-map-<cluster>/SKILL.md`
(`src/main/scaffolds/claude/commands/build-cluster-map.md`, steps 3-4). On a 20-namespace
cluster that is 21 files the UI cannot see.

**Goal, in the user's words:** *"I want to know what context the agent has (how many skills I
have, how many custom agents, how many commands and when were they updated last time) without
having to open the workspace directory to find it."*

So the feature is an **inventory**: counts plus freshness, with names on demand.

## 2. Decisions

Banked during brainstorming; each one narrows the design.

| # | Question | Decision |
|---|---|---|
| 1 | What problem does seeing them solve? | **Know what the agent knows** — counts + last-updated, not a file browser |
| 2 | Workspace only, or workspace + `~/.claude`? | **Workspace only** |
| 3 | Rollup, drill-down, or range? | **Rollup headline + expandable drill-down** |
| 4 | 21 generated skills: flat or grouped? | **Flat, oldest-first**; `seeded`/`generated` is a per-row badge, not a grouping axis |
| 5 | Placement and refresh? | **Rollup in the page header**; drill-down section in the left column above the editors; auto-refresh + manual Refresh |
| — | Which artifact kinds? | **Skills and custom agents only** — commands, MCP servers, hooks and plugins are out of scope |

### Consequences worth recording

- **One trust boundary, unchanged.** The scan root is the already-verified workdir from
  `resolveVerifiedWorkdir` (`src/main/provider-files.ts:218`). The scanner never accepts a
  caller-supplied root.
- **`assertDeclaredPath` is untouched.** Reading and writing *file contents* stays restricted to
  the three declared editors per provider. The inventory is a separate, narrower capability:
  directory listing + `lstat` + a bounded frontmatter head-read. It is not a loosening of the
  existing one.
- **Honesty debt, stated in the UI.** Sessions launch with a plain `cd` and an inherited
  environment (`src/renderer/get-launch-command.ts:20`), so `HOME` is the user's real home and
  the agent actually loads the union of the workspace and `~/.claude`. The panel is therefore a
  *subset* of the agent's true context. The section subtitle says so in one line.
- **Both kinds are the same shape.** Skills and agents are markdown files with YAML frontmatter
  under a directory root. One parser, one code path. Dropping MCP/commands deleted the JSON
  parser, the settings readers, the `~/.copilot/mcp-config.json` blind spot and the
  `.opencode/command` vs `.opencode/commands` discrepancy from the design.
- **Day-one counts differ per provider, on purpose.** Copilot CLI's seeded artifact *is* a skill
  (`.github/skills/build-cluster-map/SKILL.md`, registry line 107), so a fresh Copilot workspace
  shows `1 skill` while Claude Code and OpenCode show `0`. It is counted and badged `seeded`;
  hiding it to make providers match would make the panel lie.

### Out of scope (deferred, not rejected)

Commands · MCP servers · hooks · plugins/marketplaces · global `~/.claude` surfacing ·
grouping generated skills under the capability that produced them · `fs.watch` live updates ·
any management action (delete/disable/promote) · content preview or inline editing of discovered
files.

## 3. Approaches considered

**A. Registry-declared artifact sources + generic scanner in main. — RECOMMENDED**
Each provider gains an `artifactSources` list (kind → roots → layout). A new main-process module
walks those roots under the verified workdir and returns a normalized inventory over one new IPC
channel.
*Pro:* obeys the standing constraint "add a provider by extending the registry, not by branching
logic" (ARCHITECTURE.md); per-provider paths stay in the one file that already owns per-provider
knowledge; the scanner has no provider knowledge at all and is trivially unit-testable.
*Con:* one new registry concept to keep in sync when a provider changes its layout.

**B. Convention-based scanner, no registry change.**
Hardcode a table of well-known directories (`.claude/skills`, `.opencode/skills`,
`.github/skills`, `.agents/skills`, …) inside the scanner and report whichever exist.
*Pro:* smallest diff; catches artifact directories we never declared.
*Con:* puts per-provider knowledge in `src/main/`, which is exactly what the registry exists to
prevent; cannot express "this kind is unsupported for this provider"; the provider list and the
scanner table drift apart silently.

**C. Renderer-side scan through the existing file IPC.**
Rejected outright: `assertDeclaredPath` blocks non-declared reads, filesystem access from the
renderer violates the process split, and it would need N round-trips.

**Recommendation: A, taking B's one good insight** — a kind maps to a **list** of roots, not a
single root, because OpenCode reads skills from several project locations. Declaring the extra
roots per provider gets B's tolerance without moving provider knowledge out of the registry.

## 4. Design

### 4.1 Data model — `src/common/harness-artifacts.ts`

Process-independent types and pure helpers (rollup derivation, sorting), so both main and
renderer share one vocabulary.

```ts
export type HarnessArtifactKind = "skill" | "agent";

// Directory layout of one artifact root.
//   "skill-dir"  → <root>/<name>/SKILL.md   (skills, all three providers)
//   "markdown"   → <root>/<name>.md         (custom agents, all three providers)
export type ArtifactLayout = "skill-dir" | "markdown";

export interface ArtifactSource {
  readonly kind: HarnessArtifactKind;
  // Workspace-relative roots, highest precedence first. A kind with several
  // roots dedups by artifact name: first root wins.
  readonly roots: readonly string[];
  readonly layout: ArtifactLayout;
}

export interface HarnessArtifact {
  readonly kind: HarnessArtifactKind;
  readonly name: string;            // frontmatter `name`, else directory/file name
  readonly description?: string;    // frontmatter `description`, trimmed, capped
  readonly path: string;            // workspace-relative, forward slashes
  readonly mtimeMs: number;
  readonly origin: "seeded" | "generated";
}

export interface HarnessArtifactGroup {
  readonly kind: HarnessArtifactKind;
  readonly count: number;
  readonly newestMtimeMs?: number;  // undefined when count === 0
  readonly oldestMtimeMs?: number;
  readonly artifacts: readonly HarnessArtifact[];  // oldest-first
  readonly truncated: boolean;      // scan hit a cap; count is a floor
}

export type HarnessInventoryResult =
  | { status: "ok"; groups: readonly HarnessArtifactGroup[] }
  | { status: "error"; error: string };
```

`HarnessArtifactGroup` is **derived** from the artifact list, not a separate IPC shape — one scan
serves both the header rollup and the drill-down. A kind with no declared source is **absent**
from `groups` rather than present with `count: 0`; the renderer renders nothing for it. All three
providers support both kinds today, so nothing is absent in practice, but "unsupported ≠ 0"
survives in the shape for the next provider.

### 4.2 Registry — `src/common/agentbridge-providers.ts`

`AgentBridgeProvider` gains `readonly artifactSources: readonly ArtifactSource[]`.

| Provider | Skills roots | Agents roots |
|---|---|---|
| Claude Code | `.claude/skills` | `.claude/agents` |
| OpenCode | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `.opencode/agent`, `.opencode/agents` |
| Copilot CLI | `.github/skills` | `.github/agents` |

Two notes for the implementer:

- OpenCode's agent directory is declared **both singular and plural**. The docs and the existing
  seeded `.opencode/command/` path disagree about pluralisation elsewhere in this codebase, and a
  multi-root kind absorbs the ambiguity for free (dedup by name means a user who has only one of
  them sees no difference). Verify against an installed OpenCode during implementation and drop
  the spurious one if it can be established.
- Roots must be workspace-relative, contain no `..`, and not be absolute. A registry test
  enforces this so a bad declaration fails in CI rather than at scan time.

### 4.3 Scanner — `src/main/harness-artifacts.ts`

```ts
export function listProviderArtifacts(
  userData: string,
  clusterId: string,
  providerId: string,
): HarnessInventoryResult;
```

Behaviour:

1. Resolve the workdir with `resolveVerifiedWorkdir`. If it does not exist yet, return
   `status: "ok"` with every declared kind at `count: 0` — an unprepared workspace is empty, not
   an error.
2. For each declared source, for each root in order: resolve the root, confirm containment in the
   real workdir, and read one directory level (`readdirSync` with `withFileTypes`).
   - `skill-dir`: each **directory** entry contributes `<root>/<dir>/SKILL.md` if that file
     exists.
   - `markdown`: each `*.md` **file** entry contributes itself; case-insensitive extension match.
   - No recursion beyond the one level each layout implies. This is the depth cap — there is no
     general directory walk to bound.
3. Skip any entry whose `lstat` says symlink, and skip anything whose resolved real path is not
   inside the real workdir. Use `lstat`, never `stat`, so a symlink cannot be followed for mtime
   either.
4. `mtimeMs` comes from the artifact file (`SKILL.md` or the `.md`), not the directory.
5. Read at most the **first 4096 bytes** of each file and parse the leading YAML frontmatter
   block only: the file must start with `---` (optionally after a BOM), and parsing stops at the
   closing `---`. Extract `name` and `description` as scalar strings; ignore everything else. No
   YAML library — a line-oriented `key: value` reader handles the single-line scalars all three
   providers use, and anything it cannot read simply yields no value. Truncate `description` to
   200 characters.
6. `name` falls back to the containing directory name (`skill-dir`) or the basename without
   extension (`markdown`) when frontmatter has none. Dedup across roots is by `name`,
   first-root-wins.
7. `origin` is `seeded` when the artifact's workspace-relative path equals one of
   `provider.editors[].path`, else `generated`. The extension knows exactly what it seeds, so
   this needs no extra bookkeeping.
8. Cap at **200 artifacts per kind**. On overflow stop scanning that kind and set
   `truncated: true`; the UI then renders `200+`.
9. Sort each group's artifacts oldest-first (ties broken by `name`) so a stale straggler is the
   first row without the user sorting anything.
10. Wrap the whole body: unexpected errors become `{ status: "error", error }` following the
    project's boundary-result convention. A missing root (`ENOENT`) is not an error.

Never returns file bodies to the renderer — only metadata and the two frontmatter fields.

### 4.4 IPC

New channel `agentbridge-extension:list-provider-artifacts`, registered in `src/main/index.ts`
alongside the others (and added to the `removeHandler` list at the top of `onActivate`):

```ts
ipcMain.handle(`${CHANNEL_PREFIX}list-provider-artifacts`, (_event, clusterId: string, providerId: string) =>
  listProviderArtifacts(app.getPath("userData"), clusterId, providerId),
);
```

### 4.5 Renderer

Three new files, mirroring the `capability-hints.ts` / `capabilities-section.tsx` split (data and
pure logic separate from JSX, so the logic is testable without a DOM):

- **`src/renderer/harness-inventory.ts`** — pure view logic: `formatRelativeAge(mtimeMs, nowMs)`
  → `"4m ago"` / `"2d ago"` / `"just now"`; `summarizeGroups(groups)` → the header chip models
  (`{ kind, label, count, truncated, ageLabel }`); the empty-state predicate. No React.
- **`src/renderer/use-harness-inventory.ts`** — the fetch hook: invokes the IPC, guards stale
  responses with the same generation/current-selection pattern the page already uses
  (`agentbridge-page.tsx:32-71`), exposes `{ result, loading, refresh }`, and coalesces refreshes
  requested within 2s of the last successful scan.
- **`src/renderer/harness-artifacts-section.tsx`** — the collapsible section.

**Header rollup** (decision 5). The page header already carries live status —
`Renderer.Component.SubTitle` at `agentbridge-page.tsx:166-180` renders
`● Claude Code v2.1.0`. The rollup extends that line with one chip per non-empty kind:

```
● Claude Code v2.1.0 · 21 skills · 2 agents · updated 4m ago
```

Rules: the trailing age is the **newest** mtime across all kinds — "when did anything last
change". A zero-count kind is omitted from the header (a fresh workspace shows no chips rather
than `0 skills · 0 agents`). Chips are buttons; clicking one expands the drill-down section below
and, if the section is already expanded, does nothing else. While the first scan is in flight the
chips are absent, never `0` — an under-report that looks authoritative is worse than nothing.

**Drill-down** — a collapsible `<section>` in the left column, directly above the
`ProviderFileEditor` list (`agentbridge-page.tsx:249-251`), **collapsed by default** so the
editors do not move for users who are not looking. It reuses the visual language of
`CapabilitiesSection` (bordered card, expand chevron, count on the right):

- Header: chevron · **Workspace artifacts** · total count · Refresh button.
- Subtitle, one line: *"Seeded by this extension and generated in this cluster's workspace. Your
  personal `~/.claude` is not counted."*
- Body: per kind, a small uppercase group label (`Skills`, `Agents`) reusing
  `CAPABILITY_KIND_LABEL` from `capability-hints.ts`, then a flat list, oldest-first. Each row:
  kind icon (reuse `defaultIconForKind`) · **name** · `seeded`/`generated` badge · relative age
  (with the absolute timestamp as `title`) · description on a second line, truncated to one line.
- Empty state: *"No skills or custom agents yet. Run /build-cluster-map to generate some."*
- Truncated state: `200+` with a note that the workspace holds more than the panel lists.
- Error state: an inline message plus Retry, matching how the page renders provider errors.

Rows are **not** clickable to open a file — no content read exists for undeclared paths, and
adding one would widen the security surface for no gain against decision 1. The existing "Reveal
workdir" and "Open in editor" buttons already cover "I want the actual file".

### 4.6 Refresh

The agent mutates these files inside a Freelens terminal tab the extension does not observe, so
the panel is stale the moment `/build-cluster-map` finishes. A scan is a two-directory listing
plus a 4KB head-read per artifact, so refreshing eagerly is cheap.

Refresh on: mount, provider switch, cluster switch, after a successful Reset (the existing
`retryProvider` path), on `window` focus, on `document` `visibilitychange` → visible, and on the
explicit Refresh button. Coalesce anything within 2s of the last successful scan. No `fs.watch`
in Phase 1.

### 4.7 Failure modes

| Situation | Behaviour |
|---|---|
| Workdir missing / not yet prepared | `ok`, all kinds `count: 0` |
| Root directory missing (`ENOENT`) | Contributes nothing; not an error |
| `SKILL.md` missing inside a skill directory | Directory ignored |
| Symlinked entry, or real path outside the workdir | Skipped silently |
| Malformed / absent frontmatter | Fall back to directory or file name; no description |
| Unreadable file (`EACCES`) | Counted with name from the path, no description |
| More than 200 artifacts in a kind | `truncated: true`, UI shows `200+` |
| Unknown provider id | Throws, per the project convention for invalid programmer input |
| Any other error | `{ status: "error", error }`; header chips hidden, section shows Retry |

## 5. Testing

Per TESTING.md: Vitest, colocated, temp dirs removed in `afterEach`, no DOM where avoidable.

**`src/main/harness-artifacts.test.ts`** (the bulk of the value, styled after
`provider-files.test.ts`)
empty workspace → zero counts · missing workdir → `ok` and empty · `skill-dir` discovery ·
`markdown` discovery · `SKILL.md`-less directory ignored · frontmatter `name`/`description`
extracted · CRLF frontmatter · no frontmatter → name from path · malformed frontmatter → no
throw · frontmatter beyond 4096 bytes → ignored, no throw · description truncated to 200 chars ·
`mtimeMs` taken from the file, and rollup newest/oldest correct · oldest-first ordering with a
name tiebreak · seeded classification for Copilot's declared skill vs generated siblings ·
symlinked entry skipped · symlink escaping the workdir skipped · multi-root dedup by name with
first-root precedence · 201 artifacts → `truncated: true` and exactly 200 returned · unknown
provider throws · no file body ever appears in the result.

**`src/common/agentbridge-providers.test.ts`** (extend) — every provider declares a source for
both kinds; every root is relative, `..`-free and non-absolute; every layout is a known value.

**`src/common/harness-artifacts.test.ts`** — group derivation from an artifact list (count,
newest, oldest, ordering, empty).

**`src/renderer/harness-inventory.test.ts`** — `formatRelativeAge` boundaries (seconds → minutes
→ hours → days), chip labels including singular/plural and `200+`, zero-count kinds omitted,
empty-state predicate.

**`src/renderer/harness-artifacts-section.test.tsx`** — render smoke in the style of
`capabilities-section.test.tsx`: collapsed by default, expands, renders oldest-first rows,
renders the empty and error states.

**`src/main/index.test.ts`** (extend) — the new channel is in the `removeHandler` list and gets a
handler.

Manual smoke in Freelens (no E2E suite exists): fresh workspace shows no chips; run
`/build-cluster-map` in a session, return to the page, confirm focus-refresh updates the counts
without pressing Refresh.

## 6. Documentation to update

- `ARCHITECTURE.md` — new main module, new IPC channel, new renderer files, `artifactSources` in
  Key Abstractions, one Data Flow line.
- `docs/features/harness-artifacts.md` — new feature doc, per the ARCHITECTURE.md convention.
- `GOTCHAS.md` — only if implementation surfaces one (the OpenCode agent-directory pluralisation
  is a likely candidate).
- `README.md` — one line under the feature list.

## 7. Implementation order

1. `src/common/harness-artifacts.ts` types + group derivation, with tests.
2. `artifactSources` in the registry, with the validation test.
3. `src/main/harness-artifacts.ts` scanner, with the full test file. TDD here — the security
   cases (symlink escape, containment, no-body) are the point of the module.
4. IPC channel + `index.ts` wiring.
5. `harness-inventory.ts` pure view logic + hook, with tests.
6. `harness-artifacts-section.tsx` + header chips in `agentbridge-page.tsx`.
7. Docs.

Each step leaves the tree green (`pnpm test`, `pnpm type:check`, `pnpm lint:check`).

## 8. Known limitations, stated deliberately

- The panel reports the **workspace** only; the agent also loads `~/.claude`. The subtitle says
  so. Revisiting this is the natural Phase 2.
- Counts are a point-in-time snapshot; a session running concurrently can make them stale
  between refreshes.
- Frontmatter parsing is a line-oriented reader, not a YAML parser. Multi-line or quoted-block
  descriptions degrade to "no description" rather than being rendered wrong.
- OpenCode's agent directory name is declared defensively (both spellings) pending verification
  against an installed OpenCode.
