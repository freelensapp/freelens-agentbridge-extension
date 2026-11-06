---
name: AgentBridge
description: The Freelens Agent Bridge cluster page, a workspace explorer under a bridge from the cluster on screen to an agent session, drawn in the Freelens host world.
colors:
  teal-primary: "#00a7a0"
  ground: "#1e2124"
  surface: "#262b2f"
  text-accent: "#ffffff"
  text-secondary: "#a0a0a0"
  text-tertiary: "#909ba6"
  border: "#4c5053"
  border-faint: "#373a3e"
  half-gray: "#87909c80"
  ok-green: "#4caf50"
  warning-amber: "#ff9800"
  error-red: "#ce3933"
  soft-error-red: "#e85555"
  on-fill: "#ffffff"
typography:
  headline:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.2
  title-md:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.3
  launch:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  body:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "Lucida Console, Monaco, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
  kbd:
    fontFamily: "Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  sm: "2px"
  host: "3px"
  full: "50%"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter-narrow: "20px"
  gutter: "32px"
components:
  button-launch:
    backgroundColor: "{colors.teal-primary}"
    textColor: "{colors.on-fill}"
    typography: "{typography.launch}"
    rounded: "{rounded.host}"
    padding: "11px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-accent}"
    typography: "{typography.body-small}"
    rounded: "{rounded.host}"
    padding: "7px 12px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.soft-error-red}"
    typography: "{typography.body-small}"
    rounded: "{rounded.host}"
    padding: "7px 12px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.host}"
    size: "28px"
  bridge-strip:
    backgroundColor: "{colors.surface}"
    padding: "20px 32px"
  workspace-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.host}"
    size: "40px"
  workspace-icon-live:
    backgroundColor: "transparent"
    textColor: "{colors.teal-primary}"
    rounded: "{rounded.host}"
    size: "40px"
  provider-switcher:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.host}"
    padding: "3px"
  provider-option:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  provider-option-selected:
    backgroundColor: "color-mix(in srgb, #00a7a0 16%, transparent)"
    textColor: "{colors.text-accent}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  session-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.host}"
    padding: "14px 16px"
  session-mark:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-accent}"
    rounded: "{rounded.host}"
    size: "44px"
  status-dot-ready:
    backgroundColor: "{colors.ok-green}"
    rounded: "{rounded.full}"
    size: "8px"
  status-dot-error:
    backgroundColor: "{colors.soft-error-red}"
    rounded: "{rounded.full}"
    size: "8px"
  status-dot-loading:
    backgroundColor: "{colors.teal-primary}"
    rounded: "{rounded.full}"
    size: "8px"
  explorer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.host}"
  explorer-list:
    backgroundColor: "{colors.ground}"
    padding: "10px 8px 0"
    width: "272px"
  nav-label:
    textColor: "{colors.text-tertiary}"
    typography: "{typography.label}"
    padding: "8px 8px 4px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.host}"
    padding: "6px 8px"
  nav-item-selected:
    backgroundColor: "color-mix(in srgb, #00a7a0 14%, transparent)"
    textColor: "{colors.text-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.host}"
    padding: "6px 8px"
  nav-footer:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-tertiary}"
    typography: "{typography.label}"
    padding: "8px 4px 8px 8px"
  nav-alert:
    backgroundColor: "color-mix(in srgb, #ce3933 12%, transparent)"
    textColor: "{colors.text-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.host}"
    padding: "8px 10px"
  skeleton:
    backgroundColor: "color-mix(in srgb, #87909c80 18%, transparent)"
    rounded: "{rounded.host}"
    height: "28px"
  pane:
    backgroundColor: "{colors.surface}"
    padding: "18px 20px 20px"
  pane-icon:
    backgroundColor: "color-mix(in srgb, #00a7a0 14%, transparent)"
    textColor: "{colors.teal-primary}"
    rounded: "{rounded.host}"
    size: "32px"
  file-bar:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-accent}"
    typography: "{typography.mono}"
    padding: "0 0 0 12px"
    height: "34px"
  callout:
    backgroundColor: "color-mix(in srgb, #87909c80 14%, transparent)"
    typography: "{typography.body-small}"
    rounded: "{rounded.host}"
    padding: "10px 12px"
  blocked-panel:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.host}"
    padding: "40px 24px"
  blocked-mark:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.full}"
    size: "64px"
  intro:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.host}"
    padding: "24px 28px"
  code-inline:
    backgroundColor: "color-mix(in srgb, #87909c80 45%, transparent)"
    textColor: "{colors.text-accent}"
    rounded: "{rounded.host}"
    padding: "1px 6px"
  kbd:
    backgroundColor: "transparent"
    textColor: "{colors.text-accent}"
    typography: "{typography.kbd}"
    rounded: "{rounded.host}"
    padding: "0 5px"
