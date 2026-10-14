import type { MaterialExtractors } from "./materials.js";

/** Nothing to extract without a real parser/key — honest empty strings, not fake content. Used by default and in every test. */
export function createNullExtractors(): MaterialExtractors {
  return {
    extractPdf: async () => "",
    extractDocx: async () => "",
    transcribeAudio: async () => "",
  };
}

/**
 * Real extractors: pdf-parse and mammoth run locally (no network, no
 * key needed); audio transcription calls ElevenLabs Scribe over REST,
 * same shape as apps/screenview-practice's scribeAdapter.ts. This has
 * never been exercised against the live Scribe API in this
 * environment — no key, no network here — so treat the audio path as
 * a documented starting point, not a tested integration; the PDF/DOCX
 * paths use real local libraries and are exercised by this package's
 * own tests.
 */
export function createRealExtractors(elevenLabsApiKey?: string): MaterialExtractors {
  return {
    async extractPdf(base64) {
      const { default: pdfParse } = await import("pdf-parse");
      const buf = Buffer.from(base64, "base64");
      const result = await pdfParse(buf);
      return result.text;
    },
    async extractDocx(base64) {
      const mammoth = await import("mammoth");
      const buf = Buffer.from(base64, "base64");
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value;
    },
    async transcribeAudio(base64) {
      if (!elevenLabsApiKey) return "";
      const audioBytes = Buffer.from(base64, "base64");
      const form = new FormData();
      form.append("model_id", "scribe_v1");
      form.append("file", new Blob([audioBytes], { type: "audio/webm" }), "recording.webm");
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenLabsApiKey },
        body: form,
      });
      if (!res.ok) return "";
      const body = (await res.json()) as { text?: string };
      return body.text ?? "";
    },
  };
}
