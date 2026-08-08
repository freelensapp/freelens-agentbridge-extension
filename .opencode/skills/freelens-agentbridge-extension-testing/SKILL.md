# Freelens Agent Bridge Testing

- Unit tests live next to the module: `<module>.test.ts`.
- Runner: `vitest run` (`pnpm test:unit`). Default env `node`; jsdom opt-in
  via `// @vitest-environment jsdom` per file (we have no component tests
  today — the page is thin shell over public APIs and is smoke-tested
  manually).
- Pure modules under `src/main/` accept injected `spawn`/`mkdir` deps so
  specs can stub them; no real subprocess or filesystem touched.
- `@freelensapp/extensions` is aliased to `test/freelens-extensions.ts` for
  any future component test; our current specs don't import it.
- Test provider registry and metadata changes directly. Metadata must retain
  repository remote URL while identifying `@freelensapp/agentbridge-extension` and
  all provider keywords.
- Cover provider isolation, declared-path enforcement, reset preservation, and
  stale renderer-result guards when those flows change.