---

# Design System: AgentBridge

Scope: the "Freelens Agent Bridge" cluster page (`src/renderer/agentbridge-page.tsx` with `bridge-header.tsx`, `workspace-explorer.tsx`, `provider-file-editor.tsx` and `provider-marks.tsx`, one stylesheet: `src/renderer/agentbridge-page.module.scss`) and the extension's preferences entry (`src/renderer/settings-page.tsx`, host components plus `src/renderer/settings-page.module.scss` for its block and hint code).

## Overview

**Creative North Star: "A Workspace Explorer Under a Bridge"**

The page is the bridge from this cluster to an agent, and below it the workspace that agent works in. A strip at the top names the three ends (cluster, provider, workspace) joined by dashed wires that fill teal as the provider answers and the workspace exists. Under it, a session bar shows the provider's state and holds the one launch button. The rest of the window is an explorer: a list of what the workspace holds on a ground-coloured column, and the selected item in a pane beside it, a file in a full-height editor. Nothing here is a settings form of always-open editors: one item is open at a time and gets the whole height.

The world is Freelens' own. Every colour, font, radius and component comes from the host, so the page follows the dark and light themes and reads as a native Freelens page, like the host's own two-pane detail views. The density is that of a host details panel: 13px status lines, 28px controls, 3px corners, flat surfaces separated by faint borders. Provider marks, drawn in `currentColor`, are the only imagery.

**Key Characteristics:**

- Host CSS variables only; the page writes no literal colour.
- Teal marks selection and connection, green done, amber an optional next step, red blocked.
- Dashed means "not connected yet"; solid teal means connected.
- One primary action per page: Open session, in the session bar.
- Two panes: the list on the ground, the pane on the surface; selecting an item swaps the pane in place.
- Flat: nothing casts a shadow; every box-shadow is an inset stroke.

## Colors

The palette is the Freelens host theme, consumed through its CSS variables; teal is the only accent, and the status colours carry the provider's and the capabilities' states.

Frontmatter values are the host dark theme (the default). The light column is the host light theme. Never write either hex in code: use the variable.

| Token | Host variable | Light theme | Role |
| --- | --- | --- | --- |
| teal-primary | `--primary` | same | Live wires, live workspace icon, selected option and its mark, selected nav item tint and icon, pane icon tile, launch button, checking status dot, links, focus ring |
| ground | `--mainBackground` | `#f1f1f1` | Page ground, switcher well, session mark tile, explorer list and its footer, file bar |
| surface | `--contentColor` | `#ffffff` | Bridge strip, session bar, explorer pane, intro, blocked mark disc |
| text-accent | `--textColorAccent` | `#222222` | Names and titles, selected and hovered items, file path, workspace path, fact values, inline code, kbd, `strong` |
| text-secondary | `--textColorSecondary` | `#51575d` | Body text, unselected options and nav items, blocked panel text |
| text-tertiary | `--textColorTertiary` | `#555555` | Captions, version, status line, nav labels and details, counts, footer, pane lede, fact terms, placeholders, icon buttons, unselected marks and nav icons |
| border | `--borderColor` | `#c9cfd3` | Wire dashes, switcher well, secondary button ring, dashed workspace icon, dashed blocked panel, kbd |
| border-faint | `--borderFaintColor` | `#dfdfdf` | Strip rule, session bar, explorer frame, list divider, footer rule, launch column rule, file panel and bar rule |
| half-gray | `--halfGray` | same | Base of every grey wash (hover, code, callout, skeleton) |
| ok-green | `--colorOk` | `#399c3d` | Ready status dot; as text ("Built", Saved, session started, copied check) always the 60% mix below |
| warning-amber | `--colorWarning` | same | "Not built yet", always as the 50% mix below |
| error-red | `--colorError` | same | Session bar border when blocked, scan error wash |
| soft-error-red | `--colorSoftError` | same | Missing status ring, error status dot, error text, danger button text, Not saved |
| on-fill | none (host) | same | White label the host primary `Button` draws on teal; the page never writes it |

