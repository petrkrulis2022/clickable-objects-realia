import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { loadValidPack, PackValidationError, type LessonPack } from "@realia/shared";
import { generateCardAudio, type TextToSpeech } from "./audio.js";
import type { LlmClient } from "./llm.js";
import { extractAllMaterials, MaterialError, partitionMaterials, type MaterialExtractors, type RawMaterial } from "./materials.js";
import {
  draftRealiaLesson,
  GeneratorError,
  regenerateActivity,
  type LastLessonResults,
  type LessonBrief,
} from "./realiaLesson.js";
import { draftVennPlan } from "./vennPlan.js";

export interface AssistDeps {
  llm: LlmClient;
  /** False when ANTHROPIC_API_KEY isn't set: drafting answers with a clear error instead of a fake result. */
  llmConfigured: boolean;
  model: string;
  extractors: MaterialExtractors;
  /** null when ELEVENLABS_API_KEY isn't set: approved cards stay silent. */
  tts: TextToSpeech | null;
  newPackId?: () => string;
  log?: (message: string) => void;
}

type VennBody = { product: "vennmeet"; meetingContext?: string; materials?: RawMaterial[] };
type RealiaDraftBody = {
  product: "realia";
  mode?: "draft";
  brief: LessonBrief;
  materials?: RawMaterial[];
  referencePack?: unknown;
  lastLesson?: LastLessonResults;
};
type RealiaRegenerateBody = { product: "realia"; mode: "regenerate"; brief: LessonBrief; pack: unknown; plan: string; activityId: string };
type PlanBody = VennBody | RealiaDraftBody | RealiaRegenerateBody;

/** Only the extension's own pages (the options page) may call this service from a browser. */
const ALLOWED_ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}$/;
/** Up to 8 photos of up to 5 MB each, base64, plus documents. */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** lesson-20261125-x7k2qa: sortable, unguessable enough, and a safe file name on the relay. */
export function newLessonPackId(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6).padEnd(6, "0");
  return `lesson-${date}-${suffix}`;
}

function readJson(req: IncomingMessage): Promise<unknown> {
  // JSON only: a cross-origin page can't send it without a preflight, which it would fail.
  if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return Promise.reject(new HttpError(415, "Send JSON (content-type: application/json)"));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Too much to upload at once — fewer or smaller photos"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function packOrError(raw: unknown, what: string): LessonPack {
  try {
    return loadValidPack(raw);
  } catch (err) {
    const detail = err instanceof PackValidationError ? `: ${err.problems.slice(0, 3).join("; ")}` : "";
    throw new HttpError(400, `The ${what} is not a valid pack${detail}`);
  }
}

export function createAssistServer(deps: AssistDeps): Server {
  const log = deps.log ?? ((m: string) => console.log(m));
  const newPackId = deps.newPackId ?? (() => newLessonPackId());

  function requireLlm() {
    if (!deps.llmConfigured) {
      throw new HttpError(503, "ANTHROPIC_API_KEY is not set on the meeting-assist service — no plan can be drafted without it.");
    }
  }

  async function handlePlan(body: PlanBody): Promise<unknown> {
    requireLlm();

    if (body.product === "vennmeet") {
      const { documents, images } = partitionMaterials(body.materials ?? []);
      if (images.length) throw new HttpError(400, "Photos are only used for Realia lessons");
      const materials = await extractAllMaterials(documents, deps.extractors);
      return draftVennPlan({ meetingContext: body.meetingContext, materials }, deps.llm);
    }

    if (body.product !== "realia" || !body.brief) throw new HttpError(400, "Unknown request");

    if (body.mode === "regenerate") {
      const pack = packOrError(body.pack, "current draft");
      const started = Date.now();
      const out = await regenerateActivity({ brief: body.brief, pack, plan: body.plan ?? "", activityId: body.activityId }, deps.llm);
      log(`[meeting-assist] realia: regenerated "${body.activityId}" in ${Math.round((Date.now() - started) / 1000)}s`);
      return out;
    }

    // The photos live in `images` for exactly as long as this function
    // runs. They go to the model call and nowhere else.
    const { documents, images } = partitionMaterials(body.materials ?? []);
    const extracted = await extractAllMaterials(documents, deps.extractors);
    const referencePack = body.referencePack ? packOrError(body.referencePack, "last lesson's pack") : undefined;
    const started = Date.now();
    const draft = await draftRealiaLesson(
      { packId: newPackId(), brief: body.brief, images, documents: extracted, referencePack, lastLesson: body.lastLesson },
      deps.llm,
    );
    log(
      `[meeting-assist] realia: drafted ${draft.pack.items.length} activities from ${images.length} photo(s) and ` +
        `${extracted.length} document(s) in ${Math.round((Date.now() - started) / 1000)}s (attempts: ${draft.attempts})`,
    );
    return draft;
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (origin) {
      if (!ALLOWED_ORIGIN_RE.test(origin)) throw new HttpError(403, "origin not allowed");
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    if (req.method === "GET" && req.url === "/status") {
      return sendJson(res, 200, { anthropic: deps.llmConfigured, elevenLabs: deps.tts !== null, model: deps.model });
    }
    if (req.method === "POST" && req.url === "/plan/draft") {
      const body = (await readJson(req)) as PlanBody;
      return sendJson(res, 200, { draft: await handlePlan(body) });
    }
    // Approval: record every new word, normal and slow, once.
    if (req.method === "POST" && req.url === "/plan/audio") {
      const body = (await readJson(req)) as { pack?: unknown };
      const pack = packOrError(body.pack, "approved draft");
      return sendJson(res, 200, await generateCardAudio(pack, deps.tts));
    }
    throw new HttpError(404, "not found");
  }

  return createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      if (res.headersSent) return;
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      if (err instanceof MaterialError) return sendJson(res, 400, { error: err.message });
      if (err instanceof GeneratorError) return sendJson(res, 422, { error: err.message, problems: err.problems, raw: err.raw });
      // Never echo the request back: it may contain photos.
      log(`[meeting-assist] ${req.method} ${req.url} failed: ${err instanceof Error ? err.message : String(err)}`);
      sendJson(res, 502, { error: err instanceof Error ? err.message : "Unknown error" });
    });
  });
}
