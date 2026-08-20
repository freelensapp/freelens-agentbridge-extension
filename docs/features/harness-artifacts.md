# Workspace harness artifacts

The workspace artifact inventory answers one question without making the user
open the workspace directory: *what context does the agent actually have in this
cluster, and how fresh is it?* It reports how many skills and custom agents exist
in the selected provider's workspace and when each was last updated.

It is the retrospective counterpart to the
[capability registry](capability-registry.md): capabilities describe what **can**
be run, the inventory describes what **exists** on disk — including everything
`/build-cluster-map` generated, which the declared-file editors cannot see.

## Scope

- **Skills and custom agents only.** Commands, MCP servers, hooks and plugins are
  deliberately out of scope; nothing in the scanner knows about them.
- **Workspace only.** Sessions launch with an inherited `HOME`, so the agent also
  loads the user's personal `~/.claude`. That is deliberately not counted, and
  the expanded panel says so in one line rather than implying completeness.
- **Read-only.** Nothing in this feature creates, edits, renames or deletes an
  artifact, and no file body ever crosses the IPC boundary.

## How it works

- **`src/common/harness-artifacts.ts`** — shared types (`HarnessArtifactKind`,
  `ArtifactLayout`, `ArtifactSource`, `HarnessArtifact`, `HarnessArtifactGroup`,
  `ArtifactScanTotals`, `HarnessInventoryResult`), the render order
  `HARNESS_ARTIFACT_KIND_ORDER` (`["skill", "agent"]`), the result cap
  `MAX_ARTIFACTS_PER_KIND` (200), the work budget `MAX_ENTRIES_SCANNED` (2000),
  and `buildArtifactGroup`, which derives a per-kind rollup (count, oldest/newest
  mtime, examined count, oldest-first ordering) from a flat artifact list plus the
  scan's own totals. One scan feeds both the header chips and the drill-down; the
  rollup is never scanned separately.
- **`src/common/agentbridge-providers.ts`** — each provider declares
  `artifactSources`: per kind, a list of workspace-relative roots (highest
  precedence first) and a layout (`skill-dir` for `<root>/<name>/SKILL.md`,
  `markdown` for `<root>/<name>.md`). This is the only place per-provider artifact
  paths exist; the scanner contains zero provider knowledge.
- **`src/main/harness-artifacts.ts`** — `listProviderArtifacts(userData,
  clusterId, providerId)` walks exactly those roots under
  `resolveVerifiedWorkdir(...)`, one directory level per root, and returns
  metadata only. `listBoundedEntries` is how each root is read: an `opendirSync`
  cursor pulled only as far as the remaining entry budget, so the listing itself
  is bounded and never a `readdirSync` of the whole directory.
- **`src/main/read-frontmatter.ts`** — reads at most the first 4096 bytes of each
  artifact file and extracts `name` and `description` with a line-oriented reader.
- **`src/main/index.ts`** — registers the IPC channel
  `agentbridge-extension:list-provider-artifacts`, invoked as
  `(clusterId, providerId)`. The scan root is always derived from
  `app.getPath("userData")` plus those two ids; the renderer can never supply a
  path.
- **`src/renderer/harness-inventory.ts`** — React-free view logic:
  `loadHarnessInventory` (IPC call plus the `isCurrent()` stale-response guard,
  mirroring `loadProvider` in `provider-selection.ts`), `shouldRefresh`
  (2-second coalescing plus the in-flight and force gates), `opensCoalesceWindow`,
  `formatRelativeAge`, `chipLabel`, `totalLabel`, `summarizeInventory`,
  and `iconForArtifactKind` / `labelForArtifactKind`, which reuse the capability
  registry's icons and labels so both panels share one vocabulary.
- **`src/renderer/harness-artifacts-section.tsx`** — the view:
  `HarnessInventoryChips` (header rollup), `HarnessArtifactRow` (one artifact) and
  `HarnessArtifactsSection` (the collapsible drill-down). Every export is
  hook-free; expansion state lives in `agentbridge-page.tsx`.

### Registry declarations

| Provider           | Skills roots                                           | Agents roots                          |
| ------------------ | ------------------------------------------------------ | ------------------------------------- |
| OpenCode           | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `.opencode/agent`, `.opencode/agents` |
| Claude Code        | `.claude/skills`                                       | `.claude/agents`                      |
| GitHub Copilot CLI | `.github/skills`                                       | `.github/agents`                      |

