import { beforeEach, describe, expect, it } from "vitest";
import { setActiveMonacoTheme } from "../../test/freelens-extensions";
import { resolveHostMonacoTheme } from "./section-theme";

describe("resolveHostMonacoTheme", () => {
  beforeEach(() => {
    setActiveMonacoTheme("vs-dark");
  });

  it("returns 'vs' when the host theme is 'vs' (light)", () => {
    setActiveMonacoTheme("vs");
    expect(resolveHostMonacoTheme()).toBe("vs");
  });

  it("returns 'vs-dark' when the host theme is anything else", () => {
    setActiveMonacoTheme("clouds-midnight");
    expect(resolveHostMonacoTheme()).toBe("vs-dark");
  });
});
