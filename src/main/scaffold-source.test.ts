import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { resolveProviderScaffold, resolveScaffoldsRoot } from "./scaffold-source";

const allowedBashCommands = [
  "kubectl get",
  "kubectl describe",
  "kubectl logs",
  "kubectl explain",
  "kubectl api-resources",
  "kubectl api-versions",
  "kubectl auth can-i",
  "kubectl top",
  "kubectl version",
  "helm list",
  "helm status",
  "helm get",
  "helm history",
  "helm show",
  "helm search",
  "helm version",
];

describe("provider scaffolds", () => {
  it("uses the bundled scaffolds root unless explicitly overridden", () => {
    expect(resolveScaffoldsRoot("custom")).toBe("custom");
    expect(resolveProviderScaffold("opencode", "custom")).toBe(path.join("custom", "opencode"));
  });

  it.each(agentBridgeProviders)("contains every declared editor file for %s", (provider) => {
    const scaffold = resolveProviderScaffold(provider.id);

    for (const editor of provider.editors) expect(existsSync(path.join(scaffold, editor.path))).toBe(true);
  });

  it.each(agentBridgeProviders)("gives %s required cluster-agent guidance", (provider) => {
    const instructions = provider.editors.find((editor) => editor.role === "instructions");
    const content = readFileSync(path.join(resolveProviderScaffold(provider.id), instructions?.path ?? ""), "utf8");

    expect(content).toMatch(/inherited.*KUBECONFIG/is);
    expect(content).toMatch(/inspect.*before.*mutat/is);
    expect(content).toMatch(/explicit namespace/i);
    expect(content).toMatch(/ask before.*destructive.*availability/is);
    expect(content).toMatch(/RBAC.*credentials.*security boundary/is);
    expect(content).toMatch(/cluster notes/i);
  });

  it("limits OpenCode shell permissions to ask plus read-only Kubernetes and Helm commands", () => {
    const config = JSON.parse(
      readFileSync(path.join(resolveProviderScaffold("opencode"), ".opencode/opencode.json"), "utf8"),
    );
    const bash = config.permission.bash;

    expect(bash["*"]).toBe("ask");
    expect(bash).toEqual({
      "*": "ask",
      ...Object.fromEntries(allowedBashCommands.map((command) => [`${command} *`, "allow"])),
    });
  });

  it("allows Claude read-only Kubernetes and Helm commands without bypassing permissions", () => {
    const config = JSON.parse(
      readFileSync(path.join(resolveProviderScaffold("claude"), ".claude/settings.json"), "utf8"),
    );

    expect(JSON.stringify(config)).not.toMatch(/bypass/i);
    expect(config.permissions).toEqual({
      allow: allowedBashCommands.map((command) => `Bash(${command}:*)`),
    });
  });

  it("keeps Copilot settings permission-free", () => {
    const config = JSON.parse(
      readFileSync(path.join(resolveProviderScaffold("copilot"), ".github/copilot/settings.json"), "utf8"),
    );

    expect(config).toEqual({});
  });
});
