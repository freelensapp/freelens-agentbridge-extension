# Contributing

## Prerequisites

- Node.js >= 22
- pnpm 10
- Freelens >= 1.8.0
- One or more supported providers on `PATH`: [OpenCode](https://opencode.ai/docs/),
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup), or
  [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)

## Setup

```sh
pnpm install
```

## Build

```sh
pnpm build        # emits out/main/index.js + out/renderer/index.js
pnpm dev          # electron-vite dev watch (if wired)
```

## Test

```sh
pnpm test:unit    # vitest
pnpm type:check   # tsc --noEmit
pnpm lint:check   # biome
```

The renderer page is a thin shell over Freelens public APIs and is
smoke-tested manually — no component unit tests.

## Pack and install

### One-shot

```sh
pnpm build
pnpm pack          # produces freelensapp-agentbridge-extension-x.y.z.tgz
```

Open Freelens → Extensions (`Ctrl+Shift+E`) → drag the `.tgz` into the
window. Enable the extension.

### Symlink for faster iteration

**macOS / Linux:**

```sh
ln -s /full/path/to/freelens-agentbridge-extension \
  ~/.local/share/Freelens/extensions/freelens-agentbridge-extension
```

**Windows (junction):**

```powershell
New-Item -ItemType Junction -Path "$env:LOCALAPPDATA\Freelens\extensions\freelens-agentbridge-extension" -Target "C:\full\path\to\freelens-agentbridge-extension"
```

Then `pnpm build` and reload Freelens (`Ctrl+R` / `Cmd+R`).

> **A reload only picks up `src/renderer/` changes.** Freelens re-requires the
> renderer entry on every window reload, but the main process keeps its
> extension instance for the life of the app and never calls `onActivate`
> again — so nothing under `src/main/` is reloaded, and IPC handlers registered
> there stay as they were at startup. After changing main-process code, **quit
> Freelens completely and reopen it**. The symptom of skipping this is a new
> renderer invoking a channel the old main process never registered:
>
> ```text
> Error invoking remote method 'agentbridge-extension:<channel>':
> Error: No handler registered for 'agentbridge-extension:<channel>'
> ```

## Debug

- **Renderer errors:** `Ctrl+Shift+I` in Freelens → Console tab.
- **Main process errors:** launch Freelens from a terminal; logs prefixed
  `[EXTENSION]:` appear on stdout. The Extensions page also shows
  activation errors.

## Architecture

Two-process Electron extension mirroring the Freelens extension model:

- **Main** (`src/main/`) — registers `agentbridge-extension:` IPC handlers for
  provider checks, workspace preparation, declared-file I/O, reset, and reveal.
  Pure modules resolve isolated provider workdirs, seed registry scaffolds, and
  validate file paths.
- **Renderer** (`src/renderer/`) — sidebar registration, provider selection,
  the AI CLI session
  page (MobX observer), and terminal dock tab launch via Freelens public
  APIs. `KUBECONFIG` is inherited from the active cluster's auth proxy by
  Freelens' built-in terminal infrastructure.

Host-injected globals (`@freelensapp/extensions`, `mobx`, `react`) come
from the Freelens host. The only bundled runtime dependency is Monaco
Editor (`monaco-editor` + `@monaco-editor/react`).

## Windows

Provider Windows support varies. WSL can be useful when a selected provider
does not support native Windows.
