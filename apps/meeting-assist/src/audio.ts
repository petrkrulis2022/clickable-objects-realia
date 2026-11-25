import { generatedAudioPath, type LessonPack } from "@realia/shared";

// Card audio, generated once, when the teacher approves a pack — never
// at runtime, never in the extension, never by browser speech
// synthesis. A learner copies the model voice, so a robotic card
// teaches bad pronunciation: a card with no real recording stays
// silent and is marked as such.

export interface TextToSpeech {
  /** mp3 bytes for `text` at `speed` (1.0 normal, 0.7 slow). */
  synthesize(text: string, speed: number): Promise<Buffer>;
}

const MODEL_ID = "eleven_turbo_v2_5";
const NORMAL_SPEED = 1.0;
const SLOW_SPEED = 0.7;
const CONCURRENCY = 4;

/**
 * ElevenLabs text-to-speech, the same request scripts/generate-audio.ts
 * uses for the shipped pack. ELEVENLABS_VOICE_ID picks the voice; if
 * unset, the account's first voice is used (free-tier accounts can't
 * call shared library voices). Not exercised against the live API by
 * this repository's tests.
 */
export function createElevenLabsTts(apiKey: string, voiceId?: string): TextToSpeech {
  let resolvedVoice: Promise<string> | null = voiceId ? Promise.resolve(voiceId) : null;

  function voice(): Promise<string> {
    resolvedVoice ??= (async () => {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey } });
      if (!res.ok) throw new Error(`ElevenLabs voices: ${res.status}`);
      const { voices } = (await res.json()) as { voices: { voice_id: string }[] };
      if (!voices.length) throw new Error("No voices on this ElevenLabs account; set ELEVENLABS_VOICE_ID");
      return voices[0].voice_id;
    })().catch((err) => {
      resolvedVoice = null; // try again next time
      throw err;
    });
    return resolvedVoice;
  }

  return {
    async synthesize(text, speed) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${await voice()}`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: { stability: 0.5, similarity_boost: 0.75, speed } }),
      });
      if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

export interface CardAudioResult {
  /** The pack, with every voiced card pointing at its generated files and every other new card silent (audio: null). */
  pack: LessonPack;
  /** file name -> base64 mp3, for the relay to store inside the pack's directory. */
  audio: Record<string, string>;
  voiced: string[];
  silent: string[];
  /** Why cards are silent, when they are. */
  reason?: string;
}

/** Cards that need a recording: new words (audio null). Cards with bundled audio keep it. */
function cardsNeedingAudio(pack: LessonPack) {
  return pack.cards.filter((c) => c.audio === null);
}

export async function generateCardAudio(pack: LessonPack, tts: TextToSpeech | null): Promise<CardAudioResult> {
  const pending = cardsNeedingAudio(pack);
  if (pending.length === 0) return { pack, audio: {}, voiced: [], silent: [] };
  if (!tts) {
    return {
      pack,
      audio: {},
      voiced: [],
      silent: pending.map((c) => c.id),
      reason: "ELEVENLABS_API_KEY is not set on the meeting-assist service, so new words have no recording.",
    };
  }

  const audio: Record<string, string> = {};
  const voiced = new Set<string>();
  const failures: string[] = [];
  const queue = [...pending];

  async function worker() {
    for (let card = queue.shift(); card; card = queue.shift()) {
      try {
        const [normal, slow] = await Promise.all([tts!.synthesize(card.word, NORMAL_SPEED), tts!.synthesize(card.word, SLOW_SPEED)]);
        audio[`${card.id}-normal.mp3`] = normal.toString("base64");
        audio[`${card.id}-slow.mp3`] = slow.toString("base64");
        voiced.add(card.id);
      } catch (err) {
        failures.push(`${card.word}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

  const updated: LessonPack = {
    ...pack,
    cards: pack.cards.map((c) =>
      voiced.has(c.id)
        ? {
            ...c,
            audio: {
              normal: generatedAudioPath(pack.id, `${c.id}-normal.mp3`),
              slow: generatedAudioPath(pack.id, `${c.id}-slow.mp3`),
            },
          }
        : c,
    ),
  };
  const silent = pending.filter((c) => !voiced.has(c.id)).map((c) => c.id);
  return {
    pack: updated,
    audio,
    voiced: [...voiced],
    silent,
    ...(failures.length ? { reason: `ElevenLabs couldn't record: ${failures.join("; ")}` } : {}),
  };
}
