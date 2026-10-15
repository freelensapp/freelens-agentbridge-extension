# Contributing

## Prerequisites

- Node.js 24 (the exact version is in `.nvmrc`; `nvm install` or
  `mise install` picks it up, and `mise.toml`/`mise.lock` pin it for mise)
- pnpm 12 (`corepack install` installs the version in `packageManager`)
- Freelens >= 2.0.0. This line of the extension targets the v2 extension API
  only; Freelens 1.x is served by the 1.x releases.
- One or more supported providers on `PATH`: [OpenCode](https://opencode.ai/docs/),
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup),
  [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli),
  [OpenAI Codex CLI](https://developers.openai.com/codex/cli/),
  or [Pi](https://pi.dev/) —
  `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
  (Node >= 22.19; `@mariozechner/pi` on npm is an unrelated GPU-pod manager)

## Setup

```sh
pnpm install
```

## Build

```sh
pnpm build        # emits dist/main.js, dist/renderer.js and dist/renderer.css
pnpm dev          # both builds in watch mode, for a directory install
```

`pnpm build` runs `vite build` (renderer, empties `dist/`) and then
`vite build --mode main` (main, next to it). Both are ES modules with source
maps; nothing is minified. Neither `pnpm build` nor `pnpm dev` type-checks;
run `pnpm type:check` for that.

## Test

```sh
pnpm test:unit    # vitest
pnpm type:check   # tsc, one program per runtime plus tests, tooling and environment tests
pnpm lint:check   # biome
pnpm knip:check   # unused files and dependencies, development and production
pnpm trunk:check  # the formats Biome does not cover (Markdown, YAML, workflows)
```

Component tests that need a DOM opt into jsdom per file with
`// @vitest-environment jsdom` and use React Testing Library. The cluster page
itself is a thin shell over Freelens public APIs and is smoke-tested manually.

The integration test in `integration/__tests__/` runs in a Freelens build, not
here: the `Integration tests` workflow packs the extension, copies the test
into a Freelens `main` checkout, installs the tarball, and checks that the
extension is enabled and that its preferences load from the main process.

## Pack and install

### Development loop

Build once, then open Freelens -> Extensions (`Ctrl+Shift+E`), enter the path
of your checkout (the directory with `package.json`) and press Install.
Freelens runs the extension from `dist/` in that directory and lists it as
unverified. Then run:

```sh
pnpm dev
```

It rebuilds on every source change, and Freelens reloads the extension after
each rebuild — main process and renderer both, without a restart and without
packing. Stop it with `Ctrl+C`. A change to `main` or `renderer` in
`package.json` needs Freelens restarted once.

Freelens 2 runs `onDeactivate` and then the new `onActivate` in both
processes on every reload, and removes the IPC handlers of the old instance,
so a new renderer never talks to a stale main process.

### Tarball

```sh
pnpm build
pnpm pack          # produces freelensapp-agentbridge-extension-x.y.z.tgz
pnpm pack:dev      # bumps the prerelease version, builds and packs
```

Open Freelens -> Extensions and enter the path to the `.tgz`, or drag it
into the window. Enable the extension.

## Debug

- **Renderer errors:** `Ctrl+Shift+I` in Freelens -> Console tab. A render
  error on the cluster page is caught by the page's error boundary
  (`src/renderer/components/error-boundary.tsx`) and shown in place of the
  page.
- **Main process errors:** launch Freelens from a terminal; extension logs
  appear on stdout. The Extensions page also shows activation errors.

## Architecture

Two-process Electron extension on the Freelens v2 extension API:

- **Main** (`src/main/`) — registers the channels in
  `src/common/ipc-channels.ts` on a `Main.Ipc` subclass for provider checks,
  workspace preparation, declared-file I/O, reset, and reveal. Pure modules
  resolve isolated provider workdirs, seed scaffolds embedded in the bundle,
  and validate file paths.
- **Renderer** (`src/renderer/`) — sidebar registration, provider selection,
  the AI CLI session page (MobX observer), the provider file editors on the
  host's Monaco, and terminal dock tab launch via Freelens public APIs. It
  reaches main through a `Renderer.Ipc` subclass (`src/renderer/ipc.ts`) and
  never imports `electron`. `KUBECONFIG` is inherited from the active
  cluster's auth proxy by Freelens' built-in terminal infrastructure.

The host provides `react`, `react-dom`, `react/jsx-runtime`, `mobx`,
`mobx-react`, and `monaco-editor` on `globalThis.FreelensExtensionApi`; the
build maps those imports to the globals. Everything else the extension needs
at runtime is bundled. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Windows

Provider Windows support varies. WSL can be useful when a selected provider
does not support native Windows.
