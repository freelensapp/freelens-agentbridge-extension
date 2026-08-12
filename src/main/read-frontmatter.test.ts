import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFrontmatter, readFrontmatter } from "./read-frontmatter";

// Mirrors the implementation's cap. Kept local so the boundary fixtures below
// fail loudly if the implementation ever changes it silently.
const HEAD_BYTES = 4096;

const roots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "frontmatter-"));
  roots.push(root);
  return root;
}

function createFile(contents: string): string {
  const file = path.join(createRoot(), "SKILL.md");
  writeFileSync(file, contents, "utf8");
  return file;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("parseFrontmatter", () => {
  it("extracts name and description from a leading block", () => {
    expect(parseFrontmatter("---\nname: ns-map-kube-system\ndescription: Map of kube-system\n---\n# body")).toEqual({
      name: "ns-map-kube-system",
      description: "Map of kube-system",
    });
  });

  it("accepts CRLF line endings and a leading BOM", () => {
    expect(parseFrontmatter("﻿---\r\nname: agent-one\r\ndescription: does things\r\n---\r\n")).toEqual({
      name: "agent-one",
      description: "does things",
    });
  });

  it("accepts delimiter lines padded with whitespace", () => {
    expect(parseFrontmatter("--- \nname: padded\n\t---  \ndescription: in the body\n")).toEqual({ name: "padded" });
  });

  it("strips matching surrounding quotes", () => {
    expect(parseFrontmatter(`---\nname: "quoted"\ndescription: 'single'\n---\n`)).toEqual({
      name: "quoted",
      description: "single",
    });
  });

  it("trims whitespace outside and inside the quotes", () => {
    expect(parseFrontmatter(`---\nname: "quoted"   \ndescription:   "  padded  "\n---\n`)).toEqual({
      name: "quoted",
      description: "padded",
    });
  });

  // Regression: a greedy /^(["'])(.*)\1$/ matches the OUTERMOST pair of quotes,
  // so it would strip the first and last quote of a value that was never fully
  // quoted and silently yield `a" and "b`.
  it("leaves a value alone when the quotes do not surround the whole value", () => {
    expect(parseFrontmatter(`---\ndescription: "a" and "b"\n---\n`)).toEqual({ description: `"a" and "b"` });
    expect(parseFrontmatter(`---\ndescription: 'a' or 'b'\n---\n`)).toEqual({ description: `'a' or 'b'` });
    expect(parseFrontmatter(`---\nname: "unbalanced\n---\n`)).toEqual({ name: `"unbalanced` });
    expect(parseFrontmatter(`---\nname: "mixed'\n---\n`)).toEqual({ name: `"mixed'` });
  });

  it("unquotes a value that contains the other quote character", () => {
    expect(parseFrontmatter(`---\nname: "it's fine"\ndescription: 'she said "hi"'\n---\n`)).toEqual({
      name: "it's fine",
      description: `she said "hi"`,
    });
  });

  it("keeps a colon that appears inside a value", () => {
    expect(parseFrontmatter("---\ndescription: Use kubectl: get pods\n---\n")).toEqual({
      description: "Use kubectl: get pods",
    });
  });

  it("ignores unrelated keys and stops at the closing delimiter", () => {
    expect(parseFrontmatter("---\nname: a\nmode: subagent\n---\ndescription: in the body\n")).toEqual({ name: "a" });
  });

  it("ignores indented keys nested under another key", () => {
    expect(parseFrontmatter("---\nmetadata:\n  name: nested\n  description: nested too\n---\n")).toEqual({});
  });

  it("returns nothing when the file does not start with a delimiter", () => {
    expect(parseFrontmatter("# Just a heading\nname: a\n")).toEqual({});
  });

  it("returns nothing for malformed or empty frontmatter", () => {
    expect(parseFrontmatter("---\n\t\tnot: valid: yaml: at: all\n---\n")).toEqual({});
    expect(parseFrontmatter("---\nname:\ndescription:   \n---\n")).toEqual({});
    expect(parseFrontmatter("")).toEqual({});
  });

  it("keeps the first occurrence of a repeated key", () => {
    expect(parseFrontmatter("---\nname: first\nname: second\n---\n")).toEqual({ name: "first" });
    expect(parseFrontmatter("---\ndescription: first\ndescription: second\n---\n")).toEqual({ description: "first" });
  });

  it("skips an empty value so a later non-empty one still wins", () => {
    expect(parseFrontmatter("---\nname:\nname: second\n---\n")).toEqual({ name: "second" });
  });

  it("caps the description at 200 characters", () => {
    expect(parseFrontmatter(`---\ndescription: ${"x".repeat(500)}\n---\n`).description).toHaveLength(200);
    expect(parseFrontmatter(`---\ndescription: ${"x".repeat(200)}\n---\n`).description).toBe("x".repeat(200));
    expect(parseFrontmatter(`---\ndescription: ${"x".repeat(199)}\n---\n`).description).toHaveLength(199);
  });

  it("discards the trailing line when the block never closes", () => {
    expect(parseFrontmatter("---\nname: complete\ndescription: truncated-mid-val")).toEqual({ name: "complete" });
  });

  it("keeps a newline-terminated final line when the block never closes", () => {
    expect(parseFrontmatter("---\nname: complete\ndescription: also complete\n")).toEqual({
      name: "complete",
      description: "also complete",
    });
  });
});

describe("readFrontmatter", () => {
  it("reads frontmatter from a file", () => {
    expect(readFrontmatter(createFile("---\nname: from-disk\n---\nbody"))).toEqual({ name: "from-disk" });
  });

  it("ignores fields pushed beyond the 4096-byte head without throwing", () => {
    const padding = `padding: ${"y".repeat(5000)}\n`;
    const file = createFile(`---\nname: early\n${padding}description: too late\n---\n`);

    expect(readFrontmatter(file)).toEqual({ name: "early" });
  });

  it("keeps a field whose line ends exactly at the head boundary", () => {
    const head = `---\npadding: ${"y".repeat(4064)}\nname: at-boundary\n`;
    expect(Buffer.byteLength(head)).toBe(HEAD_BYTES);

    expect(readFrontmatter(createFile(`${head}description: too late\n---\n`))).toEqual({ name: "at-boundary" });
  });

  it("discards a field whose value is cut in half by the head boundary", () => {
    const head = `---\nname: early\npadding: ${"y".repeat(4000)}\n`;
    expect(Buffer.byteLength(head)).toBeLessThan(HEAD_BYTES);

    expect(readFrontmatter(createFile(`${head}description: ${"z".repeat(500)}\n---\n`))).toEqual({ name: "early" });
  });

  it("discards a line whose multi-byte character is split by the head boundary", () => {
    const prefix = "---\nname: early\ndescription: ";
    // An odd number of remaining bytes guarantees the boundary lands inside one
    // of the two-byte characters, so the decoded head ends in U+FFFD.
    expect((HEAD_BYTES - Buffer.byteLength(prefix)) % 2).toBe(1);

    const parsed = readFrontmatter(createFile(`${prefix}${"é".repeat(2100)}\n---\n`));

    expect(parsed).toEqual({ name: "early" });
    expect(JSON.stringify(parsed)).not.toContain("�");
  });

  it("returns nothing for a missing or unreadable file", () => {
    expect(readFrontmatter(path.join(tmpdir(), "definitely-missing-frontmatter.md"))).toEqual({});
  });

  it("returns nothing for a directory instead of throwing", () => {
    expect(readFrontmatter(createRoot())).toEqual({});
  });

  it("closes every descriptor it opens", () => {
    const file = createFile("---\nname: fd-check\n---\n");
    const baseline = openSync(file, "r");
    closeSync(baseline);

    for (let index = 0; index < 200; index++) {
      expect(readFrontmatter(file)).toEqual({ name: "fd-check" });
    }

    const afterwards = openSync(file, "r");
    closeSync(afterwards);

    // A leaked descriptor per call would push this hundreds of slots higher.
    expect(afterwards).toBeLessThanOrEqual(baseline + 8);
  });
});