A kind with several roots dedups by artifact **name**, first root wins — that is
what makes OpenCode's three skill roots (and both spellings of its agent
directory) safe to declare.

### What a scan produces

Per artifact: `kind`, `name`, optional `description`, workspace-relative `path`
(forward slashes on every platform), `mtimeMs`, and `origin`.

- `name` comes from the frontmatter `name` field, falling back to the directory
  name (`skill-dir`) or the file name without its `.md` suffix (`markdown`). A
  file named exactly `.md` keeps its full entry name, since an empty label
  renders an empty row. Like `description`, it is capped at 200 characters.
- `mtimeMs` is the artifact file's own `lstat` mtime, never its symlink target's.
- `origin` is `"seeded"` when the artifact's workspace-relative path is one the
  provider registry declares as an editor, `"generated"` otherwise. In practice
  only Copilot CLI's `.github/skills/build-cluster-map/SKILL.md` lands inside a
  scanned root; OpenCode's and Claude Code's seeded command files live outside
  their artifact roots, so everything they report is `"generated"`.
- Artifacts are ordered **oldest-first** (ties broken by name), so a stale
  straggler is the first row a user sees without sorting anything.

Per group: `count`, `artifacts`, `truncated`, `examinedCount` and the
`newestMtimeMs`/`oldestMtimeMs` range. The count and the artifact list describe
what was **kept**; the examined count and the mtime range describe everything the
scan **looked at**, including artifacts dropped by dedup or by the caps. That
distinction is not cosmetic: the scan collects in name order and the group is
displayed in mtime order, so a truncated kind keeps the alphabetically-first 200
and the kept set's mtime range can be arbitrarily older than the workspace's real
one. Reporting the scanned range keeps the header chip's "updated N ago" from
claiming a workspace is ancient seconds after `/build-cluster-map` wrote the tail
of its `ns-map-<namespace>` skills.

### Result states

`HarnessInventoryResult` is a `status` union:

- An **unprepared workspace** (`resolveVerifiedWorkdir` throws `ENOENT`) is
  `{ status: "ok" }` with zero counts — empty, not broken. Roots that do not
  exist are likewise skipped silently.
- A **containment failure** or any other filesystem error becomes
  `{ status: "error", error }`.
- An **unknown provider id** throws (project convention for invalid programmer
  input) rather than returning an error result; the rejected `invoke` is turned
  back into an error result by `loadHarnessInventory` in the renderer.
