#!/usr/bin/env node
// Build check (docs/SPEC-SCREENVIEW.md, "1. Scaffold and the two
// modes"): "Build checks that fail if: ... the practice service
// exposes any endpoint that returns candidate-facing prose."
//
// A fully general version of this check is impossible by static
// analysis alone (whether a string is "model-generated prose" vs "the
// fixed question text" is a semantic fact, not a syntactic one). What
// IS enforceable: a denylist of field names that would signal a
// free-text model output sneaking into a response — if nobody ever
// needs to use these names (every real response field here is an
// enum, a number, a boolean, an index into a fixed array, or the
// candidate's own transcript), their absence is meaningful. This is a
// naming-convention lint, not a semantic proof — paired with code
// review of every PracticeServerMessage variant in
// packages/screenview-shared, where the actual source-of-truth
// guarantee lives (see that file's own comment).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src");
const DENYLIST = ["answer", "reply", "response", "suggestion", "generatedText", "aiText", "completion", "generated"];
// Matches `answer:` / `"answer":` / `answer :` as an object-literal key.
const KEY_RE = new RegExp(`\\b(${DENYLIST.join("|")})\\s*:`, "i");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  const match = text.match(KEY_RE);
  if (match) violations.push(`${file}: uses forbidden field name "${match[1]}"`);
}

if (violations.length > 0) {
  console.error("[check-no-prose-endpoints] forbidden response field name(s) found:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("[check-no-prose-endpoints] ok — no denylisted free-text field names found");
