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

- **4a. More providers** — registry additions are cheap: Gemini CLI, Codex CLI,
  Cursor CLI, Aider, Amazon Q.
- **4b. Model + extra-args per provider** — expose `launchArgs`/model selection
  in the UI/settings instead of hardcoded empty arrays.
- **4c. Custom tools scaffolding** — templates for provider-native custom tools.
  (existing: *development of custom tools*)
- **4d. Open in text editor** — open managed files in an external editor
  (VS Code / IDE). (existing: *open in text editor -> vscode/IDE maybe*)

## 5. Safety & guardrails

- **5a. Read-only / namespace-scoped mode** — generate a restricted
  `KUBECONFIG` (read-only or single-namespace) for a launch, complementing the
  CLI-native guardrails. (open question: is this in scope, or do we keep
  Kubernetes RBAC as the only security boundary per the README's stance?)
- **5b. Command audit log** — optional record of what ran in a session.

## 6. Quality-of-life

- **6a. Providers doctor panel** — show all providers' `PATH` status at once,
  not just the selected one.
- **6b. Session disk-usage / cleanup view** — list and prune
  `agentbridge-sessions/` workdirs.

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

## Suggested priority order

1. **1a** (inject live cluster context) — biggest capability jump for least
   code, scaffold-driven.
2. **2a** ("Ask the agent" from a resource) — makes it feel native to Freelens.
3. **3a** (artifact browser + apply) — closes the loop from "agent suggests" to
   "cluster changes".
4. **4a** (more providers) — cheap breadth.
5. Everything else as follow-up.
