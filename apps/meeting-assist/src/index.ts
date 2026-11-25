import { createElevenLabsTts } from "./audio.js";
import { createRealExtractors } from "./extractors.js";
import { createAnthropicClient, createNullLlmClient, DEFAULT_MODEL } from "./llm.js";
import { createAssistServer } from "./server.js";

const PORT = 8790;

// Keys live here, on the service, and nowhere else: never in the
// extension, never in a pack. Without ANTHROPIC_API_KEY the service
// still starts (PDF/DOCX extraction is local) and a draft request
// gets a clear error; without ELEVENLABS_API_KEY approved cards are
// silent and marked, never voiced by a fallback.
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

const server = createAssistServer({
  llm: anthropicKey ? createAnthropicClient(anthropicKey, model) : createNullLlmClient(),
  llmConfigured: Boolean(anthropicKey),
  model,
  extractors: createRealExtractors(elevenLabsKey),
  tts: elevenLabsKey ? createElevenLabsTts(elevenLabsKey, process.env.ELEVENLABS_VOICE_ID) : null,
});

server.listen(PORT, () => {
  console.log(`[meeting-assist] listening on http://localhost:${PORT} (model: ${model})`);
  if (!anthropicKey) console.log("[meeting-assist] ANTHROPIC_API_KEY not set — /plan/draft will return an error until it is.");
  if (!elevenLabsKey) console.log("[meeting-assist] ELEVENLABS_API_KEY not set — approved cards will be silent and marked.");
});
