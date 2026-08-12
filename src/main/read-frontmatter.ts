import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

// Bytes read from the head of an artifact file. Frontmatter blocks written by
// every provider are far smaller than this; the cap exists so a hostile or
// merely huge file cannot be pulled into memory by a directory listing.
const HEAD_BYTES = 4096;

// Both fields cross IPC and are rendered in a single line — the description
// truncated, the name in a <strong>. Anything longer is payload the renderer
// would only throw away, so it never leaves this module.
const MAX_FIELD_LENGTH = 200;

// Top-level, unindented key only: an indented `name:` belongs to some nested
// mapping this reader does not model, so it must not be mistaken for the
// artifact's own name.
const FIELD_PATTERN = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/;

// Deliberately NOT /^(["'])(.*)\1$/: `.*` backtracks, so that pattern matches
// the OUTERMOST pair of quotes and would turn `"a" and "b"` into `a" and "b`.
// A value is unquoted only when one delimiter opens it, the same delimiter
// closes it, and it does not occur in between.
const QUOTED_PATTERN = /^"([^"]*)"$|^'([^']*)'$/;

export interface Frontmatter {
  name?: string;
  description?: string;
}

// The file the caller already lstat-ed and containment-checked. `fs.Stats`
// satisfies this structurally, so a scanner hands over the very stats it made
// its decision on and nothing has to be re-derived from the path.
export interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

function unquote(value: string): string {
  const match = QUOTED_PATTERN.exec(value);

  return (match ? (match[1] ?? match[2]) : value).trim();
}

// Deliberately NOT a YAML parser: a line-oriented reader for the single-line
// scalars all three providers write. Anything it cannot read yields no value
// rather than a wrong one, which is the correct failure mode for a display-only
// inventory.
export function parseFrontmatter(head: string): Frontmatter {
  // The CRLF split is load-bearing: `.` never matches `\r`, so a stray CR would
  // make FIELD_PATTERN reject every line. The BOM strip is belt-and-braces —
  // U+FEFF is ECMAScript whitespace, so the `.trim()` below also removes it —
  // but stating the intent here keeps the delimiter check from depending on it.
  const lines = head.replace(/^﻿/, "").split(/\r?\n/);

  if (lines[0]?.trim() !== "---") return {};

  const body = lines.slice(1);
  const closingIndex = body.findIndex((line) => line.trim() === "---");

  // An unterminated block is not frontmatter. One rule, two reasons:
  //
  //   - A plain markdown document may simply OPEN with a `---` thematic break.
  //     Scanning its whole head for `key: value` lifted body lines — including a
  //     line as unfortunate as `description: prod db password is ...` — into the
  //     inventory and across IPC, breaking this feature's "no file body ever
  //     crosses the boundary" guarantee.
  //   - A block whose closing delimiter sits past the head window may have had
  //     its last line cut mid-value or mid-UTF-8-sequence.
  //
  // Both are "we cannot tell what this file is", and this reader's whole
  // philosophy is to yield no value rather than a wrong one. A block that does
  // close inside the window is complete by construction, so no line inside it
  // can have been truncated and no tail has to be dropped.
  if (closingIndex === -1) return {};

  const fields = body.slice(0, closingIndex);
  const frontmatter: Frontmatter = {};

  for (const line of fields) {
    const match = FIELD_PATTERN.exec(line);

    if (!match) continue;
    const value = unquote(match[2].trim());

    if (!value) continue;
    if (match[1] === "name" && frontmatter.name === undefined) frontmatter.name = value.slice(0, MAX_FIELD_LENGTH);
    if (match[1] === "description" && frontmatter.description === undefined) {
      frontmatter.description = value.slice(0, MAX_FIELD_LENGTH);
    }
  }

  return frontmatter;
}

// Opening by path is an INDEPENDENT resolution of a path the caller already
// resolved and containment-checked, so the open itself has to be safe:
//
//   - O_NOFOLLOW fails the open outright if the final segment became a symlink
//     between the caller's check and this call, which is the only way that race
//     could otherwise read a file outside the workspace.
//   - O_NONBLOCK keeps a FIFO left at that path from parking this call forever.
//     This runs synchronously on the Electron main process, and `openSync` has
//     no timeout, so "forever" means until the app is killed.
//
// Windows defines neither flag, so each is optional; there `fstatSync` below is
// the whole guard.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

// Never throws: an unreadable artifact is still counted, just without metadata.
//
// `expected` is the identity of the file the caller decided to read — see
// FileIdentity. Passing it is not optional: without it this function's open is a
// third, unverified resolution of a path someone else vouched for.
export function readFrontmatter(filePath: string, expected: FileIdentity): Frontmatter {
  let head: string;

  try {
    const descriptor = openSync(filePath, OPEN_FLAGS);

    try {
      // Trust the DESCRIPTOR, not the path. `isFile()` alone would still accept
      // a different regular file swapped in after the caller's check, so the
      // (dev, ino) pair has to match too.
      const stats = fstatSync(descriptor);

      if (!stats.isFile() || stats.dev !== expected.dev || stats.ino !== expected.ino) return {};

      const buffer = Buffer.alloc(HEAD_BYTES);
      const bytes = readSync(descriptor, buffer, 0, HEAD_BYTES, 0);
      head = buffer.subarray(0, bytes).toString("utf8");
    } finally {
      closeSync(descriptor);
    }
  } catch {
    return {};
  }

  return parseFrontmatter(head);
}