### Mixes

Washes and tints are `color-mix(in srgb, …)` of host variables, so they follow the theme.

| Use | Recipe |
| --- | --- |
| Text selection | `--primary` 35% over transparent, text `--textColorAccent` |
| Selected provider option | `--primary` 16% over transparent |
| Selected nav item, pane icon tile | `--primary` 14% over transparent |
| Live workspace icon border | `--primary` 60% over transparent |
| Inline code background | `--halfGray` 45% over transparent |
| Preferences hint code background | `--halfGray` 30% over transparent |
| Icon button hover | `--halfGray` 25% over transparent |
| Option hover | `--halfGray` 22% over transparent |
| Nav item hover, skeleton bar | `--halfGray` 18% over transparent |
| Callout background | `--halfGray` 14% over transparent |
| Session bar border, blocked | `--colorError` 50% with `--borderFaintColor` |
| Scan error alert | `--colorError` 12% over transparent |
| Warning text (`$warn-text`: `warn`, todo detail) | `--colorWarning` 50% with `--textColorAccent` |
| Success text (`$ok-text`: `ok`, done detail, Saved, started, copied) | `--colorOk` 60% with `--textColorAccent` |
| Error text (`$error-text`: `error`, danger button, save error) | `--colorSoftError` 70% with `--textColorAccent` |

**The Host Variables Only Rule.** Every colour is a host variable or a mix of host variables. The page writes no literal colour; the white on the launch button is the host `Button`'s own.

**The Teal Means Connected Rule.** Teal marks what is connected, selected or actionable (live wires, the selected option and nav item, the launch button, focus). It is never decoration.

**The Amber Is Optional Rule.** Amber marks an optional next step, never a failure. Failure is red and is called blocked. Status colours used as text are always mixed with the accent text colour (amber 50%, green 60%, red 70%), because the raw host colours fail AA as text on the light theme's white surfaces; the mix darkens them on light and lightens them on dark. Dots and fills keep the raw colours.

## Typography

- **Body Font:** Roboto, through the host `--font-main` (with Helvetica, Arial, sans-serif)
- **Label/Mono Font:** the host `--font-monospace` (Lucida Console, Monaco, Consolas, monospace)

**Character:** The host pairing, unchanged. Roboto carries every label and sentence; mono marks anything the user could type or find on disk.

### Hierarchy

- **Headline** (500, 20px, 1.2): cluster name in the bridge strip, blocked panel heading, intro heading. The cluster name truncates with an ellipsis; the full name is in `title`.
- **Title** (500, 17px, 1.3): provider name in the session bar, pane title. The pane title wraps anywhere, since skill names can be long.
- **Launch** (500, 15px): the Open session label only.
- **Body** (400, 14px = host `--font-size`, 1.45): page text, nav item titles (line height 1.3), switcher options (1.2); ledes cap at 70ch, blocked text at 62ch.
- **Body small** (400, 13px): status line, pane lede (80ch), callouts, facts, the capability invocation line, secondary buttons, workspace placeholder, file errors.
- **Label** (400, 12px): nav labels (500), nav details, footer, scan error, launch status line, file save status. Strip captions use the host `--font-size-small`.
- **Mono** (12.5px): workspace path, provider version, file path in the file bar. Inline `code` is 0.92em of its context.
- **Kbd** (11px, 16px line height, Roboto): the shortcut chip.

Counts use `font-variant-numeric: tabular-nums`. Monaco runs at 13px with a 20px line height.

**The Two Weights Rule.** Only the host weights: `--font-weight-normal` (400) and `--font-weight-bold` (500). Names, titles, nav labels and the launch label take 500; the version beside the provider name and counts beside nav labels drop back to 400.

**The Mono Means Literal Rule.** Paths, file names, versions, executables and commands are mono; prose about them is not.

## Layout

The page is an `inline-size` container named `agentbridge-page`, a flex column that fills the cluster frame (`height: 100%`) above the host terminal dock and scrolls itself (`overflow-y: auto`). All width rules are container queries on it, never viewport media queries. The explorer takes whatever height the strip and the session bar leave, so the editor is as tall as the window allows; below a usable height (480px for the explorer) the page scrolls instead of crushing it.

