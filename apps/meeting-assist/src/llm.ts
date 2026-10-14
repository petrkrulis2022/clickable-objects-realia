export interface LlmClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

/** Returns a fixed string regardless of input — used in every test, and the default if ANTHROPIC_API_KEY isn't set, so this service runs without a key (producing an honest error on an actual plan request rather than silently faking one). */
export function createNullLlmClient(fixedResponse = ""): LlmClient {
  return { complete: async () => fixedResponse };
}

/**
 * Plain REST call to the Anthropic Messages API — no SDK dependency.
 * Unverified live in this environment (no key, no network here); the
 * parsing/validation code downstream of this (vennPlan.ts,
 * realiaPlan.ts) is what's actually tested, against canned responses
 * from createNullLlmClient.
 */
export function createAnthropicClient(apiKey: string, model = "claude-sonnet-5-5"): LlmClient {
  return {
    async complete(systemPrompt, userPrompt) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      }
      const body = (await res.json()) as { content: { type: string; text?: string }[] };
      return body.content.find((c) => c.type === "text")?.text ?? "";
    },
  };
}
