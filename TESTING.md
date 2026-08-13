# TESTING.md

## Strategy

Vitest unit tests cover common, main-process, renderer, package metadata, and documentation behavior in a Node environment.
Documentation tests (`src/readme-docs.test.ts`) pin user-facing prose about destructive actions to the provider registry, so a registry change that widens what Reset removes fails until the README says so.
Freelens host integration and rendered UI behavior require a manual smoke check because no integration or E2E suite exists.

## Conventions

- Keep tests beside source as `src/**/*.{test,spec}.{ts,tsx}`.
- Import `describe`, `expect`, `it`, and mocks from `vitest`.
- Use Node temporary directories for filesystem tests and remove them in `afterEach`.
- Use injected fakes for process, shell, and host boundaries; do not invoke real provider CLIs.
- Use `test/freelens-extensions.ts` through the configured `@freelensapp/extensions` alias.
- Test renderer logic without a DOM where possible; manually smoke-test host-rendered behavior in Freelens.

## Commands

```sh
# Run all automated tests
pnpm test

# Run unit tests directly
pnpm test:unit

# Type-check
pnpm type:check

# Check formatting and lint rules
pnpm lint:check

# Build extension bundles
pnpm build
```

## Definition of done

- `pnpm test` passes with no unjustified skipped tests.
- `pnpm type:check` passes.
- `pnpm lint:check` passes.
- `pnpm build` succeeds when build or packaging behavior changes.
- Changed Freelens UI or host integration is smoke-tested in Freelens.
- New behavior and regressions receive a focused colocated unit test when automatable.
