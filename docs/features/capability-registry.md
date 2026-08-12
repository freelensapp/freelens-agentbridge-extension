# Capability registry

The capability registry is the data-driven list of capabilities the extension
advertises to the user — bundled commands, preloaded skills, custom agents, and
so on. Each capability is a plain data object; a single generic card renders
every entry uniformly, so adding a capability means appending one object, not
writing a new component.

The extension never runs these capabilities itself. Each hint explains what the
capability produces and shows exactly how to invoke it inside a session for the
selected provider.

## How it works

- **`src/renderer/capability-hints.ts`** — data and types only. Exports the
  `capabilityHints` array plus helpers (`applicableCapabilityHints`,
  `groupApplicableCapabilityHints`, `iconForHint`).
- **`src/renderer/capabilities-section.tsx`** — the view. `CapabilityHintCard`
  renders one hint (icon + title + kind badge + description + invocation +
  optional footnote), and `CapabilitiesSection` renders every applicable hint
  grouped by kind in a collapsible, intrinsically responsive grid.
- **`src/renderer/agentbridge-page.tsx`** — mounts `<CapabilitiesSection>` in the
  right-hand rail when a provider is ready.

### Applicability

`getInvocation(providerId)` is the single applicability gate. Returning a
non-null `CapabilityInvocation` means "this capability applies to that provider
and here is how to invoke it"; returning `null` hides the hint for that provider.
There is no separate `appliesTo` flag to keep in sync.

### Grouping and layout

Hints are grouped by `kind` (`command` / `skill` / `agent`) in
`CAPABILITY_KIND_ORDER`. Empty groups are skipped. Cards flow in a CSS grid
(`repeat(auto-fill, minmax(280px, 1fr))`) that reflows from one column in a
narrow rail to several columns when wide — no media queries, because the renderer
uses inline styles only.

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
    return { verb: "Run", command: "/namespace-doc" };
  },
  // footnote is optional — only for capabilities also seeded as an editable file
};

export const capabilityHints: readonly CapabilityHint[] = [clusterMapHint, namespaceDocHint];
```

Guidelines:

- Pick the `kind` that matches how the provider exposes the capability; it drives
  the group, badge, and default icon.
- Return `null` from `getInvocation` for any provider that does not support the
  capability — that is how the card self-hides.
- Vary the invocation per provider when they differ (e.g. Copilot CLI invokes
  skills by natural language, while Claude Code / OpenCode use slash commands).
- No view changes are needed — the generic card handles rendering.

## Tests

Registry logic and card behaviour are covered in
`src/renderer/capability-hints.test.ts`. When adding a capability, assert its
`getInvocation` for the relevant providers and that it appears in the correct
group.