- **Bridge strip:** a three-area grid, `left providers right`, columns `minmax(0, 1fr) max-content minmax(0, 1.3fr)`, column gap 16px, row gap 14px, padding 20px 32px on the left and `max(32px, calc(100% - 1440px + 32px))` on the right, so its right edge lines up with the body's 1440px cap. The right side holds the longer content (the workspace path), so it gets the larger share; fixed shares keep the switcher still when the provider or the path changes. Each side is a flex row (16px gap): the cluster then wire A on the left, wire B then the workspace on the right. The wires take the slack inside each side (`flex: 1 1 24px`, 24px minimum).
- **Body:** a flex column, gap 16px, padding 20px 32px 24px, `max-width: 1440px`, growing to fill the page (`flex: 1 0 auto`).
- **Session bar:** a grid, columns `auto minmax(0, 1fr) auto auto`, areas `mark text actions launch`, column gap 16px, row gap 12px, items centred.
- **Explorer:** `flex: 1 0 480px`, a grid of `272px minmax(0, 1fr)`: the list, then the pane. The list and the pane each scroll on their own.
- **Pane:** a flex column, gap 14px, padding 18px 20px 20px. A file panel in it takes the rest of the height (`flex: 1 0 300px`; the editor at least 260px).
- **Blocked panel:** replaces the explorer, at least 320px tall, content centred.

### Breakpoints

| Container width | Change |
| --- | --- |
| ≤ 1060px | Strip becomes two rows, `left right` then `providers providers`; the right side justifies to the end. Both wires hide, since without the switcher between them they would skip the provider. The switcher starts the second row and scrolls horizontally if it overflows. Session bar becomes `mark text launch` over `actions actions actions`, actions justified to the start. |
| ≤ 900px | The list narrows to 216px; the pane padding drops to 14px 16px 16px. The editor stays beside the list. |
| ≤ 600px | Explorer stacks: one column, the list in a 240px row over the pane (at least 460px), a faint rule between them instead of beside; it stops stretching to the window. |
| ≤ 700px | Strip stacks `left`, `right`, `providers` in one column, padding 16px 20px; the right side justifies to the start. Body padding 16px 20px 20px. Session bar becomes one column of `mark text`, then `launch`, then `actions`; the launch column aligns to the start and drops its left rule and padding. |

Spacing steps come from the frontmatter scale; 10px and 14px also recur as inner paddings and gaps (list top, callout, nav icon gap, session bar, pane gap).

## Elevation & Depth

The page is flat. Depth is tonal: surface (`--contentColor`) strip, session bar and pane on the ground (`--mainBackground`), separated by 1px faint borders; the explorer list sits back on the ground colour inside the surface frame. Box-shadows are used only as inset strokes, never as elevation.

### Shadow Vocabulary

- **Selected underline** (`inset 0 -2px 0 var(--primary)`): selected provider option.
- **Button ring** (`inset 0 0 0 1px var(--borderColor)`, hover `--textColorTertiary`, focus 2px `--primary`): secondary and danger buttons.
- **Hollow dot** (`inset 0 0 0 1.5px var(--colorSoftError)`): status dot of a missing CLI.

**The Nothing Lifts Rule.** No element casts a shadow. Every box-shadow on the page is an inset stroke.

## Shapes

One small, quiet corner, the host's, and circles reserved for state and identity.

| Shape | Value | Used by |
| --- | --- | --- |
| Inner corner | 2px | Provider options (nested in the 3px switcher well), link buttons |
| Host corner | 3px (`--border-radius`) | Switcher, workspace icon, session bar, session mark tile, explorer, nav items, scan error, skeleton bars, pane icon tile, callouts, file panel, blocked panel, intro, icon buttons, host buttons, inline code, preferences hint code, kbd |
| Circle | 50% | Status dot (8px), save status dot (6px), blocked mark disc (64px) |

Borders are 1px; kbd has a 2px bottom border.

**The Dashed Means Not Yet Rule.** Dashed lines mean "not connected yet": the grey wire (6px dash, 5px gap), the workspace icon before the workspace exists, and the blocked panel that stands where the workspace would be. Wire and icon turn solid once connected.

