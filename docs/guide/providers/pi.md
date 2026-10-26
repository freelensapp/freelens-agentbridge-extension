# Pi

[Pi](https://pi.dev/) runs as `pi` and is model-agnostic: use your own API
keys or OAuth with any supported vendor.

## Seeded files

| Role                | Path                                                   |
| ------------------- | ------------------------------------------------------ |
| Instructions file   | `AGENTS.md`                                            |
| Guardrails          | `.pi/extensions/kubectl-guard.ts`, `.pi/settings.json` |
| Cluster-map command | `.pi/prompts/build-cluster-map.md`                     |

## Guardrails

Pi reads `AGENTS.md` from the workspace and keeps everything else under
`.pi/`. It intentionally ships no MCP, no sub-agents, no permission popups,
and no sandbox, so its guardrail is code: the seeded
`.pi/extensions/kubectl-guard.ts` is a `tool_call` hook that runs before
every shell tool call. It lets through the same read-only `kubectl`/`helm`
commands the other providers allow, and holds everything else — `delete`,
`apply`, `scale`, `drain`, `exec`, `helm upgrade`, and anything it doesn't
recognize — for confirmation, blocking it if you decline or if no UI is
attached to ask. Commands that touch neither tool are not intercepted.

`.pi/settings.json` carries the rest:

```json
{
  "defaultTools": ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"],
  "sessionDir": ".pi/sessions"
}
```

`defaultTools` adds Pi's search built-ins to its four defaults, and
`sessionDir` keeps this cluster's transcripts inside its own workspace
instead of the shared `~/.pi/agent/sessions/`. A project `defaultTools`
array **replaces** the one in your global settings rather than merging with
it — `powershell` is listed for that reason, so a Windows user who selected
it globally doesn't lose it inside a cluster workspace. Trim the array to
take a tool away from the agent.

## Things worth knowing

- **Trust.** Pi asks once per workspace, on the first interactive launch,
  and remembers the answer in `~/.pi/agent/trust.json`. Until the workspace
  is trusted, the guard extension, `.pi/settings.json`,
  `.pi/prompts/build-cluster-map.md`, and any `.pi/skills/` are not loaded —
  the session still starts and still talks to the cluster, just ungated,
  with `AGENTS.md` (which is never trust-gated) as its only instruction.
  Declining trust gives you _fewer_ guardrails, not more.
- **No sandbox.** Pi's built-in tools run with the permissions of the `pi`
  process, by design. The guard is a convenience, not a boundary: it lives
  in a directory the agent itself can write to, and a session can be talked
  into working around it. As with every other provider, the kubeconfig and
  Kubernetes RBAC remain the only enforcement boundary — pair a cluster
  session with a read-only context when that matters.
- **A broken guard file stops Pi from starting.** It's executable
  TypeScript, so a syntax error makes Pi exit with `Failed to load
  extension … ParseError` instead of opening a session. The in-app editor
  shows the guard as plain text and cannot flag such an error, because
  Freelens' Monaco has no TypeScript language service. Start Pi with
  `pi -ne` to skip extensions, or press **Reset** to restore the file.
- **No sub-agents.** Pi has none, so the workspace artifacts panel shows
  skills only — there's no "agents" chip to miss — and
  `/build-cluster-map` explores namespaces sequentially rather than
  delegating them in parallel.
- **Models.** Switch with `/model` or `Ctrl+L` inside a session, or start it
  as `pi --provider … --model …`. AgentBridge seeds no model.

On its first interactive launch, Pi downloads `fd` and `ripgrep` into
`~/.pi/agent/bin`; behind a blocked network that prints a cosmetic `Failed
to download fd` warning, which installing system `fd`/`rg` or setting
`PI_OFFLINE=1` silences. See the [Pi docs](https://pi.dev/docs/latest) for
extensions, settings, and prompt templates.

[← Back to the configuration guide](../configuration.md)
