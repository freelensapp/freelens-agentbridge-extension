# Workspace Harness Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/specs/2026-08-12-harness-artifacts-design.md`](../specs/2026-08-12-harness-artifacts-design.md) · **Issue:** [#16](https://github.com/freelensapp/freelens-agentbridge-extension/issues/16)

**Goal:** Show, on the extension page, how many skills and custom agents exist in the selected cluster's provider workspace and when each was last updated — without the user opening the workspace directory.

**Architecture:** Each provider declares its artifact directories in the shared registry (`artifactSources`). A new main-process module walks only those directories under the already-containment-checked workdir, reads a bounded head of each artifact file for its YAML frontmatter, and returns metadata only (never file bodies) over one new IPC channel. The renderer renders a rollup of counts + freshness in the page header and a collapsible, flat, oldest-first drill-down above the Monaco editors.

**Tech Stack:** TypeScript 5.9, Node >= 22 (`node:fs` sync APIs), React 17, Electron IPC (`ipcMain.handle` / `ipcRenderer.invoke`), Vitest 4 (node environment, no DOM), Biome 2.5.

---

## Global Constraints

Copied verbatim from the spec and the repo's context files. Every task's requirements implicitly include this section.

- **Scope is skills and custom agents only.** Commands, MCP servers, hooks and plugins are out of scope — do not add them "while you're in there".
- **Workspace only.** The scan root is always `resolveVerifiedWorkdir(...)`. Never scan `~/.claude`, never accept a caller-supplied root.
- **`assertDeclaredPath` must not be modified or relaxed.** Reading and writing *file contents* stays restricted to the three declared editors per provider. This feature adds a separate, narrower capability: directory listing + `lstat` + a bounded frontmatter head-read.
- **No file body ever crosses the IPC boundary.** Only `kind`, `name`, `description` (≤ 200 chars), workspace-relative `path`, `mtimeMs`, `origin`.
- **Read-only.** No create, delete, rename or write of discovered artifacts.
- **Head-read cap: 4096 bytes** per artifact file. **Artifact cap: 200 per kind**, then `truncated: true`.
- **`lstat`, never `stat`.** A symlink must not be followed, even for its mtime.
- **Provider knowledge lives in `src/common/agentbridge-providers.ts` only.** The scanner must contain zero per-provider paths (ARCHITECTURE.md: "Add providers by extending shared registry ... rather than branching UI or file logic").
- **Vitest runs in the `node` environment — there is no DOM and no React Testing Library.** Components can only be unit-tested by calling them as plain functions and inspecting the returned element, which works for hook-free components only (see `src/renderer/capabilities-section.test.tsx`). Components under test may only use SDK members present in the stub `test/freelens-extensions.ts` (today: `Renderer.Component.Icon`, `Renderer.Theme`).
- **Biome:** 2-space indent, LF, 120 columns, double quotes, semicolons, trailing commas, organized imports. Node built-ins imported with the `node:` prefix. Import order: Node, blank line, `@freelensapp`, blank line, packages, blank line, relative paths, type-only imports last.
- **Naming:** kebab-case files, colocated `<module>.test.ts(x)`, camelCase functions/variables, PascalCase types/components, UPPER_SNAKE_CASE for fixed shared constants.
- **Every task ends green:** `pnpm test`, `pnpm type:check`, `pnpm lint:check`. Run `pnpm install` once before Task 1.

---

## File Structure

### Created

| File | Responsibility |
| --- | --- |
| `src/common/harness-artifacts.ts` | Types shared across processes (`HarnessArtifactKind`, `ArtifactSource`, `HarnessArtifact`, `HarnessArtifactGroup`, `HarnessInventoryResult`), the caps, and the pure `buildArtifactGroup` rollup derivation. |
| `src/common/harness-artifacts.test.ts` | Rollup derivation tests. |
| `src/main/read-frontmatter.ts` | Bounded head-read of a file + line-oriented YAML frontmatter reader. One responsibility, so its parsing edge cases are testable without a filesystem. |
| `src/main/read-frontmatter.test.ts` | Frontmatter parsing tests. |
| `src/main/harness-artifacts.ts` | The scanner: `listProviderArtifacts(userData, clusterId, providerId)`. Containment, symlink rejection, dedup, caps, ordering. |
| `src/main/harness-artifacts.test.ts` | The security-critical test file — the bulk of the value of this feature. |
| `src/renderer/harness-inventory.ts` | Pure, React-free view logic: IPC load function, refresh coalescing predicate, relative-age formatting, chip models. |
| `src/renderer/harness-inventory.test.ts` | Tests for all of the above. |
| `src/renderer/harness-artifacts-section.tsx` | The view: hook-free `HarnessInventoryChips` and `HarnessArtifactRow`, plus the stateful `HarnessArtifactsSection`. |
| `src/renderer/harness-artifacts-section.test.tsx` | Direct-invocation tests of the two hook-free components. |
| `docs/features/harness-artifacts.md` | Feature documentation, per the ARCHITECTURE.md convention. |

### Modified

| File | Change |
| --- | --- |
| `src/common/agentbridge-providers.ts:15-24, 26-115` | `artifactSources` on the interface and on all three providers. |
| `src/common/agentbridge-providers.test.ts` | Extend the exact-metadata assertion; add root-safety validation. |
| `src/main/provider-files.ts:19-25` | Export the existing `isInside` helper so the scanner reuses it instead of re-implementing the win32 case rule. |
| `src/main/index.ts:28-40, 80` | Register the `list-provider-artifacts` channel. |
| `src/main/index.test.ts:3-18, 36-42, 66-76` | Mock the new module; assert the new channel. |
| `src/renderer/agentbridge-page.tsx:6-10, 166-180, 249-251` | Header chips, drill-down section, refresh wiring. |
| `ARCHITECTURE.md`, `README.md`, `GOTCHAS.md` | Documentation. |

---

## Interfaces at a glance

Every task below is written to be implementable in isolation. This is the shared vocabulary all of them use:

```ts
// src/common/harness-artifacts.ts
type HarnessArtifactKind = "skill" | "agent";
type ArtifactLayout = "skill-dir" | "markdown";
interface ArtifactSource { kind: HarnessArtifactKind; roots: readonly string[]; layout: ArtifactLayout }
interface HarnessArtifact { kind; name: string; description?: string; path: string; mtimeMs: number; origin: "seeded" | "generated" }
interface HarnessArtifactGroup { kind; count: number; newestMtimeMs?: number; oldestMtimeMs?: number; artifacts: readonly HarnessArtifact[]; truncated: boolean }
type HarnessInventoryResult = { status: "ok"; groups: readonly HarnessArtifactGroup[] } | { status: "error"; error: string };
function buildArtifactGroup(kind, artifacts, truncated?): HarnessArtifactGroup;
const MAX_ARTIFACTS_PER_KIND = 200;
const HARNESS_ARTIFACT_KIND_ORDER: readonly HarnessArtifactKind[];

// src/main/read-frontmatter.ts
interface Frontmatter { name?: string; description?: string }
function parseFrontmatter(head: string): Frontmatter;
function readFrontmatter(filePath: string): Frontmatter;

// src/main/harness-artifacts.ts
function listProviderArtifacts(userData: string, clusterId: string, providerId: string): HarnessInventoryResult;

// src/renderer/harness-inventory.ts
function loadHarnessInventory(clusterId, providerId, invoke, isCurrent): Promise<HarnessInventoryResult | undefined>;
function shouldRefresh(lastScanAtMs: number | undefined, nowMs: number): boolean;
function formatRelativeAge(mtimeMs: number, nowMs: number): string;
function chipLabel(kind: HarnessArtifactKind, count: number, truncated: boolean): string;
function summarizeInventory(groups: readonly HarnessArtifactGroup[], nowMs: number): InventorySummary;
interface InventorySummary { chips: readonly InventoryChip[]; totalCount: number; ageLabel?: string }
interface InventoryChip { kind: HarnessArtifactKind; label: string; count: number; truncated: boolean }
```

---

### Task 1: Shared types and rollup derivation

**Files:**
- Create: `src/common/harness-artifacts.ts`
- Test: `src/common/harness-artifacts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type and constant in the "Interfaces at a glance" block above, plus `buildArtifactGroup`.

**Context you need:** `HarnessArtifactGroup` is *derived* from a flat artifact list, not produced by a second scan. One scan feeds both the header rollup and the drill-down. Artifacts are ordered **oldest-first** so a stale straggler is the first row a user sees without sorting anything.

- [ ] **Step 1: Write the failing test**

Create `src/common/harness-artifacts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildArtifactGroup, HARNESS_ARTIFACT_KIND_ORDER, MAX_ARTIFACTS_PER_KIND } from "./harness-artifacts";

import type { HarnessArtifact } from "./harness-artifacts";

function artifact(name: string, mtimeMs: number): HarnessArtifact {
  return { kind: "skill", name, path: `.claude/skills/${name}/SKILL.md`, mtimeMs, origin: "generated" };
}