## Components

### Bridge strip (signature)

The strip names the product's one idea: this cluster, this agent, this workspace.

- **Cluster node:** host `Avatar` at 40px with the same colour seed and icon as the host sidebar; headline name (`h1`); caption "Cluster", or "Cluster · context {name}" when the kubeconfig context differs. No cluster: a `??` avatar on `--halfGray` and "No cluster".
- **Wires:** 2px tall, a repeating dash of `--borderColor`. When live, a teal fill scales in from the left (`scaleX` 0 to 1, 600ms, ease-out curve). Wire A, after the cluster, goes live when the selected provider's CLI is ready; wire B, before the workspace, when the workspace exists, 150ms after wire A. Both hide at 1060px and below.
- **Workspace node:** a 40px icon box with the host 3px corner, dashed `--borderColor` and tertiary `folder_open` glyph; live, it turns solid with a 60% teal border and teal glyph (300ms). Beside it, the shortened path in accent mono 12.5px (`…/90ec70ff…/opencode`) with a copy button; the full path is in its `title`. Before that, a placeholder: "Pick a provider" or "Not created yet" at 13px in tertiary, not mono, since it is prose. The caption "Workspace for this cluster" sits under either.

### Provider switcher

A segmented radio group, one line inside the strip, each option a provider mark beside its name.

- **Well:** `fieldset` with a visually hidden legend ("Provider for this cluster"), 1px `--borderColor`, host 3px corner, ground background, 3px padding. Disabled (no cluster): every option at 50% opacity.
- **Option:** 7px 10px padding, 2px corner, 7px gap, secondary text, a 16px mark in tertiary. Hover: 22% half-gray wash and accent text. Selected: 16% teal wash, accent text, teal mark, 2px teal underline. Focus: 2px teal outline, 1px offset.
- **Names:** Copilot and Codex show "Copilot CLI" and "Codex CLI"; the full name is in the tooltip and the accessible name. The switcher shows no install state: only the selected provider is probed, and the session bar reports it.

### Provider marks

Monochrome 24×24 marks of the five CLIs (`provider-marks.tsx`), filled in `currentColor` with even-odd rules, so they follow the theme and the selected state. They are always decorative (`aria-hidden`): the provider's name sits beside every mark. Sizes: 16px in the switcher, 22px in the session mark tile, 36px in the blocked mark disc.

| Provider | Source |
| --- | --- |
| OpenCode | `@lobehub/icons-static-svg` 1.102.0 (MIT), `opencode.svg` |
| Claude Code | `@lobehub/icons-static-svg` 1.102.0 (MIT), `claudecode.svg` |
| GitHub Copilot CLI | `simple-icons` 16.36.0, `githubcopilot.svg`, from GitHub Primer `copilot-24` (MIT) |
| OpenAI Codex CLI | `@lobehub/icons-static-svg` 1.102.0 (MIT), `codex.svg` |
| Pi | `@lobehub/icons-static-svg` 1.102.0 (MIT), `pi.svg` (the pi.dev favicon mark) |

The trademarks belong to their owners and are used only to name the CLI. A new provider brings its mark with a source noted beside it in `provider-marks.tsx`; a provider without one shows no mark, never a stand-in.

### Session bar

The provider's state and the page's one primary action, in a surface card under the strip.

- **Frame:** 1px `--borderFaintColor`, host 3px corner, surface, padding 14px 16px. When the CLI is missing or did not answer, the border becomes the 50% error mix.
- **Mark tile:** 44px, host 3px corner, ground background, the provider mark at 22px in accent.
- **Name:** title style, with the version beside it once ready (mono 12.5px, 400, tertiary, baseline-aligned, 8px gap).
- **Status line (13px, tertiary, 6px gap, wraps):** an 8px status dot, then one phrase.

| Status | Dot | Line |
| --- | --- | --- |
| loading | Teal, pulsing (opacity to 0.35, 1.1s) | Checking · running `{executable}` `{args}` |
| ready | Green | Ready · found `{executable}` on your PATH, then a 24px "Check {provider} again" icon button |
| missing | Hollow soft-red ring | Not installed · no `{executable}` on the PATH Freelens sees |
| error | Soft red | Did not answer its version check |

