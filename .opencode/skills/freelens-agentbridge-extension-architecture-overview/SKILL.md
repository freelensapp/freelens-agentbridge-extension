# Freelens Agent Bridge Architecture

Two-process Electron extension. `src/common/agentbridge-providers.ts` is provider
registry for OpenCode, Claude Code, and GitHub Copilot CLI. Entries define CLI
metadata, declared editor files, reset paths, and provider scaffold identity.

Main registers six raw Electron IPC operations under `agentbridge-extension:`:
`check-provider`, `prepare-workspace`, `read-provider-file`,
`write-provider-file`, `reveal-workspace`, and `reset-provider`. All handlers
take cluster ID and provider ID, then derive an isolated server-side workdir at
`<userData>/agentbridge-sessions/<safe-cluster-key>/<provider-id>`.

Renderer registers one cluster page and menu. Its MobX `observer` selects a
provider per cluster, checks it on `PATH`, prepares its workdir, opens a built-in
terminal dock tab with inherited `KUBECONFIG`, and renders declared files in
Monaco. Generation and selection guards drop stale asynchronous results after a
cluster, provider, or retry change.

Runtime globals (`@freelensapp/extensions`, `mobx`, `react`, ...) injected by
the Freelens host. Monaco is the exception — `monaco-editor` and
`@monaco-editor/react` are the extension's first runtime deps (bundled into
`out/renderer/` via Vite `?worker` imports, shipped in the `.tgz`).

`provider-files.ts` permits only registry-declared files. It validates provider
IDs and paths, rejects absolute, NUL, traversal, undeclared, and symlink-escape
paths, and realpath-checks workdirs, targets, and existing parents against
sessions root. Reset removes and re-seeds only declared `resetPaths`; it
preserves instruction files and unrelated files. Provider guardrails are native
CLI convenience controls, never a replacement for Kubernetes RBAC or kubeconfig
permissions.
