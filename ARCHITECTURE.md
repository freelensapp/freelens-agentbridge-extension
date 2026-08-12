# Architecture

## Overview

- Freelens extension that opens per-cluster sessions for OpenCode, Claude Code, or GitHub Copilot CLI.
- Follows Freelens' two-process Electron model: renderer owns UI and terminal orchestration; main process owns filesystem, child-process, settings, and shell operations.
- Uses local files only. No server, database, direct Kubernetes client, or provider API integration.

## Structure

- `src/common/`
  - Shared provider registry, IPC result types, and normalized extension settings.
- `src/main/index.ts`
  - Main entry point; registers `agentbridge-extension:*` Electron IPC handlers on activation.
- `src/main/provider-files.ts`
  - Creates isolated workspaces, seeds and resets managed files, validates declared paths, and exposes safe file I/O.
- `src/main/get-provider-workdir.ts`
  - Maps cluster IDs to collision-resistant directory names under Freelens `userData`.
- `src/main/check-provider.ts`, `open-in-editor.ts`, `extension-settings-store.ts`
  - Provider executable probes, external editor launch, and JSON settings persistence.
- `src/main/scaffolds/`
  - Provider-native instruction, permission, command, and skill templates copied into new workspaces.
- `src/renderer/index.tsx`
  - Renderer entry point; registers cluster page, sidebar menu, and app preferences.
- `src/renderer/agentbridge-page.tsx`
  - Page state coordinator for active cluster, provider selection, readiness, editing, reset, and launch actions.
- `src/renderer/provider-file-editor.tsx`
  - Monaco-based declared-file editor with debounced IPC saves.
- `src/renderer/launch-session.ts`, `renderer-launch.ts`, `get-launch-command.ts`
  - Testable terminal launch logic, Freelens terminal adapter, and platform-specific shell commands.
- `src/renderer/capability-hints.ts`, `capabilities-section.tsx`
  - Data-driven capability registry and generic capability UI.
- `src/**/*.test.{ts,tsx}`, `test/freelens-extensions.ts`
  - Vitest unit tests and Freelens host stub.
- `electron.vite.config.js`, `build/`
  - CJS main/renderer builds, host-global external mapping, Monaco worker handling, and scaffold copying.
- `.github/workflows/`, `docs/`
  - Version/tag/release automation and contributor, release, and feature documentation.

## Data Flow

- Freelens supplies active cluster ID and host UI APIs to renderer.
- Renderer restores selected provider per cluster from `localStorage`.
- Renderer invokes main IPC to run provider `<executable> --version`; main returns `ready`, `missing`, or `error`.
- When ready, renderer requests workspace preparation.
- Main derives `<userData>/agentbridge-sessions/<safe-cluster-id>/<provider-id>/`, verifies real-path containment, and copies missing declared scaffold files.
- Renderer reads and debounced-writes declared provider files through IPC; main rejects undeclared, absolute, traversal, and escaped paths.
- Session launch creates Freelens terminal tab, waits for terminal readiness, changes to provider workspace, then runs provider executable.
- Freelens terminal infrastructure supplies active cluster `KUBECONFIG`; extension does not read or modify Kubernetes credentials.
- Reveal and editor actions cross IPC; main verifies workspace then uses Electron shell or configured editor executable.

## Persistence

- Provider selection: renderer `localStorage`, keyed by cluster ID.
- Provider workspaces: Freelens `userData/agentbridge-sessions/`, partitioned by safe cluster key and provider ID.
- Extension preferences: `userData/agentbridge-extension-settings.json`.
- Reset removes only provider registry `resetPaths`, then restores those files from bundled scaffolds; instructions and unrelated workspace files remain.

## Key Abstractions

- `AgentBridgeProvider`: registry entry defining executable, probe/launch arguments, docs, editable files, and reset scope.
- `EditorDefinition`: declared provider file contract containing path, title, syntax, role, and optional scaffold source.
- `ProviderCheckResult` / `ProviderLoadResult`: readiness state passed from process probe through renderer UI.
- `ExtensionSettings`: normalized probe timeout and external editor command/URI scheme.
- `LaunchSessionDeps`: small adapter boundary between framework-independent launch timing and Freelens terminal APIs.
- `CapabilityHint`: data-only capability description whose provider-specific invocation controls applicability.
- `agentbridge-extension:*`: explicit renderer/main IPC boundary for all privileged operations.

## External Dependencies

- Freelens `>=1.8`: extension lifecycle, cluster context, UI components, notifications, and terminal tabs.
- Electron: IPC, application paths, filesystem reveal, and external URI handling.
- React 17, MobX, and MobX React: renderer UI and host-observed state; injected by Freelens at runtime.
- Monaco Editor and `@monaco-editor/react`: only bundled runtime UI dependencies.
- OpenCode, Claude Code, and GitHub Copilot CLI: optional user-installed executables discovered on `PATH`; extension does not bundle them.
- Node.js `>=22`: filesystem, hashing, paths, and child-process APIs.
- Kubernetes access: indirect through `KUBECONFIG` inherited by Freelens terminals; Kubernetes RBAC remains authorization boundary.

## Build And Release

- `electron-vite` emits CommonJS entries at `out/main/index.js` and `out/renderer/index.js` with source maps.
- Freelens, React, MobX, Electron, and Node modules remain external; build maps host libraries to Freelens globals.
- Build copies `src/main/scaffolds/` to `out/main/scaffolds/`; npm package contains only `out/**/*`.
- Vitest runs `src/**/*.{test,spec}.{ts,tsx}` in Node; TypeScript and Biome provide type and lint checks.
- Version tags trigger GitHub Actions build, pack, npm OIDC publication, and GitHub Release creation.

## Architectural Constraints

- Keep privileged filesystem, process, and shell work in main process; renderer accesses it through IPC.
- Add providers by extending shared registry and adding matching scaffold files, rather than branching UI or file logic.
- Editable paths must be declared in provider registry; containment checks defend against traversal and symlink escape.
- Provider permission files are convenience guardrails, not Kubernetes authorization controls.

## Features
The folder `docs/features` contains a .md document for each most important and documentation-worth feature.