# OpenCode

[OpenCode](https://opencode.ai/docs/) runs as `opencode` and works with any
model vendor you sign in to, using your own API keys or OAuth.

## Seeded files

| Role                | Path                                     |
| ------------------- | ---------------------------------------- |
| Instructions file   | `AGENTS.md`                              |
| Guardrails          | `.opencode/opencode.json`                |
| Cluster-map command | `.opencode/command/build-cluster-map.md` |

## Guardrails

OpenCode uses pattern-based permissions where each rule resolves to `allow`,
`ask`, or `deny`. The seeded file allows read-only commands and asks for
everything else:

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

[← Back to the configuration guide](../configuration.md)
