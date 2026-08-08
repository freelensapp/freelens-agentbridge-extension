# @freelensapp/agentbridge-extension

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Run an AI CLI session scoped to any Kubernetes cluster, straight from the
Freelens sidebar. Select OpenCode, Claude Code, or GitHub Copilot CLI; Freelens
launches selected provider in a docked terminal tab with `KUBECONFIG` wired and
provider-native files pre-seeded.

<img src="docs/images/freelens-agentbridge-screenshot.png" width="800" alt="AI CLI session in Freelens sidebar">

## Why

Operating Kubernetes clusters means switching between Freelens and a terminal
for AI-assisted work. This extension keeps provider sessions in Freelens while
leaving each cluster and provider with an isolated workspace.

## Features

- **Provider selection** — select OpenCode, Claude Code, or GitHub Copilot CLI
  per cluster. Selection persists per cluster and can change at any time.
- **Per-cluster isolation** — each provider workdir is
  `<userData>/agentbridge-sessions/<safe-cluster-id>/<provider-id>/`.
- **Provider-native scaffolds** — registry entries declare managed editor files,
  reset paths, and bundled scaffolds for every provider.
- **In-app editors** — edit provider-declared instruction, permissions, and
  settings files with debounced autosave and theme matching.
- **Checks and retry** — provider availability is checked on `PATH`; missing or
  failed checks show retry action. Changing cluster or provider drops stale
  in-flight results.
- **Reveal workdir** — open only selected provider's validated workdir in native
  file manager.
- **Open in editor** — open the selected provider's validated workdir as a
  project in VS Code (or a configured fork). Uses the editor CLI, falling back to
  the editor's URL handler when the command is not on `PATH`.
<img src="docs/images/permission-settings.png" width="800" alt="OpenCode permission editor">

CLI permission files are provider-native convenience guardrails. Kubernetes
RBAC and kubeconfig permissions remain security boundary.

## Quick start

### 1. Install a provider

Install [OpenCode](https://opencode.ai/docs/),
[Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup), or
[GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli).
The extension detects providers via `PATH`; it does not bundle or update them.

### 2. Install the extension

Open Freelens, go to **Extensions**, and install extension archive.

### 3. Launch a session

Click **AI CLI** in any cluster sidebar, select an installed provider, then
open its session. Repeat per cluster; every provider workspace is independent.

## How it works

Each cluster and provider get a persistent workspace:

```
<userData>/agentbridge-sessions/<safe-cluster-id>/<provider-id>/
  <provider-native files>
```

`<safe-cluster-id>` replaces unsupported characters in the cluster ID and appends a short digest, preserving
isolation when different IDs sanitize to the same value.

On first open, the extension copies provider-native scaffold files into the
workdir. OpenCode uses `AGENTS.md` and `.opencode/opencode.json`; Claude Code
uses `CLAUDE.md` and `.claude/settings.json`; Copilot uses
`.github/copilot-instructions.md` and `.github/copilot/settings.json`.

Edit declared files in Freelens, reveal workdir, or open the workdir as a
project in your editor to use other tools. Provider guardrails apply only within
that CLI. They do not grant Kubernetes access or replace RBAC and kubeconfig
permissions.

**Open in editor:** the **Open in editor** button opens the validated workdir as
a project window. It runs the configured editor command (default `code`) with
the workdir as its argument; if that command cannot be launched it falls back to
the editor's `vscode://file/...` URL handler. Set the **Editor command** under
**Preferences → Extensions → Freelens Agent Bridge** to use a VS Code fork such as
`codium` or `cursor`. On macOS, run "Shell Command: Install 'code' command in
PATH" from VS Code so the CLI is available.

**Reset:** removes and re-seeds only provider registry `resetPaths`: currently
`.opencode/opencode.json`, `.claude/settings.json`, or
`.github/copilot/settings.json`. Instruction files and unrelated workspace
files remain unchanged.

# Video demo

**The situation:**
- Pod status: `CreateContainerConfigError` (new pod can't start)

**What the agent does:**
1. `kubectl get pods, get deployments, get events` — notices `CreateContainerConfigError`
2. Reads secret key error
3. Inspects keys
4. Identifies key mismatch: `DB_PASS` should be `DB_PASSWORD`
5. Fixes and waits for pod to come back healthy

<p align="center">
  <video src="https://github.com/user-attachments/assets/528e3f01-c9d1-4da3-a748-cc7a6bd80cb7" width="80%" controls></video>
</p>

**The situation:**
- Pod restarts: increasing restart count

**What the agent does:**
1. `kubectl get pods -n freelens-agent-demo` — notices restarts
2. `kubectl describe pod` shows `OOMKilled` with exit code 137
3. Inspects resource limits in deployment, identifies 16Mi as insufficient
4. Recommends bumping to 256Mi
5. Fixes: applies good deployment manifest
6. Verifies pod stabilizes

<p align="center">
  <video src="https://github.com/user-attachments/assets/4843056a-f8d1-486e-a828-40965c92a1c7" width="80%" controls></video>
</p>

## Developing

Dev setup, build, test, and debugging instructions live in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2025-2026 Freelens Authors
