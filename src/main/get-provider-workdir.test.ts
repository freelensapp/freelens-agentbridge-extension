import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeProviderWorkdir, getSafeClusterKey } from "./get-provider-workdir";

describe("getSafeClusterKey", () => {
  it("bounds an unsafe long cluster ID while retaining a digest", () => {
    const key = getSafeClusterKey(`${"a".repeat(200)}/prod`);

    expect(key).toMatch(/^[a-zA-Z0-9-_]+-[a-f0-9]{12}$/);
    expect(key.length).toBeLessThanOrEqual(109);
  });

  it("distinguishes IDs that sanitize to the same prefix", () => {
    expect(getSafeClusterKey("a/b")).not.toBe(getSafeClusterKey("a:b"));
  });
});

describe("computeProviderWorkdir", () => {
  it("joins the user data, cluster, and provider paths", () => {
    expect(computeProviderWorkdir("/tmp/user", "cluster-1", "opencode")).toBe(
      path.join("/tmp/user", "agentbridge-sessions", "cluster-1-4afb32cc106e", "opencode"),
    );
  });

  it("isolates workdirs by provider and cluster", () => {
    const opencode = computeProviderWorkdir("/tmp/user", "cluster-1", "opencode");

    expect(computeProviderWorkdir("/tmp/user", "cluster-1", "claude")).not.toBe(opencode);
    expect(computeProviderWorkdir("/tmp/user", "cluster-2", "opencode")).not.toBe(opencode);
  });

  it("rejects unknown providers", () => {
    expect(() => computeProviderWorkdir("/tmp/user", "cluster-1", "unknown")).toThrow("Unsupported AI CLI provider");
  });
});
