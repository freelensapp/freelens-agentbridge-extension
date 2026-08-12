# General rules
Before doing any action, think deeply and plan your work. Always try to leverage subagents by splitting your task in little subtasks that can be executed by a subagent. If some of those tasks are independent call subagents in parallel.

After any task, consider to upgrade the tests and the documentation files.

# Context files
You have access to context files that you will read during your task when needed:

## GOTCHAS.md
Contains pitfalls encountered by previous agents:
- read it when you have doubts or get stuck
- append a concise gotcha at the end of your session when you discover one

## ARCHITECTURE.md
Describes project structure, data flow, key abstractions, dependencies, and architectural constraints.

## TESTING.md
Covers testing strategy, conventions, and exact verification commands.

## CONVENTIONS.md
Covers project naming, structure, implementation patterns, and tooling conventions.
