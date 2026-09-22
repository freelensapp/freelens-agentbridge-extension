/**
 * AgentBridge kubectl guard — Pi's permission file.
 *
 * Pi has no permission file, no approval policy and no sandbox: built-in tools
 * run with the permissions of the `pi` process, and that is intentional. A
 * `tool_call` hook is the only mechanism Pi offers that can stop a command
 * before it executes, so this extension is what the other providers express
 * declaratively (`permission.bash` on OpenCode, `permissions.allow` on Claude
 * Code, `approval_policy` on Codex).
 *
 * What it does: every `kubectl`, `oc` or `helm` invocation inside a shell
 * command — including the ones chained behind `&&`, `;` or a `sudo` — is checked
 * against a read-only allowlist. Read verbs run untouched; everything else —
 * `delete`, `apply`, `create`, `edit`, `patch`, `scale`, `drain`, `exec`,
 * `cordon`, `rollout`, `helm upgrade`, and anything unrecognised — asks you
 * first, and is blocked if you decline or if no UI is attached to ask. Commands
 * that touch none of those three tools are not intercepted at all.
 *
 * Three things to know before trusting it:
 *
 *   - **It is a convenience, not a security boundary.** It reads one command
 *     string. A wrapper script, a shell variable, a here-doc or a second
 *     extension gets around it. Your kubeconfig and the cluster's RBAC remain
 *     the only real enforcement — pair a cluster session with a read-only
 *     context when that matters.
 *   - **It is inert until the project folder is trusted.** Pi loads nothing
 *     under `.pi/` before you answer its trust prompt. `AGENTS.md` still loads,
 *     so an untrusted session runs on instructions alone.
 *   - **A syntax error here stops Pi from starting**, with
 *     `Failed to load extension ... ParseError` and exit code 1. Recover with
 *     `pi -ne` (start without extensions) or press Reset on the AgentBridge
 *     page to restore this file.
 *
 * To widen it, add commands to ALLOWED_READ_ONLY. To narrow it, remove them.
 * To turn it off, delete the file (Reset brings it back).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// The same read-only set the other providers allow without asking. A prefix
// matches when the command starts with it, so `kubectl get` covers
// `kubectl get pods -A -o yaml`.
const ALLOWED_READ_ONLY = [
  "kubectl get",
  "kubectl describe",
  "kubectl logs",
  "kubectl explain",
  "kubectl api-resources",
  "kubectl api-versions",
  "kubectl auth can-i",
  "kubectl top",
  "kubectl version",
  "kubectl config current-context",
  "kubectl config get-contexts",
  "kubectl config view",
  "helm list",
  "helm status",
  "helm get",
  "helm history",
  "helm show",
  "helm search",
  "helm version",
];

// Named only so the confirmation prompt can say *what* it is about to do.
// Anything not in ALLOWED_READ_ONLY asks regardless of whether it appears here.
const MUTATING_VERBS: Record<string, string> = {
  delete: "deletes resources",
  apply: "creates or updates resources",
  create: "creates resources",
  replace: "replaces resources",
  edit: "edits resources in place",
  patch: "patches resources",
  scale: "changes replica counts",
  autoscale: "changes autoscaling",
  rollout: "restarts or rolls back workloads",
  drain: "evicts every pod from a node",
  cordon: "marks a node unschedulable",
  uncordon: "marks a node schedulable",
  taint: "changes node scheduling",
  annotate: "changes metadata",
  label: "changes metadata",
  exec: "runs a command inside a container",
  attach: "attaches to a running container",
  cp: "copies files into or out of a container",
  "port-forward": "opens a tunnel into the cluster",
  proxy: "opens a proxy to the API server",
  debug: "starts a debug container",
  install: "installs a Helm release",
  upgrade: "upgrades a Helm release",
  uninstall: "uninstalls a Helm release",
  rollback: "rolls back a Helm release",
};

// Shell metacharacters that chain or nest commands. Splitting on them is what
// keeps `echo ok && kubectl delete ns prod` from reading as a harmless `echo`.
const COMMAND_SEPARATORS = /\|\||&&|[;|&\n]|\$\(|`|\)/;

// Leading `FOO=bar`, `sudo`, `env`, `time`, ... before the real executable.
const COMMAND_PREFIXES = new Set(["sudo", "env", "time", "nohup", "command", "exec", "xargs", "nice", "doas"]);

// Flags whose value is a separate word. Without these, `kubectl -n prod get
// pods` reads as the verb `prod` — the command is still caught, but as an
// unrecognised one, so a read-only `get` would be held for approval it does not
// need. The `--flag=value` spelling needs no entry: it is one word.
const VALUE_FLAGS = new Set([
  "-n",
  "--namespace",
  "--context",
  "--cluster",
  "--kubeconfig",
  "--user",
  "--as",
  "--as-group",
  "--server",
  "--token",
  "--request-timeout",
  "-o",
  "--output",
  "-l",
  "--selector",
  "--field-selector",
]);

function segments(command: string): string[] {
  return command
    .split(COMMAND_SEPARATORS)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

// The executable and its arguments, with env assignments and wrappers stripped.
// `/usr/local/bin/kubectl` and `kubectl.exe` both normalise to `kubectl`.
function parse(segment: string): { tool: string; args: string[] } {
  const words = segment.split(/\s+/).filter(Boolean);

  while (words.length > 0) {
    const [word] = words;

    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || COMMAND_PREFIXES.has(word)) words.shift();
    else break;
  }

  const [executable = "", ...args] = words;
  // Lowercased because Windows resolves `KUBECTL.EXE` the same as `kubectl`,
  // and a case-sensitive comparison here would wave it straight through.
  const tool =
    executable
      .toLowerCase()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(exe|cmd|bat)$/, "") ?? "";

  return { tool, args };
}

interface Concern {
  readonly segment: string;
  readonly reason: string;
}

// The arguments that are not flags and not a flag's value, lowercased — the
// subcommand path, in order: `kubectl -n prod get pods -o yaml` -> ["get", "pods"].
function positional(args: string[]): string[] {
  const words: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") break;

    if (arg.startsWith("-")) {
      if (VALUE_FLAGS.has(arg)) index += 1;
      continue;
    }

    words.push(arg.toLowerCase());
  }

  return words;
}

function inspect(command: string): Concern | undefined {
  for (const segment of segments(command)) {
    const { tool, args } = parse(segment);

    if (tool !== "kubectl" && tool !== "helm" && tool !== "oc") continue;

    const words = positional(args);
    const normalised = [tool, ...words].join(" ");

    if (ALLOWED_READ_ONLY.some((allowed) => normalised === allowed || normalised.startsWith(`${allowed} `))) continue;

    // Name the verb when it is one we recognise; otherwise say honestly that the
    // command is simply not on the read-only list.
    const verb = words.find((word) => MUTATING_VERBS[word]);

    return {
      segment,
      reason: verb
        ? `\`${tool} ${verb}\` ${MUTATING_VERBS[verb]}`
        : `\`${segment}\` is not a read-only ${tool} command`,
    };
  }

  return undefined;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // `bash` is the built-in shell tool on every platform (Pi uses Git Bash on
    // Windows); `powershell` is the opt-in Windows alternative.
    if (event.toolName !== "bash" && event.toolName !== "powershell") return undefined;

    const command = typeof event.input.command === "string" ? event.input.command : "";
    const concern = inspect(command);

    if (!concern) return undefined;

    // `-p`, `--mode json` and `--mode rpc` have nobody to ask. Blocking with a
    // reason is the safe default, and the reason reaches the model verbatim as
    // the tool result, so it can explain itself or propose a read-only
    // alternative instead of silently retrying.
    if (!ctx.hasUI) {
      return { block: true, reason: `Blocked by the AgentBridge kubectl guard: ${concern.reason}. No UI to confirm.` };
    }

    const choice = await ctx.ui.select(
      `Cluster mutation requested — ${concern.reason}\n\n  ${concern.segment}\n\nRun it?`,
      ["Run it", "Block it"],
    );

    if (choice !== "Run it") {
      return { block: true, reason: `Blocked by the user: ${concern.reason}. Propose a read-only alternative.` };
    }

    return undefined;
  });
}
