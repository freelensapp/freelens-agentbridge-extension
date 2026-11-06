# Product

<!-- impeccable:product-schema 1 -->

> Inferred from the repository (README.md, GLOSSARY.md, ARCHITECTURE.md,
> docs/) during a design review; no interview round was held. Correct any
> line that is wrong.

## Platform

web

## Users

Platform engineers, SREs and developers who already live in Freelens to
operate Kubernetes clusters, and who use an AI coding agent CLI (OpenCode,
Claude Code, GitHub Copilot CLI, OpenAI Codex CLI, Pi) in their terminal.
They open AgentBridge from a cluster's sidebar when they want the agent to
investigate or change that specific cluster, often in the middle of an
incident or a routine check.

## Product Purpose

AgentBridge gives every Kubernetes cluster its own AI coding agent: one
click opens a session of the selected provider in a docked Freelens
terminal, already pointed at the cluster's `KUBECONFIG`, inside a persistent
per-cluster workspace that holds the agent's instructions, guardrails and
skills. Success: the user goes from "this cluster" to "an agent that knows
this cluster and asks before mutating it" in one action, and never talks to
the wrong cluster.

## Positioning

The cluster on screen is the agent's context. No context switching, no
copied kubeconfigs: the session inherits the cluster Freelens has open, and
each cluster and provider pair keeps its own memory (instructions file,
cluster map skills) that outlives every session.

## Operating Context

- Lives inside the Freelens desktop app (Electron), as a cluster page
  ("Freelens Agent Bridge" in the cluster sidebar) and an Extensions
  preferences entry. It renders with the host's components and theme
  (dark and light), next to the host's dock where the session terminal opens.
- A session is a Freelens terminal tab; the page stays visible above the
  dock while the agent works.
- The agent writes skills and agents into the workspace in a terminal the
  page does not observe; the page rescans on focus.

## Capabilities and Constraints

- Provider selection per cluster; readiness probe (`<cli> --version`) with
  ready / missing / error states and a configurable timeout.
- Workspace actions: open session, reveal workspace, open in external
  editor, Reset (restores managed files only).
- In-page editors for each provider's declared files (instructions,
  guardrails, command or skill), autosaved.
- Capabilities (today: "Build a cluster map") and a read-only inventory
  of the workspace's skills and agents.
- Must use the host's React, MobX, Monaco and `Renderer.Component.*`;
  no bundled UI libraries. Styling must follow the host theme variables so
  light and dark themes both work.
- Terminology is fixed by GLOSSARY.md (provider, workspace, session,
  guardrails, managed file, Reset). "Freelens Agent Bridge" is the UI label
  of the sidebar entry and preferences.

## Brand Commitments

- Product name in prose: AgentBridge. UI label: Freelens Agent Bridge.
- It is a Freelens extension: it must feel native to Freelens, not a
  foreign app embedded in it.

## Evidence on Hand

- docs/images/: page and session screenshots; README demo videos.
- No customer quotes, metrics or benchmarks; none may be invented.

## Product Principles

1. The cluster is the context: every surface says which cluster and which
   provider it acts on.
2. One primary action: opening a session is always the obvious next step
   when it is possible.
3. Honest safety: guardrails are a convenience; Kubernetes RBAC is the
   boundary, and the UI never implies otherwise.
4. Nothing destructive without seeing exactly what changes.
5. Native to the host: Freelens components, theme and conventions first.

## Accessibility & Inclusion

No product-specific requirement recorded; WCAG AA contrast, full keyboard
operation and screen-reader names apply as a baseline in both host themes.
