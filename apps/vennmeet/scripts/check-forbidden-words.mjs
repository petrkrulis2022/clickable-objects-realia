#!/usr/bin/env node
// Build check (docs/SPEC-VENNMEET.md, "The rules", "No concealment
// vocabulary"): "The words cheat, hidden, stealth, undetectable,
// secret and ghost appear nowhere in the product, the store listing
// or the site."
//
// Scoped to USER-FACING COPY specifically, not implementation code —
// the product legitimately uses words like "hidden" in CSS and code
// comments to describe hiding layers on screen share (see the SPEC's
// own prose: "It hides on screen share"). Scanning all source text
// would false-positive on exactly the mechanism this product needs.
// So this checks only the files that are, or become, user-facing
// text: the manifest's name/description/command descriptions, the
// centralised UI copy module, and template content (names/sections/
// example card text a user actually sees in the editor).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const FORBIDDEN = ["cheat", "hidden", "stealth", "undetectable", "secret", "ghost"];
const WORD_RE = new RegExp(`\\b(${FORBIDDEN.join("|")})\\b`, "i");

function collectManifestStrings(manifest) {
  const strings = [];
  if (manifest.name) strings.push(manifest.name);
  if (manifest.description) strings.push(manifest.description);
  for (const cmd of Object.values(manifest.commands ?? {})) {
    if (cmd.description) strings.push(cmd.description);
  }
  return strings;
}

function collectJsonStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectJsonStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectJsonStrings(v, out));
  return out;
}

let violations = [];

const manifestPath = join(ROOT, "public", "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const s of collectManifestStrings(manifest)) {
    if (WORD_RE.test(s)) violations.push(`manifest.json: "${s}"`);
  }
}

const copyPath = join(ROOT, "src", "copy.ts");
if (existsSync(copyPath)) {
  const text = readFileSync(copyPath, "utf8");
  const match = text.match(WORD_RE);
  if (match) violations.push(`src/copy.ts: contains "${match[0]}"`);
}

const templatesDir = join(ROOT, "src", "templates");
const templateFiles = existsSync(templatesDir)
  ? readdirSync(templatesDir).filter((f) => f.endsWith(".json")).map((f) => join(templatesDir, f))
  : [];
for (const file of templateFiles) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  for (const s of collectJsonStrings(json)) {
    if (WORD_RE.test(s)) violations.push(`${file}: "${s}"`);
  }
}

if (violations.length > 0) {
  console.error("[check-forbidden-words] forbidden word(s) found in user-facing copy:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("[check-forbidden-words] ok — no forbidden words in user-facing copy");