- **Actions (8px gap, wrapping, end-justified):** ready: Reveal, Open in editor, Reset… (danger). Missing: Installation guide (opens the provider's docs), Check again. Error: Check again. Loading: none.
- **Launch column:** a column, end-aligned, 4px gap, set off by 16px left padding and a 1px faint left rule. The host primary `Button` with a `terminal` glyph, "Open {provider} session", padding 11px 18px, 10px gap, 15px at 500; disabled until ready and while opening, with the host `waiting` animation while opening. Under it, one 12px status line (min height 18px) whose text changes in place: "or press" and the shortcut chip (Ctrl Enter, ⌘ Enter on macOS), then "Starting {executable} in a terminal tab below…", then the green "Started {age}. Closing its tab ends it." with a check that rises in (300ms). Empty until ready.

### Workspace explorer (signature)

Everything the agent reads, may do and has learned, one click from a full-height editor. It appears once the CLI is ready; it opens on the instructions file, and a new provider or cluster starts there again.

- **Frame:** 1px `--borderFaintColor`, host 3px corner, surface, clipped.
- **List:** 272px, ground background, a faint right rule, padding 10px 8px 0, 4px between groups, scrolls on its own. A `nav` labelled "{provider} workspace".
- **Groups, in order:** Configuration (Instructions, Guardrails, and Settings where a provider keeps settings beside a separate permission file, as Pi does; each with its file name), Capabilities (today "Build a cluster map", detail "Built {age}" in green or "Not built yet" in the amber mix, nothing before a scan), then Skills and Agents from the scan, newest first, with ages as details. With no skills or agents, one "Skills and agents" group says "None yet. Building the cluster map adds one skill per namespace." A truncated group says "Showing the first {n}; the workspace holds more."
- **Group label:** 12px at 500, tertiary, padding 8px 8px 4px, a tabular count at 400 on the right, only for scanned groups that have items.
- **Nav item:** a native button, 10px gap, padding 6px 8px, host 3px corner, secondary text, a small tertiary glyph (`description`, `shield`, `tune`, the capability's icon, `school` for a skill, `smart_toy` for an agent), a title (ellipsis) over a 12px tertiary detail (ellipsis); items are 1px apart. Hover: 18% half-gray wash and accent text (120ms). Selected (`aria-current="true"`): 14% teal tint, accent text and a teal glyph; no edge bar.
- **Footer:** sticky to the list bottom, faint top rule, ground background, padding 8px 4px 8px 8px, 12px tertiary: "Lists this workspace only, not your home directory." (or "Scanning the workspace…") and a Rescan icon button, disabled while scanning.
- **Scan error:** a `role="alert"` block in the list, 12% red wash, accent 12px text, host 3px corner, padding 8px 10px, with a "Try again" link button.
- **Loading:** while the CLI is checked, the explorer frame shows three 28px skeleton bars in the list (18% half-gray, host corner, pulsing to 0.35 over 1.4s) and an empty pane; the frame is `aria-busy`.

### Pane

The selected item, swapped in place.

- **Head:** 12px gap; a 32px icon tile (host 3px corner, 14% teal tint, teal glyph); the title (title style) over a 13px tertiary lede (80ch, 2px above).
- **File (Instructions, Guardrails, Settings):** head and the file editor panel. Guardrails add a callout naming the kubeconfig and Kubernetes RBAC as what decides. Settings make no safety claim: their lede names the tools and session options and that Reset puts back the bundled version.
- **Capability:** head with the description as lede; an invocation line (13px, 8px gap, wrapping): green "Built: `{skill}` updated {age}. Run again to refresh:" or amber "Not built yet." then "{verb} in a session:", the command in code and a copy button; then the editor panels of the files the capability seeds.
- **Skill or agent:** head with its description (or "This skill has no description."); a `dl` of facts (Kind, Origin, Updated, Path), a grid of `max-content minmax(0, 1fr)`, gaps 8px 24px, 13px, terms tertiary, values accent, the path in code that wraps anywhere with a copy button; then a callout that AgentBridge lists skills and agents without opening them, with an "Open in editor" link button.
- **Nothing selected:** centred tertiary text, "Select an item to see it here." or "This item is no longer in the workspace."

### File editor panel

- **Frame:** 1px faint border, host 3px corner, clipped, a column that takes the rest of the pane.
- **Bar:** 34px min height, ground background, padding-left 12px, faint bottom rule. The file path in accent mono 12.5px, truncated with the full path in `title`.
- **Save status:** right-aligned, 12px, tertiary: "Autosaves as you type", "Saving…", "Saved" (green, back to idle after 1s), "Not saved" (soft red); a 6px dot in `currentColor` leads the last three. Writes debounce 500ms and flush on switch.
- **Editor:** host Monaco with the active host theme, filling the frame (at least 260px), 10px padding top and bottom, no minimap, no overview ruler, word wrap on. Before the file is read, centred tertiary "Opening {file}…"; a read error replaces it with a `role="alert"` message, never an editable empty file. A save error adds a 13px red line ("Not saved: …", `role="alert"`) under the editor, over a faint rule.

### Blocked panel

Stands where the explorer would be when the CLI is missing or did not answer, labelled by its heading.

- **Frame:** dashed 1px `--borderColor`, host 3px corner, no fill, at least 320px tall, padding 40px 24px, content centred in a column, 10px gap.
- **Mark:** a 64px disc of surface colour with the provider mark at 36px in tertiary, 6px above the heading.
- **Text:** headline "{provider} is not installed" or "{provider} did not answer", then body text (62ch): where AgentBridge looks and that it never installs CLIs; or the probe error in soft red, plus a hint about Version probe timeout in Preferences when the probe timed out.

### Buttons

| Variant | Built from | Look | States |
| --- | --- | --- | --- |
| Launch | Host `Button primary` | Teal fill, host white text, 11px 18px, 15px 500, 10px glyph gap | Host hover and active; disabled 50%; host `waiting` |
| Secondary | Host `Button outlined` | 1px `--borderColor` inset ring, accent text, 7px 12px, 13px, optional 6px-gap glyph | Hover ring `--textColorTertiary`; focus 2px teal inset ring |
| Danger | Secondary | Same ring, `--colorSoftError` text | Same as secondary; only Reset… |
| Icon | Native `button` | 28px square (24px in the status line), host 3px corner, tertiary glyph, needs `aria-label` and `title` | Hover 25% half-gray wash and accent glyph; disabled 50%; done (copied) green |
| Link | Native `button` | Teal underlined text, 3px offset, 2px corner | Focus ring; Try again, Open in editor |

The host outlined button draws no border, so the page adds the inset ring; it keeps the host's own states otherwise.

### Callouts

A block with the host 3px corner on a 14% half-gray wash, padding 10px 12px, 10px gap, 13px text with a leading small `info_outline` glyph; `strong` in accent text. No coloured borders or status fills. Used for the guardrails note and the skill and agent note.

### Inline code and kbd

- **Code:** mono at 0.92em, padding 1px 6px, host 3px corner, 45% half-gray wash, accent text, no wrap (a fact path wraps anywhere).
- **Kbd:** Roboto 11px on a 16px line, padding 0 5px, 1px `--borderColor` with a 2px bottom edge, 3px corner, accent text.

### Intro (no provider yet)

A surface card (1px faint border, host 3px corner, padding 24px 28px, max 760px) with a 20px heading, "Choose a provider for {cluster}", a line under it, and three points (16px apart), each led by a 32px host-corner tile with a 14% teal wash and a teal icon (folder, terminal, shield): they are facts, not steps, so they carry no numbers. With no cluster open, the body holds one line instead: "Open a cluster first: every session runs against the cluster on screen."

### Preferences entry

Host components plus a small stylesheet (`settings-page.module.scss`): a host `SubTitle` and a `round-black` host `Input` per setting (Version probe timeout, Editor command), a soft-red "Not saved: …" line (`role="alert"`) on a failed save, and the host `hint` text below. Both settings sit in one block, a flex column separated by `--flow-space` (24px fallback). The host draws hint code pale grey, unreadable on the light theme, so the block gives it the page's code treatment: mono at 0.92em, padding 1px 5px, host 3px corner, 30% half-gray wash, accent text, line height 1.

### Motion

One ease-out curve, `cubic-bezier(0.22, 1, 0.36, 1)`, for state changes; plain `ease-out` for hovers.

| Element | Property | Duration | Easing |
| --- | --- | --- | --- |
| Wire fill | `transform` (scaleX) | 600ms (wire B +150ms) | Curve |
| Workspace icon | Border and glyph colour | 300ms | Curve |
| Session started line | Rise from 4px, fade in | 300ms | Curve |
| Option, option mark, icon button | Colours | 150ms | ease-out |
| Nav item | Colours | 120ms | ease-out |
| Checking status dot | Pulse to 0.35 opacity | 1.1s, infinite | ease-in-out |
| Skeleton bar | Pulse to 0.35 opacity | 1.4s, infinite | ease-in-out |

Under `prefers-reduced-motion: reduce`, every animation and transition in the page runs for 1ms and once. States stay legible without motion: the wires show filled or dashed, the dots keep their colours.

### Copy

- Use GLOSSARY.md terms: provider, workspace, session, guardrails, managed file, Reset. "AgentBridge" in prose; "Freelens Agent Bridge" only for the UI label (sidebar entry, preferences path).
- Guardrails are a convenience, never a security boundary. Say so once, in their pane, and name the kubeconfig and Kubernetes RBAC as what decides; never call guardrails permissions, policy or security settings.
- Buttons are verbs: "Open {provider} session", "Reveal", "Open in editor", "Check again", "Installation guide". An ellipsis marks a button that asks first ("Reset…"), and the confirm names exactly the files that change ("Reset files", "Cancel").
- Status lines lead with the state; a middle dot separates the fact that follows: "Ready · found `opencode` on your PATH". Progress uses the ellipsis character: "Starting opencode in a terminal tab below…", "Saving…".
- Never show an authoritative-looking zero: no count and no built state before a successful scan.

### Accessibility

- **Glyphs:** host Material icons render their name as ligature text, so every decorative icon goes through `Glyph` (`aria-hidden`). Wires, the workspace icon, status dots, the mark tile and the blocked mark are `aria-hidden`; provider marks are `aria-hidden` by default.
- **Focus:** everything the page draws itself shows a 2px solid `--primary` outline at 2px offset (options at 1px, secondary buttons as a 2px inset ring).
- **Names:** icon buttons carry `aria-label` and `title`; the copy button switches both to "Copied". Provider options keep the short name `aria-hidden` and expose the full name in visually hidden text. Nav items carry their title and detail in `title`.
- **Live regions:** the launch status line is one `role="status"` region that changes its text from the shortcut hint to starting to started; the provider status line is `role="status"`, so a switch from checking to ready is announced; the save status is shown but `aria-hidden` (it would talk over the typing), and a failed save is `role="alert"`; the scan error and file read errors are `role="alert"`; the loading explorer is `aria-busy`.
- **Landmarks:** the strip is a `header` with the cluster name as `h1`; the session bar is a `section` labelled "{provider} session"; the list is a `nav` labelled "{provider} workspace" with each group a `role="group"` named by its label; the pane is a `section` labelled by its own heading; the selected nav item has `aria-current="true"`.
- **Keyboard:** the switcher is a native radio group (arrow keys); nav items are native buttons in Tab order; Ctrl/⌘ Enter opens a session from anywhere except Monaco and text fields.

## Do's and Don'ts

### Do

- **Do** take every colour, font, radius and component from the host (`Button`, `Icon`, `Avatar`, `ConfirmDialog`, `Notifications`, Monaco), so both themes work.
- **Do** mark selection with teal: the 14% tint, the 2px inset bar and a teal glyph in the list; the 16% wash and underline in the switcher.
- **Do** keep one primary action, Open session, in the session bar.
- **Do** open one item at a time in the pane, and give a file the rest of the height.
- **Do** show a provider by its mark beside its name, with the mark's source noted in `provider-marks.tsx`.
- **Do** use the host 3px corner (2px only for options nested in the switcher) and circles only for status dots and the blocked mark.
- **Do** use container queries on `agentbridge-page` for responsive changes.

### Don't

- **Don't** hard-code colours; the page writes no literal colour.
- **Don't** use teal for decoration, or amber for failure.
- **Don't** cast shadows; every box-shadow is an inset stroke.
- **Don't** render a Material icon without `Glyph` or `aria-hidden`.
- **Don't** imply guardrails are a security boundary.
- **Don't** add a second filled primary button to the page.
- **Don't** draw a provider mark without its name beside it, or a stand-in for a provider without one.
