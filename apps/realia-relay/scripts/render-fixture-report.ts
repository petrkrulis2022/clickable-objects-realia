#!/usr/bin/env -S node --experimental-strip-types
// Dev helper backing the acceptance check for "8. The report": "the
// report renders correctly from a recorded log fixture committed to
// the repo." Run from apps/realia-relay: `node --experimental-strip-types
// scripts/render-fixture-report.ts [outDir]`.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LessonEvent } from "@realia/shared";
import { loadPack } from "../src/packs.ts";
import { buildSeed, renderReport } from "../src/report.ts";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "sample-lesson.jsonl");
const outDir = process.argv[2] ?? "/tmp";

const events: LessonEvent[] = readFileSync(FIXTURE_PATH, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const pack = loadPack("a2-prepositions-place");
const html = renderReport({ code: "FIXTURE", events, pack });
const seed = buildSeed({ code: "FIXTURE", events, pack });

writeFileSync(join(outDir, "fixture-report.html"), html, "utf8");
writeFileSync(join(outDir, "fixture-report.seed.json"), JSON.stringify(seed, null, 2), "utf8");

console.log(`events: ${events.length}`);
console.log(`html bytes: ${html.length}`);
console.log(`weakest relations: ${seed.weakestRelations.map((r) => `${r.relation} ${Math.round(r.errorRate * 100)}%`).join(", ")}`);
console.log(`rescued words: ${seed.rescuedWords.map((w) => `${w.word}(${w.stage})`).join(", ") || "(none)"}`);
console.log(`wrote ${outDir}/fixture-report.html and fixture-report.seed.json`);
