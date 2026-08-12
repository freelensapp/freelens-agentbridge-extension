import { closeSync, openSync, readSync } from "node:fs";

// Bytes read from the head of an artifact file. Frontmatter blocks written by
// every provider are far smaller than this; the cap exists so a hostile or
// merely huge file cannot be pulled into memory by a directory listing.
const HEAD_BYTES = 4096;

// Descriptions are rendered in a single truncated UI line; anything longer is
// payload we would only throw away in the renderer.
const MAX_DESCRIPTION_LENGTH = 200;

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
  // With no closing delimiter inside the head window the last line may have been
  // cut mid-value (or mid-UTF-8-sequence), so it is dropped rather than trusted.
  // A head that ends on a newline has "" as its last element, so a complete
  // final line survives.
  const fields = closingIndex === -1 ? body.slice(0, -1) : body.slice(0, closingIndex);
  const frontmatter: Frontmatter = {};

  for (const line of fields) {
    const match = FIELD_PATTERN.exec(line);

    if (!match) continue;
    const value = unquote(match[2].trim());

    if (!value) continue;
    if (match[1] === "name" && frontmatter.name === undefined) frontmatter.name = value;
    if (match[1] === "description" && frontmatter.description === undefined) {
      frontmatter.description = value.slice(0, MAX_DESCRIPTION_LENGTH);
    }
  }

  return frontmatter;
}

// Never throws: an unreadable artifact is still counted, just without metadata.
export function readFrontmatter(filePath: string): Frontmatter {
  let head: string;

  try {
    const descriptor = openSync(filePath, "r");

    try {
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
