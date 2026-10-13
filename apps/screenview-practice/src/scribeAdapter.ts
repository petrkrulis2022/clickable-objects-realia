export interface TranscribeAdapter {
  /** One base64-encoded audio chunk in, the new transcript text it adds out ("" if nothing new yet). */
  transcribeChunk(base64Audio: string): Promise<string>;
}

/** Used by default and in every test — there's no audio to transcribe without a real session, so this is honest rather than a fake transcript. */
export function createNullTranscribeAdapter(): TranscribeAdapter {
  return { transcribeChunk: async () => "" };
}

/**
 * ElevenLabs Scribe, REST speech-to-text per chunk
 * (https://api.elevenlabs.io/v1/speech-to-text). This has never been
 * exercised against the live API in this environment — no key, no
 * network, no microphone to feed it here — and a per-chunk REST call
 * is a simplification of Scribe's real streaming/websocket mode, not
 * a faithful low-latency integration. Verifying and likely replacing
 * this is explicitly one of the "Before real use" checks in
 * docs/SPEC-SCREENVIEW.md ("Confirm the STAR blocks light correctly
 * for a rambling answer..."). Treat this as a documented starting
 * point, not a tested integration.
 */
export function createElevenLabsScribeAdapter(apiKey: string): TranscribeAdapter {
  return {
    async transcribeChunk(base64Audio: string): Promise<string> {
      const audioBytes = Buffer.from(base64Audio, "base64");
      const form = new FormData();
      form.append("model_id", "scribe_v1");
      form.append("file", new Blob([audioBytes], { type: "audio/webm" }), "chunk.webm");

      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });
      if (!res.ok) return "";
      const body = (await res.json()) as { text?: string };
      return body.text ?? "";
    },
  };
}
