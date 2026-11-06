# Configuring AgentBridge

Every cluster and provider pair has its own **workspace**: a persistent
directory under `<userData>/agentbridge-sessions/<safe-cluster-id>/<provider-id>/`.
Everything below lives in that workspace, so you can give production a strict,
ask-for-everything policy while a local kind cluster runs with broad
permissions.

The AgentBridge page is a workspace explorer. On the left it lists the
instructions file, the guardrails, the capabilities, and the skills and agents
the workspace holds; the item you select fills the right side. A file opens in
Freelens' own Monaco editor, with autosave, syntax highlighting for JSON, TOML,
and Markdown, and the colors of the active Freelens theme. Or work on the
workspace externally with **Reveal** (your file manager) or **Open in editor**
(VS Code or a fork), next to **Open session**. The copy button beside the
workspace path at the top of the page copies its full path.

## Instructions file: teach the agent about the cluster

Every provider reads a Markdown instructions file at session start. The
seeded file sets careful ground rules; extend it with anything the agent
should know about this specific cluster:

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

The seeded file ends with a **Cluster Notes** section for exactly this
purpose: ask the agent to record what it learned there, and the knowledge
persists across sessions. Reset never touches the instructions file.

## Guardrails

Guardrails are the provider-native files that decide what the agent may do
without asking. Each provider has its own format:

- [OpenCode](providers/opencode.md) — pattern-based `allow` / `ask` / `deny`
- [Claude Code](providers/claude.md) — `allow` / `ask` / `deny` tool patterns
- [GitHub Copilot CLI](providers/copilot.md) — interactive approvals
- [OpenAI Codex CLI](providers/codex.md) — sandbox and approval policy in TOML
- [Pi](providers/pi.md) — a TypeScript `tool_call` guard; Pi's
  `.pi/settings.json` (tools and session options) is listed separately as
  **Settings**

Guardrails are a convenience, not a security boundary: Kubernetes RBAC and
your kubeconfig decide what the agent can actually do to the cluster.

## Workspace contents

The **Skills** and **Agents** groups of the explorer list what the workspace
holds, newest first, and when each last changed. Skills created by the
`build-cluster-map` command show up here, and **Build a cluster map** reads
"Built" once the cluster-level skill exists.

## Extension preferences

Under **Preferences → Extensions → Freelens Agent Bridge**:

- **Version probe timeout (ms)** — how long to wait for a CLI to answer
  `--version` before reporting an error. Increase it on slow machines or
  network filesystems.
- **Editor command** — the CLI used by **Open in editor** (default `code`).
  Set it to `codium`, `cursor`, or another VS Code fork. If the CLI isn't on
  `PATH`, AgentBridge falls back to the editor's URL handler. On macOS, run
  "Shell Command: Install 'code' command in PATH" from VS Code first.
