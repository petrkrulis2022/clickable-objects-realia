#!/usr/bin/env -S node --experimental-strip-types
// Gemini-based alternative to generate-audio.ts (ElevenLabs), for
// accounts without ElevenLabs API access. Same contract as the PRD's
// "6. Reveal cards" build script: pre-generates the two mp3 files
// (normal, slow) per word, ships them in apps/realia/public/audio,
// never runs at runtime, never puts a key in the extension.
//
// Run: node --env-file=.env --experimental-strip-types
// scripts/generate-audio-gemini.ts
//
// Requires GEMINI_API_KEY, and ffmpeg on PATH (converts Gemini's raw
// PCM output to mp3 — everything else in the build expects .mp3).

import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "..", "realia", "public", "audio");
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-preview-tts";
const VOICE_NAME = process.env.GEMINI_VOICE_NAME ?? "Kore";

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

// Gemini TTS has no numeric speed parameter — pace is steered with a
// plain-language instruction in the prompt itself.
function promptFor(word: string, speed: "normal" | "slow"): string {
  return speed === "slow"
    ? `Say slowly and clearly, like a teacher repeating a word for a language learner: "${word}"`
    : `Say clearly and naturally: "${word}"`;
}

async function synthesizePcm(text: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini TTS failed for "${text}": ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`No audio in Gemini response for "${text}": ${JSON.stringify(json)}`);
  return Buffer.from(b64, "base64"); // raw PCM: s16le, 24000Hz, mono
}

function pcmToMp3(pcm: Buffer, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-v", "error", "-y",
      "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0",
      "-codec:a", "libmp3lame", "-qscale:a", "4",
      outPath,
    ]);
    ff.on("error", (e) =>
      reject(new Error(`ffmpeg not found or failed to start (${e.message}). Install ffmpeg to use this script.`)),
    );
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    ff.stdin.end(pcm);
  });
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[generate-audio-gemini] GEMINI_API_KEY not set — skipping.");
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });

  for (const { id, word } of WORDS) {
    console.log(`[generate-audio-gemini] ${word} ...`);
    const [normalPcm, slowPcm] = await Promise.all([
      synthesizePcm(promptFor(word, "normal"), apiKey),
      synthesizePcm(promptFor(word, "slow"), apiKey),
    ]);
    await pcmToMp3(normalPcm, join(OUT_DIR, `${id}-normal.mp3`));
    await pcmToMp3(slowPcm, join(OUT_DIR, `${id}-slow.mp3`));
  }

  console.log(`[generate-audio-gemini] wrote ${WORDS.length * 2} files to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
