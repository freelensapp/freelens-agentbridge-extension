// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("./ipc", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
// Monaco needs a real browser; a textarea stands in for it.
vi.mock("./code-editor", () => ({
  CodeEditor: ({ initialValue, onChange, ariaLabel }: Record<string, any>) => (
    <textarea aria-label={ariaLabel} defaultValue={initialValue} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { ProviderFileEditor } from "./provider-file-editor";

import type { EditorDefinition } from "../common/agentbridge-providers";

const GUARD: EditorDefinition = {
  path: ".pi/extensions/kubectl-guard.ts",
  title: "Permissions",
  language: "typescript",
  role: "permissions",
};
const SETTINGS: EditorDefinition = { path: ".pi/settings.json", title: "Settings", language: "json", role: "settings" };

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockImplementation((channel: string) =>
    Promise.resolve(channel === "read-provider-file" ? { content: "original", exists: true } : { ok: true, bytes: 1 }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  invoke.mockReset();
});

async function settle() {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}

function writes() {
  return invoke.mock.calls.filter(([channel]) => channel === "write-provider-file");
}

describe("ProviderFileEditor", () => {
  it("autosaves after a pause and says so", async () => {
    render(<ProviderFileEditor clusterId="c" providerId="pi" editor={SETTINGS} />);
    await settle();

    fireEvent.change(screen.getByLabelText(".pi/settings.json"), { target: { value: "{}" } });
    expect(screen.getByText("Saving…")).toBeDefined();
    await settle();

    expect(writes()).toEqual([["write-provider-file", "c", "pi", ".pi/settings.json", "{}"]]);
    expect(screen.getByText("Saved")).toBeDefined();
  });

  it("writes a pending edit at once when another file opens, instead of dropping it", async () => {
    const { rerender } = render(<ProviderFileEditor clusterId="c" providerId="pi" editor={GUARD} />);
    await settle();

    fireEvent.change(screen.getByLabelText(".pi/extensions/kubectl-guard.ts"), { target: { value: "edited" } });
    rerender(<ProviderFileEditor clusterId="c" providerId="pi" editor={SETTINGS} />);

    expect(writes()).toEqual([["write-provider-file", "c", "pi", ".pi/extensions/kubectl-guard.ts", "edited"]]);
    await settle();
    expect(writes()).toHaveLength(1);
  });

  it("never shows a file it could not read as an empty, editable one", async () => {
    invoke.mockImplementation(() => Promise.reject(new Error("EACCES")));
    render(<ProviderFileEditor clusterId="c" providerId="pi" editor={SETTINGS} />);
    await settle();

    expect(screen.getByRole("alert").textContent).toContain("EACCES");
    expect(screen.queryByLabelText(".pi/settings.json")).toBeNull();
  });
});
