# Claude Code on GitHub

This repository is wired to run [Claude Code](https://github.com/apps/claude)
directly inside GitHub Actions. You talk to Claude from issues, pull requests
and reviews, or launch it manually — it reads the code, makes changes, pushes
commits and opens PRs on its own.

The same setup is used across the Freelens repositories (`freelens`,
`freelens-example-extension`, and this extension). This document explains the
pieces and how to use them.

## What is installed

| File | Purpose |
|------|---------|
| `.github/workflows/claude.yaml` | On-demand assistant. Runs when a comment/issue/review contains `@claude`. |
| `.github/workflows/claude-task.yaml` | Manual task runner via **Actions → Run workflow** (`workflow_dispatch`). |
| `.claude/settings.json` | `PreToolUse` hook that blocks Claude from reading/writing secret files (`.env`, `*.pem`, `*.key`, etc.). |
| `CLAUDE.md` | Thin stub that imports `AGENTS.md` (`@AGENTS.md`) so Claude and other agents share one guide. |
| `AGENTS.md` | The agent guide. Its "GitHub Actions (Claude Code Action) Rules" section governs how Claude behaves in CI. |

## Prerequisites (one-time, repo/org admin)

1. Install the **Claude GitHub App** on the repository:
   <https://github.com/apps/claude>
2. Generate an OAuth token locally with `claude setup-token`.
3. Add it as the secret **`CLAUDE_CODE_OAUTH_TOKEN`** (org-level or repo-level).
4. Recommended: enable branch protection on `main` (require PR + approvals).
   Claude pushes with its own App token, so this is your defense in depth.

Only users with **write+ permission** (OWNER, MEMBER, COLLABORATOR) can trigger
the workflows.

## Usage 1 — mention `@claude` (the common path)

Write a comment containing the literal string `@claude` in any of:

- a **new issue** (body or title)
- a **new issue comment**
- a **new PR review comment**
- a **submitted PR review**

Editing an existing comment does **not** trigger a run — the workflow only
listens to `created` / `opened` / `submitted` events. A new comment is required.

Examples:

```text
@claude please add a unit test for the terminal spawn logic and open a PR.
```

```text
@claude review this PR for correctness and style.
```

### Selecting model and runner

Add optional markers anywhere in the triggering text:

```text
@claude fix the failing build [model:sonnet] [runs-on:ubuntu-24.04]
```

Accepted `model` aliases: `opus` / `opus-4` (default here), `sonnet`,
`haiku`, or a full model ID.
Accepted `runs-on` aliases: `ubuntu`, `ubuntu-arm` (default), `macos`,
`macos-intel`, `windows`, `windows-arm`.

Windows requests take a separate path: Claude writes a PowerShell `verify.ps1`,
it runs on a Windows runner, and Claude posts a summary comment.

### Important: do not trigger by accident

`@claude` is matched as a plain substring anywhere in the text — inside code
spans, fenced blocks, quotes or URLs. When you only want to *refer* to the
handle (in docs, a plan, a bug report) without starting a run, escape it:

```text
@<!-- -->claude
```

It renders as the handle but the raw text does not contain the literal string.

Other rules:

- **One trigger per task.** Each `@claude` occurrence starts a concurrent
  120-minute CI job. Don't repeat it while a run is in flight.
- **Push first.** The workflow checks out the remote ref, so anything not
  pushed is invisible to Claude.

## Usage 2 — manual task (`claude-task.yaml`)

For work that isn't tied to a comment, run it by hand:

1. GitHub → **Actions** → **Claude Task** → **Run workflow**.
2. Fill in:
   - **prompt** — what you want done.
   - **model** — pick from the dropdown.
   - **runs-on** — pick the runner.
   - **create-pr** — if checked, Claude creates a `claude/` branch, commits,
      pushes, and opens a PR following the repo's commit/PR conventions.

The model menu wins over a `[model:...]` prompt marker. If no menu model is
available, the marker wins; otherwise the default is `claude-opus-4-8`. Model
aliases include `fable` and `fable-5`.

## What Claude is allowed to do

The workflow grants a fixed tool allowlist (`--allowedTools`): file
read/write/edit, search, web, and a curated set of Bash commands (`pnpm`,
`git`, `gh`, `node`, `npx`, `jq`, `yq`, and common shell utilities). It cannot
run arbitrary binaries. The `.claude/settings.json` hook additionally denies
reads/writes to secret files regardless of the allowlist.

Claude commits with its own GitHub App token and is constrained by its system
prompt (this repo's `AGENTS.md`, appended at runtime) to push only to the
branch it was invoked on or to `claude/` branches it creates.

## Behavior rules Claude follows

These live in the "GitHub Actions (Claude Code Action) Rules" section of
`AGENTS.md`:

- Show a unified diff and a **proposed commit subject** before changing code,
  and wait for confirmation.
- No Conventional Commits prefixes (`fix:`, `feat:`, …) and no emoji in commit
  messages, PR titles/descriptions, or Markdown.
- One commit per fix; push after each commit.
- Branch names: `claude/issue-<number>-<short-slug>` (no timestamp suffixes).

## Failure handling

If the main `claude` job fails or times out, a `report-failure` job re-runs
Claude in read-only mode to diagnose the cause, post a comment with the root
cause and a link to the run, and clean up any stalled progress comment. Mention
`@claude` again to retry.

## Adapting this to another repo

To replicate the setup elsewhere:

1. Copy `.github/workflows/claude.yaml`, `.github/workflows/claude-task.yaml`,
   and `.claude/settings.json`.
2. Add a `CLAUDE.md` that just imports your guide: `@AGENTS.md`.
3. Add (or extend) `AGENTS.md` with the GitHub Actions rules section.
4. Install the Claude GitHub App and set the `CLAUDE_CODE_OAUTH_TOKEN` secret.

The workflows are project-agnostic — for extensions they check out
`freelensapp/freelens` into `tmp/freelens` for the toolchain; the main app
repo builds in place. No file needs renaming when copied between the Freelens
repos.
