import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agentBridgeProviders } from "./common/agentbridge-providers";

// The README is the only description of Reset a user reads before pressing it,
// and it drifted once already: it claimed Reset restored "only the managed
// permission file" while every provider's resetPaths has held two entries since
// the /build-cluster-map command was added. A destructive action documented as
// narrower than it is costs the user a file, so the registry — not prose — is
// the source of truth these tests pin the prose to.
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

// The README documents Reset in two pieces: the "**Reset button**" paragraph
// names the exact table columns it deletes and re-seeds, and the seeded-files
// table directly above it lists the paths in those columns. A path mentioned
// elsewhere in the README does not count, so the section spans both.
function resetSection(): string {
  const start = readme.indexOf("| Provider");

  expect(start).toBeGreaterThan(-1);

  const resetParagraph = readme.indexOf("**Reset button** deletes and re-seeds");

  expect(resetParagraph).toBeGreaterThan(start);

  const end = readme.indexOf("\n## ", resetParagraph);

  return readme.slice(start, end === -1 ? undefined : end);
}

describe("README", () => {
  it("documents every seeded file of every provider", () => {
    for (const provider of agentBridgeProviders) {
      for (const editor of provider.editors) {
        // A boolean, not toContain: a failed toContain against the whole README
        // prints the whole README as its diff.
        expect(
          readme.includes(`\`${editor.path}\``),
          `${provider.name}: ${editor.path} is seeded but never documented in README.md`,
        ).toBe(true);
      }
    }
  });

  it("names every path Reset destroys in the Reset section", () => {
    const section = resetSection();

    for (const provider of agentBridgeProviders) {
      for (const path of provider.resetPaths) {
        expect(
          section.includes(`\`${path}\``),
          `${provider.name}: Reset deletes ${path}, and README.md's Reset section does not say so`,
        ).toBe(true);
      }
    }
  });

  it("never describes Reset as touching a single file", () => {
    // The exact wording that was wrong, guarded across the whole file: the same
    // claim appeared twice, in the feature list and in "How it works".
    expect(readme).not.toMatch(/only the managed (permission|settings) file/i);
  });

  // The drift above then recurred in the other direction: "the two managed
  // files" was correct for four providers and wrong for the fifth, and it would
  // have passed every assertion here while telling the user Reset destroys
  // fewer files than it does. Prose is not allowed to know the count at all —
  // the per-provider list below the paragraph carries the exact paths, and the
  // registry is the only source of truth for how many there are.
  it("never hardcodes how many files Reset destroys", () => {
    expect(readme).not.toMatch(/\b(one|two|three|four|five|\d+)\s+managed\b/i);
    expect(resetSection()).not.toMatch(/\bboth\s+(files|of them)\b/i);
  });
});
