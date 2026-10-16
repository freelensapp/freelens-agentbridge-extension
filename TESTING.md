# TESTING.md

## Strategy

Vitest unit tests cover common, main-process, renderer, package metadata, and documentation behavior in a Node environment; component tests opt into jsdom per file.
Documentation tests (`src/readme-docs.test.ts`) pin user-facing prose about destructive actions to the provider registry, so a registry change that widens what Reset removes fails until the README says so.
Package metadata tests (`src/package-metadata.test.ts`) assert the v2 manifest: `"type": "module"`, `dist/main.js` and `dist/renderer.js` entries, and `engines.freelens: ^2.0.0`.
`src/main/scaffold-source.test.ts` compares the scaffold keys embedded by `import.meta.glob` with the files on disk, so a file the glob skips fails the test.
The TypeScript check runs one program per runtime, and `environment-tests/` proves that renderer and common code see no Node and main code sees no DOM.
One integration test (`integration/__tests__/extensions.tests.ts`) runs inside a Freelens `main` build in CI: it installs the packed tarball, checks the extension is Enabled (not Incompatible), opens its preferences, and waits for "Version probe timeout (ms)", which is read from the main process over IPC.
Everything else that depends on the Freelens host, such as terminal launch and the editors, requires a manual smoke check.

## Conventions

- Keep tests beside source as `src/**/*.test.{ts,tsx}`.
- Import `describe`, `expect`, `it`, `vi`, and the hooks from `vitest`; no tsconfig declares them as globals, and Biome rejects a `vitest` import outside tests.
- Add `// @vitest-environment jsdom` at the top of a test that renders React components, and use React Testing Library.
- Use Node temporary directories for filesystem tests and remove them in `afterEach`.
- Use injected fakes for process, shell, and host boundaries; do not invoke real provider CLIs.
- Use `test/freelens-extensions.ts` through the `@freelensapp/extensions` alias in `vitest.config.ts`. The stub covers only what the tests use, at runtime only: a test that reaches a missing member compiles against the real declaration and fails on `undefined`, so add the member to the stub.
- `react`, `mobx`, `mobx-react`, and `monaco-editor` are not stubbed; they resolve to the devDependencies pinned to the host's versions.
- Manually smoke-test host-rendered behavior in Freelens 2, using a directory install and `pnpm dev`.

## Commands

```sh
# Install dependencies
pnpm install

# Type-check sources, tests, tooling and environment tests
pnpm type:check

# Build extension bundles into dist/
pnpm build

# Run unit tests
pnpm test:unit

# Find unused files and dependencies (development and production passes)
pnpm knip:check

# Check formatting and lint rules
pnpm lint:check

# Check the formats Biome does not cover
pnpm trunk:check
```

`pnpm type:check` runs `type:check:sources`, `type:check:tests`, `type:check:tooling`, and `type:check:environments`, which can also be run one at a time.
After `pnpm build`, `dist/` contains `main.js`, `renderer.js`, `renderer.css`, and their source maps.

## Definition of done

- `pnpm test:unit` passes with no unjustified skipped tests.
- `pnpm type:check` passes.
- `pnpm lint:check` and `pnpm knip:check` pass.
- `pnpm trunk:check` passes when Markdown, YAML, or workflow files change.
- `pnpm build` succeeds when build or packaging behavior changes.
- Changed Freelens UI or host integration is smoke-tested in Freelens 2.
- New behavior and regressions receive a focused colocated unit test when automatable.
