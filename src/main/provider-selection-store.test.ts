import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSelectedProvider, writeSelectedProvider } from "./provider-selection-store";

const SELECTIONS_FILE = "agentbridge-provider-selections.json";

describe("provider selection store", () => {
  let userData: string;

  beforeEach(() => {
    userData = mkdtempSync(path.join(tmpdir(), "agentbridge-selections-"));
  });

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it("has no selection when no file exists", () => {
    expect(readSelectedProvider(userData, "cluster-a")).toBeNull();
  });

  it("has no selection when the file is corrupt", () => {
    writeFileSync(path.join(userData, SELECTIONS_FILE), "{not json", "utf8");

    expect(readSelectedProvider(userData, "cluster-a")).toBeNull();
  });

  it("keeps one selection per cluster", () => {
    writeSelectedProvider(userData, "cluster-a", "opencode");
    writeSelectedProvider(userData, "cluster-b", "claude");
    writeSelectedProvider(userData, "cluster-a", "pi");

    expect(readSelectedProvider(userData, "cluster-a")).toBe("pi");
    expect(readSelectedProvider(userData, "cluster-b")).toBe("claude");
    expect(JSON.parse(readFileSync(path.join(userData, SELECTIONS_FILE), "utf8"))).toEqual({
      "cluster-a": "pi",
      "cluster-b": "claude",
    });
  });

  it("ignores a stored provider the registry no longer has", () => {
    writeFileSync(path.join(userData, SELECTIONS_FILE), JSON.stringify({ "cluster-a": "removed" }), "utf8");

    expect(readSelectedProvider(userData, "cluster-a")).toBeNull();
  });

  it("does not read inherited properties as selections", () => {
    expect(readSelectedProvider(userData, "constructor")).toBeNull();
    expect(readSelectedProvider(userData, "__proto__")).toBeNull();
  });

  it("stores a cluster id that names an Object property as a plain key", () => {
    writeSelectedProvider(userData, "__proto__", "codex");

    expect(readSelectedProvider(userData, "__proto__")).toBe("codex");
    expect(readSelectedProvider(userData, "cluster-a")).toBeNull();
  });

  it("rejects an unknown provider or an empty cluster id without writing", () => {
    expect(() => writeSelectedProvider(userData, "cluster-a", "unknown")).toThrow("Unsupported AI CLI provider");
    expect(() => writeSelectedProvider(userData, "", "claude")).toThrow("Invalid cluster id");
    expect(() => writeSelectedProvider(userData, 42, "claude")).toThrow("Invalid cluster id");
    expect(readSelectedProvider(userData, "cluster-a")).toBeNull();
  });

  it("creates the user data directory when missing", () => {
    const nested = path.join(userData, "nested");

    writeSelectedProvider(nested, "cluster-a", "copilot");

    expect(readSelectedProvider(nested, "cluster-a")).toBe("copilot");
  });
});
