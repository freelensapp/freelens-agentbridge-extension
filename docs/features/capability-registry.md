# Capability registry

The capability registry is the data-driven list of capabilities the extension
advertises to the user — bundled commands, preloaded skills, custom agents, and
so on. Each capability is a plain data object; the page's workspace explorer
renders every entry as one generic item, so adding a capability means
appending one object, not writing a new component.

The extension never runs these capabilities itself. Each hint explains what the
capability produces and shows exactly how to invoke it inside a session for the
selected provider.

## How it works

- **`src/renderer/capability-hints.ts`** — data and types only. Exports the
  `capabilityHints` array plus helpers (`applicableCapabilityHints`,
  `iconForHint`, `defaultIconForKind`).
- **`src/renderer/page-model.ts`** — `capabilityProgress(hint, inventory)`
  says whether a capability has already run in this workspace, from the
  artifact its `findEvidence` names.
- **`src/renderer/workspace-explorer.tsx`** — lists each applicable hint under
  **Capabilities**, with its progress ("Built 4m ago", "Not built yet").
  Selected, the pane shows the description, the invocation with a copy button,
  and the seeded files of the hint's `editorRole` in the editor.

### Applicability

`getInvocation(providerId)` is the single applicability gate. Returning a
non-null `CapabilityInvocation` means "this capability applies to that provider
and here is how to invoke it"; returning `null` hides the hint for that provider.
There is no separate `appliesTo` flag to keep in sync.

### Progress

A hint may declare `findEvidence(artifacts)`, which picks the artifact whose
presence proves the capability has run. The item then reads **Built 4m ago**
in green, or **Not built yet** in amber. Without
`findEvidence`, or before the first successful inventory scan, the item stays
neutral and claims neither. The cluster map uses the cluster-level skill:
every provider's scaffold names it `cluster-map-<cluster>`.

## Adding a capability

Append one object to `capabilityHints` in `capability-hints.ts`:

```ts
const namespaceDocHint: CapabilityHint = {
  id: "namespace-doc",
  kind: "skill",
  // icon is optional; defaults per kind (command → terminal, skill → school, agent → smart_toy)
  title: "Document a namespace",
  description: "Explores a namespace and writes a durable report.",
  getInvocation(providerId) {
    if (providerId === "copilot") {
      return { verb: "Ask Copilot", command: "Use the namespace-doc skill" };
    }
    if (providerId === "codex") {
      return { verb: "Run", command: "$namespace-doc" };
    }
    return { verb: "Run", command: "/namespace-doc" };
  },
  // Optional: the declared editors holding the capability's seeded file.
  // editorRole: "command",
  // Optional: the artifact that proves the capability has run.
  findEvidence: (artifacts) => artifacts.find((artifact) => artifact.name.startsWith("namespace-doc-")),
};

export const capabilityHints: readonly CapabilityHint[] = [clusterMapHint, namespaceDocHint];
```

Guidelines:

- Pick the `kind` that matches how the provider exposes the capability; it drives
  the default icon.
- Return `null` from `getInvocation` for any provider that does not support the
  capability — that is how the item hides itself.
- Vary the invocation per provider when they differ, and treat the fall-through
  as a claim you have to defend: Claude Code, OpenCode and Pi have project-local
  slash commands. Copilot CLI invokes skills by natural language, and Codex CLI
  mentions them with `$<name>` — its `~/.codex/prompts/` are global-only and
  deprecated, so a hint that falls through to `/namespace-doc` tells a Codex user
  to type a command their CLI does not have. Pi earns the fall-through: a
  `.pi/prompts/<name>.md` file is a real `/<name>` command, with `description`
  and `argument-hint` frontmatter and `$1` / `$@` / `${1:-default}` argument
  substitution, so it needs no branch of its own.
- No view changes are needed — the generic item handles rendering.

## Tests

Registry logic is covered in `src/renderer/capability-hints.test.ts`, and
progress in `src/renderer/page-model.test.ts`. When adding a capability,
assert its `getInvocation` for the relevant providers and what `findEvidence`
accepts and rejects.
