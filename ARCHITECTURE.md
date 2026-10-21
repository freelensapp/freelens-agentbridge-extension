# Architecture

## Overview

- Freelens extension that opens per-cluster sessions for OpenCode, Claude Code, GitHub Copilot CLI, OpenAI Codex CLI, or Pi.
- Built on the Freelens v2 extension API (`engines.freelens: ^2.0.0`, ES module package); Freelens 1.x is not supported by this line.
- Follows Freelens' two-process Electron model: renderer owns UI and terminal orchestration; main process owns filesystem, child-process, settings, and shell operations.
- Uses local files only. No server, database, direct Kubernetes client, or provider API integration.

## Structure

- `src/common/`
  - Shared provider registry, the typed IPC contract (`ipc-channels.ts`: channel names, per-channel arguments and results, `ActionResult`), and normalized extension settings.
- `src/main/index.ts`
  - Main entry point; in `onActivate` creates `AgentBridgeMainIpc` (a `Main.Ipc` subclass) and registers one handler per channel from a map typed `IpcHandlers`, so a handler that drifts from the contract fails to compile; reset errors become an `ActionResult` here. `onDeactivate` calls `resetInstance`.
- `src/main/provider-files.ts`
  - Creates isolated workspaces, seeds and resets managed files from the embedded scaffolds, validates declared paths, and exposes safe file I/O.
- `src/main/scaffold-source.ts`
  - Embeds every file under `src/main/scaffolds/` into `dist/main.js` with `import.meta.glob(..., { query: "?raw", import: "default", eager: true, exhaustive: true })`; exposes `readScaffoldFile(providerId, path)` and `listScaffoldFiles()`. `exhaustive` is required, because every provider keeps its config under a dot directory.
- `src/main/get-provider-workdir.ts`
  - Maps cluster IDs to collision-resistant directory names under Freelens `userData`.
- `src/main/harness-artifacts.ts`, `read-frontmatter.ts`
  - Read-only inventory of workspace skills and custom agents; bounded frontmatter metadata extraction.
- `src/main/check-provider.ts`, `open-in-editor.ts`, `extension-settings-store.ts`
  - Provider executable probes, external editor launch, and JSON settings persistence.
- `src/main/scaffolds/`
  - Provider-native instruction, permission, command, and skill templates seeded into new workspaces. Data, not source: excluded from the main TypeScript program and from knip.
- `src/renderer/index.tsx`
  - Renderer entry point; creates the renderer `Ipc` in `onActivate`, and registers the cluster page (wrapped by `withPageErrorBoundary`), sidebar menu, and app preferences.
- `src/renderer/ipc.ts`
  - `Renderer.Ipc` subclass and the typed `invoke` (`IpcInvoke`) every renderer module uses to reach main; the one place the host's `Promise<any>` is trusted to match the contract.
- `src/renderer/components/`
  - Error boundary and error page from the extension template; a render error replaces the cluster page, not the cluster's whole main area.
- `src/renderer/agentbridge-page-state.ts`
  - React-free page state: the active cluster's selected provider, its readiness check, the workspace inventory scan (coalescing, in-flight gate, stale-result tokens), and the reveal/open/reset actions. Takes `invoke`, storage and a clock; the page subscribes with `useSyncExternalStore`.
- `src/renderer/agentbridge-page.tsx`
  - Renders the page state, forwards user intent to it, asks for Reset confirmation, shows notifications, and launches sessions.
- `src/renderer/provider-selection.ts`
  - Per-cluster provider selection in `localStorage`.
- `src/renderer/provider-file-editor.tsx`, `code-editor.tsx`, `editor-language.ts`
  - Declared-file editor with debounced IPC saves; `CodeEditor`, a Monaco editor on the host's Monaco instance (`import { editor } from "monaco-editor"`, mapped to the host global) with the host theme; and the map from a declared file's syntax to a language id the host's Monaco can show.
- `src/renderer/launch-session.ts`, `renderer-launch.ts`, `get-launch-command.ts`
  - Testable terminal launch logic, Freelens terminal adapter, and shell-specific commands (`LaunchShell = "posix" | "windows"`, chosen with `Common.App.isWindows`).
