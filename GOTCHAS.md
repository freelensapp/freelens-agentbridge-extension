# GOTCHAS.md

Chronological log of non-obvious pitfalls. Read when stuck. Append before ending your session.

## Format

Each entry: `- YYYY-MM-DD: <one-line gotcha>. Fix: <one-line fix or workaround>`

## Log

- 2026-08-08: `activeCluster` is not a `ClusterInfo` DTO. Fix: use `Renderer.Catalog.getActiveCluster()` for cluster data.
- 2026-08-11: Terminal readiness does not mean an agent CLI accepts input. Fix: do not send delayed REPL keystrokes.
- 2026-08-12: Literal `@claude` in new GitHub text triggers CI. Fix: write `@<!-- -->claude` when only referring to the handle.
- 2026-08-12: JS regex `.` never matches `\r`, so a `^(.*)$` line parser silently rejects every line of a CRLF file. Fix: split on `/\r?\n/` before matching.
- 2026-08-12: A lexical containment check on a path built from a declared relative root is dead code; the reachable escape is a root that is itself a symlink. Fix: decide containment on the root's `realpathSync` before the first `readdir`.
- 2026-08-12: "Assert zero results" cannot test a containment guard when a downstream check discards the results anyway. Fix: record the scan's fs calls and assert which syscalls ran, since that is the only observable difference.
- 2026-08-12: In node-env component tests, a `renderedText` helper that stops at nested function components makes assertions about anything one component deep pass vacuously. Fix: invoke nested hook-free components inside the helper.
- 2026-08-12: Restoring a window fires `focus` and `visibilitychange` in the same tick, and a gate written only on completion cannot see the first request. Fix: track an in-flight ref, not the loading state, and suppress non-forced refreshes while it is set.
- 2026-08-12: A collapsed-by-default section that computes its header count from an error result advertises an authoritative `0`. Fix: render the count only for the success branch and keep the error plus Retry outside the collapsible body.
- 2026-08-12: `realpathSync` resolves symlinks, so it cannot see a hardlink: `<workdir>/.../SKILL.md` hardlinked to an outside file passes every containment check and is reported under a fabricated in-workspace path. Fix: reject `lstat` results with `nlink > 1`.
- 2026-08-12: A cap on RESULTS does not bound WORK — entries dropped by dedup or holding no artifact file never reach it, so a synchronous main-process scan still pays lstat + realpath + read for every one of them. Fix: add a separate examined-entries budget charged for every entry considered.
- 2026-08-12: Collecting in name order and displaying in mtime order makes a truncated group's mtime range a lie ("updated 20800d ago" seconds after the dropped tail was written). Fix: track the true range and examined count over everything the scan looked at, not over what it kept.
- 2026-08-12: `openSync` on a FIFO blocks forever with no timeout, and a blocked worker thread also defeats Vitest's own test timeout, so the whole run hangs. Fix: open with `O_NONBLOCK | O_NOFOLLOW` and re-identify the descriptor with `fstatSync` (dev/ino) before reading.
- 2026-08-12: A frontmatter reader that treats an unterminated `---` block as frontmatter parses the entire head of any markdown document opening with a thematic break, lifting body lines shaped `key: value` across IPC. Fix: require the closing delimiter inside the head window; no closing delimiter means no frontmatter.
- 2026-08-13: Freelens re-requires the renderer entry on a window reload but never re-activates an extension already in `extensionInstances`, so a new IPC channel is missing in the running main process (`No handler registered for ...`) until the app is fully quit. Fix: restart Freelens after any `src/main/` change, and make renderer-side errors say so.
- 2026-08-12: A body-leak canary with no `:` in it (`SUPER-SECRET-BODY`) cannot be captured by a `key: value` reader, so the test passes by construction. Fix: shape the canary like the thing the reader captures (`description: SUPER-SECRET-BODY`) in a file with no closing delimiter.
- 2026-08-13: A destructive action described in prose drifts silently when its scope lives in the registry — README said Reset restored "only the managed permission file" long after every `resetPaths` grew a second entry, so the `/build-cluster-map` editor was deleted without warning. Fix: assert the docs against the registry (`src/readme-docs.test.ts`), never re-describe `resetPaths` by hand.
- 2026-08-13: `pnpm lint:check` failed on a clean checkout of `main` — the previous commit hand-edited a `.tsx` line past the formatter's width and no workflow runs on `push`/`pull_request`, so nothing caught it. Fix: run `pnpm lint:check && pnpm type:check && pnpm test:unit` before assuming a red check is yours.
- 2026-08-13: A per-entry work budget still leaves the scan unbounded when it sits *behind* `readdirSync` + a full `localeCompare` sort — both complete before the counter is read once (~70 ms and ~11 MB for a 100k-entry directory, on the main process, re-run on every window focus). A cap on entries EXAMINED does not bound entries LISTED. Fix: `opendirSync` + a pull bounded by the remaining budget, plus one `readSync` past it to tell "directory ended" from "we stopped"; accept that truncation stops being alphabetically stable.
- 2026-08-13: `break`ing out of the root loop on an exhausted budget dropped every remaining root without setting `truncated`, so the header printed an authoritative count for directories it never opened. Fix: fall through instead — a bounded pull with a budget of 0 lists nothing and still reports whether the root held entries.
- 2026-08-13: Auditing `opendirSync` in tests undercounts unless `bufferSize: 1` is passed: libuv prefetches 32 entries per syscall, so a scan can over-read by 31 entries between two `readSync()` calls the audit can see. Fix: force `bufferSize: 1` in the `node:fs` mock and count `Dir.readSync()` calls.
- 2026-08-13: The output directory a scaffold command tells the agent to write skills into is prose, so nothing type-checked it against `artifactSources.roots` — `/build-cluster-map` wrote OpenCode skills to `.opencode/skill/` while the scanner only reads `.opencode/skills/`, making every generated skill invisible. Fix: assert in `src/main/scaffold-source.test.ts` that every `` `.../SKILL.md` `` path in a command scaffold sits under that provider's declared skill roots.
