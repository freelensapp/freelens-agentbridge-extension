# AgentBridge

AgentBridge is a Freelens extension that gives every Kubernetes cluster its
own AI coding agent, launched in a terminal already pointed at that cluster.

## Language

**AgentBridge**:
The product's name in prose. "Freelens Agent Bridge" is reserved for the UI
label the user clicks (sidebar entry, preferences page).
_Avoid_: Agent Bridge, AgentBridge extension, Agent Harness (as a name)

**Agent harness**:
Tagline only: describes what AgentBridge is for, never a thing in the product.
_Avoid_: using it to mean a workspace or a session

**Provider**:
One supported AI agent CLI (OpenCode, Claude Code, GitHub Copilot CLI,
OpenAI Codex CLI, Pi), selected per cluster.
_Avoid_: agent, backend, tool

**Workspace**:
The persistent directory owned by one cluster and provider pair, holding the
provider's instructions, guardrails, and anything the agent creates. It
outlives every session.
_Avoid_: workdir, harness, session directory (in code, `workdir` names the
workspace's absolute path, not a separate concept)

**Session**:
One launch of a provider's CLI in a workspace, inside a Freelens terminal tab.
Closing the tab ends the session; the workspace remains.
_Avoid_: workspace, terminal, run

## Workspace contents

**Seeded file**:
Any file AgentBridge creates in a new workspace; an existing file is never
overwritten.
_Avoid_: scaffold (reserved for the bundled templates in code), default file

**Instructions file**:
The Markdown file a provider reads at session start to learn about the
cluster. Reset never touches it.
_Avoid_: prompt, memory file

**Guardrails**:
The provider-native seeded files that decide what the agent may do without
asking. They are a convenience, not a security boundary.
_Avoid_: permissions, policy, security settings

**Managed file**:
A seeded file that Reset restores: the guardrails and the cluster-map command
or skill.
_Avoid_: seeded file (when only the resettable subset is meant)

**Reset**:
Restoring a workspace's managed files to their bundled defaults.
_Avoid_: re-seed, restore defaults
