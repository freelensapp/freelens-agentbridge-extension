# @freelensapp/agentbridge-extension

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Bring an AI coding agent into every Kubernetes cluster you manage — without
leaving Freelens.

Pick [OpenCode](https://opencode.ai/docs/),
[Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup),
[GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli),
or [OpenAI Codex CLI](https://developers.openai.com/codex/cli/)
per cluster, click one button, and the agent opens in a docked terminal tab
with `KUBECONFIG` already pointed at the active cluster. Each cluster gets an
isolated, persistent workspace with sensible guardrails pre-configured, and
you can tune the agent's instructions and permissions directly inside
Freelens.

![GitHub Copilot CLI session answering a cluster health report request](docs/images/agentbridge-session.jpg)

![AI CLI session in Freelens sidebar](docs/images/agentbridge-homepage.png)

## Why use it

Debugging a cluster with an AI agent usually means: open a terminal, switch
kubeconfig context, `cd` somewhere sensible, remember which instruction files
you set up for this cluster, and hope you did not point the agent at the
wrong environment. This extension removes all of that:

- **No context mistakes** — the session inherits `KUBECONFIG` from the
  cluster you have open in Freelens. The agent always talks to the cluster
  you are looking at.
- **Per-cluster memory** — every cluster keeps its own workspace, so the
  agent's instructions and notes for `prod` never leak into `staging`. Ask
  the agent to record findings in its instructions file and it will remember
  them next session.
- **Safe by default** — pre-seeded permission files allow read-only
  `kubectl` and `helm` commands and require your approval for everything
  else. You review every mutation before it runs.
- **Your choice of agent** — use different agents on different clusters, or
  switch at any time. The selection is remembered per cluster.

## Features

- **Four providers** — OpenCode, Claude Code, GitHub Copilot CLI, and
  OpenAI Codex CLI. Selection persists per cluster and can be changed at any
  time.
- **One-click sessions** — launches the agent in a Freelens terminal tab,
  in the cluster's workspace, with `KUBECONFIG` and `PATH` wired up. Works
  on macOS, Linux, and Windows (PowerShell).
- **Isolated workspaces** — each cluster and provider pair gets its own
  persistent directory under
  `<userData>/agentbridge-sessions/<safe-cluster-id>/<provider-id>/`.
- **Pre-seeded guardrails** — on first open, the extension copies
  provider-native scaffold files into the workspace: instructions, a
  permission file that allows read-only `kubectl`/`helm` and asks for
  everything else, and a `/build-cluster-map` command (a skill on Copilot
  CLI and Codex). Only missing files are written, so your edits are never
  overwritten.
- **In-app editors** — edit each provider's instruction, permission and
  command files in a Monaco editor inside Freelens, with debounced
  autosave, JSON, TOML and Markdown highlighting, and an auto/dark/light
  theme toggle.
- **Workspace artifacts** — see how many skills and custom agents the
  cluster's workspace holds and when each last changed, with a drill-down
  list, without leaving the page or opening the directory.
- **Availability checks** — the extension probes the selected CLI on
  `PATH` (`--version`) before offering a session, with a retry action, a
  link to the provider's install docs, and a configurable probe timeout.
- **Reveal workdir** — open the cluster's workspace in your native file
  manager.
- **Open in editor** — open the workspace as a project in VS Code or a
  fork (`codium`, `cursor`, ...), falling back to the editor's URL handler
  when the CLI is not on `PATH`.
- **Reset** — restore the two managed files — the permission/settings file
  and the `/build-cluster-map` command — to their bundled defaults. Both are
  deleted and re-seeded, so local edits to either are lost; the instructions
  file and every other file in the workspace stay untouched. The confirm
  dialog lists the exact paths before anything is removed.

![OpenCode permission editor](docs/images/opencode-permission-settings.png)

## Requirements

- Freelens >= 1.8.0
- macOS, Linux, or Windows (PowerShell)
- At least one supported agent CLI on `PATH` (see [Quick start](#quick-start))

## Quick start

### 1. Install an agent CLI

Install at least one of:

- [OpenCode](https://opencode.ai/docs/) — `opencode`
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup) — `claude`
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) — `copilot`
- [OpenAI Codex CLI](https://developers.openai.com/codex/cli/) — `codex`

The extension detects agents on `PATH`; it does not bundle or update them.

### 2. Install the extension

Open Freelens and go to Extensions (`ctrl`+`shift`+`E` or `cmd`+`shift`+`E`),
then search for and install `@freelensapp/agentbridge-extension`.

Alternatively, open the following URL in the browser to install directly:

[freelens://app/extensions/install/%40freelensapp%2Fagentbridge-extension](freelens://app/extensions/install/%40freelensapp%2Fagentbridge-extension)

**After installing or upgrading, restart Freelens completely.** Freelens loads
extension code into its main process once per app run, so a window reload picks
up the new UI but leaves the old main process behind. Symptoms are errors of the
form `No handler registered for 'agentbridge-extension:…'`; quitting and
reopening Freelens clears them.

### 3. Launch a session

Open a cluster, click **Freelens Agent Bridge** in the sidebar, select a
provider, and press **Open session**. Repeat on any other cluster — every
workspace is independent.

## Example: what a session looks like

Open a session on a cluster with a failing deployment and ask, in plain
language:

```text
The checkout pods in namespace shop keep restarting. Find out why and fix it.
```

The agent runs read-only commands immediately (they are pre-allowed):

```text
kubectl get pods -n shop
kubectl describe pod checkout-7d4b9-xkz2p -n shop
kubectl logs checkout-7d4b9-xkz2p -n shop --previous
```

It finds `OOMKilled` with exit code 137, inspects the deployment's resource
limits, and proposes a fix. Because `kubectl apply`, `kubectl edit`, and
`kubectl patch` are not in the allow-list, the agent must ask before running
the mutation — you approve it, and the agent verifies the rollout and
reports back.

Other things people ask in a cluster session:

```text
Which pods in this cluster have no resource limits set?
Compare the image tags running in staging with what the Helm chart defines.
A PVC is stuck in Pending — figure out which StorageClass is the problem.
Summarize the warning events from the last hour and group them by cause.
```

## How it works

Each cluster and provider pair gets a persistent workspace:

```text
<userData>/agentbridge-sessions/<safe-cluster-id>/<provider-id>/
  <provider-native files>
```

`<safe-cluster-id>` replaces unsupported characters in the cluster ID and
appends a short digest, so different clusters can never collide on the same
directory.

On first open, the extension seeds the workspace with each provider's native
files:

| Provider           | Instructions                      | Permissions / settings          | Command / skill                             |
| ------------------ | --------------------------------- | ------------------------------- | ------------------------------------------- |
| OpenCode           | `AGENTS.md`                       | `.opencode/opencode.json`       | `.opencode/command/build-cluster-map.md`    |
| Claude Code        | `CLAUDE.md`                       | `.claude/settings.json`         | `.claude/commands/build-cluster-map.md`     |
| GitHub Copilot CLI | `.github/copilot-instructions.md` | `.github/copilot/settings.json` | `.github/skills/build-cluster-map/SKILL.md` |
| OpenAI Codex CLI   | `AGENTS.md`                       | `.codex/config.toml`            | `.agents/skills/build-cluster-map/SKILL.md` |

Seeding only ever creates files that are absent — an existing file is left
exactly as you last edited it.

When you launch a session, the extension opens a Freelens terminal tab —
which already carries the active cluster's `KUBECONFIG` via Freelens'
built-in terminal infrastructure — changes into the workspace, and starts
the CLI. The agent picks up its instruction and permission files exactly as
it would in any project directory.

Codex CLI is the one provider started with arguments, because two of its
defaults would otherwise break a cluster session before its config file is
ever read (Codex ignores a project's `.codex/` layer until you trust the
folder, which it asks about on first launch):

```sh
codex --sandbox workspace-write --ask-for-approval on-request \
      -c sandbox_workspace_write.network_access=true
```

Command-line flags outrank every config layer, so the session works on the
first launch: the agent may write in its own workspace, `kubectl` can reach
the API server — Codex's `workspace-write` sandbox blocks the network by
default — and every command the sandbox does not already permit is still
shown to you first.

**Reset** removes and re-seeds the two managed files of the selected
provider — the permission/settings file **and** the `/build-cluster-map`
command (a skill on Copilot CLI and Codex CLI):

- **OpenCode** — `.opencode/opencode.json` and
  `.opencode/command/build-cluster-map.md`
- **Claude Code** — `.claude/settings.json` and
  `.claude/commands/build-cluster-map.md`
- **GitHub Copilot CLI** — `.github/copilot/settings.json` and
  `.github/skills/build-cluster-map/SKILL.md`
- **OpenAI Codex CLI** — `.codex/config.toml` and
  `.agents/skills/build-cluster-map/SKILL.md`

Both files are deleted and copied back from the bundled scaffold, so any
change you made to them is discarded. The instructions file, workspace
skills and agents, and anything else the agent created are preserved. The
confirm dialog lists the exact paths for the selected provider before
removing anything.

## Configuring your agent

Everything below is editable directly in Freelens through the in-app
editors, or externally via **Reveal workdir** / **Open in editor**. Because
each cluster has its own workspace, you can give the production cluster a
strict, ask-for-everything policy while the local kind cluster runs with
broad permissions.

### Instructions: teach the agent about the cluster

Every provider reads a Markdown instructions file at session start. The
default scaffold sets careful ground rules; extend it with anything the
agent should know about this specific cluster:

```markdown
# Cluster Agent Instructions

This cluster agent uses inherited `KUBECONFIG` from Freelens.

- Inspect resources before mutating them.
- Use an explicit namespace for namespaced resources.
- Ask before destructive or availability-affecting changes.

## Cluster Notes

- This is the EU production cluster; treat every change as customer-facing.
- Deployments are managed by Argo CD — never `kubectl apply` app manifests,
  point me at the Git repo instead.
- Ingress runs on ingress-nginx in namespace `ingress`; cert-manager handles
  TLS.
```

The scaffold ends with a **Cluster Notes** section for exactly this purpose:
ask the agent to record what it learned there, and the knowledge persists
across sessions.

### OpenCode (`.opencode/opencode.json`)

OpenCode uses pattern-based permissions where each rule resolves to
`allow`, `ask`, or `deny` — the default scaffold allows read-only commands
and asks for everything else:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "ask",
      "kubectl get *": "allow",
      "kubectl describe *": "allow",
      "kubectl logs *": "allow",
      "helm list *": "allow",
      "kubectl delete *": "deny"
    }
  }
}
```

Add `"kubectl delete *": "deny"`-style rules to hard-block commands, or
promote frequently approved commands (for example
`"kubectl rollout status *": "allow"`) to reduce prompts. See the
[OpenCode permissions docs](https://opencode.ai/docs/permissions/) for the
full syntax, including per-agent overrides.

### Claude Code (`.claude/settings.json` and `CLAUDE.md`)

Claude Code uses `allow` / `ask` / `deny` lists of tool patterns, where
deny always wins:

```json
{
  "permissions": {
    "allow": [
      "Bash(kubectl get:*)",
      "Bash(kubectl describe:*)",
      "Bash(kubectl logs:*)",
      "Bash(helm list:*)"
    ],
    "ask": ["Bash(kubectl apply:*)", "Bash(kubectl rollout restart:*)"],
    "deny": ["Bash(kubectl delete namespace:*)"]
  }
}
```

`CLAUDE.md` in the workspace root holds the instructions. See the
[Claude Code settings docs](https://code.claude.com/docs/en/settings) for
the full pattern syntax, environment variables, and hooks.

### GitHub Copilot CLI (`.github/copilot-instructions.md`)

Copilot CLI reads `.github/copilot-instructions.md` automatically and asks
interactively before running file-modifying tools; you can approve a tool
once or for the rest of the session. Session-level configuration lives in
the CLI itself via the `/settings` slash command. See the
[Copilot CLI docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
for details.

### OpenAI Codex CLI (`.codex/config.toml` and `AGENTS.md`)

Codex reads `AGENTS.md` from the workspace and takes its policy from TOML:

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
writable_roots = ["/path/to/this/workspace/.agents"]
```

Two Codex-specific things are worth knowing:

- **Trust.** Codex loads a project's `.codex/` layer only after you trust
  the folder, and it asks the first time a session opens. Until you answer,
  this file has no effect — which is why the extension passes the sandbox,
  approval and network settings as launch flags as well.
- **Read-only paths.** Codex keeps `.agents/`, `.codex/` and `.git/`
  read-only even inside a writable workspace. `build-cluster-map` writes
  its per-namespace skills under `.agents/skills/`, so Codex asks for
  approval before each one. Add this workspace's own `.agents` directory to
  `writable_roots` (an absolute path — **Reveal workdir** gives it to you)
  to let them through without prompting.

Codex has no project-local slash commands, so the cluster map ships as a
skill: mention it with `$build-cluster-map`, or pick it from `/skills`.
Custom subagents go in `.codex/agents/*.toml` and are counted in the
workspace artifacts panel. See the
[Codex configuration docs](https://developers.openai.com/codex/config/) for
the full key reference.

### Extension preferences

Under **Preferences → Extensions → Freelens Agent Bridge**:

- **Version probe timeout (ms)** — how long to wait for a CLI to answer
  `--version` before reporting an error. Increase it on slow machines or
  network filesystems.
- **Editor command** — the CLI used by **Open in editor** (default
  `code`). Set it to `codium`, `cursor`, or another VS Code fork. On macOS,
  run "Shell Command: Install 'code' command in PATH" from VS Code first.

## Video demo

The agent fixes a missing secret that crashes the pod:
<video src="https://github.com/user-attachments/assets/3e404238-8e21-4363-ad9f-783a9bd41790" controls width="600"></video>

The agent fixes the deployment's memory limit too low that causes pod's restart:
<video src="https://github.com/user-attachments/assets/12e1571c-4ac2-42cc-82fb-cd6d5d245213" controls width="600"></video>

## Security model

CLI permission files are provider-native convenience guardrails: they
control what the agent asks before doing, inside its own session. They do
not grant or restrict Kubernetes access. **Kubernetes RBAC and your
kubeconfig permissions remain the security boundary** — the agent can never
do more against the cluster than the kubeconfig Freelens hands it allows.

## Build from the source

`pnpm pack:dev` builds a prerelease `.tgz` you can install straight from the
Freelens Extensions page. Full dev setup, build, test, and debugging
instructions live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2025-2026 Freelens Authors