describe("buildArtifactGroup", () => {
  it("derives count and the mtime range from the artifact list", () => {
    const group = buildArtifactGroup("skill", [artifact("b", 3000), artifact("a", 1000), artifact("c", 2000)]);

    expect(group.count).toBe(3);
    expect(group.oldestMtimeMs).toBe(1000);
    expect(group.newestMtimeMs).toBe(3000);
    expect(group.truncated).toBe(false);
  });

  it("orders artifacts oldest-first, breaking ties by name", () => {
    const group = buildArtifactGroup("skill", [artifact("b", 1000), artifact("c", 5000), artifact("a", 1000)]);

    expect(group.artifacts.map(({ name }) => name)).toEqual(["a", "b", "c"]);
  });

  it("leaves the mtime range undefined for an empty kind", () => {
    const group = buildArtifactGroup("agent", []);

    expect(group).toEqual({
      kind: "agent",
      count: 0,
      newestMtimeMs: undefined,
      oldestMtimeMs: undefined,
      artifacts: [],
      truncated: false,
    });
  });

  it("carries the truncated flag through", () => {
    expect(buildArtifactGroup("skill", [artifact("a", 1)], true).truncated).toBe(true);
  });

  it("does not mutate the caller's array", () => {
    const input = [artifact("b", 2000), artifact("a", 1000)];
    buildArtifactGroup("skill", input);

    expect(input.map(({ name }) => name)).toEqual(["b", "a"]);
  });

  it("exposes the render order and the per-kind cap", () => {
    expect(HARNESS_ARTIFACT_KIND_ORDER).toEqual(["skill", "agent"]);
    expect(MAX_ARTIFACTS_PER_KIND).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/common/harness-artifacts.test.ts`
Expected: FAIL — `Failed to resolve import "./harness-artifacts"`.

- [ ] **Step 3: Write the implementation**

Create `src/common/harness-artifacts.ts`:

```ts
// Inventory of the artifacts that exist in a provider workspace right now:
// skills and custom agents the extension seeded or the agent generated. This is
// the retrospective counterpart to the forward-looking capability registry
// (src/renderer/capability-hints.ts) — capabilities say what CAN be run, this
// says what EXISTS on disk.
//
// Workspace only, by design. Sessions launch with an inherited HOME, so the
// agent also loads the user's personal ~/.claude; that is deliberately not
// counted here and the UI says so.

export type HarnessArtifactKind = "skill" | "agent";

// Directory layout of one artifact root.
//   "skill-dir" -> <root>/<name>/SKILL.md   (skills, all three providers)
//   "markdown"  -> <root>/<name>.md         (custom agents, all three providers)
export type ArtifactLayout = "skill-dir" | "markdown";

export interface ArtifactSource {
  readonly kind: HarnessArtifactKind;
  // Workspace-relative roots, highest precedence first. A kind with several
  // roots dedups by artifact name: the first root that declares a name wins.
  readonly roots: readonly string[];
  readonly layout: ArtifactLayout;
}

export interface HarnessArtifact {
  readonly kind: HarnessArtifactKind;
  // Frontmatter `name`, falling back to the directory or file name.
  readonly name: string;
  // Frontmatter `description`, trimmed and capped. Absent when unparseable.
  readonly description?: string;
  // Workspace-relative, forward slashes on every platform.
  readonly path: string;
  readonly mtimeMs: number;
  // "seeded" when the extension ships this exact path; "generated" otherwise.
  readonly origin: "seeded" | "generated";
}

export interface HarnessArtifactGroup {
  readonly kind: HarnessArtifactKind;
  readonly count: number;
  readonly newestMtimeMs?: number;
  readonly oldestMtimeMs?: number;
  // Oldest-first, so a stale straggler is the first row.
  readonly artifacts: readonly HarnessArtifact[];
  // The scan hit MAX_ARTIFACTS_PER_KIND; `count` is a floor, not a total.
  readonly truncated: boolean;
}

export type HarnessInventoryResult =
  | { status: "ok"; groups: readonly HarnessArtifactGroup[] }
  | { status: "error"; error: string };

// Render order of the kind groups.
export const HARNESS_ARTIFACT_KIND_ORDER: readonly HarnessArtifactKind[] = ["skill", "agent"];

// Upper bound per kind. A workspace with more artifacts than this is reported as
// truncated rather than scanned exhaustively.
export const MAX_ARTIFACTS_PER_KIND = 200;

// The rollup is derived, never scanned separately: one scan serves both the
// header chips and the drill-down list.
export function buildArtifactGroup(
  kind: HarnessArtifactKind,
  artifacts: readonly HarnessArtifact[],
  truncated = false,
): HarnessArtifactGroup {
  const sorted = [...artifacts].sort(
    (left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name),
  );

  return {
    kind,
    count: sorted.length,
    newestMtimeMs: sorted.at(-1)?.mtimeMs,
    oldestMtimeMs: sorted.at(0)?.mtimeMs,
    artifacts: sorted,
    truncated,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm vitest run src/common/harness-artifacts.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify the tree is green and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add src/common/harness-artifacts.ts src/common/harness-artifacts.test.ts
git commit -m "feat: add shared harness artifact types and rollup derivation"
```

---

### Task 2: Declare artifact sources in the provider registry

**Files:**
- Modify: `src/common/agentbridge-providers.ts:15-24` (interface), `:26-115` (each provider literal)
- Modify: `src/common/agentbridge-providers.test.ts`

**Interfaces:**
- Consumes: `ArtifactSource` from Task 1.
- Produces: `provider.artifactSources` — the only place per-provider artifact paths exist. Task 4's scanner reads it and contains no provider knowledge of its own.

**Context you need:** `src/common/agentbridge-providers.test.ts` contains a `defines exact provider metadata` test that asserts the **entire** registry with `toEqual`. Adding a field to the provider literals breaks it — updating that assertion is part of this task, not an accident.

Verified paths (from the provider docs, confirmed during brainstorming):

| Provider | Skills roots | Agents roots |
| --- | --- | --- |
| OpenCode | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `.opencode/agent`, `.opencode/agents` |
| Claude Code | `.claude/skills` | `.claude/agents` |
| Copilot CLI | `.github/skills` | `.github/agents` |

OpenCode's agent directory is declared in **both** spellings on purpose: the docs and this codebase's existing seeded `.opencode/command/` path disagree about pluralisation, and a multi-root kind absorbs the ambiguity for free (dedup by name means a user who has only one of them sees no difference). If you can verify against an installed OpenCode during implementation, drop the spurious spelling and note it in `GOTCHAS.md`.

- [ ] **Step 1: Write the failing test**

Add to `src/common/agentbridge-providers.test.ts`, inside the existing `describe("agentBridgeProviders", ...)` block, after the `uses safe relative editor and reset paths` test:

```ts
  it("declares a skill and an agent artifact source for every provider", () => {
    for (const provider of agentBridgeProviders) {
      expect(provider.artifactSources.map(({ kind }) => kind)).toEqual(["skill", "agent"]);
    }
  });

  it("uses safe relative artifact roots", () => {
    for (const provider of agentBridgeProviders) {
      for (const source of provider.artifactSources) {
        expect(source.roots.length).toBeGreaterThan(0);
        expect(new Set(source.roots)).toHaveLength(source.roots.length);
        expect(["skill-dir", "markdown"]).toContain(source.layout);

        for (const root of source.roots) {
          expect(root).not.toContain("\0");
          expect(root.split(/[\\/]/)).not.toContain("..");
          expect(root).not.toMatch(/^(?:[\\/]|[A-Za-z]:)/);
        }
      }
    }
  });

  it("uses the skill-dir layout for skills and the markdown layout for agents", () => {
    for (const provider of agentBridgeProviders) {
      for (const source of provider.artifactSources) {
        expect(source.layout).toBe(source.kind === "skill" ? "skill-dir" : "markdown");
      }
    }
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/common/agentbridge-providers.test.ts`
Expected: FAIL — `Property 'artifactSources' does not exist` at type-check time and `Cannot read properties of undefined (reading 'map')` at run time.

- [ ] **Step 3: Extend the provider interface**

In `src/common/agentbridge-providers.ts`, add the import at the top of the file (before the existing declarations; this file currently has no imports, so it becomes the first line):

```ts
import type { ArtifactSource } from "./harness-artifacts";
```

Then add the field to `AgentBridgeProvider`, immediately after `readonly editors` (line 22):

```ts
  // Directories scanned to report what the workspace actually contains. Purely
  // informational: unlike `editors`, these paths are never read for content and
  // never written. See src/main/harness-artifacts.ts.
  readonly artifactSources: readonly ArtifactSource[];
```

- [ ] **Step 4: Declare the sources on each provider**

Add an `artifactSources` array to each provider literal, immediately after its `resetPaths` line.

OpenCode (after line 54):

```ts
    artifactSources: [
      { kind: "skill", roots: [".opencode/skills", ".claude/skills", ".agents/skills"], layout: "skill-dir" },
      { kind: "agent", roots: [".opencode/agent", ".opencode/agents"], layout: "markdown" },
    ],
```

Claude Code (after line 84):

```ts
    artifactSources: [
      { kind: "skill", roots: [".claude/skills"], layout: "skill-dir" },
      { kind: "agent", roots: [".claude/agents"], layout: "markdown" },
    ],
```

Copilot CLI (after line 113):

```ts
    artifactSources: [
      { kind: "skill", roots: [".github/skills"], layout: "skill-dir" },
      { kind: "agent", roots: [".github/agents"], layout: "markdown" },
    ],
```

- [ ] **Step 5: Update the exact-metadata assertion**

In `src/common/agentbridge-providers.test.ts`, the `defines exact provider metadata` test asserts the whole registry with `toEqual`. Add the matching `artifactSources` array to each of the three expected objects, immediately after its `resetPaths` entry — the same three literals you just wrote in Step 4, verbatim.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm vitest run src/common/agentbridge-providers.test.ts && pnpm type:check`
Expected: PASS. If `defines exact provider metadata` still fails, diff the expected object against the source literal — the arrays must match element for element.

- [ ] **Step 7: Verify the tree is green and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add src/common/agentbridge-providers.ts src/common/agentbridge-providers.test.ts
git commit -m "feat: declare skill and agent artifact sources per provider"
```

---

### Task 3: Bounded frontmatter reader

**Files:**
- Create: `src/main/read-frontmatter.ts`
- Test: `src/main/read-frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseFrontmatter(head: string): Frontmatter` and `readFrontmatter(filePath: string): Frontmatter`, where `interface Frontmatter { name?: string; description?: string }`. Task 4 calls `readFrontmatter`.

**Context you need:** This is deliberately **not** a YAML parser. All three providers write single-line scalar `name:` and `description:` fields, and a line-oriented reader that degrades to "no value" on anything else is both sufficient and impossible to turn into a parsing exploit. Never add a YAML dependency for this — the spec calls the degradation out as an accepted limitation.

Two rules that are easy to get wrong:

1. **Only the first 4096 bytes are read.** If the closing `---` is not inside that window, the final (possibly byte-truncated) line must be discarded — otherwise a value cut mid-way, or a mangled multi-byte character, gets surfaced as a description.
2. The reader must **never throw**. An unreadable file yields `{}` and is still counted.

- [ ] **Step 1: Write the failing test**

Create `src/main/read-frontmatter.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFrontmatter, readFrontmatter } from "./read-frontmatter";

const roots: string[] = [];

function createFile(contents: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "frontmatter-"));
  roots.push(root);
  const file = path.join(root, "SKILL.md");
  writeFileSync(file, contents, "utf8");
  return file;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("parseFrontmatter", () => {
  it("extracts name and description from a leading block", () => {
    expect(parseFrontmatter("---\nname: ns-map-kube-system\ndescription: Map of kube-system\n---\n# body")).toEqual({
      name: "ns-map-kube-system",
      description: "Map of kube-system",
    });
  });

  it("accepts CRLF line endings and a leading BOM", () => {
    expect(parseFrontmatter("\uFEFF---\r\nname: agent-one\r\ndescription: does things\r\n---\r\n")).toEqual({
      name: "agent-one",
      description: "does things",
    });
  });

  it("strips matching surrounding quotes", () => {
    expect(parseFrontmatter(`---\nname: "quoted"\ndescription: 'single'\n---\n`)).toEqual({
      name: "quoted",
      description: "single",
    });
  });

  it("ignores unrelated keys and stops at the closing delimiter", () => {
    expect(parseFrontmatter("---\nname: a\nmode: subagent\n---\ndescription: in the body\n")).toEqual({ name: "a" });
  });

  it("returns nothing when the file does not start with a delimiter", () => {
    expect(parseFrontmatter("# Just a heading\nname: a\n")).toEqual({});
  });

  it("returns nothing for malformed or empty frontmatter", () => {
    expect(parseFrontmatter("---\n\t\tnot: valid: yaml: at: all\n---\n")).toEqual({});
    expect(parseFrontmatter("---\nname:\ndescription:   \n---\n")).toEqual({});
    expect(parseFrontmatter("")).toEqual({});
  });

  it("keeps the first occurrence of a repeated key", () => {
    expect(parseFrontmatter("---\nname: first\nname: second\n---\n")).toEqual({ name: "first" });
  });

  it("caps the description at 200 characters", () => {
    const parsed = parseFrontmatter(`---\ndescription: ${"x".repeat(500)}\n---\n`);

    expect(parsed.description).toHaveLength(200);
  });

  it("discards the trailing line when the block never closes", () => {
    expect(parseFrontmatter("---\nname: complete\ndescription: truncated-mid-val")).toEqual({ name: "complete" });
  });
});

describe("readFrontmatter", () => {
  it("reads frontmatter from a file", () => {
    expect(readFrontmatter(createFile("---\nname: from-disk\n---\nbody"))).toEqual({ name: "from-disk" });
  });

  it("ignores fields pushed beyond the 4096-byte head without throwing", () => {
    const padding = `padding: ${"y".repeat(5000)}\n`;
    const file = createFile(`---\nname: early\n${padding}description: too late\n---\n`);

    expect(readFrontmatter(file)).toEqual({ name: "early" });
  });

  it("returns nothing for a missing or unreadable file", () => {
    expect(readFrontmatter(path.join(tmpdir(), "definitely-missing-frontmatter.md"))).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/main/read-frontmatter.test.ts`
Expected: FAIL — `Failed to resolve import "./read-frontmatter"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/read-frontmatter.ts`:

```ts
import { closeSync, openSync, readSync } from "node:fs";

// Bytes read from the head of an artifact file. Frontmatter blocks written by
// every provider are far smaller than this; the cap exists so a hostile or
// merely huge file cannot be pulled into memory by a directory listing.
const HEAD_BYTES = 4096;

// Descriptions are rendered in a single truncated UI line; anything longer is
// payload we would only throw away in the renderer.
const MAX_DESCRIPTION_LENGTH = 200;

const FIELD_PATTERN = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/;
const QUOTED_PATTERN = /^(["'])(.*)\1$/;

export interface Frontmatter {
  name?: string;
  description?: string;
}

function unquote(value: string): string {
  const match = QUOTED_PATTERN.exec(value);

  return (match ? match[2] : value).trim();
}

// Deliberately NOT a YAML parser: a line-oriented reader for the single-line
// scalars all three providers write. Anything it cannot read yields no value
// rather than a wrong one, which is the correct failure mode for a display-only
// inventory.
export function parseFrontmatter(head: string): Frontmatter {
  const lines = head.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (lines[0]?.trim() !== "---") return {};

  const body = lines.slice(1);
  const closingIndex = body.findIndex((line) => line.trim() === "---");
  // With no closing delimiter inside the head window the last line may have been
  // cut mid-value (or mid-UTF-8-sequence), so it is dropped rather than trusted.
  const fields = closingIndex === -1 ? body.slice(0, -1) : body.slice(0, closingIndex);
  const frontmatter: Frontmatter = {};

  for (const line of fields) {
    const match = FIELD_PATTERN.exec(line);

    if (!match) continue;
    const value = unquote(match[2].trim());

    if (!value) continue;
    if (match[1] === "name" && frontmatter.name === undefined) frontmatter.name = value;
    if (match[1] === "description" && frontmatter.description === undefined) {
      frontmatter.description = value.slice(0, MAX_DESCRIPTION_LENGTH);
    }
  }

  return frontmatter;
}

// Never throws: an unreadable artifact is still counted, just without metadata.
export function readFrontmatter(filePath: string): Frontmatter {
  let head: string;

  try {
    const descriptor = openSync(filePath, "r");

    try {
      const buffer = Buffer.alloc(HEAD_BYTES);
      const bytes = readSync(descriptor, buffer, 0, HEAD_BYTES, 0);
      head = buffer.subarray(0, bytes).toString("utf8");
    } finally {
      closeSync(descriptor);
    }
  } catch {
    return {};
  }

  return parseFrontmatter(head);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm vitest run src/main/read-frontmatter.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify the tree is green and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add src/main/read-frontmatter.ts src/main/read-frontmatter.test.ts
git commit -m "feat: add bounded frontmatter reader for artifact metadata"
```

---

### Task 4: The workspace scanner

**Files:**
- Create: `src/main/harness-artifacts.ts`
- Test: `src/main/harness-artifacts.test.ts`
- Modify: `src/main/provider-files.ts:19-25` (export `isInside`)

**Interfaces:**
- Consumes: `buildArtifactGroup`, `MAX_ARTIFACTS_PER_KIND`, the types (Task 1); `provider.artifactSources` (Task 2); `readFrontmatter` (Task 3); `resolveVerifiedWorkdir` and `isInside` from `./provider-files`.
- Produces: `listProviderArtifacts(userData: string, clusterId: string, providerId: string): HarnessInventoryResult`. Task 5 calls it.

**Context you need — read before writing code:**

- `resolveVerifiedWorkdir(userData, clusterId, providerId)` (`src/main/provider-files.ts:218`) resolves the workdir's real path and verifies it is inside `<userData>/agentbridge-sessions`. It **throws `ENOENT`** when the sessions root or the workdir does not exist yet, and throws `"Forbidden path"` on containment failure. An unprepared workspace is *empty*, not an error, so `ENOENT` must map to an `ok` result with zero counts.
- `getAgentBridgeProvider` throws `Unsupported AI CLI provider: <id>` for an unknown id. Per the project convention (CONVENTIONS.md: "throw for invalid programmer inputs"), that call goes **outside** the try/catch so it propagates, matching `resolveVerifiedWorkdir`'s own behaviour. Everything else is caught and returned as `{ status: "error", error }`.
- `isInside` already exists in `provider-files.ts:19` with the win32 case-insensitivity rule. Export it and reuse it — a second copy will drift.
- `readdirSync(dir, { withFileTypes: true })` returns `Dirent`s whose `isSymbolicLink()` uses `lstat` semantics, so entry-level symlinks are detected without an extra syscall. The artifact file inside a `skill-dir` still needs its own `lstatSync`.
- The dedup key is the resolved artifact **name**, first-root-wins — that is what makes OpenCode's three skill roots safe to declare.

- [ ] **Step 1: Export `isInside` from `provider-files.ts`**

In `src/main/provider-files.ts`, change line 19 from `function isInside(` to:

```ts
// Exported for the artifact scanner, which needs the same win32-aware
// containment rule. Keep this the single definition.
export function isInside(root: string, candidate: string): boolean {
```

Run: `pnpm type:check`
Expected: PASS.

- [ ] **Step 2: Write the failing test**

Create `src/main/harness-artifacts.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listProviderArtifacts } from "./harness-artifacts";
import { prepareProviderWorkspace } from "./provider-files";

import type { HarnessArtifactGroup, HarnessInventoryResult } from "../common/harness-artifacts";

const roots: string[] = [];

function createUserData(): string {
  const root = mkdtempSync(path.join(tmpdir(), "harness-artifacts-"));
  roots.push(root);
  return root;
}

// Every test needs a prepared workspace; seeding also gives us the one file the
// registry declares, which is what "seeded" origin is derived from.
function createWorkspace(providerId: string): { userData: string; workdir: string } {
  const userData = createUserData();
  const { workdir } = prepareProviderWorkspace(userData, "cluster-1", providerId);
  return { userData, workdir };
}

function writeSkill(workdir: string, root: string, name: string, frontmatter = `name: ${name}`): string {
  const dir = path.join(workdir, ...root.split("/"), name);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  writeFileSync(file, `---\n${frontmatter}\n---\nbody for ${name}\n`, "utf8");
  return file;
}

function writeAgent(workdir: string, root: string, name: string, frontmatter = `name: ${name}`): string {
  const dir = path.join(workdir, ...root.split("/"));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  writeFileSync(file, `---\n${frontmatter}\n---\nbody for ${name}\n`, "utf8");
  return file;
}

function setMtime(file: string, seconds: number): void {
  utimesSync(file, seconds, seconds);
}

function groupsOf(result: HarnessInventoryResult): readonly HarnessArtifactGroup[] {
  if (result.status !== "ok") throw new Error(`Expected ok inventory, got: ${result.error}`);
  return result.groups;
}

function groupFor(result: HarnessInventoryResult, kind: "skill" | "agent"): HarnessArtifactGroup {
  const group = groupsOf(result).find((candidate) => candidate.kind === kind);
  if (!group) throw new Error(`Missing group: ${kind}`);
  return group;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("listProviderArtifacts", () => {
  it("reports empty groups for an unprepared workspace", () => {
    const result = listProviderArtifacts(createUserData(), "cluster-1", "claude");

    expect(groupsOf(result).map(({ kind, count }) => ({ kind, count }))).toEqual([
      { kind: "skill", count: 0 },
      { kind: "agent", count: 0 },
    ]);
  });

  it("reports empty groups for a prepared workspace with no artifacts", () => {
    const { userData } = createWorkspace("claude");

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill").count).toBe(0);
  });

  it("discovers skills laid out as <root>/<name>/SKILL.md", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeSkill(workdir, ".claude/skills", "ns-map-kube-system", "name: ns-map-kube-system\ndescription: kube-system");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill");

    expect(group.count).toBe(1);
    expect(group.artifacts[0]).toMatchObject({
      kind: "skill",
      name: "ns-map-kube-system",
      description: "kube-system",
      path: ".claude/skills/ns-map-kube-system/SKILL.md",
      origin: "generated",
    });
  });

  it("discovers custom agents laid out as <root>/<name>.md", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeAgent(workdir, ".claude/agents", "reviewer");

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "agent").artifacts[0]).toMatchObject({
      kind: "agent",
      name: "reviewer",
      path: ".claude/agents/reviewer.md",
    });
  });

  it("ignores a skill directory with no SKILL.md and non-markdown agent files", () => {
    const { userData, workdir } = createWorkspace("claude");
    mkdirSync(path.join(workdir, ".claude/skills/empty"), { recursive: true });
    mkdirSync(path.join(workdir, ".claude/agents"), { recursive: true });
    writeFileSync(path.join(workdir, ".claude/agents/notes.txt"), "not an agent", "utf8");

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").count).toBe(0);
    expect(groupFor(result, "agent").count).toBe(0);
  });

  it("falls back to the path name when frontmatter has no name", () => {
    const { userData, workdir } = createWorkspace("claude");
    mkdirSync(path.join(workdir, ".claude/skills/no-frontmatter"), { recursive: true });
    writeFileSync(path.join(workdir, ".claude/skills/no-frontmatter/SKILL.md"), "# no frontmatter\n", "utf8");
    // Valid frontmatter, but without the `name` field.
    writeAgent(workdir, ".claude/agents", "unnamed", "mode: subagent");

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").artifacts[0].name).toBe("no-frontmatter");
    expect(groupFor(result, "skill").artifacts[0].description).toBeUndefined();
    expect(groupFor(result, "agent").artifacts[0].name).toBe("unnamed");
  });

  it("takes mtime from the artifact file and orders artifacts oldest-first", () => {
    const { userData, workdir } = createWorkspace("claude");
    setMtime(writeSkill(workdir, ".claude/skills", "newest"), 3_000);
    setMtime(writeSkill(workdir, ".claude/skills", "oldest"), 1_000);
    setMtime(writeSkill(workdir, ".claude/skills", "middle"), 2_000);

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill");

    expect(group.artifacts.map(({ name }) => name)).toEqual(["oldest", "middle", "newest"]);
    expect(group.oldestMtimeMs).toBe(1_000_000);
    expect(group.newestMtimeMs).toBe(3_000_000);
  });

  it("classifies a registry-declared artifact as seeded and its siblings as generated", () => {
    const { userData, workdir } = createWorkspace("copilot");
    writeSkill(workdir, ".github/skills", "ns-map-default");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "copilot"), "skill");
    const origins = Object.fromEntries(group.artifacts.map(({ name, origin }) => [name, origin]));

    expect(origins["build-cluster-map"]).toBe("seeded");
    expect(origins["ns-map-default"]).toBe("generated");
  });

  it("dedups by name across roots, first root wins", () => {
    const { userData, workdir } = createWorkspace("opencode");
    setMtime(writeSkill(workdir, ".opencode/skills", "shared"), 1_000);
    setMtime(writeSkill(workdir, ".claude/skills", "shared"), 2_000);
    writeSkill(workdir, ".agents/skills", "only-in-third");

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "opencode"), "skill");

    expect(group.count).toBe(2);
    expect(group.artifacts.find(({ name }) => name === "shared")?.path).toBe(".opencode/skills/shared/SKILL.md");
  });

  it("skips symlinked entries and artifacts that resolve outside the workdir", () => {
    const { userData, workdir } = createWorkspace("claude");
    const outside = createUserData();
    mkdirSync(path.join(outside, "evil"), { recursive: true });
    writeFileSync(path.join(outside, "evil/SKILL.md"), "---\nname: evil\n---\n", "utf8");
    writeFileSync(path.join(outside, "secret.md"), "---\nname: secret\n---\n", "utf8");

    mkdirSync(path.join(workdir, ".claude/skills"), { recursive: true });
    mkdirSync(path.join(workdir, ".claude/agents"), { recursive: true });
    symlinkSync(path.join(outside, "evil"), path.join(workdir, ".claude/skills/linked"), "dir");
    symlinkSync(path.join(outside, "secret.md"), path.join(workdir, ".claude/agents/linked.md"), "file");

    // A real directory whose SKILL.md is itself a symlink escaping the workdir.
    mkdirSync(path.join(workdir, ".claude/skills/sneaky"), { recursive: true });
    symlinkSync(path.join(outside, "evil/SKILL.md"), path.join(workdir, ".claude/skills/sneaky/SKILL.md"), "file");

    const result = listProviderArtifacts(userData, "cluster-1", "claude");

    expect(groupFor(result, "skill").count).toBe(0);
    expect(groupFor(result, "agent").count).toBe(0);
  });

  it("caps a kind at 200 artifacts and flags the result as truncated", () => {
    const { userData, workdir } = createWorkspace("claude");
    for (let index = 0; index < 201; index++) {
      writeSkill(workdir, ".claude/skills", `skill-${String(index).padStart(3, "0")}`);
    }

    const group = groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill");

    expect(group.count).toBe(200);
    expect(group.truncated).toBe(true);
  });

  it("does not flag exactly 200 artifacts as truncated", () => {
    const { userData, workdir } = createWorkspace("claude");
    for (let index = 0; index < 200; index++) {
      writeSkill(workdir, ".claude/skills", `skill-${String(index).padStart(3, "0")}`);
    }

    expect(groupFor(listProviderArtifacts(userData, "cluster-1", "claude"), "skill").truncated).toBe(false);
  });

  it("never returns file bodies", () => {
    const { userData, workdir } = createWorkspace("claude");
    writeSkill(workdir, ".claude/skills", "secretive", "name: secretive\ndescription: safe");
    writeFileSync(
      path.join(workdir, ".claude/skills/secretive/SKILL.md"),
      "---\nname: secretive\ndescription: safe\n---\nSUPER-SECRET-BODY\n",
      "utf8",
    );

    expect(JSON.stringify(listProviderArtifacts(userData, "cluster-1", "claude"))).not.toContain("SUPER-SECRET-BODY");
  });

  it("throws for an unknown provider", () => {
    expect(() => listProviderArtifacts(createUserData(), "cluster-1", "unknown")).toThrowError(
      new Error("Unsupported AI CLI provider: unknown"),
    );
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `pnpm vitest run src/main/harness-artifacts.test.ts`
Expected: FAIL — `Failed to resolve import "./harness-artifacts"`.

- [ ] **Step 4: Write the implementation**

Create `src/main/harness-artifacts.ts`:

```ts
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { getAgentBridgeProvider } from "../common/agentbridge-providers";
import { buildArtifactGroup, MAX_ARTIFACTS_PER_KIND } from "../common/harness-artifacts";
import { isInside, resolveVerifiedWorkdir } from "./provider-files";
import { readFrontmatter } from "./read-frontmatter";

import type { Dirent, Stats } from "node:fs";
import type { AgentBridgeProvider } from "../common/agentbridge-providers";
import type {
  ArtifactSource,
  HarnessArtifact,
  HarnessArtifactGroup,
  HarnessInventoryResult,
} from "../common/harness-artifacts";

// Read-only inventory of what a provider workspace currently contains.
//
// This is a NARROWER capability than the declared-file editors, not a wider one:
// it lists directories, lstats entries and reads a bounded head of each artifact
// for its frontmatter. It never reads a file body, never writes, and never leaves
// the workdir that resolveVerifiedWorkdir already containment-checked.

function toWorkspaceRelative(workdir: string, target: string): string {
  return path.relative(workdir, target).split(path.sep).join("/");
}

// A directory entry contributes at most one artifact file, decided by layout.
function artifactFileFor(source: ArtifactSource, rootDir: string, entry: Dirent): string | undefined {
  if (source.layout === "skill-dir") {
    return entry.isDirectory() ? path.join(rootDir, entry.name, "SKILL.md") : undefined;
  }

  return entry.isFile() && entry.name.toLowerCase().endsWith(".md") ? path.join(rootDir, entry.name) : undefined;
}

function fallbackNameFor(source: ArtifactSource, entryName: string): string {
  return source.layout === "skill-dir" ? entryName : entryName.replace(/\.md$/i, "");
}

function scanSource(workdir: string, source: ArtifactSource, seededPaths: ReadonlySet<string>): HarnessArtifactGroup {
  const artifacts: HarnessArtifact[] = [];
  const seenNames = new Set<string>();
  let truncated = false;

  for (const root of source.roots) {
    if (truncated) break;

    const rootDir = path.resolve(workdir, ...root.split("/"));

    if (!isInside(workdir, rootDir)) continue;

    let entries: Dirent[];

    try {
      entries = readdirSync(rootDir, { withFileTypes: true });
    } catch {
      // A root that does not exist (ENOENT), is not a directory, or is not
      // readable simply contributes nothing.
      continue;
    }

    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
      // Dirent.isSymbolicLink() has lstat semantics: an entry that is itself a
      // link is rejected before it is ever resolved.
      if (entry.isSymbolicLink()) continue;

      const file = artifactFileFor(source, rootDir, entry);

      if (!file) continue;

      let stats: Stats;

      try {
        stats = lstatSync(file);
      } catch {
        continue;
      }

      // isFile() is false for a symlinked SKILL.md, because this is lstat.
      if (!stats.isFile()) continue;

      let realFile: string;

      try {
        realFile = realpathSync(file);
      } catch {
        continue;
      }

      if (!isInside(workdir, realFile)) continue;

      if (artifacts.length >= MAX_ARTIFACTS_PER_KIND) {
        truncated = true;
        break;
      }

      const frontmatter = readFrontmatter(file);
      const name = frontmatter.name ?? fallbackNameFor(source, entry.name);

      if (seenNames.has(name)) continue;
      seenNames.add(name);

      const relativePath = toWorkspaceRelative(workdir, file);

      artifacts.push({
        kind: source.kind,
        name,
        ...(frontmatter.description === undefined ? {} : { description: frontmatter.description }),
        path: relativePath,
        mtimeMs: stats.mtimeMs,
        origin: seededPaths.has(relativePath) ? "seeded" : "generated",
      });
    }
  }

  return buildArtifactGroup(source.kind, artifacts, truncated);
}

function emptyInventory(provider: AgentBridgeProvider): HarnessInventoryResult {
  return { status: "ok", groups: provider.artifactSources.map((source) => buildArtifactGroup(source.kind, [])) };
}

export function listProviderArtifacts(
  userData: string,
  clusterId: string,
  providerId: string,
): HarnessInventoryResult {
  // Invalid programmer input throws, matching the rest of the main process.
  const provider = getAgentBridgeProvider(providerId);

  try {
    let workdir: string;

    try {
      workdir = resolveVerifiedWorkdir(userData, clusterId, provider.id);
    } catch (error: any) {
      // An unprepared workspace is empty, not broken.
      if (error?.code === "ENOENT") return emptyInventory(provider);
      throw error;
    }

    const seededPaths = new Set(provider.editors.map((editor) => editor.path.split(/[\\/]+/).join("/")));

    return { status: "ok", groups: provider.artifactSources.map((source) => scanSource(workdir, source, seededPaths)) };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm vitest run src/main/harness-artifacts.test.ts`
Expected: PASS, 15 tests.

If the symlink test fails on Windows (unprivileged `symlinkSync` throws `EPERM`), skip it there rather than weakening it:

```ts
const itUnlessWindows = process.platform === "win32" ? it.skip : it;
```

- [ ] **Step 6: Verify the tree is green and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add src/main/harness-artifacts.ts src/main/harness-artifacts.test.ts src/main/provider-files.ts
git commit -m "feat: scan provider workspaces for skills and custom agents"
```

---

### Task 5: IPC channel

**Files:**
- Modify: `src/main/index.ts:28-40` (channel list), `:80` (handler registration)
- Modify: `src/main/index.test.ts:3-18` (mocks), `:36-42` (module mock), `:66-76` (channel assertion)

**Interfaces:**
- Consumes: `listProviderArtifacts` (Task 4).
- Produces: the channel `agentbridge-extension:list-provider-artifacts`, invoked as `(clusterId, providerId)` and resolving to `HarnessInventoryResult`. Task 6 calls it.

**Context you need:** `src/main/index.test.ts` mocks every module `index.ts` imports with an explicit `vi.mock` factory. Importing a new module without adding it to the mocks pulls the real filesystem code into that test. The channel-order assertion uses `toEqual` on an exact array, so the new channel must be appended in the same position in both the source and the test.

- [ ] **Step 1: Write the failing test**

In `src/main/index.test.ts`:

1. Add to the `vi.hoisted` mocks object (keep alphabetical order — it sits between `getPath` and `openExternal`):

```ts
  listProviderArtifacts: vi.fn(),
```

2. Add the module mock next to the other `vi.mock` calls:

```ts
vi.mock("./harness-artifacts", () => ({ listProviderArtifacts: mocks.listProviderArtifacts }));
```

3. Append the channel to the `channels` array in the first test, after `"agentbridge-extension:set-settings"`:

```ts
      "agentbridge-extension:list-provider-artifacts",
```

4. Add the invocation and assertion at the end of that test, after the `set-settings` call and the `resetProvider` expectation respectively:

```ts
    await getHandler("agentbridge-extension:list-provider-artifacts")({}, "cluster-1", "claude");
```

```ts
    expect(mocks.listProviderArtifacts).toHaveBeenCalledWith("/user-data", "cluster-1", "claude");
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/main/index.test.ts`
Expected: FAIL — `Missing IPC handler: agentbridge-extension:list-provider-artifacts`.

- [ ] **Step 3: Register the channel**

In `src/main/index.ts`, add the import after the `./extension-settings-store` import:

```ts
import { listProviderArtifacts } from "./harness-artifacts";
```

Append to the `channels` array (after `"set-settings"`):

```ts
      "list-provider-artifacts",
```

Register the handler after the `set-settings` handler (line 80):

```ts
    ipcMain.handle(`${CHANNEL_PREFIX}list-provider-artifacts`, (_event, clusterId: string, providerId: string) =>
      listProviderArtifacts(app.getPath("userData"), clusterId, providerId),
    );
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm vitest run src/main/index.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify the tree is green and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add src/main/index.ts src/main/index.test.ts
git commit -m "feat: expose workspace artifact inventory over IPC"
```

---

### Task 6: Renderer view logic

**Files:**
- Create: `src/renderer/harness-inventory.ts`
- Test: `src/renderer/harness-inventory.test.ts`

**Interfaces:**
- Consumes: the types from Task 1; `CAPABILITY_KIND_LABEL` and `defaultIconForKind` from `./capability-hints`; `IpcInvoke` from `./provider-selection`.
- Produces: `loadHarnessInventory`, `shouldRefresh`, `formatRelativeAge`, `chipLabel`, `summarizeInventory`, `iconForArtifactKind`, `InventorySummary`, `InventoryChip`. Task 7 and Task 8 consume these.

**Context you need:** The renderer test environment is **node**, so React hooks cannot be exercised. Everything worth testing therefore lives here as plain functions, exactly as `provider-selection.ts` does for the provider load flow — `loadHarnessInventory` mirrors `loadProvider` (`src/renderer/provider-selection.ts:63`), including the `isCurrent()` stale-response guard.

`CapabilityKind` is `"command" | "skill" | "agent"`, a superset of `HarnessArtifactKind`, so `CAPABILITY_KIND_LABEL[kind]` and `defaultIconForKind(kind)` type-check directly. Reuse them rather than defining a second label map — one vocabulary for "Skills" / "Agents" across both panels.

Chip rules from the spec: a **zero-count kind is omitted**, a truncated kind renders `200+`, and the trailing age is the **newest** mtime across all kinds ("when did anything last change").

- [ ] **Step 1: Write the failing test**

Create `src/renderer/harness-inventory.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildArtifactGroup } from "../common/harness-artifacts";
import {
  chipLabel,
  formatRelativeAge,
  loadHarnessInventory,
  shouldRefresh,
  summarizeInventory,
} from "./harness-inventory";

import type { HarnessArtifact } from "../common/harness-artifacts";

const NOW = 1_700_000_000_000;

function artifact(name: string, mtimeMs: number, kind: "skill" | "agent" = "skill"): HarnessArtifact {
  return { kind, name, path: `.claude/skills/${name}/SKILL.md`, mtimeMs, origin: "generated" };
}

describe("formatRelativeAge", () => {
  it("formats ages from seconds to days", () => {
    expect(formatRelativeAge(NOW, NOW)).toBe("just now");
    expect(formatRelativeAge(NOW - 30_000, NOW)).toBe("just now");
    expect(formatRelativeAge(NOW - 60_000, NOW)).toBe("1m ago");
    expect(formatRelativeAge(NOW - 4 * 60_000, NOW)).toBe("4m ago");
    expect(formatRelativeAge(NOW - 60 * 60_000, NOW)).toBe("1h ago");
    expect(formatRelativeAge(NOW - 25 * 60 * 60_000, NOW)).toBe("1d ago");
    expect(formatRelativeAge(NOW - 48 * 60 * 60_000, NOW)).toBe("2d ago");
  });

  it("clamps a future mtime to just now rather than showing a negative age", () => {
    expect(formatRelativeAge(NOW + 60_000, NOW)).toBe("just now");
  });
});

describe("chipLabel", () => {
  it("pluralizes counts and renders truncation as a floor", () => {
    expect(chipLabel("skill", 1, false)).toBe("1 skill");
    expect(chipLabel("skill", 21, false)).toBe("21 skills");
    expect(chipLabel("agent", 2, false)).toBe("2 agents");
    expect(chipLabel("skill", 200, true)).toBe("200+ skills");
  });
});

describe("summarizeInventory", () => {
  it("omits zero-count kinds and reports the newest age across kinds", () => {
    const groups = [
      buildArtifactGroup("skill", [artifact("a", NOW - 10 * 60_000), artifact("b", NOW - 4 * 60_000)]),
      buildArtifactGroup("agent", []),
    ];

    expect(summarizeInventory(groups, NOW)).toEqual({
      chips: [{ kind: "skill", label: "2 skills", count: 2, truncated: false }],
      totalCount: 2,
      ageLabel: "4m ago",
    });
  });

  it("returns no chips and no age for a completely empty inventory", () => {
    expect(summarizeInventory([buildArtifactGroup("skill", []), buildArtifactGroup("agent", [])], NOW)).toEqual({
      chips: [],
      totalCount: 0,
      ageLabel: undefined,
    });
  });

  it("keeps registry order across kinds", () => {
    const groups = [
      buildArtifactGroup("skill", [artifact("a", NOW)]),
      buildArtifactGroup("agent", [artifact("r", NOW, "agent")]),
    ];

    expect(summarizeInventory(groups, NOW).chips.map(({ kind }) => kind)).toEqual(["skill", "agent"]);
  });
});

describe("shouldRefresh", () => {
  it("always allows the first scan", () => {
    expect(shouldRefresh(undefined, NOW)).toBe(true);
  });

  it("coalesces refreshes requested within two seconds of the last scan", () => {
    expect(shouldRefresh(NOW - 500, NOW)).toBe(false);
    expect(shouldRefresh(NOW - 1_999, NOW)).toBe(false);
    expect(shouldRefresh(NOW - 2_000, NOW)).toBe(true);
    expect(shouldRefresh(NOW - 10_000, NOW)).toBe(true);
  });
});

describe("loadHarnessInventory", () => {
  it("invokes the inventory channel with the cluster and provider", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "ok", groups: [] });

    await loadHarnessInventory("cluster-1", "claude", invoke, () => true);

    expect(invoke).toHaveBeenCalledWith("agentbridge-extension:list-provider-artifacts", "cluster-1", "claude");
  });

  it("returns the inventory when the request is still current", async () => {
    const groups = [buildArtifactGroup("skill", [artifact("a", NOW)])];
    const invoke = vi.fn().mockResolvedValue({ status: "ok", groups });

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => true)).toEqual({ status: "ok", groups });
  });

  it("discards a stale response", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "ok", groups: [] });

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => false)).toBeUndefined();
  });

  it("converts a rejected invoke into an error result", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("Forbidden path"));

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => true)).toEqual({
      status: "error",
      error: "Forbidden path",
    });
  });

  it("discards a rejection that is no longer current", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("Forbidden path"));

    expect(await loadHarnessInventory("cluster-1", "claude", invoke, () => false)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/renderer/harness-inventory.test.ts`
Expected: FAIL — `Failed to resolve import "./harness-inventory"`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/harness-inventory.ts`:

```ts
import { HARNESS_ARTIFACT_KIND_ORDER } from "../common/harness-artifacts";
import { CAPABILITY_KIND_LABEL, defaultIconForKind } from "./capability-hints";

import type { HarnessArtifactGroup, HarnessArtifactKind, HarnessInventoryResult } from "../common/harness-artifacts";
import type { IpcInvoke } from "./provider-selection";

// React-free view logic for the workspace artifact inventory. Kept separate from
// harness-artifacts-section.tsx so it is unit-testable in the node test
// environment, which has no DOM.

const CHANNEL_PREFIX = "agentbridge-extension:";

// Refreshes fire on mount, provider switch, reset, window focus and tab
// visibility, so several can land at once; anything inside this window after a
// successful scan reuses the result.
const REFRESH_COALESCE_MS = 2_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Singular label per kind, for chip text. The plural comes from
// CAPABILITY_KIND_LABEL, which the capabilities rail already owns.
const ARTIFACT_KIND_SINGULAR: Record<HarnessArtifactKind, string> = {
  skill: "skill",
  agent: "agent",
};

export interface InventoryChip {
  readonly kind: HarnessArtifactKind;
  readonly label: string;
  readonly count: number;
  readonly truncated: boolean;
}

export interface InventorySummary {
  // Non-empty kinds only, in registry order.
  readonly chips: readonly InventoryChip[];
  readonly totalCount: number;
  // Age of the newest artifact across all kinds: "when did anything last change".
  readonly ageLabel?: string;
}

export function iconForArtifactKind(kind: HarnessArtifactKind): string {
  return defaultIconForKind(kind);
}

export function labelForArtifactKind(kind: HarnessArtifactKind): string {
  return CAPABILITY_KIND_LABEL[kind];
}

export function formatRelativeAge(mtimeMs: number, nowMs: number): string {
  // Clock skew between the filesystem and the renderer must not surface as a
  // negative age.
  const elapsed = Math.max(0, nowMs - mtimeMs);

  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;

  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

export function chipLabel(kind: HarnessArtifactKind, count: number, truncated: boolean): string {
  const noun = count === 1 ? ARTIFACT_KIND_SINGULAR[kind] : `${ARTIFACT_KIND_SINGULAR[kind]}s`;

  return `${count}${truncated ? "+" : ""} ${noun}`;
}

export function summarizeInventory(groups: readonly HarnessArtifactGroup[], nowMs: number): InventorySummary {
  const ordered = HARNESS_ARTIFACT_KIND_ORDER.flatMap((kind) => groups.filter((group) => group.kind === kind));
  const newest = ordered.reduce<number | undefined>(
    (latest, group) =>
      group.newestMtimeMs === undefined ? latest : Math.max(latest ?? group.newestMtimeMs, group.newestMtimeMs),
    undefined,
  );

  return {
    chips: ordered
      .filter((group) => group.count > 0)
      .map((group) => ({
        kind: group.kind,
        label: chipLabel(group.kind, group.count, group.truncated),
        count: group.count,
        truncated: group.truncated,
      })),
    totalCount: ordered.reduce((total, group) => total + group.count, 0),
    ageLabel: newest === undefined ? undefined : formatRelativeAge(newest, nowMs),
  };
}

export function shouldRefresh(lastScanAtMs: number | undefined, nowMs: number): boolean {
  return lastScanAtMs === undefined || nowMs - lastScanAtMs >= REFRESH_COALESCE_MS;
}

// Mirrors loadProvider in provider-selection.ts: isCurrent() gates every state
// transition so a response for a superseded cluster/provider is discarded.
export async function loadHarnessInventory(
  clusterId: string,
  providerId: string,
  invoke: IpcInvoke,
  isCurrent: () => boolean,
): Promise<HarnessInventoryResult | undefined> {
  try {
    const result = (await invoke(
      `${CHANNEL_PREFIX}list-provider-artifacts`,
      clusterId,
      providerId,
    )) as HarnessInventoryResult;

    return isCurrent() ? result : undefined;
  } catch (error) {
    return isCurrent() ? { status: "error", error: error instanceof Error ? error.message : String(error) } : undefined;
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm vitest run src/renderer/harness-inventory.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify the tree is green and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add src/renderer/harness-inventory.ts src/renderer/harness-inventory.test.ts
git commit -m "feat: add harness inventory view logic and IPC loader"
```

---

### Task 7: The section component

**Files:**
- Create: `src/renderer/harness-artifacts-section.tsx`
- Test: `src/renderer/harness-artifacts-section.test.tsx`

**Interfaces:**
- Consumes: everything from Task 6; `HarnessArtifact`, `HarnessArtifactGroup`, `HarnessInventoryResult` from Task 1.
- Produces:
  - `HarnessInventoryChips({ summary, onSelect }): JSX.Element | null` — hook-free.
  - `HarnessArtifactRow({ artifact, nowMs }): JSX.Element` — hook-free.
  - `HarnessArtifactsSection({ result, loading, expanded, onToggle, onRefresh, nowMs }): JSX.Element | null` — presentational; the parent owns the state so this component stays hook-free too and the page can expand it when a header chip is clicked.

**Context you need:** Vitest runs in `node` with no DOM. `src/renderer/capabilities-section.test.tsx` shows the only viable component test here: call the component as a plain function and assert on the returned element. That works **only for hook-free components** — which is why the `expanded` state lives in `agentbridge-page.tsx` (Task 8) rather than inside this section. Do not add `useState` to this file.

The stub `test/freelens-extensions.ts` exposes only `Renderer.Component.Icon` and `Renderer.Theme`. Anything under unit test may use `Icon` and plain DOM elements. The Refresh control therefore uses a plain `<button>` styled like the existing collapse toggle in `capabilities-section.tsx:94-115`, not `Renderer.Component.Button` — this keeps the section testable and matches the existing collapse button's markup.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/harness-artifacts-section.test.tsx`:

```ts
import { describe, expect, it } from "vitest";
import { buildArtifactGroup } from "../common/harness-artifacts";
import { HarnessArtifactRow, HarnessArtifactsSection, HarnessInventoryChips } from "./harness-artifacts-section";
import { summarizeInventory } from "./harness-inventory";

import type { HarnessArtifact } from "../common/harness-artifacts";

// Both exported pieces are hook-free, so they can be invoked directly and the
// returned React element inspected without a DOM renderer (the test env is
// node, no RTL) — the same approach as capabilities-section.test.tsx. Visual
// layout is smoke-tested manually in Freelens.

const NOW = 1_700_000_000_000;

function artifact(overrides: Partial<HarnessArtifact> = {}): HarnessArtifact {
  return {
    kind: "skill",
    name: "ns-map-default",
    description: "Map of the default namespace",
    path: ".claude/skills/ns-map-default/SKILL.md",
    mtimeMs: NOW - 4 * 60_000,
    origin: "generated",
    ...overrides,
  };
}

function renderedText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? renderedText(props.children) : "";
}

describe("HarnessInventoryChips", () => {
  it("renders nothing when the inventory is empty", () => {
    const summary = summarizeInventory([buildArtifactGroup("skill", []), buildArtifactGroup("agent", [])], NOW);

    expect(HarnessInventoryChips({ summary, onSelect: () => {} })).toBeNull();
  });

  it("renders one chip per non-empty kind plus the newest age", () => {
    const summary = summarizeInventory(
      [buildArtifactGroup("skill", [artifact()]), buildArtifactGroup("agent", [])],
      NOW,
    );
    const text = renderedText(HarnessInventoryChips({ summary, onSelect: () => {} }));

    expect(text).toContain("1 skill");
    expect(text).not.toContain("agent");
    expect(text).toContain("4m ago");
  });
});

describe("HarnessArtifactRow", () => {
  it("renders the name, badge, relative age and description", () => {
    const text = renderedText(HarnessArtifactRow({ artifact: artifact(), nowMs: NOW }));

    expect(text).toContain("ns-map-default");
    expect(text).toContain("generated");
    expect(text).toContain("4m ago");
    expect(text).toContain("Map of the default namespace");
  });

  it("renders a seeded artifact with the seeded badge and no description", () => {
    const text = renderedText(HarnessArtifactRow({ artifact: artifact({ origin: "seeded", description: undefined }), nowMs: NOW }));

    expect(text).toContain("seeded");
  });
});

describe("HarnessArtifactsSection", () => {
  const props = { loading: false, expanded: true, onToggle: () => {}, onRefresh: () => {}, nowMs: NOW };

  it("renders nothing before the first result arrives", () => {
    expect(HarnessArtifactsSection({ ...props, result: undefined })).toBeNull();
  });

  it("renders the empty state when the workspace has no artifacts", () => {
    const result = { status: "ok" as const, groups: [buildArtifactGroup("skill", []), buildArtifactGroup("agent", [])] };

    expect(renderedText(HarnessArtifactsSection({ ...props, result }))).toContain("No skills or custom agents yet");
  });

  it("renders artifacts oldest-first under their kind label", () => {
    const result = {
      status: "ok" as const,
      groups: [
        buildArtifactGroup("skill", [
          artifact({ name: "fresh", mtimeMs: NOW - 60_000 }),
          artifact({ name: "stale", mtimeMs: NOW - 3 * 24 * 60 * 60_000 }),
        ]),
      ],
    };
    const text = renderedText(HarnessArtifactsSection({ ...props, result }));

    expect(text).toContain("Skills");
    expect(text.indexOf("stale")).toBeLessThan(text.indexOf("fresh"));
  });

  it("renders the error state with a retry control", () => {
    const text = renderedText(HarnessArtifactsSection({ ...props, result: { status: "error", error: "Forbidden path" } }));

    expect(text).toContain("Forbidden path");
    expect(text).toContain("Retry");
  });

  it("hides the body when collapsed", () => {
    const result = { status: "ok" as const, groups: [buildArtifactGroup("skill", [artifact({ name: "hidden-row" })])] };

    expect(renderedText(HarnessArtifactsSection({ ...props, result, expanded: false }))).not.toContain("hidden-row");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/renderer/harness-artifacts-section.test.tsx`
Expected: FAIL — `Failed to resolve import "./harness-artifacts-section"`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/harness-artifacts-section.tsx`:

```tsx
import { Renderer } from "@freelensapp/extensions";
import { HARNESS_ARTIFACT_KIND_ORDER } from "../common/harness-artifacts";
import { formatRelativeAge, iconForArtifactKind, labelForArtifactKind } from "./harness-inventory";

import type { HarnessArtifact, HarnessArtifactGroup, HarnessInventoryResult } from "../common/harness-artifacts";
import type { InventorySummary } from "./harness-inventory";

// The retrospective counterpart to the capabilities rail: what the workspace
// actually contains right now. Every export here is hook-free so it stays
// unit-testable in the node test environment; expansion state lives in the page.

const FAINT_BORDER = "1px solid var(--borderFaintColor, rgba(127,127,127,0.25))";

const badgeStyle = {
  fontSize: "0.7em",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  padding: "1px 6px",
  borderRadius: "10px",
  border: FAINT_BORDER,
  opacity: 0.75,
};

const inlineButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
  textAlign: "left" as const,
};