- `src/renderer/capability-hints.ts`, `capabilities-section.tsx`
  - Data-driven capability registry and generic capability UI.
- `src/renderer/harness-inventory.ts`, `harness-artifacts-section.tsx`
  - Inventory view formatting (chips, ages, totals) and the workspace artifacts panel.
- `src/**/*.test.{ts,tsx}`, `test/freelens-extensions.ts`
  - Vitest unit tests and Freelens host stub (`Main`/`Renderer` `LensExtension` and `Ipc`, `Common.App`, `Common.logger`, and the renderer members the tests use).
- `integration/__tests__/`
  - Playwright integration test run inside a Freelens `main` build by the `Integration tests` workflow.
- `vite.config.mjs`, `build/`
  - ESM renderer and main builds, the host-module plugin, standard-decorator lowering, and CSS module declarations, all from the extension template.
- `tsconfig.base.json`, `src/*/tsconfig.json`, `src/tsconfig.json`, `tsconfig.json`, `environment-tests/`
  - One TypeScript program per runtime, plus tests and tooling, and probes proving each runtime's environment stays pure.
- `.github/workflows/`, `github-workflow-fix/`, `docs/`
  - Version/tag/release automation, workflows updated for v2 staged for a maintainer to move into `.github/workflows/` (CI cannot push workflow changes), and contributor, release, and feature documentation.

## Data Flow

- Freelens supplies active cluster ID and host UI APIs to renderer.
- Renderer restores selected provider per cluster from `localStorage`.
- Renderer invokes main IPC to run provider `<executable> --version`; main returns `ready`, `missing`, or `error`.
- When ready, renderer requests workspace preparation.
- Main derives `<userData>/agentbridge-sessions/<safe-cluster-id>/<provider-id>/`, verifies real-path containment, and writes missing declared files from the scaffolds embedded in the main bundle.
- Renderer reads and debounced-writes declared provider files through IPC; main rejects undeclared, absolute, traversal, and escaped paths.
- Renderer requests the workspace artifact inventory through IPC; main lists registry-declared artifact roots under the verified workdir and returns metadata only, never file contents.
- Session launch creates a titled Freelens terminal tab (`createTerminalTab({ title })`) and sends one command that changes to the provider workspace and runs the provider executable (`terminalStore.sendCommand(cmd, { tabId, enter: true })`); the host waits for the tab's shell to be ready before typing.
- Freelens terminal infrastructure supplies active cluster `KUBECONFIG`; extension does not read or modify Kubernetes credentials.
- Reveal and editor actions cross IPC; main verifies workspace then uses Electron shell or configured editor executable.

## Persistence

- Provider selection: renderer `localStorage`, keyed by cluster ID.
- Provider workspaces: Freelens `userData/agentbridge-sessions/`, partitioned by safe cluster key and provider ID.
- Extension preferences: `userData/agentbridge-extension-settings.json`.
- Both stay under Electron `userData`, where the 1.x releases kept them, so upgrading to the v2 line keeps the user's files.
- Reset removes only provider registry `resetPaths`, then restores those files from the embedded scaffolds; instructions and unrelated workspace files remain.

## Key Abstractions

