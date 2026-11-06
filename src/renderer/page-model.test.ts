import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { buildArtifactGroup } from "../common/harness-artifacts";
import { capabilityHints } from "./capability-hints";
import {
  capabilityProgress,
  defaultSelection,
  fileLabel,
  groupEditors,
  isProbeTimeout,
  managedCapabilityNoun,
  providerShortName,
  selectionKey,
  shortenWorkdir,
} from "./page-model";

import type { HarnessArtifact } from "../common/harness-artifacts";

const clusterMap = capabilityHints.find((hint) => hint.id === "cluster-map");

function provider(id: string) {
  const found = agentBridgeProviders.find((candidate) => candidate.id === id);

  if (!found) throw new Error(`no provider ${id}`);
  return found;
}

describe("groupEditors", () => {
  it("puts every declared file in exactly one step, for every provider", () => {
    for (const { id, editors } of agentBridgeProviders) {
      const groups = groupEditors(editors);
      const grouped = [...groups.instructions, ...groups.guardrails, ...groups.settings, ...groups.command];

      expect(grouped, id).toHaveLength(editors.length);
      expect(groups.instructions, id).toHaveLength(1);
      expect(groups.command, id).toHaveLength(1);
    }
  });

  it("counts a permission file, or the settings of a provider without one, as guardrails", () => {
    expect(groupEditors(provider("pi").editors).guardrails.map((editor) => editor.path)).toEqual([
      ".pi/extensions/kubectl-guard.ts",
    ]);
    expect(groupEditors(provider("codex").editors).guardrails.map((editor) => editor.path)).toEqual([
      ".codex/config.toml",
    ]);
    expect(groupEditors(provider("copilot").editors).settings).toEqual([]);
  });

  // Pi's settings hold tools and session options, not an approval policy;
  // calling them guardrails would promise a safety they do not give.
  it("keeps settings beside a permission file apart from the guardrails", () => {
    expect(groupEditors(provider("pi").editors).settings.map((editor) => editor.path)).toEqual([".pi/settings.json"]);
  });

  it("names the managed capability file a skill only where it is one", () => {
    expect(managedCapabilityNoun(groupEditors(provider("copilot").editors))).toBe("skill");
    expect(managedCapabilityNoun(groupEditors(provider("codex").editors))).toBe("skill");
    expect(managedCapabilityNoun(groupEditors(provider("pi").editors))).toBe("command");
  });
});

describe("fileLabel", () => {
  it("keeps the base name, and the directory of a SKILL.md", () => {
    expect(fileLabel(".opencode/opencode.json")).toBe("opencode.json");
    expect(fileLabel("AGENTS.md")).toBe("AGENTS.md");
    expect(fileLabel(".github/skills/build-cluster-map/SKILL.md")).toBe("build-cluster-map/SKILL.md");
  });
});

describe("isProbeTimeout", () => {
  it("recognizes the probe timeout the user can fix in Preferences", () => {
    expect(isProbeTimeout("Pi version probe timed out after 15000ms")).toBe(true);
    expect(isProbeTimeout("Pi --version exited with code 1")).toBe(false);
  });
});

describe("explorer selection", () => {
  it("opens on the instructions file for every provider", () => {
    for (const { id, editors } of agentBridgeProviders) {
      const groups = groupEditors(editors);

      expect(defaultSelection(groups), id).toEqual({ kind: "file", path: groups.instructions[0]?.path });
    }
  });

  it("keys every kind of selection apart", () => {
    expect(selectionKey({ kind: "file", path: "AGENTS.md" })).toBe("file:AGENTS.md");
    expect(selectionKey({ kind: "artifact", path: "AGENTS.md" })).toBe("artifact:AGENTS.md");
    expect(selectionKey({ kind: "capability", id: "cluster-map" })).toBe("capability:cluster-map");
  });
});

describe("shortenWorkdir", () => {
  it("keeps an abbreviated cluster key and the provider directory", () => {
    expect(shortenWorkdir("/home/u/.config/Freelens/agentbridge-sessions/6952fa4870abe023dd17/copilot")).toBe(
      "…/6952fa48…/copilot",
    );
    expect(shortenWorkdir("C:\\Users\\u\\AppData\\Roaming\\Freelens\\agentbridge-sessions\\short\\pi")).toBe(
      "…/short/pi",
    );
  });
});

describe("providerShortName", () => {
  it("drops the vendor only where the switcher needs the room", () => {
    expect(agentBridgeProviders.map(providerShortName)).toEqual([
      "OpenCode",
      "Claude Code",
      "Copilot CLI",
      "Codex CLI",
      "Pi",
    ]);
  });
});

describe("capabilityProgress", () => {
  const skill = (name: string): HarnessArtifact => ({
    kind: "skill",
    name,
    path: `.claude/skills/${name}/SKILL.md`,
    mtimeMs: 5_000,
    origin: "generated",
  });
  const inventory = (artifacts: HarnessArtifact[]) => ({
    status: "ok" as const,
    groups: [buildArtifactGroup("skill", artifacts)],
  });

  it("says nothing before a scan succeeds", () => {
    if (!clusterMap) throw new Error("cluster-map hint missing");
    expect(capabilityProgress(clusterMap, undefined)).toEqual({ status: "unknown" });
    expect(capabilityProgress(clusterMap, { status: "error", error: "boom" })).toEqual({ status: "unknown" });
  });

  it("is done once the cluster-level skill exists, and a todo before", () => {
    if (!clusterMap) throw new Error("cluster-map hint missing");
    expect(capabilityProgress(clusterMap, inventory([skill("ns-map-default")]))).toEqual({ status: "todo" });
    expect(capabilityProgress(clusterMap, inventory([skill("ns-map-default"), skill("cluster-map-kind")]))).toEqual({
      status: "done",
      evidenceName: "cluster-map-kind",
      evidenceMtimeMs: 5_000,
    });
  });
});
