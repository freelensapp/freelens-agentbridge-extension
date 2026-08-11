---
name: build-cluster-map
description: Explore the connected Kubernetes cluster and build a durable, reusable map — a short navigation map merged into the instructions file plus one skill per namespace. Use when asked to map, document, or build memory of the cluster.
---

# Build Cluster Map

Explore the Kubernetes cluster reachable through the inherited `KUBECONFIG` and
persist a durable map so future conversations do not have to re-explore it.

This skill is **idempotent**: on the first run it builds the map; on later runs
it **merges/refreshes** what already exists instead of duplicating it.

## Absolute rules

- **Read-only.** Use only read verbs (`get`, `describe`, `explain`, `top`,
  `api-resources`, `version`, `helm get/status/list/history/show`). Never create,
  apply, edit, delete, scale, patch, exec, port-forward, or restart anything.
- Always pass an explicit `-n <namespace>` for namespaced reads.
- **Never** read or record Secret *values*. Record only Secret *names* and *keys*.
- Keep everything concise. The map is meant to be cheap to load every session.

## Scope

- If the user names a single namespace, refresh only that namespace — regenerate
  its `ns-map-<namespace>` skill and update just its entries in the navigation
  map and the cluster-level skill. Otherwise map the whole cluster.

## Steps

1. **Identify the cluster.**
   - `kubectl config current-context` for the context/cluster name (use it,
     sanitized to lowercase kebab-case, as `<cluster>`).
   - `kubectl version` for server version; infer the distribution when obvious.
   - `kubectl get nodes -o wide` for node count, roles, and runtime.
   - `kubectl get ns` for the namespace inventory. Skip system namespaces
     (`kube-system`, `kube-public`, `kube-node-lease`) unless asked otherwise.

2. **Explore each namespace.**
   - Copilot CLI has no parallel subagents, so explore namespaces
     **sequentially**, one at a time, pinned to `-n <namespace>`.
   - For each namespace produce a concise inventory: workloads
     (Deployments/StatefulSets/DaemonSets/Jobs/CronJobs) with replica health;
     Pods summary (restarts, notable statuses, images); Services + Ingresses /
     Gateways with hostnames; ConfigMap & Secret **names and keys only, never
     values**; PVCs / StorageClasses; RBAC (ServiceAccounts/Roles/RoleBindings);
     NetworkPolicies; recent **Warning** Events grouped; `kubectl top` if metrics
     are available; and a short "health & risks" note.

3. **Write one skill per namespace.**
   - Path: `.github/skills/ns-map-<namespace>/SKILL.md`.
   - Front matter:
     ```
     ---
     name: ns-map-<namespace>
     description: Map of the <namespace> namespace in <cluster> — workloads, services, config, storage, RBAC, risks. Use when working in this namespace.
     ---
     ```
   - Body: the concise inventory from step 2. Overwrite/merge on re-run.

4. **Write one cluster-level skill.**
   - Path: `.github/skills/cluster-map-<cluster>/SKILL.md`.
   - Cluster-wide detail only — nodes, versions/distribution, CRDs, ingress
     controllers, StorageClasses, cross-namespace relationships, cluster-scoped
     RBAC. **Do not** duplicate the short navigation map below.

5. **Merge the short navigation map into the instructions file**
   (`.github/copilot-instructions.md`).
   - Replace (or insert) the block delimited exactly by:
     ```
     <!-- BEGIN AGENTBRIDGE CLUSTER MAP -->
     <!-- END AGENTBRIDGE CLUSTER MAP -->
     ```
   - Keep it **short** — a quick navigator, not a report. It must let you answer
     "which namespace owns X?" without exploring. Include:
     - one line: `<cluster>` — server version, distribution, node count;
     - a compact index mapping notable resources → namespace, e.g.
       `service1, deploy/api, ingress host app.example.com → namespace1`.
   - Do **not** list or point to the skills here.
   - When refreshing a single namespace, update only that namespace's lines
     inside the block and leave the rest untouched.

6. **Report** a one-paragraph summary of what was mapped (namespace count, skills
   written/updated).
