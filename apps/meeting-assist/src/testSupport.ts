// Test helpers (not shipped in a request path). A scripted stand-in
// for the model, and a well-formed model answer to start from.

import type { JsonGenerationRequest, LlmClient } from "./llm.js";

export interface RecordedCall {
  system: string;
  content: JsonGenerationRequest["content"];
}

/** Answers each generateJson call with the next scripted reply, and records what it was sent. */
export function scriptedLlm(replies: Array<{ text: string; stopReason?: string }>): LlmClient & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    complete: async () => "",
    async generateJson(req) {
      calls.push({ system: req.system, content: req.content });
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
      return { text: reply.text, stopReason: reply.stopReason ?? "end_turn" };
    },
  };
}

/** A small valid lesson in the model's output shape: one sort, one gap, one match, one card. Written for the tests, not copied from any book. */
export function sampleLesson() {
  return {
    title: "Modals of obligation",
    summary: "Sort the modals by meaning, then use them in gaps and advice.",
    translation_language: "Czech",
    plan_markdown: "## Shape of the lesson\n\n| Time | What |\n|---|---|\n| 0-10 | Sort |\n\n## Answer key\n\n1. mustn't → forbidden",
    teach_normally: [{ exercise: "Speaking 5", why: "Free speaking — talk, don't drag." }],
    objects: [
      { id: "mustnt", label: "mustn't", emoji: "" },
      { id: "dont-have-to", label: "don't have to", emoji: "" },
      { id: "cant", label: "can't", emoji: "" },
      { id: "must", label: "must", emoji: "" },
      { id: "lie-down", label: "You should lie down.", emoji: "" },
      { id: "umbrella", label: "Take an umbrella.", emoji: "☂️" },
      { id: "must-to", label: "must to", emoji: "" },
      { id: "dont-must", label: "don't must", emoji: "" },
      { id: "unused", label: "never used", emoji: "" },
    ],
    cards: [{ id: "obligation", word: "obligation", translation: "povinnost", emoji: "📋" }],
    activities: [
      {
        id: "g1a",
        kind: "sort",
        source_exercise: "Grammar 1a",
        prompt: "Forbidden or not necessary?",
        feedback: "Yes.",
        zones: [
          { id: "forbidden", label: "forbidden" },
          { id: "not-necessary", label: "not necessary" },
        ],
        pairs: [
          { object_id: "mustnt", zone_id: "forbidden" },
          { object_id: "cant", zone_id: "forbidden" },
          { object_id: "dont-have-to", zone_id: "not-necessary" },
        ],
        distractors: [] as string[],
      },
      {
        id: "g3",
        kind: "gap",
        source_exercise: "Grammar 3, items 1-2",
        prompt: "You [1] be 18 to drive a tractor. You [2] wear a seatbelt.",
        feedback: "",
        zones: [
          { id: "1", label: "1" },
          { id: "2", label: "2" },
        ],
        pairs: [
          { object_id: "dont-have-to", zone_id: "1" },
          { object_id: "must", zone_id: "2" },
        ],
        distractors: ["must-to", "dont-must"],
      },
      {
        id: "g2",
        kind: "match",
        source_exercise: "Grammar 2",
        prompt: "Match each problem with the advice.",
        feedback: "Good advice.",
        zones: [
          { id: "headache", label: "I've got a headache." },
          { id: "rain", label: "It's raining." },
        ],
        pairs: [
          { object_id: "lie-down", zone_id: "headache" },
          { object_id: "umbrella", zone_id: "rain" },
        ],
        distractors: [] as string[],
      },
    ],
  };
}

/** A tiny real JPEG header followed by `marker`, so an image's bytes can be searched for afterwards. */
export function sentinelJpegBase64(marker: string): string {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from(`JFIF\0${marker}`)]).toString("base64");
}
