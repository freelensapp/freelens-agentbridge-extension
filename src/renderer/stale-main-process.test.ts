import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import { describeStaleMainProcessError, FULL_RESTART_REMEDY, isStaleMainProcessError } from "./stale-main-process";

const REMEDY = `Something needs a full Freelens restart. ${FULL_RESTART_REMEDY}`;

// Verbatim from issue #23: the renderer offered Codex, the main process bundle
// loaded at startup predated it.
const CODEX_REPORT =
  "Error invoking remote method 'agentbridge-extension:check-provider': Error: Unsupported AI CLI provider: codex";

describe("isStaleMainProcessError", () => {
  it("recognises a channel the running main process never registered", () => {
    expect(
      isStaleMainProcessError(
        "Error invoking remote method 'agentbridge-extension:list-provider-artifacts': Error: No handler registered for 'agentbridge-extension:list-provider-artifacts'",
      ),
    ).toBe(true);
  });

  it("recognises a provider the running main process has never heard of", () => {
    expect(isStaleMainProcessError(CODEX_REPORT)).toBe(true);
  });

  it("recognises the same disagreement on every provider-taking channel", () => {
    // The throw comes from getAgentBridgeProvider, which every one of these
    // reaches; only the wrapping channel name differs.
    for (const channel of ["prepare-workspace", "read-provider-file", "reset-provider", "list-provider-artifacts"]) {
      expect(
        isStaleMainProcessError(
          `Error invoking remote method 'agentbridge-extension:${channel}': Error: Unsupported AI CLI provider: codex`,
        ),
      ).toBe(true);
    }
  });

  it("covers every registered provider, so a fifth one inherits this for free", () => {
    for (const { id } of agentBridgeProviders) {
      expect(isStaleMainProcessError(`Error: Unsupported AI CLI provider: ${id}`)).toBe(true);
    }
  });

  it("leaves an id this renderer does not offer alone", () => {
    // A hand-edited localStorage entry, or an id dropped from a later build.
    // Both sides agree it is unknown, so there is nothing a restart would fix
    // and sending the user to reboot would be a lie.
    expect(isStaleMainProcessError("Error: Unsupported AI CLI provider: nope")).toBe(false);
    expect(isStaleMainProcessError("Error: Unsupported AI CLI provider: codexx")).toBe(false);
  });

  it("leaves unrelated failures alone", () => {
    expect(isStaleMainProcessError("EACCES: permission denied, scandir '/x'")).toBe(false);
    expect(isStaleMainProcessError("codex --version exited with code 1")).toBe(false);
    expect(isStaleMainProcessError("")).toBe(false);
  });
});

describe("describeStaleMainProcessError", () => {
  it("replaces a stale-bundle failure with the remedy", () => {
    expect(describeStaleMainProcessError(CODEX_REPORT, REMEDY)).toBe(REMEDY);
  });

  it("does not leak the raw programmer-error string to the user", () => {
    expect(describeStaleMainProcessError(CODEX_REPORT, REMEDY)).not.toMatch(/Unsupported AI CLI provider/);
    expect(describeStaleMainProcessError(CODEX_REPORT, REMEDY)).not.toMatch(/invoking remote method/);
  });

  it("passes every other message through untouched", () => {
    expect(describeStaleMainProcessError("EACCES: permission denied", REMEDY)).toBe("EACCES: permission denied");
  });
});

describe("FULL_RESTART_REMEDY", () => {
  // The one detail users get wrong: a window reload re-requires the renderer
  // only, so it can never refresh the main process bundle.
  it("rules out a window reload", () => {
    expect(FULL_RESTART_REMEDY).toMatch(/window reload only updates the UI/);
  });
});
