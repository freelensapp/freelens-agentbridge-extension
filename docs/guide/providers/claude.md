# Claude Code

[Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup) runs as
`claude` and uses Anthropic models.

## Seeded files

| Role                | Path                                    |
| ------------------- | --------------------------------------- |
| Instructions file   | `CLAUDE.md`                             |
| Guardrails          | `.claude/settings.json`                 |
| Cluster-map command | `.claude/commands/build-cluster-map.md` |

## Guardrails

Claude Code uses `allow` / `ask` / `deny` lists of tool patterns, where
`deny` always wins:

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

See the [Claude Code settings docs](https://code.claude.com/docs/en/settings)
for the full pattern syntax, environment variables, and hooks.

[← Back to the configuration guide](../configuration.md)
