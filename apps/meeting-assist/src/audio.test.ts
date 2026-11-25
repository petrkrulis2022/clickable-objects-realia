import { test } from "node:test";
import assert from "node:assert/strict";
import { loadValidPack, validatePack, type LessonPack } from "@realia/shared";
import { generateCardAudio, type TextToSpeech } from "./audio.js";

function packWithCards(): LessonPack {
  return loadValidPack({
    id: "lesson-audio",
    title: "t",
    translationLang: "Czech",
    scenery: [],
    draggables: [{ id: "a", label: "a" }, { id: "b", label: "b" }],
    zones: [{ id: "x", label: "x" }, { id: "y", label: "y" }],
    backdrops: {},
    sentenceTemplate: "",
    cards: [
      { id: "c-new", word: "timetable", translation: "rozvrh", audio: null },
      { id: "c-other", word: "coursework", translation: "seminární práce", audio: null },
      { id: "c_keys", word: "keys", translation: "klíče" }, // bundled recording, untouched
    ],
    items: [{ id: "s", kind: "sort", prompt: "Sort.", pairs: [{ objectId: "a", zoneId: "x" }, { objectId: "b", zoneId: "y" }] }],
  });
}

const fakeMp3 = (text: string, speed: number) => Buffer.concat([Buffer.from("ID3"), Buffer.from(`${text}@${speed}`)]);

test("without an ElevenLabs key, new cards stay silent and the reason is given — no fallback voice", async () => {
  const pack = packWithCards();
  const out = await generateCardAudio(pack, null);
  assert.deepEqual(out.silent, ["c-new", "c-other"]);
  assert.deepEqual(out.audio, {});
  assert.match(out.reason ?? "", /ELEVENLABS_API_KEY/);
  assert.equal(out.pack.cards[0].audio, null);
});

test("with a key, each new word gets a normal and a slow mp3, served from the pack's own directory", async () => {
  const spoken: Array<[string, number]> = [];
  const tts: TextToSpeech = {
    synthesize: async (text, speed) => {
      spoken.push([text, speed]);
      return fakeMp3(text, speed);
    },
  };
  const out = await generateCardAudio(packWithCards(), tts);
  assert.deepEqual(out.voiced.sort(), ["c-new", "c-other"]);
  assert.deepEqual(Object.keys(out.audio).sort(), ["c-new-normal.mp3", "c-new-slow.mp3", "c-other-normal.mp3", "c-other-slow.mp3"]);
  assert.deepEqual(out.pack.cards[0].audio, {
    normal: "/packs/lesson-audio/audio/c-new-normal.mp3",
    slow: "/packs/lesson-audio/audio/c-new-slow.mp3",
  });
  assert.equal(out.pack.cards[2].audio, undefined, "a bundled card is not re-recorded");
  assert.ok(spoken.some(([t, s]) => t === "timetable" && s < 1), "a slow version is recorded");
  assert.deepEqual(validatePack(out.pack), []);
});

test("a word ElevenLabs can't record stays silent; the rest are recorded", async () => {
  const tts: TextToSpeech = {
    synthesize: async (text, speed) => {
      if (text === "coursework") throw new Error("ElevenLabs TTS 500");
      return fakeMp3(text, speed);
    },
  };
  const out = await generateCardAudio(packWithCards(), tts);
  assert.deepEqual(out.voiced, ["c-new"]);
  assert.deepEqual(out.silent, ["c-other"]);
  assert.match(out.reason ?? "", /coursework/);
  assert.equal(out.pack.cards[1].audio, null);
});