// The header rollup: "· 21 skills · 2 agents · updated 4m ago". Renders nothing
// for an empty inventory — a fresh workspace shows no chips rather than "0
// skills", and an authoritative-looking zero is worse than nothing.
export function HarnessInventoryChips({
  summary,
  onSelect,
}: {
  summary: InventorySummary;
  onSelect: () => void;
}) {
  if (summary.chips.length === 0) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {summary.chips.map((chip) => (
        <span key={chip.kind}>
          {" · "}
          <button
            type="button"
            onClick={onSelect}
            title={`Show workspace ${labelForArtifactKind(chip.kind).toLowerCase()}`}
            style={{ ...inlineButtonStyle, textDecoration: "underline dotted" }}
          >
            {chip.label}
          </button>
        </span>
      ))}
      {summary.ageLabel ? <span style={{ opacity: 0.7 }}>{` · updated ${summary.ageLabel}`}</span> : null}
    </span>
  );
}

// One artifact: icon, name, origin badge, relative age, description.
export function HarnessArtifactRow({ artifact, nowMs }: { artifact: HarnessArtifact; nowMs: number }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "6px 0", borderTop: FAINT_BORDER }}>
      <Renderer.Component.Icon
        material={iconForArtifactKind(artifact.kind)}
        small
        style={{ marginTop: "2px", opacity: 0.8 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <strong>{artifact.name}</strong>
          <span style={badgeStyle}>{artifact.origin}</span>
          <span style={{ opacity: 0.7, fontSize: "0.85em" }} title={new Date(artifact.mtimeMs).toLocaleString()}>
            {formatRelativeAge(artifact.mtimeMs, nowMs)}
          </span>
        </div>
        {artifact.description ? (
          <span style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {artifact.description}
          </span>
        ) : null}
      </div>
      <span style={{ opacity: 0.5, fontSize: "0.8em", fontFamily: "var(--font-monospace, monospace)" }}>
        {artifact.path}
      </span>
    </div>
  );
}