- A **missing IPC handler** — Electron's `No handler registered for
  'agentbridge-extension:list-provider-artifacts'` — is rewritten by
  `describeInventoryError` into the one remedy that works: quit Freelens and
  reopen it. Freelens re-requires the renderer entry on every window reload, but
  `ExtensionLoader` skips any extension already present in `extensionInstances`,
  so the main process never re-runs `onActivate` and never registers a channel
  added after startup. Upgrading the extension in place, or rebuilding it while
  Freelens runs, therefore leaves a new renderer talking to an old main process.
  No renderer-side retry can fix that, which is why the message names the fix
  instead of the fault.

## Security posture

The inventory is a **narrower** capability than the declared-file editors, not a
loosening of them:

- `assertDeclaredPath` is untouched. Content read/write still only reaches the
  three declared editors per provider. This feature adds directory listing +
  `lstat` + a bounded head-read, nothing else.
- The scan root is always `resolveVerifiedWorkdir(userData, clusterId,
  providerId)`; it is never caller-supplied.
- **Each declared root is resolved with `realpathSync` and containment-checked
  against the workdir before the directory is opened.** A lexical check on the joined
  path would be dead code — declared roots never contain `..` — while a root that
  is *itself* a symlink out of the workspace would otherwise be listed and
  stat-ed, which is an existence oracle even if every entry were discarded later.
- Directory entries that are symlinks are skipped, the artifact file is `lstat`-ed
  (so a symlinked `SKILL.md` is not a file and is never followed, not even for its
  mtime), and the file is re-resolved with `realpathSync` and re-checked for
  containment before it is read — the last guard covers a path that changes shape
  between the `lstat` and the read.
- **An artifact file with `nlink > 1` is skipped.** A hardlink has no real path of
  its own, so `realpathSync` — which resolves symlinks only — happily reports the
  in-workspace path of a file whose bytes live anywhere on the volume, and every
  containment check passes on a fabricated path. Link count is the only signal
  there is; it necessarily also excludes hardlinks between two workspaces, which
  no symlink check could have caught either, and a generated artifact is never
  hardlinked.
- **The head-read re-verifies the file it opened.** `readFrontmatter` opens by
  path, which is a third independent resolution, so it opens with
  `O_RDONLY | O_NOFOLLOW | O_NONBLOCK` and then `fstat`s the descriptor and
  requires `isFile()` plus the same `dev`/`ino` the scan `lstat`-ed. Without
  `O_NOFOLLOW` a file swapped for a symlink in that window is read from outside
  the workspace; without `O_NONBLOCK` a FIFO swapped in parks the synchronous
  main-process handler forever, since `openSync` has no timeout.
- Containment reuses the single `isInside` definition exported from
  `provider-files.ts`, including its win32 case-insensitivity rule.
- No file body ever crosses the IPC boundary — only the metadata listed above,
  with `name` and `description` capped at 200 characters and the head-read capped
  at 4096 bytes per file. A frontmatter block that does not close inside that
  window yields no metadata at all, so a markdown document that merely opens with
  a `---` thematic break cannot leak body lines shaped like `key: value`.
- Each kind is capped at `MAX_ARTIFACTS_PER_KIND` (200) artifacts **kept**;
  beyond that the group is flagged `truncated`, the chip renders `200+`, and the
  drill-down header says the count is a floor. The cap is charged *after* dedup,
  so a duplicate name neither consumes budget nor fakes truncation. The scan keeps
  examining entries past the cap so the group's mtime range and `examinedCount`
  stay true; only the work budget below stops it.
- **A second budget, `MAX_ENTRIES_SCANNED` (2000), bounds the WORK.** It is
  charged for every directory entry considered, across all of a kind's roots, and
  sets `truncated` when it trips. The result cap cannot serve this purpose:
  entries dropped by dedup, and directories holding no artifact file, never reach
  it, so a workspace full of duplicate names would cost one `lstat`, one
  `realpath` and one 4 KiB read per entry with nothing bounding the total —
  seconds of a frozen Freelens window, because this IPC handler is synchronous.
- **The budget is enforced on the LISTING, not only on the loop.** Roots are read
  with `opendirSync` and a bounded pull (`listBoundedEntries`), never with
  `readdirSync`: a full listing materialises one `Dirent` per entry and the
  alphabetical sort then collates all of them, both *before* the budget is
  consulted once — measured at ~70 ms and ~11 MB for a 100k-entry directory,
  against ~2 ms for a bounded pull. A cap on entries examined does not bound
  entries listed, which is the same lesson as the bullet above, one layer up.
  One `readSync` past the budget distinguishes "the directory ended" from "we
  stopped", so a root whose entries were never listed — including one skipped
  entirely because an earlier root used the budget up — still reports
  `truncated` instead of an authoritative count.

## Frontmatter reading

`read-frontmatter.ts` is deliberately **not** a YAML parser, and must not grow
into one. All three providers write single-line scalar `name:` and `description:`
fields; a line-oriented reader that degrades to "no value" is both sufficient and
impossible to turn into a parsing exploit.

- Only the first 4096 bytes are read, and the block must both open and close
  inside that window. **An unterminated block is not frontmatter and yields
  `{}`**: its head is indistinguishable from the body of a plain markdown
  document that opens with a `---` thematic break, and its last line may have
  been cut mid-value or mid-UTF-8-sequence. A block that does close inside the
  window is complete by construction, so no line in it can be truncated. The
  cost is that a frontmatter block larger than 4 KiB reports no metadata; that is
  the correct trade for a display-only inventory that must never emit a file's
  body.
- Lines are split on `/\r?\n/` (CRLF-safe) and a leading BOM is stripped.
- Only unindented `key: value` lines are read; an indented `name:` belongs to some
  nested mapping this reader does not model.
- A value is unquoted only when one delimiter opens it, the same delimiter closes
  it, and it does not occur in between — so `"a" and "b"` is left alone.
- The first occurrence of a repeated key wins; empty values are ignored; both
  `name` and `description` are capped at 200 characters.
- `readFrontmatter(filePath, expected)` requires the caller's `FileIdentity` (the
  `dev`/`ino` of the file it already `lstat`-ed and containment-checked) and
  reads nothing unless the opened descriptor still *is* that file. `fs.Stats`
  satisfies `FileIdentity` structurally, so the scanner passes the very stats it
  decided on.
- `readFrontmatter` never throws: an unreadable artifact — missing, a directory,
  a symlink, a FIFO, or no longer the file the caller checked — is still counted,
  just without metadata.

## UI

- **Header chips** (`HarnessInventoryChips`) render `· 21 skills · 2 agents ·
  updated 4m ago` next to the provider version. Zero-count kinds are omitted, and
  an entirely empty inventory renders nothing at all — an authoritative-looking
  "0 skills" is worse than nothing. The trailing age is the **newest** mtime
  across kinds ("when did anything last change"). Clicking a chip opens the
  drill-down.
- **Drill-down** (`HarnessArtifactsSection`) renders nothing until the first
  result lands, then a collapsible section headed "Workspace artifacts" with the
  total across kinds (`totalLabel`, which appends `+` when any kind is truncated
  so the header agrees with the `200+` chip) and a Refresh button. Expanded, it
  shows the "your personal `~/.claude` is not counted" note, then either the
  empty state ("No skills or custom agents yet. Run /build-cluster-map inside a
  session to generate some.") or one group per non-empty kind in registry order.
  Each row shows the kind icon, name, the `seeded`/`generated` badge, a relative
  age (with the absolute timestamp as its `title`), the description and the
  workspace-relative path.
- **A failed scan carries no count.** The section is collapsed by default and is
  re-collapsed on every cluster/provider change, so the collapsed rendering is
  the default rendering of a failure. The header count is therefore rendered only
  for an `ok` result — otherwise a failure would read as an authoritative
  "Workspace artifacts 0" — and the error message with its Retry control sits
  outside the collapsible body so it is visible without expanding.
- Relative ages are formatted against a `nowMs` passed in from the page, captured
  when a scan lands, so rendered output is stable between scans.

## Refresh

The agent mutates these files inside a terminal tab the extension does not
observe, so `agentbridge-page.tsx` rescans on mount, cluster switch, provider
switch, the transition into `ready`, after a successful Reset, on `window` focus
and on `document` `visibilitychange` → visible, plus the explicit Refresh and
Retry buttons. There is no `fs.watch` and no polling.

Every one of those paths goes through the same `refreshInventory` function:

- Scans are coalesced by `shouldRefresh` within 2 seconds of the last successful
  scan. Only the Refresh and Retry buttons pass `force` and bypass it.
- `lastScanAt` is written only when the result is `ok` (`opensCoalesceWindow`): a
  failed scan must stay immediately retryable rather than opening a window that
  swallows the next focus.
- `shouldRefresh` also suppresses a non-forced scan while one is in flight.
  Restoring the window fires `focus` and `visibilitychange` in the same tick, and
  `lastScanAt` is only written on completion, so without that flag both requests
  reach the main process, which runs each scan in full regardless of the
  renderer-side cancellation.
- The two moments that must always rescan — a new selection and a completed Reset
  — clear `lastScanAt` first, so coalescing cannot swallow them even though they
  do not force. Both also bump the request counter and release the in-flight
  flag, so a scan started before the change cannot land its stale numbers or hold
  the gate shut.
- A selection change also clears the inventory, the loading flag and the expanded
  state, so the previous provider's numbers are never shown against the new one.
- The inventory keeps its own request counter (bumping the page's `generation`
  would cancel the in-flight provider check) and additionally compares the page's
  `currentRequest` ref, so a focus handler left over from an earlier selection is
  a no-op and a superseded response is discarded without leaving the spinner
  running.

## Adding a provider or a root

Append to the provider's `artifactSources` in `agentbridge-providers.ts`:

```ts
artifactSources: [
  { kind: "skill", roots: [".myagent/skills"], layout: "skill-dir" },
  { kind: "agent", roots: [".myagent/agents"], layout: "markdown" },
],
```

Roots must be workspace-relative, must not contain `..`, and are listed
highest-precedence first. No scanner, IPC or UI change is needed. Note that
`src/common/agentbridge-providers.test.ts` asserts the entire registry with
`toEqual`, so that expected literal has to be updated in the same change.

## Tests

- `src/common/harness-artifacts.test.ts` — rollup derivation: counts, mtime range,
  oldest-first ordering with name tie-breaks, truncation flag, scanned totals
  overriding the kept range, both budgets, no mutation of the caller's array.
- `src/main/read-frontmatter.test.ts` — parsing edge cases (CRLF, BOM, quoting,
  repeated keys, the 200-character caps, unterminated blocks) and the 4096-byte
  window, against real temporary files, plus the open-side guards: an identity
  that no longer matches, a symlink left at the path, and a FIFO (skipped on
  win32) that must not block the call.
- `src/main/harness-artifacts.test.ts` — the security-critical file. It builds
  real workspaces in `os.tmpdir()` and mocks `node:fs` with pass-through wrappers
  that *record* every path the scan lists, stats, opens or reads, and that can
  lose a race on demand — `pretendRegularFiles` makes an `lstat` claim "plain
  file", and `swapOnRealpath` swaps a path the instant `realpathSync` hands it
  back, which is the only way to reproduce a TOCTOU window deterministically.
  Containment tests then assert what the scan touched, not just that the result
  was empty: "zero artifacts" would also pass with the guard removed, because a
  later check discards the results anyway. The work-budget test asserts on
  recorded syscall counts rather than elapsed time; its companion counts
  `Dir.readSync()` calls (with `bufferSize: 1` forced in the mock, since libuv
  otherwise prefetches 32 entries per syscall) and asserts `readdirSync` is never
  called at all, because a bounded *loop* over an unbounded *listing* would
  satisfy the syscall counts on their own. The body-leak canary is
  shaped `description: SUPER-SECRET-BODY` in a file with no closing delimiter,
  because a canary containing no `:` would pass by construction.
- `src/renderer/harness-inventory.test.ts` — age ladder boundaries, chip labels,
  the truncated total label, summary ordering/omission, the refresh decision
  (coalescing, in-flight suppression, forced bypass, and which results open the
  window), and the `loadHarnessInventory` stale and error paths.
- `src/renderer/harness-artifacts-section.test.tsx` — Vitest runs in the `node`
  environment (no DOM, no React Testing Library), so the hook-free components are
  invoked as plain functions and the returned element tree is inspected. The
  `renderedText` helper *invokes nested function components*; without that,
  assertions about anything one component deep pass vacuously.
- `src/renderer/agentbridge-page.tsx` has no unit test (stateful `observer`
  component, no DOM), so the wiring is covered by `pnpm type:check` and a manual
  smoke test in Freelens.

## Known limitations

- Counts are a point-in-time snapshot; a running session can make them stale
  between refreshes.
- Frontmatter parsing is line-oriented, not a YAML parser. Multi-line or
  block-quoted descriptions degrade to "no description" rather than rendering
  something wrong. So does a frontmatter block that does not close within the
  first 4096 bytes, and so does an artifact file that has more than one hard link.
- A kind whose workspace holds more than `MAX_ENTRIES_SCANNED` (2000) directory
  entries is reported as `truncated` with no attempt to be exhaustive; its
  `examinedCount` and mtime range describe those 2000 entries, not the whole
  directory. Both budgets exist to keep a synchronous main-process handler
  bounded, and neither is configurable.
- **Which** 2000 entries is not defined. The bounded pull takes them in directory
  order, so the kept set can differ between refreshes of an unchanged workspace.
  Listing the whole directory first would make truncation alphabetical and stable,
  and that is exactly the unbounded work the budget exists to prevent; the group
  is flagged `truncated` and rendered in mtime order either way, so the previous
  ordering was never a guarantee anyone could see. Entries that *are* listed are
  still sorted by name before they are examined, so dedup across roots stays
  deterministic for a directory under the budget.
- OpenCode's agent directory is declared in both the singular and plural
  spellings pending verification against an installed OpenCode; the dedup-by-name
  rule makes the redundant spelling harmless.
- The panel reports the workspace only. Whatever the agent picks up from the
  user's personal `~/.claude` is invisible here.
