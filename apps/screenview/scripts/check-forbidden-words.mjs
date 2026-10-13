#!/usr/bin/env node
// Build check (docs/SPEC-SCREENVIEW.md, "What it will not do"): "The
// words cheat, hidden, stealth, undetectable, secret and ghost appear
// nowhere in the product or its marketing, and a build check enforces
// it."
//
// Scoped to USER-FACING COPY specifically (the manifest's name/
// description, onboarding text, and any centralised UI-copy module),
// not implementation code — same reasoning as apps/vennmeet's
// equivalent check: the product legitimately uses words like "hidden"
// in code/CSS for hiding layers on screen share.

import { readFileSync, existsSync } from "node:fs";
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

const onboardingPath = join(ROOT, "src", "options", "onboarding.ts");
if (existsSync(onboardingPath)) {
  const text = readFileSync(onboardingPath, "utf8");
  // Only the SCREENS array is user-facing copy — the rest of this file
  // is UI code that legitimately uses words like "hidden" as a CSS
  // visibility value, same reasoning as apps/vennmeet's checker (which
  // doesn't scan onboarding.ts at all for exactly this reason).
  const screensMatch = text.match(/const SCREENS[^[]*\[([\s\S]*?)\];/);
  const copyText = screensMatch ? screensMatch[1] : "";
  const match = copyText.match(WORD_RE);
  if (match) violations.push(`src/options/onboarding.ts: SCREENS contains "${match[0]}"`);
}

if (violations.length > 0) {
  console.error("[check-forbidden-words] forbidden word(s) found in user-facing copy:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("[check-forbidden-words] ok — no forbidden words in user-facing copy");
