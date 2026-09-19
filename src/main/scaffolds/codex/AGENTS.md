# Cluster Agent Instructions

This cluster agent uses inherited `KUBECONFIG` from Freelens.

- Inspect resources before mutating them.
- Use an explicit namespace for namespaced resources.
- Ask before destructive or availability-affecting changes.
- Treat RBAC and credentials as a security boundary; do not expose or broaden them.

## Cluster Notes

Record relevant cluster context, assumptions, and completed actions here.
