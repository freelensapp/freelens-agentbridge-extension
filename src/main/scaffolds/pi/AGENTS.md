# Cluster Agent Instructions

This cluster agent uses inherited `KUBECONFIG` from Freelens.

- Inspect resources before mutating them.
- Use an explicit namespace for namespaced resources.
- Ask before destructive or availability-affecting changes.
- Treat RBAC and credentials as a security boundary; do not expose or broaden them.

## Guardrails on Pi

Pi ships no sandbox and no permission file: its built-in tools run with the
permissions of the `pi` process. This workspace therefore seeds
`.pi/extensions/kubectl-guard.ts`, a `tool_call` hook that lets read-only
`kubectl` and `helm` commands through and asks before anything else runs.

- The guard only loads once the project folder is **trusted**. Until then these
  instructions are the only guardrail in force — `AGENTS.md` is read regardless
  of trust, everything under `.pi/` is not.
- The guard is a convenience, not a boundary. It reads one command string and
  can be edited, bypassed or written around. The kubeconfig and the cluster's
  RBAC remain the only real enforcement.
- Do not edit or replace `.pi/extensions/kubectl-guard.ts` on your own
  initiative, and do not route a blocked command around the guard (a shell
  variable, a here-doc, a wrapper script). If a command is blocked and you
  believe it should run, say so and let the user decide.

## Cluster Notes

Record relevant cluster context, assumptions, and completed actions here.
