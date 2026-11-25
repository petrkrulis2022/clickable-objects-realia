import Anthropic from "@anthropic-ai/sdk";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** One piece of a prompt. Images exist only in memory, for the length of one request. */
export type PromptBlock = { type: "text"; text: string } | { type: "image"; mediaType: ImageMediaType; base64: string };

export interface JsonGenerationRequest {
  system: string;
  content: PromptBlock[];
  /** JSON schema the reply is constrained to (structured outputs). */
  schema: Record<string, unknown>;
}

export interface JsonGenerationResult {
  /** The JSON text the model returned. */
  text: string;
  /** "end_turn" normally; "refusal" or "max_tokens" mean the text must not be trusted. */
  stopReason: string | null;
}

export interface LlmClient {
  /** Plain text completion (Venn's deck drafting). */
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
  /** JSON constrained to a schema, from text and images (Realia's lesson generator). */
  generateJson(req: JsonGenerationRequest): Promise<JsonGenerationResult>;
}

/** Returns a fixed string regardless of input — used in tests, and the default if ANTHROPIC_API_KEY isn't set, so this service runs without a key (producing an honest error on an actual plan request rather than silently faking one). */
export function createNullLlmClient(fixedResponse = ""): LlmClient {
  return {
    complete: async () => fixedResponse,
    generateJson: async () => ({ text: fixedResponse, stopReason: "end_turn" }),
  };
}

export const DEFAULT_MODEL = "claude-opus-5-5";

/** A plain-language error for the teacher, from the SDK's typed errors. */
function explain(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new Error("The Anthropic API key was rejected — check ANTHROPIC_API_KEY on the meeting-assist service.");
  if (err instanceof Anthropic.PermissionDeniedError) return new Error("The Anthropic API key isn't allowed to use this model.");
  if (err instanceof Anthropic.RateLimitError) return new Error("The Anthropic API is rate-limiting this key — try again in a minute.");
  if (err instanceof Anthropic.BadRequestError) return new Error(`The Anthropic API refused the request: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) return new Error("Couldn't reach the Anthropic API — check the network.");
  if (err instanceof Anthropic.APIError) return new Error(`Anthropic API error ${err.status ?? ""}: ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
}

function toSdkBlock(block: PromptBlock): Anthropic.Beta.BetaContentBlockParam {
  if (block.type === "text") return { type: "text", text: block.text };
  return { type: "image", source: { type: "base64", media_type: block.mediaType, data: block.base64 } };
}

/**
 * The official Anthropic SDK, on Claude Opus 5.5. Thinking is always
 * on for this model (adaptive); effort is set explicitly because its
 * default is medium. Server-side refusal fallbacks are enabled, so a
 * policy decline is retried on a fallback model inside the same call
 * instead of failing the teacher's draft.
 *
 * Never exercised against the live API from this repository's tests —
 * those run against createNullLlmClient or a fake. The parsing and
 * validation downstream of this are what the tests cover.
 */
export function createAnthropicClient(apiKey: string, model = DEFAULT_MODEL): LlmClient {
  const client = new Anthropic({ apiKey });

  return {
    async complete(systemPrompt, userPrompt) {
      try {
        const message = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
        if (message.stop_reason === "refusal") throw new Error("The model declined to draft this deck.");
        return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      } catch (err) {
        throw explain(err);
      }
    },

    async generateJson(req) {
      try {
        // Streaming: a lesson's plan plus its pack is a long answer, and a
        // non-streamed request that long risks an HTTP timeout.
        const message = await client.beta.messages
          .stream({
            model,
            max_tokens: 64000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "high", format: { type: "json_schema", schema: req.schema } },
            system: req.system,
            messages: [{ role: "user", content: req.content.map(toSdkBlock) }],
          })
          .finalMessage();
        return {
          text: message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""),
          stopReason: message.stop_reason,
        };
      } catch (err) {
        throw explain(err);
      }
    },
  };
}
