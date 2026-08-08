# Domain Context

## Terms

### Provider-native guardrail

A provider configuration rule that controls what its AI CLI session may do in a
per-cluster workspace. It does not restrict Kubernetes API credentials or direct
commands outside that provider.

### Approval rule

A provider-native guardrail that requires approval before a matching command
runs.

### Approval pattern

A provider-native pattern matched against a command or shell text. Provider
guardrails are convenience controls; Kubernetes RBAC and kubeconfig permissions
remain security boundary.

### Provider workspace

An isolated path at
`<userData>/agentbridge-sessions/<safe-cluster-key>/<provider-id>`. Registry entries
declare provider metadata, editor files, reset paths, and bundled scaffolds.
