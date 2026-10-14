import { createServer } from "node:http";
import type { LessonPack } from "@realia/shared";
import { extractAllMaterials, type RawMaterial } from "./materials.js";
import { createNullExtractors, createRealExtractors } from "./extractors.js";
import { createAnthropicClient, createNullLlmClient } from "./llm.js";
import { draftVennPlan } from "./vennPlan.js";
import { draftRealiaPlan } from "./realiaPlan.js";

const PORT = 8790;

// Null fallbacks mean this service starts and its material-extraction
// path works (PDF/DOCX are local, no key needed) without any key
// configured; a plan request without ANTHROPIC_API_KEY set fails with
// a clear error rather than silently returning nothing.
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const anthropicModel = process.env.ANTHROPIC_MODEL;
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

const extractors = createRealExtractors(elevenLabsKey);
const llm = anthropicKey ? createAnthropicClient(anthropicKey, anthropicModel) : createNullLlmClient();

type PlanRequestBody =
  | { product: "vennmeet"; meetingContext?: string; materials: RawMaterial[] }
  | { product: "realia"; referencePack: LessonPack; focusNotes?: string; materials: RawMaterial[] };

async function handlePlanDraft(body: PlanRequestBody) {
  if (!anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the meeting-assist service — no plan can be drafted without it.");
  }
  const materials = await extractAllMaterials(body.materials, extractors);

  if (body.product === "vennmeet") {
    return draftVennPlan({ meetingContext: body.meetingContext, materials }, llm);
  }
  return draftRealiaPlan({ referencePack: body.referencePack, focusNotes: body.focusNotes, materials }, llm);
}

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && req.url === "/plan/draft") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body) as PlanRequestBody;
        const draft = await handlePlanDraft(parsed);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ draft }));
      } catch (err) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }));
      }
    });
    return;
  }

  res.writeHead(404).end();
});

httpServer.listen(PORT, () => {
  console.log(`[meeting-assist] listening on http://localhost:${PORT}`);
  if (!anthropicKey) {
    console.log("[meeting-assist] ANTHROPIC_API_KEY not set — /plan/draft will return an error until it is.");
  }
});