function ArtifactKindGroup({ group, nowMs }: { group: HarnessArtifactGroup; nowMs: number }) {
  if (group.count === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: "0.75em", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}>
        {labelForArtifactKind(group.kind)}
        {group.truncated ? ` (showing the first ${group.count}; the workspace holds more)` : null}
      </span>
      {group.artifacts.map((artifact) => (
        <HarnessArtifactRow key={artifact.path} artifact={artifact} nowMs={nowMs} />
      ))}
    </div>
  );
}

export function HarnessArtifactsSection({
  result,
  loading,
  expanded,
  onToggle,
  onRefresh,
  nowMs,
}: {
  result: HarnessInventoryResult | undefined;
  loading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  nowMs: number;
}) {
  // Nothing at all until the first scan lands: an empty panel that might just be
  // slow is noise.
  if (!result) return null;

  const groups =
    result.status === "ok"
      ? HARNESS_ARTIFACT_KIND_ORDER.flatMap((kind) => result.groups.filter((group) => group.kind === kind))
      : [];
  const total = groups.reduce((count, group) => count + group.count, 0);

  return (
    <section
      style={{
        border: FAINT_BORDER,
        borderRadius: "6px",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button type="button" onClick={onToggle} aria-expanded={expanded} style={{ ...inlineButtonStyle, display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
          <Renderer.Component.Icon material={expanded ? "expand_less" : "expand_more"} small />
          <strong style={{ flex: 1 }}>Workspace artifacts</strong>
          <span style={{ opacity: 0.6, fontSize: "0.85em" }}>{total}</span>
        </button>
        <button type="button" onClick={onRefresh} disabled={loading} title="Rescan the workspace" style={inlineButtonStyle}>
          <Renderer.Component.Icon material="refresh" small />
        </button>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ opacity: 0.7, fontSize: "0.85em" }}>
            Seeded by this extension and generated in this cluster's workspace. Your personal <code>~/.claude</code> is
            not counted.
          </span>

          {result.status === "error" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <Renderer.Component.Icon material="error_outline" small />
              <span>{result.error}</span>
              <button type="button" onClick={onRefresh} style={{ ...inlineButtonStyle, textDecoration: "underline" }}>
                Retry
              </button>
            </div>
          )}

          {result.status === "ok" && total === 0 && (
            <span style={{ opacity: 0.85 }}>
              No skills or custom agents yet. Run /build-cluster-map inside a session to generate some.
            </span>
          )}

          {result.status === "ok" &&
            groups.map((group) => <ArtifactKindGroup key={group.kind} group={group} nowMs={nowMs} />)}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm vitest run src/renderer/harness-artifacts-section.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify the tree is green and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add src/renderer/harness-artifacts-section.tsx src/renderer/harness-artifacts-section.test.tsx
git commit -m "feat: add workspace artifacts section and header chips"
```

---

### Task 8: Wire the page — header chips, drill-down, refresh

**Files:**
- Modify: `src/renderer/agentbridge-page.tsx` — imports (`:1-13`), new state and effects (after `:85`), header (`:166-180`), left column (`:249-251`)

**Interfaces:**
- Consumes: `HarnessArtifactsSection`, `HarnessInventoryChips` (Task 7); `loadHarnessInventory`, `shouldRefresh`, `summarizeInventory` (Task 6).
- Produces: nothing consumed by later tasks.

**Context you need:** This file has no unit test today (it is a stateful `observer` component and the test env has no DOM), so this task is verified by `pnpm type:check`, `pnpm lint:check` and a manual smoke test in Freelens. Keep all logic in the already-tested functions; this file only wires state to them.

The page already implements the stale-response guard this needs at `:32-71`: a `generation` ref bumped on every selection change plus a `currentRequest` ref compared inside the callback. Reuse the same pattern rather than inventing a second one.

Refresh triggers (spec §4.6): mount, provider switch, cluster switch, after a successful Reset (which calls `retryProvider`), `window` focus, `document` `visibilitychange` → visible, and the Refresh button. All coalesced by `shouldRefresh` except the explicit button, which always rescans.

- [ ] **Step 1: Add the imports**

In `src/renderer/agentbridge-page.tsx`, add after the `CapabilitiesSection` import (line 6):

```ts
import { HarnessArtifactsSection, HarnessInventoryChips } from "./harness-artifacts-section";
import { loadHarnessInventory, shouldRefresh, summarizeInventory } from "./harness-inventory";
```

and add to the type imports at the bottom of the import block:

```ts
import type { HarnessInventoryResult } from "../common/harness-artifacts";
```

- [ ] **Step 2: Add the inventory state and loader**

Insert after the `retryProvider` function (line 85):

```ts
  const [inventory, setInventory] = useState<HarnessInventoryResult | undefined>(undefined);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [artifactsExpanded, setArtifactsExpanded] = useState(false);
  const [scanNow, setScanNow] = useState(() => Date.now());
  const lastScanAt = useRef<number | undefined>(undefined);
  const inventoryGeneration = useRef(0);

  function refreshInventory(force = false) {
    if (!clusterId || !providerId || state.status !== "ready") return;

    const now = Date.now();

    if (!force && !shouldRefresh(lastScanAt.current, now)) return;

    const request = ++inventoryGeneration.current;
    setInventoryLoading(true);
    void loadHarnessInventory(
      clusterId,
      providerId,
      ipcRenderer.invoke,
      () =>
        inventoryGeneration.current === request &&
        currentRequest.current.clusterId === clusterId &&
        currentRequest.current.providerId === providerId,
    ).then((result) => {
      if (!result) return;
      lastScanAt.current = Date.now();
      setScanNow(lastScanAt.current);
      setInventory(result);
      setInventoryLoading(false);
    });
  }
```

`scanNow` is the `nowMs` passed to the view: relative ages are recomputed when a scan lands rather than on every render, so the rendered output is stable between scans.

- [ ] **Step 3: Add the refresh effects**

Insert immediately after the block from Step 2:

```ts
  // A fresh selection has no inventory yet; drop the previous cluster's numbers
  // rather than showing them against the new provider.
  useEffect(() => {
    inventoryGeneration.current++;
    lastScanAt.current = undefined;
    setInventory(undefined);
    setInventoryLoading(false);
    setArtifactsExpanded(false);
  }, [clusterId, providerId]);

  // Mount, provider/cluster switch, and after Reset (which bumps `retry`).
  useEffect(() => {
    refreshInventory(true);
  }, [clusterId, providerId, retry, state.status]);

  // The agent mutates these files in a terminal tab the extension does not
  // observe, so the panel is stale the moment /build-cluster-map finishes.
  // Coming back to the page is the cheapest reliable moment to rescan.
  useEffect(() => {
    const onFocus = () => refreshInventory();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshInventory();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clusterId, providerId, state.status]);
```

- [ ] **Step 4: Render the header chips**

In the `SubTitle` block, extend the `ready` branch (lines 167-171) to:

```tsx
            {hasCurrentSelection && state.status === "ready" && (
              <>
                <Renderer.Component.StatusBrick className="running" /> {provider?.name} v{state.version}
                {inventory?.status === "ok" && (
                  <HarnessInventoryChips
                    summary={summarizeInventory(inventory.groups, scanNow)}
                    onSelect={() => setArtifactsExpanded(true)}
                  />
                )}
              </>
            )}
```

- [ ] **Step 5: Render the drill-down above the editors**

In the `ready` branch of the left column, insert the section immediately before `{provider.editors.map(...)}` (line 249):

```tsx
              <HarnessArtifactsSection
                result={inventory}
                loading={inventoryLoading}
                expanded={artifactsExpanded}
                onToggle={() => setArtifactsExpanded((value) => !value)}
                onRefresh={() => refreshInventory(true)}
                nowMs={scanNow}
              />
```

- [ ] **Step 6: Verify types, lint and tests**

Run: `pnpm test && pnpm type:check && pnpm lint:check`
Expected: all PASS. If Biome reports the `useEffect` dependency arrays, do **not** add `refreshInventory` to them — it is recreated on every render, and the existing effects in this file follow the same convention.

- [ ] **Step 7: Manual smoke test in Freelens**

There is no E2E suite (TESTING.md), so verify by hand:

1. `pnpm build`, load the extension in Freelens, open a cluster, select Claude Code.
2. **Fresh workspace:** no chips in the header; the "Workspace artifacts" section shows `0`, collapsed, and expands to the empty state.
3. Open a session and run `/build-cluster-map`; wait for it to write skills.
4. Return to the extension page (this fires `focus`/`visibilitychange`). **Expect the chips to appear without pressing Refresh** — e.g. `● Claude Code v2.x · 21 skills · updated 4m ago`.
5. Click a chip → the section expands. Confirm the list is oldest-first and the seeded/generated badges are right.
6. Select Copilot CLI → expect `1 skill`, badged `seeded` (its `build-cluster-map` skill is registry-declared).
7. Press Reset → confirm the counts refresh.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/agentbridge-page.tsx
git commit -m "feat: show workspace artifact counts and drill-down on the page"
```

---

### Task 9: Documentation

**Files:**
- Create: `docs/features/harness-artifacts.md`
- Modify: `ARCHITECTURE.md` (Structure, Data Flow, Key Abstractions), `README.md`, `GOTCHAS.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing.

- [ ] **Step 1: Write the feature document**

Create `docs/features/harness-artifacts.md`, following the style of `docs/features/capability-registry.md`:

```markdown
# Workspace harness artifacts

The workspace artifact inventory answers one question without making the user
open the workspace directory: *what context does the agent actually have in this
cluster, and how fresh is it?* It reports how many skills and custom agents exist
in the selected provider's workspace and when each was last updated.

It is the retrospective counterpart to the [capability registry](capability-registry.md):
capabilities describe what **can** be run, the inventory describes what **exists**
on disk — including everything `/build-cluster-map` generated, which the
declared-file editors cannot see.

## Scope

- **Skills and custom agents only.** Commands, MCP servers, hooks and plugins are
  deliberately out of scope.
- **Workspace only.** Sessions launch with an inherited `HOME`, so the agent also
  loads the user's personal `~/.claude`. That is not counted, and the panel says
  so in one line rather than implying completeness.
- **Read-only.** Nothing in this feature creates, edits or deletes an artifact.

## How it works

- **`src/common/agentbridge-providers.ts`** — each provider declares
  `artifactSources`: per kind, a list of workspace-relative roots (highest
  precedence first) and a layout (`skill-dir` for `<root>/<name>/SKILL.md`,
  `markdown` for `<root>/<name>.md`). Adding a provider means adding registry
  entries, never touching the scanner.
- **`src/main/harness-artifacts.ts`** — `listProviderArtifacts` walks exactly
  those roots under `resolveVerifiedWorkdir`, one directory level per layout.
- **`src/main/read-frontmatter.ts`** — reads at most the first 4096 bytes of each
  artifact and extracts `name` and `description` with a line-oriented reader.
- **`src/renderer/harness-inventory.ts`** — React-free view logic: the IPC load
  function, refresh coalescing, relative ages, chip models.
- **`src/renderer/harness-artifacts-section.tsx`** — the header chips and the
  collapsible drill-down.

## Security posture

The inventory is a **narrower** capability than the declared-file editors, not a
loosening of them:

- `assertDeclaredPath` is untouched; content read/write still only reaches the
  three declared editors per provider.
- The scan root is always `resolveVerifiedWorkdir`; it is never caller-supplied.
- Symlinked entries are skipped, and anything whose real path resolves outside
  the workdir is skipped. `lstat` is used throughout so a symlink is not followed
  even for its mtime.
- No file body ever crosses the IPC boundary — only metadata plus the two
  frontmatter fields, with descriptions capped at 200 characters.
- Each kind is capped at 200 artifacts; beyond that the group is reported as
  `truncated` and the UI shows `200+`.

## Refresh

The agent mutates these files inside a terminal tab the extension does not
observe, so the panel refreshes on mount, provider switch, cluster switch, after
Reset, on window focus and on tab visibility, plus an explicit Refresh button.
Automatic refreshes are coalesced within 2 seconds; there is no `fs.watch`.

## Known limitations

- Counts are a point-in-time snapshot; a running session can make them stale
  between refreshes.
- Frontmatter parsing is line-oriented, not a YAML parser. Multi-line or
  block-quoted descriptions degrade to "no description" rather than rendering
  wrong.
- OpenCode's agent directory is declared in both the singular and plural
  spellings pending verification against an installed OpenCode.
```

- [ ] **Step 2: Update ARCHITECTURE.md**

Add to **Structure**, after the `src/main/get-provider-workdir.ts` entry:

```markdown
- `src/main/harness-artifacts.ts`, `read-frontmatter.ts`
  - Read-only inventory of workspace skills and custom agents; bounded frontmatter metadata extraction.
```

Add to **Structure**, after the `capability-hints.ts` entry:

```markdown
- `src/renderer/harness-inventory.ts`, `harness-artifacts-section.tsx`
  - Inventory view logic and the workspace artifacts panel.
```

Add to **Data Flow**, after the declared-file read/write line:

```markdown
- Renderer requests the workspace artifact inventory through IPC; main lists registry-declared artifact roots under the verified workdir and returns metadata only, never file contents.
```

Add to **Key Abstractions**:

```markdown
- `ArtifactSource`: registry entry declaring, per artifact kind, the workspace-relative roots scanned for the inventory and their directory layout.
- `HarnessArtifact` / `HarnessArtifactGroup`: normalized inventory record and its derived per-kind rollup (count, mtime range, truncation).
```

- [ ] **Step 3: Update README.md**

Add one line to the feature list describing the panel, matching the surrounding phrasing:

```markdown
- Workspace artifact inventory: how many skills and custom agents the selected cluster's workspace contains and when each changed.
```

- [ ] **Step 4: Append any gotcha discovered during implementation**

If OpenCode's agent directory spelling was verified, or anything else non-obvious surfaced, append one line to `GOTCHAS.md` in the existing format:

```markdown
- 2026-08-12: <one-line gotcha>. Fix: <one-line fix>
```

If nothing surfaced, skip this step — do not invent an entry.

- [ ] **Step 5: Verify and commit**

```bash
pnpm test && pnpm type:check && pnpm lint:check
git add docs/features/harness-artifacts.md ARCHITECTURE.md README.md GOTCHAS.md
git commit -m "docs: document the workspace harness artifact inventory"
```

---

## Deviations from the spec

Three spec statements did not survive contact with the codebase. Each is corrected in the tasks above; they are listed here so a reviewer comparing plan to spec sees them deliberately rather than as drift.

1. **Spec §5 asks for a section render smoke test "collapsed by default, expands".** Vitest runs in the `node` environment with no DOM and no React Testing Library, and `capabilities-section.test.tsx` only tests the *hook-free* `CapabilityHintCard`, never the stateful `CapabilitiesSection`. Expansion state therefore lives in `agentbridge-page.tsx` and the whole section file is hook-free and directly invocable (Task 7). Expansion behaviour is covered by the `expanded` prop test plus the manual smoke test.

2. **Spec §4.5 puts the fetch hook in `use-harness-inventory.ts`.** A hook cannot be unit-tested in this environment. The logic moved into pure functions in `harness-inventory.ts` (`loadHarnessInventory`, `shouldRefresh`), mirroring how `provider-selection.ts` already factors the provider load flow, and the remaining wiring lives inline in the page. No separate hook file.

3. **Spec §4.3 step 1 and §4.7 disagree slightly about errors.** `resolveVerifiedWorkdir` *throws* `ENOENT` for an unprepared workspace, and `getAgentBridgeProvider` throws for an unknown provider id. Task 4 resolves this explicitly: the provider lookup sits outside the try/catch so it propagates (project convention for invalid programmer input), `ENOENT` maps to an `ok` result with zero counts, and everything else becomes `{ status: "error", error }`.

Two additions the spec did not anticipate, both forced by existing tests:

- `src/common/agentbridge-providers.test.ts` asserts the entire registry with `toEqual`, so Task 2 must update that literal.
- `src/main/index.test.ts` mocks every module `index.ts` imports, so Task 5 must add `./harness-artifacts` to the mocks or the real scanner is pulled into that test.

## Spec coverage

| Spec section | Task |
| --- | --- |
| §4.1 Data model | 1 |
| §4.2 Registry `artifactSources` | 2 |
| §4.3 Scanner (containment, symlinks, caps, dedup, ordering, origin) | 3, 4 |
| §4.4 IPC channel | 5 |
| §4.5 Renderer view logic, header chips, drill-down | 6, 7, 8 |
| §4.6 Refresh triggers and coalescing | 6 (`shouldRefresh`), 8 (effects) |
| §4.7 Failure modes | 4 (scanner cases), 7 (error/empty/truncated states) |
| §5 Testing | every task; manual smoke in 8 |
| §6 Documentation | 9 |
| §8 Known limitations | 9 (feature doc) |
