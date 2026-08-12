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
