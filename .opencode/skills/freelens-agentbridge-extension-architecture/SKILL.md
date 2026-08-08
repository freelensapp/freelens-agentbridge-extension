---
name: freelens-agentbridge-extension-architecture
description: Use when changing provider workspaces, managed files, IPC handlers, or scaffolds in freelens-agentbridge-extension.
---

# Provider Workspace Architecture

`src/common/agentbridge-providers.ts` is provider registry. Each provider declares
CLI metadata, editable managed files, and reset paths.

`src/main/get-provider-workdir.ts` computes isolated provider workdirs under
`<userData>/agentbridge-sessions/<safe-cluster-key>/<provider-id>`.

`src/main/provider-files.ts` owns all managed-file operations:

- `prepareProviderWorkspace` creates and seeds only absent declared editor files.
- `readProviderFile` and `writeProviderFile` handle only declared editor files.
- `resetProvider` removes only registry `resetPaths`, then seeds again.
- `revealProviderWorkspace` opens only a real workdir inside sessions root.

Every operation derives its workdir with `computeProviderWorkdir`, validates
provider and declared editor paths, and realpaths workdir, targets, and
existing parents. Real workdirs must remain under real sessions root; checks
are case-insensitive on Windows. Reject absolute, NUL, traversal, undeclared,
and symlink-escaping paths with `Forbidden path`.

`src/main/index.ts` uses raw Electron IPC with `agentbridge-extension:` prefix. Its
six operations are `check-provider`, `prepare-workspace`,
`read-provider-file`, `write-provider-file`, `reveal-workspace`, and
`reset-provider`. Handlers take cluster ID and derive workdir server-side. Do
not accept renderer-supplied workdir paths.

Deleted legacy modules: `ensure-harness.ts`, `harness-file.ts`,
`reveal-path.ts`, and `src/main/scaffold/`. Provider scaffolds live in
`src/main/scaffolds/<provider-id>/` and are copied to `out/main/scaffolds/`
by `electron.vite.config.js`.
