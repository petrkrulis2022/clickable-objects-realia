export interface VoiceAgentAdapter {
  /** Speaks a FIXED string — the question text or a FIXED probe, never anything generated. Returns audio bytes, or null if no audio could be produced. */
  speak(text: string): Promise<ArrayBuffer | null>;
}

/** Used by default and in every test — no audio out, which is honest when there's no key to produce any. */
export function createNullVoiceAgentAdapter(): VoiceAgentAdapter {
  return { speak: async () => null };
}

/**
 * ElevenLabs text-to-speech, REST per utterance
 * (https://api.elevenlabs.io/v1/text-to-speech/{voice_id}). "The
 * interviewer voice is an ElevenLabs conversational agent" (SPEC,
 * "Architecture") describes a fuller realtime agent than this; this
 * adapter only covers the "speaks it aloud" half with plain TTS, and
 * has never been exercised against the live API here — no key, no
 * network. A real conversational-agent integration is a later
 * replacement behind this same interface, not a rewrite of the
 * session logic that calls it.
 */
export function createElevenLabsVoiceAgentAdapter(apiKey: string, voiceId: string): VoiceAgentAdapter {
  return {
    async speak(text: string): Promise<ArrayBuffer | null> {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
      });
      if (!res.ok) return null;
      return res.arrayBuffer();
    },
  };
}
