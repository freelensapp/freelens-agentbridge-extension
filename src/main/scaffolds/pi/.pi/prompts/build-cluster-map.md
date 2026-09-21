---
description: Explore the connected cluster and build a durable, reusable map (navigation map in AGENTS.md + per-namespace skills).
argument-hint: "[namespace]"
---

# Build Cluster Map

Explore the Kubernetes cluster reachable through the inherited `KUBECONFIG` and
persist a durable map so future conversations do not have to re-explore it.

This command is **idempotent**: on the first run it builds the map; on later runs
it **merges/refreshes** what already exists instead of duplicating it.

## Absolute rules

- **Read-only.** Use only read verbs (`get`, `describe`, `explain`, `top`,
  `api-resources`, `version`, `helm get/status/list/history/show`). Never create,
  apply, edit, delete, scale, patch, exec, port-forward, or restart anything.
  The seeded `.pi/extensions/kubectl-guard.ts` will stop you anyway, but a
  blocked call is a wasted turn — stay inside the read verbs.
- Always pass an explicit `-n <namespace>` for namespaced reads.
- **Never** read or record Secret *values*. Record only Secret *names* and *keys*.
- Keep everything concise. The map is meant to be cheap to load every session.

## Scope

- `${1:-}` is an optional single namespace.
  - **If a namespace is given**: refresh only that namespace — regenerate its
    `ns-map-<namespace>` skill and update just its entries in the navigation map
    and the cluster-level skill. Do not touch other namespaces.
  - **If empty**: map the whole cluster (all namespaces).

## Steps

1. **Identify the cluster.**
   - `kubectl config current-context` for the context/cluster name (use it,
     sanitized to lowercase kebab-case, as `<cluster>`).
   - `kubectl version` for server version; infer the distribution when obvious
     (EKS/GKE/AKS/k3s/OpenShift/kubeadm) from nodes and version metadata.
   - `kubectl get nodes -o wide` for node count, roles, and kernel/runtime.
   - `kubectl get ns` for the namespace inventory. Skip system namespaces
     (`kube-system`, `kube-public`, `kube-node-lease`) unless the user asked for
     a specific one.

2. **Explore each namespace.**
   - Pi has no sub-agents, so explore namespaces **sequentially**, one at a
     time, each read pinned to `-n <namespace>`.
   - For each namespace produce a concise inventory: workloads
     (Deployments/StatefulSets/DaemonSets/Jobs/CronJobs) with replica health;
     Pods summary (restarts, notable statuses, images); Services + Ingresses /
     Gateways with hostnames; ConfigMap & Secret **names and keys only, never
     values**; PVCs / StorageClasses; RBAC (ServiceAccounts/Roles/RoleBindings);
     NetworkPolicies; recent **Warning** Events grouped; `kubectl top` if metrics
     are available; and a short "health & risks" note.

3. **Write one skill per namespace.**
   - Path: `.pi/skills/ns-map-<namespace>/SKILL.md`.
   - Front matter — Pi drops a skill whose `description` is missing **without
     warning**, so always write both keys:
     ```yaml
     ---
     name: ns-map-<namespace>
     description: Map of the <namespace> namespace in <cluster> — workloads, services, config, storage, RBAC, risks. Load when working in this namespace.
     ---
     ```
   - Body: the concise inventory from step 2. Overwrite/merge on re-run so it
     stays fresh.

4. **Write one cluster-level skill.**
   - Path: `.pi/skills/cluster-map-<cluster>/SKILL.md`, with the same `name` +
     `description` front matter.
   - Cluster-wide detail only — nodes, versions/distribution, CRDs, ingress
     controllers, StorageClasses, cross-namespace relationships, cluster-scoped
     RBAC. **Do not** duplicate the short navigation map below.

5. **Merge the short navigation map into the instructions file** (`AGENTS.md`).
   - Replace (or insert) the block delimited exactly by:
     ```markdown
     <!-- BEGIN AGENTBRIDGE CLUSTER MAP -->
     <!-- END AGENTBRIDGE CLUSTER MAP -->
     ```
   - Keep it **short** — it is a quick navigator, not a report. It must let you
     answer "which namespace owns X?" without exploring. Include:
     - one line: `<cluster>` — server version, distribution, node count;
     - a compact index mapping notable resources → namespace, e.g.
       `service1, deploy/api, ingress host app.example.com → namespace1`.
   - Do **not** list or point to the skills here (Pi advertises them itself).
   - When refreshing a single namespace, update only that namespace's lines
     inside the block and leave the rest untouched.
   - Leave the rest of `AGENTS.md` alone — in particular the guardrail section,
     which the user may have edited.

6. **Report** a one-paragraph summary of what was mapped (namespace count, skills
   written/updated) and remind the user that the newly written skills are picked
   up on the next start, and that the map refreshes by re-running
   `/build-cluster-map` (optionally with a namespace argument).
