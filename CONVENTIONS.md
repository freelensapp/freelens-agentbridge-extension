# CONVENTIONS.md

Coding conventions for this project. Follow these when writing or reviewing code.

## Naming
- Name source files in kebab-case; colocate tests as `<module>.test.ts` or `<module>.test.tsx`.
- Use camelCase for functions, variables, and local constants; use PascalCase for classes, components, interfaces, and types.
- Use UPPER_SNAKE_CASE for fixed shared constants such as timeouts, regexes, and IPC prefixes.
- Prefer domain names such as `providerId`, `clusterId`, and `workdir` consistently across process boundaries.

## Structure
- Put process-independent types and logic in `src/common/`, Electron and filesystem code in `src/main/`, and React UI in `src/renderer/`.
- Keep provider definitions centralized in `src/common/agentbridge-providers.ts`; derive provider IDs and result unions from that registry.
- Keep provider scaffold assets under `src/main/scaffolds/<provider>/`; build output belongs in `out/`.
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
- Install dependencies with `pnpm install`; supported runtime is Node.js >= 22 and pnpm 10.
- Run unit tests with `pnpm test:unit`.
- Run TypeScript checks with `pnpm type:check`.
- Run Biome formatter and linter checks with `pnpm lint:check`; apply safe fixes with `pnpm lint:fix`.
- Build both extension processes with `pnpm build`.
- Biome enforces 2-space indentation, LF endings, 120-column lines, double quotes, semicolons, trailing commas, and organized imports.
