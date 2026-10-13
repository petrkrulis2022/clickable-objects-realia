#!/usr/bin/env node
// Static half of the mode-isolation test (docs/SPEC-SCREENVIEW.md,
// "1. Scaffold and the two modes"): "Write the mode-isolation test
// now, before the features: load interview mode in a call, run for 60
// seconds, assert zero network requests and zero getUserMedia calls."
// "it fails when a fetch is deliberately added to interview mode."
//
// A built content.js can't be grepped for this: practiceUi's code is
// physically present in the same IIFE bundle (inlineDynamicImports —
// see vite.content.config.ts's comment), so the interesting guarantee
// is about interview/index.ts's own SOURCE import graph, not the
// built output. This walks that graph (relative imports only —
// workspace packages like @overlay/shared are skipped here and
// verified once, separately, since every module that imports them
// shares the same guarantee) and fails if any visited file contains a
// network or microphone call.
//
// The runtime half — actually running the module with fetch/WebSocket/
// getUserMedia mocked and confirming none fire — lives in
// src/interview/index.test.ts.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ENTRY = resolve(import.meta.dirname, "..", "src", "interview", "index.ts");
const FORBIDDEN_RE = /\bfetch\s*\(|\bnew\s+WebSocket\s*\(|getUserMedia\s*\(/;
const IMPORT_RE = /\bimport\s+(?:[^'"]*\bfrom\s+)?["']([^"']+)["']/g;

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null; // workspace/npm package — not walked here
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const visited = new Set();
const violations = [];

function walk(file) {
  if (visited.has(file)) return;
  visited.add(file);

  const text = readFileSync(file, "utf8");
  const match = text.match(FORBIDDEN_RE);
  if (match) violations.push(`${file}: contains "${match[0].trim()}"`);

  for (const m of text.matchAll(IMPORT_RE)) {
    const resolved = resolveImport(file, m[1]);
    if (resolved) walk(resolved);
  }
}

walk(ENTRY);

if (violations.length > 0) {
  console.error("[check-interview-isolation] interview mode's import graph is not network/mic-free:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(`[check-interview-isolation] ok — ${visited.size} file(s) in interview mode's import graph, none touch fetch/WebSocket/getUserMedia`);
