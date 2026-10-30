# CONVENTIONS.md

Coding conventions for this project. Follow these when writing or reviewing code.

## Naming
- Name source files in kebab-case; colocate tests as `<module>.test.ts` or `<module>.test.tsx`.
- Use camelCase for functions, variables, and local constants; use PascalCase for classes, components, interfaces, and types.
- Use UPPER_SNAKE_CASE for fixed shared constants such as timeouts and regexes.
- Name IPC channels in kebab-case in `ipcChannels` (`src/common/ipc-channels.ts`), without an extension prefix; the host adds one. A new channel goes into `IpcContract` (arguments and result) and `ipcChannels`, then gets its handler in `src/main/index.ts`; the compiler flags each step that is missing.
- Prefer domain names such as `providerId`, `clusterId`, and `workdir` consistently across process boundaries. In code, `workdir` is the absolute path of a workspace; user-facing text says "workspace" (see `GLOSSARY.md`).

## Structure
- Put process-independent types and logic in `src/common/`, Electron and filesystem code in `src/main/`, and React UI in `src/renderer/`. Renderer and common code import no Node builtins and no `electron`; use `Common.App` (for example `Common.App.isWindows`) instead of `process`.
- Reach main from the renderer only through `invoke` in `src/renderer/ipc.ts`; register handlers only on `AgentBridgeMainIpc` in `src/main/index.ts`. Do not cast `invoke` results: the contract types them. Return `ActionResult` for actions whose failure the user can retry.
- Keep renderer page logic in React-free modules that take `invoke`, storage and a clock (see `agentbridge-page-state.ts`); components render and forward intent.
- Keep provider definitions centralized in `src/common/agentbridge-providers.ts`; derive provider IDs and result unions from that registry.
- Keep provider scaffold assets under `src/main/scaffolds/<provider>/`; they are embedded into the main bundle, so read them through `src/main/scaffold-source.ts`, never from disk. Build output belongs in `dist/`.
- Import host modules (`react`, `mobx`, `mobx-react`, `monaco-editor`, ...) by their package names; the build maps them to the host's instances. Do not add a second copy of a host module as a runtime dependency.
- Export reusable symbols by name; reserve default exports for Freelens extension entry classes and tool configuration.
- Import Node built-ins with `node:`; order imports as Node, blank line, `@freelensapp`, blank line, packages, blank line, relative paths, with type-only imports last where Biome places them.

## Patterns
- Model finite outcomes with discriminated unions using `status`; handle non-ready states before success data.
- Validate untrusted provider IDs, settings, and file paths in shared boundary functions before side effects.
- Use `async`/`await` for sequential IPC flows; use `void promise.then(...).catch(...)` in effects and timers that cannot await.
- Convert unknown failures with `error instanceof Error ? error.message : String(error)` and return user-facing result objects when callers can recover; throw for invalid programmer inputs.
- Guard async renderer updates with cancellation or current-selection checks to prevent stale results from mutating state.
- Add focused Vitest coverage beside changed modules; mock process or platform boundaries through injected dependencies.

## Tooling
- Install dependencies with `pnpm install`; supported runtime is Node.js 24 (`.nvmrc`, `mise.toml`) and pnpm 12.
- Run unit tests with `pnpm test:unit`.
- Run TypeScript checks with `pnpm type:check`.
- Run Biome formatter and linter checks with `pnpm lint:check`; apply safe fixes with `pnpm lint:fix`.
- Run `pnpm knip:check` for unused files and dependencies and `pnpm trunk:check` for Markdown, YAML, and workflows.
- Build both extension processes with `pnpm build`; iterate with `pnpm dev` on a directory install.
- Biome enforces 2-space indentation, LF endings, 120-column lines, double quotes, semicolons, trailing commas, and organized imports.
