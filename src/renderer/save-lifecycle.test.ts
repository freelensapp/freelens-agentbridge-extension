import { afterEach, describe, expect, it, vi } from "vitest";
import { createSaveLifecycle } from "./save-lifecycle";

describe("save lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates an in-flight save when a newer save starts", () => {
    const lifecycle = createSaveLifecycle();
    const isFirstSaveCurrent = lifecycle.begin();
    const isSecondSaveCurrent = lifecycle.begin();

    expect(isFirstSaveCurrent()).toBe(false);
    expect(isSecondSaveCurrent()).toBe(true);
  });

  it("cancels the saved badge timer when the editor lifecycle changes", () => {
    vi.useFakeTimers();
    const lifecycle = createSaveLifecycle();
    const showIdle = vi.fn();

    lifecycle.setBadgeTimer(showIdle);
    lifecycle.invalidate();
    vi.advanceTimersByTime(1000);

    expect(showIdle).not.toHaveBeenCalled();
  });
});
