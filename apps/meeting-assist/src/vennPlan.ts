import type { Card, Section } from "@vennmeet/shared";
import type { LlmClient } from "./llm.js";
import type { ExtractedMaterial } from "./materials.js";
import { parseJsonLenient } from "./jsonExtract.js";

export interface VennPlanRequest {
  /** e.g. "Client meeting with Acme, discuss phase 2 scope and pricing" */
  meetingContext?: string;
  materials: ExtractedMaterial[];
}

export interface DraftDeck {
  name: string;
  sections: Section[];
}

const MAX_SECTIONS = 6;
const MAX_CARDS_PER_SECTION = 6;

// Only the private-layer-appropriate kinds — "decision" and "action"
// are shared-layer-only (@vennmeet/shared's own comment: logged during
// a live session), so drafting them ahead of a meeting that hasn't
// happened yet doesn't make sense.
const ALLOWED_KINDS = ["phrase", "list", "checklist", "number", "note", "goal"] as const;

const SYSTEM_PROMPT = `You are drafting a VennMeet deck: a small set of private note cards for someone about to join a video call, built from materials they give you (notes, past transcripts, documents). You are not writing a summary to be read — you are writing cards to be glanced at during the call.

Output ONLY a single valid JSON object, no markdown code fences, no commentary before or after it. The shape is exactly:

{
  "name": string,
  "sections": [
    {
      "title": string,
      "cards": [ one of these shapes per card —
        { "kind": "phrase", "text": string },
        { "kind": "list", "title": string, "lines": string[] },
        { "kind": "checklist", "title": string, "items": [{ "text": string, "done": false }] },
        { "kind": "number", "title": string, "value": string, "spoken": string },
        { "kind": "note", "title": string, "text": string },
        { "kind": "goal", "title": string, "want": string, "walkAway": string }
      ]
    }
  ]
}

Rules:
- At most ${MAX_SECTIONS} sections, at most ${MAX_CARDS_PER_SECTION} cards per section.
- Every fact, name, number, or commitment on a card must come from the materials given. Never invent one. If the materials don't support a card you'd otherwise add, leave it out.
- A "goal" card's "want" and "walkAway" must be grounded in the materials, not generic filler like "close the deal."
- Card text is short — a few words to a short sentence, meant to be read in under two seconds, not a paragraph.
- Use only the six card kinds listed above — never "decision" or "action" (those are created live, during a call, not drafted ahead of one).`;

export async function draftVennPlan(req: VennPlanRequest, llm: LlmClient): Promise<DraftDeck> {
  const raw = await llm.complete(SYSTEM_PROMPT, buildUserPrompt(req));
  return parseVennDraft(raw);
}

function buildUserPrompt(req: VennPlanRequest): string {
  const parts: string[] = [];
  if (req.meetingContext) parts.push(`Context for this meeting: ${req.meetingContext}`);
  for (const m of req.materials) parts.push(`--- ${m.filename} ---\n${m.text}`);
  if (parts.length === 0) parts.push("(No materials were given.)");
  return parts.join("\n\n");
}

function genId(): string {
  return crypto.randomUUID();
}

/**
 * Validates and clamps the model's JSON into real Section/Card
 * objects — defense in depth, not just a prompt instruction. A
 * malformed or out-of-shape card is dropped rather than passed
 * through; an invented "decision"/"action" kind is dropped too, since
 * the prompt forbidding it is advisory, not enforced, until this runs.
 */
export function parseVennDraft(raw: string): DraftDeck {
  const parsed = parseJsonLenient(raw) as Record<string, unknown>;
  if (typeof parsed.name !== "string" || !Array.isArray(parsed.sections)) {
    throw new Error("Malformed plan draft: expected { name: string, sections: [...] }");
  }

  const sections: Section[] = (parsed.sections as unknown[]).slice(0, MAX_SECTIONS).map((s) => {
    const section = s as Record<string, unknown>;
    const rawCards = Array.isArray(section.cards) ? section.cards : [];
    const cards = rawCards
      .slice(0, MAX_CARDS_PER_SECTION)
      .map((c) => validateCard(c as Record<string, unknown>))
      .filter((c): c is Card => c !== null);
    return { id: genId(), title: typeof section.title === "string" ? section.title : "Untitled", cards };
  });

  return { name: parsed.name as string, sections };
}

function validateCard(c: Record<string, unknown>): Card | null {
  const kind = c.kind;
  if (typeof kind !== "string" || !(ALLOWED_KINDS as readonly string[]).includes(kind)) return null;
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

  switch (kind) {
    case "phrase":
      return { id: genId(), kind: "phrase", text: str(c.text) };
    case "list":
      return {
        id: genId(),
        kind: "list",
        title: str(c.title, "Untitled"),
        lines: Array.isArray(c.lines) ? c.lines.filter((l): l is string => typeof l === "string") : [],
      };
    case "checklist":
      return {
        id: genId(),
        kind: "checklist",
        title: str(c.title, "Untitled"),
        items: Array.isArray(c.items)
          ? c.items
              .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
              .map((i) => ({ text: str(i.text), done: false }))
          : [],
      };
    case "number":
      return { id: genId(), kind: "number", title: str(c.title, "Untitled"), value: str(c.value), spoken: str(c.spoken) };
    case "note":
      return { id: genId(), kind: "note", title: str(c.title, "Untitled"), text: str(c.text) };
    case "goal":
      return { id: genId(), kind: "goal", title: str(c.title, "This call"), want: str(c.want), walkAway: str(c.walkAway) };
    default:
      return null;
  }
}
