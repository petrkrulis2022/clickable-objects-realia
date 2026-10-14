import type { LessonPack, PackItem } from "@realia/shared";
import type { LlmClient } from "./llm.js";
import type { ExtractedMaterial } from "./materials.js";
import { parseJsonLenient } from "./jsonExtract.js";

export interface RealiaPlanRequest {
  /** The fixed vocabulary/scenery/zone/card set this draft must draw from — never invented. Today there is one shipped pack; this is it, or an equivalent. */
  referencePack: LessonPack;
  /** e.g. "struggled with behind/between last week, confident on on/under" */
  focusNotes?: string;
  materials: ExtractedMaterial[];
}

export interface DraftPlan {
  items: PackItem[];
  /** A short, plain sentence for the approval screen — never written into the pack itself. */
  summary: string;
}

const MAX_ITEMS = 16;
const MIN_ITEMS = 4;

function buildSystemPrompt(pack: LessonPack): string {
  const draggableIds = pack.draggables.map((d) => d.id).join(", ");
  const zones = pack.zones.map((z) => `${z.id} (${z.relation} the ${z.anchor === "both" ? "two anchors" : z.anchor})`).join("; ");
  const backdropKeys = Object.keys(pack.backdrops).join(", ") || "(none)";

  return `You are drafting next session's practice sequence for a language-learning drag-and-drop lesson. You do NOT invent new vocabulary, scenery, zones, or pictures — only pre-recorded audio and pre-placed art exist for the ids below, and nothing else can be used.

Existing draggable objects (use these "object" ids only): ${draggableIds}
Existing zones (use these "zone" ids only): ${zones}
Existing backdrop keys (use these "backdrop" values only, or omit the field): ${backdropKeys}
Sentence template for prompts: "${pack.sentenceTemplate}" (relation and anchor come from the zone you pick; write the prompt as this sentence would read with "Put the X" in front of it)

Output ONLY a single valid JSON object, no markdown fences, no commentary:

{
  "summary": string,  // one or two plain sentences: what this session emphasizes and why, for a teacher to read in four seconds
  "items": [
    { "prompt": string, "object": string, "zone": string, "backdrop": string (optional) }
  ]
}

Rules:
- Between ${MIN_ITEMS} and ${MAX_ITEMS} items.
- Every "object" must be one of the existing draggable ids above. Every "zone" must be one of the existing zone ids above. Every "backdrop", if present, must be one of the existing backdrop keys above.
- Generate conservatively: reuse the relations and objects that already exist; do not propose a new kind of activity. Prioritize zones/relations the materials indicate need more practice; include some already-solid ones too, not only weak points.
- "prompt" must read naturally as an instruction, e.g. "Put the keys under the chair."`;
}

export async function draftRealiaPlan(req: RealiaPlanRequest, llm: LlmClient): Promise<DraftPlan> {
  const raw = await llm.complete(buildSystemPrompt(req.referencePack), buildUserPrompt(req));
  return parseRealiaDraft(raw, req.referencePack);
}

function buildUserPrompt(req: RealiaPlanRequest): string {
  const parts: string[] = [];
  if (req.focusNotes) parts.push(`Teacher's notes on what to focus on: ${req.focusNotes}`);
  for (const m of req.materials) parts.push(`--- ${m.filename} ---\n${m.text}`);
  if (parts.length === 0) parts.push("(No materials were given — draft a balanced general-practice session.)");
  return parts.join("\n\n");
}

/**
 * Validates every item against the reference pack's actual ids —
 * defense in depth, not just a prompt instruction. An item referencing
 * an id that doesn't exist is dropped rather than passed through,
 * since a dangling id would silently fail (or draw nothing) in the
 * runner.
 */
export function parseRealiaDraft(raw: string, referencePack: LessonPack): DraftPlan {
  const parsed = parseJsonLenient(raw) as Record<string, unknown>;
  if (typeof parsed.summary !== "string" || !Array.isArray(parsed.items)) {
    throw new Error("Malformed plan draft: expected { summary: string, items: [...] }");
  }

  const objectIds = new Set(referencePack.draggables.map((d) => d.id));
  const zoneIds = new Set(referencePack.zones.map((z) => z.id));
  const backdropKeys = new Set(Object.keys(referencePack.backdrops));

  const items: PackItem[] = (parsed.items as unknown[])
    .slice(0, MAX_ITEMS)
    .map((raw) => raw as Record<string, unknown>)
    .filter((i) => typeof i.object === "string" && objectIds.has(i.object))
    .filter((i) => typeof i.zone === "string" && zoneIds.has(i.zone))
    .map((i): PackItem => {
      const backdrop = typeof i.backdrop === "string" && backdropKeys.has(i.backdrop) ? i.backdrop : undefined;
      return {
        prompt: typeof i.prompt === "string" && i.prompt ? i.prompt : `Put the ${i.object} ${referencePack.zones.find((z) => z.id === i.zone)?.relation ?? ""}.`,
        object: i.object as string,
        zone: i.zone as string,
        ...(backdrop ? { backdrop } : {}),
      };
    });

  if (items.length < MIN_ITEMS) {
    throw new Error(`Draft produced only ${items.length} valid item(s) after validation — too few to be useful`);
  }

  return { items, summary: parsed.summary as string };
}
