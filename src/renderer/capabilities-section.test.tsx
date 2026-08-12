import { describe, expect, it } from "vitest";
import { CapabilityHintCard } from "./capabilities-section";

import type { CapabilityHint } from "./capability-hints";

// CapabilityHintCard is hook-free, so it can be invoked directly and its
// returned React element inspected without a DOM renderer (the test env is
// node, no RTL). We only assert the applicability gate here: the card renders
// nothing when the hint does not apply to the provider, and something when it
// does. Full visual layout lives in capabilities-section.tsx.

const hint: CapabilityHint = {
  id: "test",
  kind: "command",
  title: "Test capability",
  description: "does a thing",
  getInvocation(providerId: string) {
    return providerId === "claude" ? { verb: "Run", command: "/test" } : null;
  },
};

describe("CapabilityHintCard", () => {
  it("renders nothing when the hint does not apply to the provider", () => {
    expect(CapabilityHintCard({ hint, providerId: "copilot" })).toBeNull();
  });

  it("renders an element when the hint applies to the provider", () => {
    expect(CapabilityHintCard({ hint, providerId: "claude" })).not.toBeNull();
  });
});