- `AgentBridgeProvider`: registry entry defining executable, probe/launch arguments, docs, editable files, and reset scope.
- `EditorDefinition`: declared provider file contract containing path, title, syntax, role, and optional scaffold source. `language` is a syntax name (`json`, `markdown`, `toml`, `typescript`), not a Monaco language id; the renderer maps it. Providers declare as many editors as their native layout needs; Pi declares four, because its guardrail hook and its settings are separate files.
- `ProviderCheckResult` / `ProviderLoadResult`: readiness state passed from process probe through renderer UI.
- `AgentBridgePageState`: the page's state module; its interface (`setCluster`, `selectProvider`, `retry`, `refreshInventory`, `reset`, ...) is also its test surface, driven with a fake `invoke` in Node.
- `ExtensionSettings`: normalized probe timeout and external editor command/URI scheme.
- `LaunchSessionDeps`: small adapter boundary between framework-independent launch timing and Freelens terminal APIs.
- `CapabilityHint`: data-only capability description whose provider-specific invocation controls applicability.
- `ArtifactSource`: registry entry declaring, per artifact kind, the workspace-relative roots scanned for the inventory and their directory layout. A kind may be omitted when the CLI has no such concept — Pi declares skills only, since it has no sub-agents — and the renderer needs no branch for it, because `summarizeInventory` already keeps only groups with `count > 0`.
- `HarnessArtifact` / `HarnessArtifactGroup`: normalized inventory record and its derived per-kind rollup (count, mtime range, truncation).
- `IpcContract` / `ipcChannels` (`src/common/ipc-channels.ts`): explicit renderer/main IPC boundary for all privileged operations. `IpcContract` maps each channel to its arguments and result; `IpcInvoke` (renderer) and `IpcHandlers` (main) are derived from it, so neither side casts. Arguments are still untrusted at runtime and validated by main. Names are unprefixed; the host prefixes them per extension and removes the handlers on deactivation.

## External Dependencies

- Freelens `^2.0.0` (v2 extension API): extension lifecycle, cluster context, UI components, notifications, terminal tabs, per-extension IPC, and the host modules.
- Electron (main process only): application paths, filesystem reveal, and external URI handling. The renderer never imports `electron`.
- React 19, MobX 7, and MobX React 10: renderer UI and host-observed state; provided by Freelens at runtime on `globalThis.FreelensExtensionApi`.
- Monaco Editor: the host's instance, also provided on `globalThis.FreelensExtensionApi`; the extension bundles no Monaco and no workers. The host registers the JSON and generic editor workers only, so TypeScript is shown as plain text.
- OpenCode, Claude Code, GitHub Copilot CLI, OpenAI Codex CLI, and Pi: optional user-installed executables discovered on `PATH`; extension does not bundle them.
- Node.js `>=24`: filesystem, hashing, paths, and child-process APIs.
- Kubernetes access: indirect through `KUBECONFIG` inherited by Freelens terminals; Kubernetes RBAC remains authorization boundary.

## Build And Release

- `vite.config.mjs` builds one entry per run, in library mode, as ESM: `vite build` builds the renderer into `dist/renderer.js` and `dist/renderer.css` and empties `dist/`; `vite build --mode main` builds `dist/main.js` next to it. Both emit source maps; nothing is minified.
- `pnpm dev` runs both builds in watch mode for a directory install; the host reloads the extension after each rebuild.
- `build/vite-plugin-host-modules.mjs` replaces imports of `react`, `react-dom`, `react/jsx-runtime`, `mobx`, `mobx-react`, and `monaco-editor` with reads of `globalThis.FreelensExtensionApi`. Its named exports come from the devDependency copy pinned to the host's version; when `require()` of a module fails (monaco-editor's CommonJS entry is an AMD build), it reads the named exports from the ES module entry's source instead. This is the one local change to the template's plugin.
- Main keeps Node builtins and `electron` external; the renderer has nothing external and fails the build on a Node or Electron import.
- Scaffolds are embedded in `dist/main.js`; npm package contains only `dist/**/*`.
- Vitest runs `src/**/*.test.{ts,tsx}` in Node, with jsdom for files that ask for it; TypeScript, Biome, knip, and Trunk provide type, lint, dead-code, and format checks.
- Version tags trigger GitHub Actions build, pack, npm OIDC publication, and GitHub Release creation.

## Architectural Constraints

- Keep privileged filesystem, process, and shell work in main process; renderer accesses it through IPC.
- Renderer and common code use no Node APIs, and main code uses no DOM; the per-runtime TypeScript programs, `environment-tests/`, and Biome's `noNodejsModules` override enforce it.
- Add providers by extending shared registry and adding matching scaffold files, rather than branching UI or file logic.
- Editable paths must be declared in provider registry; containment checks defend against traversal and symlink escape.
- Provider permission files are convenience guardrails, not Kubernetes authorization controls.

## Features
The folder `docs/features` contains a .md document for each most important and documentation-worth feature.
