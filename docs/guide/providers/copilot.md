# GitHub Copilot CLI

[GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)
runs as `copilot` and offers GitHub's curated model list under one
subscription.

## Seeded files

| Role              | Path                                        |
| ----------------- | ------------------------------------------- |
| Instructions file | `.github/copilot-instructions.md`           |
| Guardrails        | `.github/copilot/settings.json`             |
| Cluster-map skill | `.github/skills/build-cluster-map/SKILL.md` |

## Guardrails

Copilot CLI reads `.github/copilot-instructions.md` automatically and asks
interactively before running file-modifying tools; you can approve a tool
once or for the rest of the session. Session-level configuration lives in
the CLI itself via the `/settings` slash command. See the
[Copilot CLI docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
for details.

[← Back to the configuration guide](../configuration.md)
