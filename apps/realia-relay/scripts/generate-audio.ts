#!/usr/bin/env -S node --experimental-strip-types
// Pre-generates the two mp3 files (normal, slow) per reveal-card word,
// per docs/PRD.md, "6. Reveal cards": "Audio is NOT generated at
// runtime... a build script that lives in apps/relay and ships them
// inside the pack directory. The extension plays local files only and
// must never contain an API key."
//
// Run with ELEVENLABS_API_KEY set: `node --experimental-strip-types
// scripts/generate-audio.ts`. The key lives only in this script's
// environment and is never written to the output or to the extension.
//
// No network calls happen unless ELEVENLABS_API_KEY is set. Without
// it, nothing is generated here — see scripts/generate-placeholder-audio.sh
// for the silent stand-ins committed for local testing in an
// environment with no ElevenLabs account.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "realia", "public", "audio");
const MODEL_ID = "eleven_turbo_v2_5";

interface Voice {
  voice_id: string;
  name: string;
}

/**
 * Free-tier accounts can't use ElevenLabs' shared "voice library" IDs
 * via the API (402 paid_plan_required) — only voices already in the
 * account. Rather than hardcode one that may not exist on every
 * account/plan, ask the account what it actually has and use that
 * (ELEVENLABS_VOICE_ID still overrides, if set).
 */
async function resolveVoiceId(apiKey: string): Promise<string> {
  const explicit = process.env.ELEVENLABS_VOICE_ID;
  if (explicit) return explicit;

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Could not list voices: ${res.status} ${await res.text()}`);
  }
  const { voices } = (await res.json()) as { voices: Voice[] };
  if (!voices.length) {
    throw new Error(
      "No voices available on this ElevenLabs account. Add one in the dashboard, " +
        "or set ELEVENLABS_VOICE_ID to a voice_id your plan can use.",
    );
  }
  console.log(`[generate-audio] using voice "${voices[0].name}" (${voices[0].voice_id})`);
  return voices[0].voice_id;
}

interface Word {
  id: string;
  word: string;
}

// Matches the a2-prepositions-place demo pack (docs/PRD.md).
const WORDS: Word[] = [
  { id: "keys", word: "keys" },
  { id: "ball", word: "ball" },
  { id: "cup", word: "cup" },
  { id: "apple", word: "apple" },
  { id: "phone", word: "phone" },
  { id: "book", word: "book" },
];

async function synthesize(text: string, speed: number, apiKey: string, voiceId: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed },
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed for "${text}" (speed ${speed}): ${res.status} ${await res.text()}`);
  }
  return res.arrayBuffer();
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log(
      "[generate-audio] ELEVENLABS_API_KEY not set — skipping. " +
        "See scripts/generate-placeholder-audio.sh for local-testing stand-ins.",
    );
    return;
  }

  const voiceId = await resolveVoiceId(apiKey);
  await mkdir(OUT_DIR, { recursive: true });

  for (const { id, word } of WORDS) {
    console.log(`[generate-audio] ${word} ...`);
    const [normal, slow] = await Promise.all([
      synthesize(word, 1.0, apiKey, voiceId),
      synthesize(word, 0.7, apiKey, voiceId),
    ]);
    await writeFile(join(OUT_DIR, `${id}-normal.mp3`), Buffer.from(normal));
    await writeFile(join(OUT_DIR, `${id}-slow.mp3`), Buffer.from(slow));
  }

  console.log(`[generate-audio] wrote ${WORDS.length * 2} files to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
