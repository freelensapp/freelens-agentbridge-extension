# Freelens Agent Bridge Gotchas

- `Renderer.Catalog.activeCluster` is a `computed` returning a catalog
  `KubernetesCluster | null` entity, NOT a `ClusterInfo` DTO. Use
  `Renderer.Catalog.getActiveCluster()` to read `{ id, kubeConfigPath,
  contextName, ... }`.
- IPC uses raw Electron handlers because published `Main.Ipc` is abstract.
  Include `agentbridge-extension:` in all six operation names: `check-provider`,
  `prepare-workspace`, `read-provider-file`, `write-provider-file`,
  `reveal-workspace`, and `reset-provider`.
- The built-in terminal sets `env.KUBECONFIG = proxyKubeconfigPath` for the
  active cluster at `shell-session.ts:384`. The extension never reads or
  mutates this — just opens a terminal tab and sends a command.
- `sendCommand` resolves only after the shell is ready (it `await`s
  `terminalApi.isReady`); the click handler can ignore the returned Promise.
- `createTerminalTab` auto-selects + opens the dock — no separate focus call.
- Provider selection is persisted per cluster. Async provider checks use
  generation and selection guards; never apply a stale result after changing
  cluster, provider, or retrying.
- Workspaces and file operations must stay below the real sessions root. Never
  trust renderer workdir paths or bypass declared editor and reset paths.
- Provider-native guardrails are not Kubernetes authorization. RBAC and
  kubeconfig permissions remain security boundary.
- Build stack filenames: `electron.vite.config.js` (not `.ts`) and
  `biome.jsonc` (not `.json`). Vendored helper: `build/global-externals.js`.
