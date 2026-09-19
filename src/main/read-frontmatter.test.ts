import { execFileSync } from "node:child_process";
import { closeSync, lstatSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFrontmatter, parseTomlMetadata, readFrontmatter } from "./read-frontmatter";

import type { FileIdentity } from "./read-frontmatter";

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

// The scanner passes the `lstat` result it already containment-checked; these
// tests do the same, so a mismatch below is a deliberate fixture, never noise.
function identityOf(target: string): FileIdentity {
  const { dev, ino } = lstatSync(target);

  return { dev, ino };
}

function readFile(contents: string) {
  const file = createFile(contents);

  return readFrontmatter(file, identityOf(file));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A Codex subagent file, shaped like the one in OpenAI's own docs.
const CODEX_AGENT = [
  'name = "reviewer"',
  'description = "PR reviewer focused on correctness, security, and missing tests."',
  'model = "gpt-5.6-terra"',
  'sandbox_mode = "read-only"',
  'developer_instructions = """',
  "Review code like an owner.",
  'name = "not-the-agent-name"',
  '"""',
  "",
].join("\n");

describe("parseTomlMetadata", () => {
  it("extracts the top-level name and description of a Codex subagent", () => {
    expect(parseTomlMetadata(CODEX_AGENT)).toEqual({
      name: "reviewer",
      description: "PR reviewer focused on correctness, security, and missing tests.",
    });
  });

  it("accepts CRLF line endings and a leading BOM", () => {
    expect(parseTomlMetadata('﻿name = "agent-one"\r\ndescription = "does things"\r\n')).toEqual({
      name: "agent-one",
      description: "does things",
    });
  });

  it("reads literal strings and ignores trailing comments", () => {
    expect(parseTomlMetadata("name = 'agent-one' # the name\ndescription = \"does things\"  # why\n")).toEqual({
      name: "agent-one",
      description: "does things",
    });
  });

  // Everything after a table header belongs to that table, so a `name` inside
  // `[skills.config]` is not the agent's name.
  it("stops at the first table header, indented or not", () => {
    expect(parseTomlMetadata('name = "outer"\n[[skills.config]]\ndescription = "inner"\n')).toEqual({ name: "outer" });
    expect(parseTomlMetadata('name = "outer"\n  [agents.explorer]\ndescription = "inner"\n')).toEqual({
      name: "outer",
    });
  });

  // A multi-line string body can contain anything, including a line shaped
  // exactly like a top-level key — see CODEX_AGENT's decoy.
  it("stops at an unterminated multi-line string rather than reading into it", () => {
    expect(parseTomlMetadata('developer_instructions = """\nname = "decoy"\n"""\n')).toEqual({});
  });

  it("ignores indented keys, comments and non-string values", () => {
    expect(parseTomlMetadata('  name = "indented"\n# name = "commented"\nname = 12\ndescription = true\n')).toEqual({});
  });

  it("keeps the first occurrence of each key", () => {
    expect(parseTomlMetadata('name = "first"\nname = "second"\n')).toEqual({ name: "first" });
  });

  // TOML has no closing delimiter to prove the head window captured a whole
  // block, so an unterminated final line is where HEAD_BYTES cut the file — it
  // may be missing the rest of its value or half a UTF-8 sequence.
  it("drops a final line the head window did not terminate", () => {
    expect(parseTomlMetadata('name = "kept"\ndescription = "truncated here')).toEqual({ name: "kept" });
    expect(parseTomlMetadata('name = "kept"\ndescription = "whole"\n')).toEqual({
      name: "kept",
      description: "whole",
    });
  });

  // Escapes are the one place a "close enough" reader would show the user a
  // wrong value (`a\nb` rendered literally), so basic strings carrying one yield
  // nothing instead.
  it("yields nothing for a value it cannot render exactly", () => {
    expect(parseTomlMetadata('name = "a\\nb"\n')).toEqual({});
    expect(parseTomlMetadata('name = ""\n')).toEqual({});
  });

  it("does not read markdown frontmatter", () => {
    expect(parseTomlMetadata("---\nname: markdown-agent\n---\n")).toEqual({});
  });
});

describe("readFrontmatter with the toml format", () => {
  it("reads a .toml artifact and ignores the markdown reader", () => {
    const file = path.join(createRoot(), "reviewer.toml");
    writeFileSync(file, CODEX_AGENT, "utf8");

    expect(readFrontmatter(file, identityOf(file), "toml")).toEqual({
      name: "reviewer",
      description: "PR reviewer focused on correctness, security, and missing tests.",
    });
    expect(readFrontmatter(file, identityOf(file))).toEqual({});
  });

  it("applies the same identity check as the markdown format", () => {
    const file = path.join(createRoot(), "reviewer.toml");
    writeFileSync(file, CODEX_AGENT, "utf8");

    expect(readFrontmatter(file, { dev: 1, ino: 1 }, "toml")).toEqual({});
  });

  // The head cap is shared, so a key pushed past it is simply not there.
  it("never reads past the head window", () => {
    const file = path.join(createRoot(), "reviewer.toml");
    writeFileSync(file, `${"# padding\n".repeat(HEAD_BYTES)}name = "too-late"\n`, "utf8");

    expect(readFrontmatter(file, identityOf(file), "toml")).toEqual({});
  });
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

  // `name` is rendered in a <strong> and crosses IPC exactly like `description`,
  // so it gets exactly the same cap; an 1800-character name is payload.
  it("caps the name at 200 characters", () => {
    expect(parseFrontmatter(`---\nname: ${"x".repeat(1800)}\n---\n`).name).toHaveLength(200);
    expect(parseFrontmatter(`---\nname: ${"x".repeat(200)}\n---\n`).name).toBe("x".repeat(200));
    expect(parseFrontmatter(`---\nname: ${"x".repeat(199)}\n---\n`).name).toHaveLength(199);
  });

  // Replaces two tests that asserted a block with no closing delimiter still
  // yielded its fields (minus a possibly-truncated tail). That behaviour scanned
  // the whole 4096-byte head as frontmatter, so an ordinary markdown document
  // opening with a `---` thematic break leaked BODY lines into the inventory and
  // across IPC. An unterminated block is simply not frontmatter now.
  it("returns nothing when the block never closes", () => {
    expect(parseFrontmatter("---\nname: complete\ndescription: truncated-mid-val")).toEqual({});
    expect(parseFrontmatter("---\nname: complete\ndescription: also complete\n")).toEqual({});
  });

  it("never reads a body line of a document that merely opens with a thematic break", () => {
    const document = "---\n# Deployment notes\n\nSome prose here.\ndescription: prod db password is hunter2-SECRET\n\n";

    expect(parseFrontmatter(document)).toEqual({});
  });
});

describe("readFrontmatter", () => {
  it("reads frontmatter from a file", () => {
    expect(readFile("---\nname: from-disk\n---\nbody")).toEqual({ name: "from-disk" });
  });

  // Was "ignores fields pushed beyond the 4096-byte head": a block whose closing
  // delimiter is outside the window is now unreadable in full, not readable in
  // part, because the head of such a file is indistinguishable from body text.
  it("yields nothing when the closing delimiter is pushed beyond the 4096-byte head", () => {
    const padding = `padding: ${"y".repeat(5000)}\n`;

    expect(readFile(`---\nname: early\n${padding}description: too late\n---\n`)).toEqual({});
  });

  it("keeps a field whose block closes exactly at the head boundary", () => {
    const head = `---\npadding: ${"y".repeat(4060)}\nname: at-boundary\n---\n`;
    expect(Buffer.byteLength(head)).toBe(HEAD_BYTES);

    expect(readFile(`${head}description: in the body\n`)).toEqual({ name: "at-boundary" });
  });

  it("yields nothing when a value is cut in half by the head boundary", () => {
    const head = `---\nname: early\npadding: ${"y".repeat(4000)}\n`;
    expect(Buffer.byteLength(head)).toBeLessThan(HEAD_BYTES);

    expect(readFile(`${head}description: ${"z".repeat(500)}\n---\n`)).toEqual({});
  });

  it("never emits a replacement character when a multi-byte character is split by the boundary", () => {
    const prefix = "---\nname: early\ndescription: ";
    // An odd number of remaining bytes guarantees the boundary lands inside one
    // of the two-byte characters, so the decoded head ends in U+FFFD.
    expect((HEAD_BYTES - Buffer.byteLength(prefix)) % 2).toBe(1);

    const parsed = readFile(`${prefix}${"é".repeat(2100)}\n---\n`);

    expect(parsed).toEqual({});
    expect(JSON.stringify(parsed)).not.toContain("�");
  });

  it("returns nothing for a missing or unreadable file", () => {
    expect(readFrontmatter(path.join(tmpdir(), "definitely-missing-frontmatter.md"), { dev: 0, ino: 0 })).toEqual({});
  });

  it("returns nothing for a directory instead of throwing", () => {
    const root = createRoot();

    expect(readFrontmatter(root, identityOf(root))).toEqual({});
  });

  // The open is an independent, third resolution of a path the caller already
  // lstat-ed and containment-checked, so the descriptor — not the path — has to
  // be proven to be that same file.
  it("returns nothing when the file at the path is not the file the caller checked", () => {
    const checked = createFile("---\nname: checked\n---\n");
    const swapped = createFile("---\nname: swapped-in\n---\n");

    expect(readFrontmatter(swapped, identityOf(checked))).toEqual({});
    expect(readFrontmatter(swapped, identityOf(swapped))).toEqual({ name: "swapped-in" });
  });

  it("does not follow a symlink left at the path after the check", () => {
    const target = createFile("---\nname: link-target\n---\n");
    const link = path.join(createRoot(), "SKILL.md");
    symlinkSync(target, link, "file");

    // Both identities: the link's own (what an lstat would have seen) and its
    // target's (what a follow would land on). Neither may read the target.
    expect(readFrontmatter(link, identityOf(link))).toEqual({});
    expect(readFrontmatter(link, identityOf(target))).toEqual({});
  });

  // Without O_NONBLOCK this call never returns: openSync on a reader-less FIFO
  // blocks the Electron main process forever, with no timeout to rescue it.
  it.skipIf(process.platform === "win32")("does not block on a FIFO left at the path", () => {
    const fifo = path.join(createRoot(), "SKILL.md");
    execFileSync("mkfifo", [fifo]);

    expect(readFrontmatter(fifo, identityOf(fifo))).toEqual({});
  });

  it("closes every descriptor it opens", () => {
    const file = createFile("---\nname: fd-check\n---\n");
    const identity = identityOf(file);
    const baseline = openSync(file, "r");
    closeSync(baseline);

    for (let index = 0; index < 200; index++) {
      expect(readFrontmatter(file, identity)).toEqual({ name: "fd-check" });
    }

    const afterwards = openSync(file, "r");
    closeSync(afterwards);

    // A leaked descriptor per call would push this hundreds of slots higher.
    expect(afterwards).toBeLessThanOrEqual(baseline + 8);
  });
});
