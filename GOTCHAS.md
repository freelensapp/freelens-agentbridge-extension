# GOTCHAS.md

Chronological log of non-obvious pitfalls. Read when stuck. Append before ending your session.

## Format

Each entry: `- YYYY-MM-DD: <one-line gotcha>. Fix: <one-line fix or workaround>`

## Log

- 2026-08-08: `activeCluster` is not a `ClusterInfo` DTO. Fix: use `Renderer.Catalog.getActiveCluster()` for cluster data.
- 2026-08-11: Terminal readiness does not mean an agent CLI accepts input. Fix: do not send delayed REPL keystrokes.
- 2026-08-12: Literal `@claude` in new GitHub text triggers CI. Fix: write `@<!-- -->claude` when only referring to the handle.
