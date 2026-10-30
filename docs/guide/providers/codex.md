# OpenAI Codex CLI

[OpenAI Codex CLI](https://developers.openai.com/codex/cli/) runs as `codex`
and can use other model vendors through a custom provider.

## Seeded files

| Role              | Path                                        |
| ----------------- | ------------------------------------------- |
| Instructions file | `AGENTS.md`                                 |
| Guardrails        | `.codex/config.toml`                        |
| Cluster-map skill | `.agents/skills/build-cluster-map/SKILL.md` |

## Launch flags

Codex CLI is started with explicit arguments, because two of its defaults
would otherwise break a cluster session before its config file is ever read
(Codex ignores a project's `.codex/` layer until you trust the folder, which
it asks about on first launch):

```sh
codex --sandbox workspace-write --ask-for-approval on-request -c sandbox_workspace_write.network_access=true
```

Command-line flags outrank every config layer, so the session works on the
first launch. As a result: the agent may write inside its own workspace,
`kubectl` can reach the API server (Codex's `workspace-write` sandbox blocks
network access by default), and any command the sandbox doesn't already
permit is still shown to you first.

## Guardrails

Codex takes its policy from TOML:

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
  this file has no effect — which is why AgentBridge also passes the
  sandbox, approval, and network settings as launch flags.
- **Read-only paths.** Codex keeps `.agents/`, `.codex/`, and `.git/`
  read-only even inside a writable workspace. `build-cluster-map` writes its
  per-namespace skills under `.agents/skills/`, so Codex asks for approval
  before each one. Add this workspace's own `.agents` directory to
  `writable_roots` (an absolute path — **Reveal workspace** gives it to you)
  to let them through without prompting.

## Skills and agents

Codex has no project-local slash commands, so the cluster map ships as a
skill: mention it with `$build-cluster-map`, or pick it from `/skills`.
Custom subagents go in `.codex/agents/*.toml` and are counted in the
workspace artifacts panel. See the
[Codex configuration docs](https://developers.openai.com/codex/config/) for
the full key reference.

[← Back to the configuration guide](../configuration.md)
