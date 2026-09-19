# Backlog

Proposed items to make the extension more powerful. Grouped into themed
sections with a suggested priority order at the bottom. The original flat
notes are folded into the relevant items.

The core theme: today `KUBECONFIG` is wired into the agent's terminal, but the
agent has almost no *structured* or *textual* knowledge of the cluster it is
pointed at, and there is no path from a Freelens resource to the agent. Most
high-leverage items below close that gap.

## 1. Make the agent cluster-aware

- **1b. Ship curated custom subagents** — Claude Code subagents / OpenCode
  agents for K8s roles (SRE triage, security/RBAC auditor, cost optimizer),
  seeded in each provider's native format. (existing: *custom agents*)

## 2. Context-aware entry points (UI)

- **2a. "Ask the agent" from a resource** — button/menu on pod, deployment, and
  events detail views that opens a session pre-filled with a prompt about the
  selected object. (existing: *add buttons on cluster items*)
- **2c. Provider skills library** — a reusable, versioned set of K8s skills
  (incident triage, manifest review, drift check) seeded into the workdir.
  (existing: *skills*)

## 3. Artifacts & session output

- **3a. Artifact browser** — surface files the agent writes in the workdir
  (generated manifests, reports) in the page, with a one-click **Apply to
  cluster** / open-diff action. (existing: *generate artifacts* + *show harness
  artifacts*)
- **3b. Session transcript persistence & viewer** — keep and browse past
  sessions per cluster/provider.

## 4. Provider coverage & configuration

- **4a. More providers** — remaining candidates: Gemini CLI, Cursor CLI, Aider,
  Amazon Q. Registry additions are usually cheap, but "cheap" is not a given:
  Codex CLI (done) also needed a `toml` editor language, a `toml-file` artifact
  layout, a capability-hint branch and the first non-empty `launchArgs`, because
  it is configured in TOML, has no project-local slash commands, and defaults to
  a sandbox with no network. Budget a day per provider that is not a Claude
  Code / OpenCode lookalike.
- **4b. Model + extra-args per provider** — expose `launchArgs`/model selection
  in the UI/settings. Codex is now the one provider with non-empty `launchArgs`,
  and they are hardcoded; a user who wants `--model` or a different sandbox has
  to edit `.codex/config.toml` and trust the folder first.
- **4c. Custom tools scaffolding** — templates for provider-native custom tools.
  (existing: *development of custom tools*)

## 5. Safety & guardrails

- **5b. Command audit log** — optional record of what ran in a session.

## MCP servers (reminder — no concrete item yet)

Kept as a future reminder, not a committed item. A **Kubernetes** MCP server is
**not** wanted: the agent CLIs already launch with `KUBECONFIG` wired into a
docked terminal and drive `kubectl` directly, so a k8s MCP server would only
re-expose what `kubectl` already provides at the cost of an extra dependency.

Where MCP *could* be worth it later is the systems `kubectl` cannot reach —
observability (Prometheus / Grafana / Loki / Datadog), cloud provider APIs
(AWS / GCP / Azure), incident & delivery (PagerDuty / GitHub / GitLab / Jira),
and internal knowledge/docs. No specific external server is planned right now;
if a concrete one lands, reintroduce it here as a real item.
