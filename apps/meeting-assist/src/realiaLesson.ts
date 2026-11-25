import { normalizePack, validatePack, type ItemKind, type LessonPack, type PackItem } from "@realia/shared";
import type { LlmClient, PromptBlock } from "./llm.js";
import type { ExtractedMaterial, ImageMaterial } from "./materials.js";

// The textbook-to-pack generator (docs/PRD.md, "12. The
// textbook-to-pack generator", which generalises "10. The plan generator"). One pipeline, three doors:
//   - last-lesson: last lesson's results + its pack (+ notes) -> next week's pack
//   - coursebook:  photos of the pages + the teacher's brief  -> this week's pack
//   - scratch:     the teacher's brief alone                  -> a new pack
// Every door returns the same thing: a pack AND a teaching plan, so
// the teacher can see what the model decided before teaching it.

export type Door = "last-lesson" | "coursebook" | "scratch";

/** The options page's five fields. */
export interface LessonBrief {
  door: Door;
  lengthMinutes: number;
  format: "one-to-one" | "group";
  level: string;
  firstLanguage: string;
  /** What is already done, and what is new. */
  doneAndNew: string;
  /** What to focus on (optional). */
  focus?: string;
}

/** Last lesson's results, as the relay's report seed records them. */
export interface LastLessonResults {
  weakestRelations?: { relation: string; attempts: number; errorRate: number }[];
  rescuedWords?: { word: string; stage: number }[];
  mistakes?: { placed: string; into: string; count: number }[];
}

export interface DraftRequest {
  packId: string;
  brief: LessonBrief;
  images: ImageMaterial[];
  documents: ExtractedMaterial[];
  /** The pack last lesson used (the last-lesson door). Its place zones, objects and cards may be reused. */
  referencePack?: LessonPack;
  lastLesson?: LastLessonResults;
}

export interface TeachNormally {
  exercise: string;
  why: string;
}

export interface DraftLesson {
  pack: LessonPack;
  /** The teaching plan, markdown, for the teacher. */
  plan: string;
  summary: string;
  teachNormally: TeachNormally[];
  attempts: number;
}

/** The draft could not be made valid. Carries the problems and the model's raw output for the teacher to see. */
export class GeneratorError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
    readonly raw: string,
  ) {
    super(message);
    this.name = "GeneratorError";
  }
}

// --- What the model returns (structured outputs). ---
// No numeric or length constraints in the schema — structured outputs
// don't support them; validatePack enforces every limit afterwards.

const ACTIVITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "source_exercise", "prompt", "feedback", "zones", "pairs", "distractors"],
  properties: {
    id: { type: "string", description: "Short id, lowercase letters, digits and hyphens, unique in the lesson." },
    kind: { type: "string", enum: ["sort", "gap", "match", "place"] },
    source_exercise: { type: "string", description: "Which exercise this comes from, as the book names it, e.g. 'Grammar 1a' or 'Vocabulary 4, items 1-4'." },
    prompt: { type: "string", description: "sort/match/place: the one-sentence instruction. gap: the text the student sees, each gap written as [1], [2], ..." },
    feedback: { type: "string", description: "Short line shown on a correct placement, or an empty string." },
    zones: {
      type: "array",
      description: "This activity's own zones (bins, gaps, or match targets). Empty for place.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label"],
        properties: {
          id: { type: "string" },
          label: { type: "string", description: "Bin name, match target, or for a gap exactly its number: '1', '2', ..." },
        },
      },
    },
    pairs: {
      type: "array",
      description: "Every correct (object, zone) combination.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["object_id", "zone_id"],
        properties: { object_id: { type: "string" }, zone_id: { type: "string" } },
      },
    },
    distractors: {
      type: "array",
      description: "gap: 2-3 ids of wrong-answer objects, wrong in every gap. match: optional. sort and place: empty.",
      items: { type: "string" },
    },
  },
} as const;

const OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "emoji"],
  properties: {
    id: { type: "string" },
    label: { type: "string", description: "What the chip says: a word or short phrase, at most 60 characters." },
    emoji: { type: "string", description: "One emoji if it genuinely helps, otherwise an empty string." },
  },
} as const;

export const LESSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "translation_language", "plan_markdown", "teach_normally", "objects", "cards", "activities"],
  properties: {
    title: { type: "string", description: "Short title for the teacher's list, e.g. 'Unit 5: modals of obligation'." },
    summary: { type: "string", description: "One or two plain sentences for the approval screen: what this lesson does and why." },
    translation_language: { type: "string", description: "The student's first language, which card translations are in." },
    plan_markdown: { type: "string", description: "The teaching plan for the teacher, in Markdown." },
    teach_normally: {
      type: "array",
      description: "Exercises from the materials that are taught without objects, each with one line saying why.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["exercise", "why"],
        properties: { exercise: { type: "string" }, why: { type: "string" } },
      },
    },
    objects: { type: "array", description: "Every draggable object any activity uses.", items: OBJECT_SCHEMA },
    cards: {
      type: "array",
      description: "Vocabulary reveal cards for new words worth hearing aloud (at most 8). Empty for a pure grammar lesson.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "word", "translation", "emoji"],
        properties: {
          id: { type: "string" },
          word: { type: "string" },
          translation: { type: "string", description: "In the student's first language." },
          emoji: { type: "string" },
        },
      },
    },
    activities: { type: "array", items: ACTIVITY_SCHEMA },
  },
} as const;

export const ACTIVITY_REPLACEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["activity", "objects"],
  properties: {
    activity: ACTIVITY_SCHEMA,
    objects: { type: "array", description: "Objects the new activity uses that are not already in the pack.", items: OBJECT_SCHEMA },
  },
} as const;

interface ModelActivity {
  id: string;
  kind: ItemKind;
  source_exercise: string;
  prompt: string;
  feedback: string;
  zones: { id: string; label: string }[];
  pairs: { object_id: string; zone_id: string }[];
  distractors: string[];
}
interface ModelObject {
  id: string;
  label: string;
  emoji: string;
}
interface ModelLesson {
  title: string;
  summary: string;
  translation_language: string;
  plan_markdown: string;
  teach_normally: TeachNormally[];
  objects: ModelObject[];
  cards: { id: string; word: string; translation: string; emoji: string }[];
  activities: ModelActivity[];
}

// --- The instructions. ---

export const SYSTEM_PROMPT = `You prepare a lesson for an online language teacher who uses Realia: a shared layer over a Google Meet video call where the teacher and the student drag objects into labelled zones while still seeing each other's faces. You produce two things, and the teacher reviews both before anything is used:

1. A pack: drag-and-drop activities for the parts of the lesson where moving objects genuinely helps.
2. A teaching plan in Markdown, for the teacher.

# Activity kinds

- sort: several objects go into 2–6 labelled bins, and several objects can share a bin. For categorising: obligation / prohibition / advice, true / false, countable / uncountable, which school stage.
- gap: a short text with numbered gaps. Write each gap in the text as [1], [2] … and give it a zone whose label is exactly "1", "2" …. The objects are the words or phrases that fill the gaps. Also for word order (slots in a row) and timelines.
- match: one-to-one pairing. Each zone is a target (a situation, a definition, a sentence half) and exactly one object belongs to each.
- place: only for prepositions of place, and only by reusing the reference pack's existing anchored zones by id (zones: []). Never invent scenery. If no reference pack with place zones is given, do not use place.

# Deciding what becomes objects

Turn an exercise into objects only when moving things adds something: choosing between categories, choosing the right form, putting things in order. Listening tasks, free speaking, reading comprehension, open personalisation questions and free writing are taught normally: list each in teach_normally with one line saying why, and leave it out of the pack. Forcing every exercise into draggables produces gimmicks that waste lesson time; refusing is the right answer for those.

# Rules for the pack

- Every activity comes from the teacher's materials, or, when there are none, from the teacher's brief. Don't add topics the teacher didn't ask for.
- At most 8 objects and 6 zones per activity. Split a long exercise into self-contained parts (for example items 1–5 and 6–9).
- Object labels are short: a word or phrase, at most 60 characters. Zone labels at most 140 characters. Gap text at most 400 characters.
- Every gap activity has two or three distractors: extra chips that are wrong in every one of its gaps, so the last gap can't be filled by elimination. Make them plausible — the errors this student would really make (must to, don't must, mustn't where don't have to is meant) or words from the same box that don't fit here. A distractor must never be another acceptable answer for any gap; check each one against every gap. List them in the objects too. A match may have one or two; a sort has none.
- If one answer fills two gaps in the same activity, make one object per occurrence (ids like must-1, must-2) and pair each copy with every gap it can fill.
- If more than one form is correct in a zone, pair every correct object with it. Never pair an object with a zone where it is wrong.
- The pages may already contain the student's handwritten answers. Use them to judge what is done; never copy them as the key — work out every answer yourself, and check each pair before you finish.
- Everything the student sees is in English: prompts, labels, gap texts, feedback. Card translations are in the student's first language.
- Cards: up to 8 vocabulary reveal cards for new words from the materials that are worth hearing aloud. None for grammar words.
- Ids: lowercase letters, digits and hyphens only.

# The plan

Write it in the language the teacher wrote their brief in. Everything the student sees, hears or says stays in English: exercise instructions, example sentences, questions to ask, and the answer key. It contains, in this order:

1. The shape of the lesson: a timing table that fits the lesson length. For each stage say what happens, and whether it uses a Realia activity (name it by its source exercise) or is taught normally.
2. Each stage briefly: what it is for and how to run it.
3. The answer key for every exercise in the lesson, including those taught normally.
4. What will go wrong: the two or three errors this student is most likely to make with this material, and how to handle each.
5. The assumptions you made (what was homework, the student's age, whether the grammar is new or revision), so the teacher can correct them.

Keep it practical. The teacher reads it once before the lesson.`;

function briefText(req: Pick<DraftRequest, "brief" | "images" | "documents" | "referencePack" | "lastLesson">): string {
  const b = req.brief;
  const lines = [
    "# The teacher's brief",
    `- Lesson: ${b.lengthMinutes} minutes, ${b.format === "group" ? "a small group" : "one-to-one"}, online over Google Meet`,
    `- Student: level ${b.level || "not given"}, first language ${b.firstLanguage || "not given"}`,
    `- Already done, and what is new: ${b.doneAndNew.trim() || "not given"}`,
    `- Focus: ${b.focus?.trim() || "not given"}`,
    "",
  ];

  if (req.images.length > 0) {
    lines.push(`# Materials`, `Photos of ${req.images.length} coursebook page(s) are attached above, in order.`, "");
  }
  for (const d of req.documents) {
    if (d.text.trim()) lines.push(`--- ${d.filename} ---`, d.text.trim(), "");
  }
  if (req.images.length === 0 && !req.documents.some((d) => d.text.trim()) && !req.referencePack) {
    lines.push("# Materials", "None. Build the lesson from the brief alone, with your own example sentences.", "");
  }

  if (req.referencePack) {
    const p = req.referencePack;
    lines.push(
      "# Last lesson",
      `Pack played: "${p.title}".`,
      `Objects you may reuse by id: ${p.draggables.map((d) => `${d.id} (${d.label})`).join(", ") || "none"}.`,
      `Anchored place zones you may reuse by id: ${p.zones.filter((z) => z.anchor !== undefined).map((z) => `${z.id} (${z.relation} the ${z.anchor})`).join(", ") || "none"}.`,
      `Cards you may reuse by id: ${p.cards.map((c) => `${c.id} (${c.word})`).join(", ") || "none"}.`,
    );
    const r = req.lastLesson;
    if (r) {
      const weak = (r.weakestRelations ?? []).filter((w) => w.errorRate > 0);
      if (weak.length) lines.push(`Weakest: ${weak.map((w) => `${w.relation} (${Math.round(w.errorRate * 100)}% missed)`).join(", ")}.`);
      if (r.mistakes?.length) lines.push(`Wrong placements: ${r.mistakes.map((m) => `${m.placed} → ${m.into}${m.count > 1 ? ` ×${m.count}` : ""}`).join(", ")}.`);
      if (r.rescuedWords?.length) lines.push(`Words that needed the picture or translation: ${r.rescuedWords.map((w) => w.word).join(", ")}.`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// --- Turning the model's answer into a pack. ---

function slug(s: string, max = 40): string {
  const out = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, max)
    .replace(/[-_]+$/, "");
  return out || "x";
}

function zoneId(activityId: string, modelZoneId: string): string {
  return `${slug(activityId, 20)}--${slug(modelZoneId, 24)}`;
}

function cardId(modelId: string): string {
  const s = slug(modelId, 44);
  return s.startsWith("c-") ? s : `c-${s}`;
}

function toItem(a: ModelActivity, reference: LessonPack | undefined, zonesOut: LessonPack["zones"]): PackItem {
  const id = slug(a.id, 20);
  const pairs = a.pairs.map((p) => {
    const z =
      a.kind === "place" && reference?.zones.some((rz) => rz.id === p.zone_id) ? p.zone_id : zoneId(a.id, p.zone_id);
    return { objectId: slug(p.object_id), zoneId: z };
  });
  if (a.kind !== "place") {
    for (const z of a.zones) {
      const zid = zoneId(a.id, z.id);
      if (!zonesOut.some((existing) => existing.id === zid)) zonesOut.push({ id: zid, label: z.label.trim() });
    }
  }
  const distractors = [...new Set((a.distractors ?? []).map((d) => slug(d)))];
  return {
    id,
    kind: a.kind,
    prompt: a.prompt.trim(),
    ...(a.feedback.trim() ? { feedback: a.feedback.trim() } : {}),
    pairs,
    ...(distractors.length ? { distractors } : {}),
    ...(a.source_exercise.trim() ? { source: a.source_exercise.trim().slice(0, 80) } : {}),
  };
}

/** Builds a normalised pack from the model's lesson. Reference-pack ids are reused as-is; everything new is slugged. */
export function toPack(lesson: ModelLesson, packId: string, reference?: LessonPack): LessonPack {
  const zones: LessonPack["zones"] = [];
  const items = lesson.activities.map((a) => toItem(a, reference, zones));

  const usedObjects = new Set(items.flatMap((i) => [...i.pairs.map((p) => p.objectId), ...(i.distractors ?? [])]));
  const usedZones = new Set(items.flatMap((i) => i.pairs.map((p) => p.zoneId)));
  const draggables: LessonPack["draggables"] = [];
  for (const o of lesson.objects) {
    const id = slug(o.id);
    if (!usedObjects.has(id) || draggables.some((d) => d.id === id)) continue;
    draggables.push({ id, label: o.label.trim(), ...(o.emoji.trim() ? { emoji: o.emoji.trim() } : {}) });
  }
  for (const d of reference?.draggables ?? []) {
    if (usedObjects.has(d.id) && !draggables.some((x) => x.id === d.id)) draggables.push(d);
  }

  const usesPlace = items.some((i) => i.kind === "place");
  for (const z of reference?.zones ?? []) {
    if (usesPlace && usedZones.has(z.id) && !zones.some((x) => x.id === z.id)) zones.push(z);
  }

  const cards: LessonPack["cards"] = lesson.cards.map((c) => {
    const reused = reference?.cards.find((rc) => rc.id === c.id);
    if (reused) return reused; // keeps its existing (bundled) audio
    return {
      id: cardId(c.id),
      word: c.word.trim(),
      translation: c.translation.trim(),
      ...(c.emoji.trim() ? { emoji: c.emoji.trim() } : {}),
      audio: null, // silent until approval generates its mp3s
    };
  });

  return normalizePack({
    id: packId,
    title: lesson.title.trim(),
    translationLang: lesson.translation_language.trim(),
    scenery: usesPlace ? (reference?.scenery ?? []) : [],
    draggables,
    zones,
    backdrops: usesPlace ? (reference?.backdrops ?? {}) : {},
    sentenceTemplate: usesPlace ? (reference?.sentenceTemplate ?? "") : "",
    cards,
    items,
  });
}

// --- Calling the model, validating, retrying once. ---

interface Attempt<T> {
  value: T | null;
  problems: string[];
  raw: string;
}

/** Runs one model call and turns its answer into T, or into the problems that stop it. */
async function attempt<T>(
  llm: LlmClient,
  system: string,
  content: PromptBlock[],
  schema: Record<string, unknown>,
  build: (parsed: unknown) => T,
  validate: (value: T) => string[],
): Promise<Attempt<T>> {
  const result = await llm.generateJson({ system, content, schema });
  if (result.stopReason === "refusal") return { value: null, problems: ["The model declined to draft this lesson."], raw: result.text };
  if (result.stopReason === "max_tokens") return { value: null, problems: ["The draft was cut off before it finished."], raw: result.text };
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return { value: null, problems: ["The draft was not valid JSON."], raw: result.text };
  }
  let value: T;
  try {
    value = build(parsed);
  } catch (err) {
    return { value: null, problems: [`The draft could not be read: ${err instanceof Error ? err.message : String(err)}`], raw: result.text };
  }
  return { value, problems: validate(value), raw: result.text };
}

function retryNote(previous: Attempt<unknown>): PromptBlock {
  return {
    type: "text",
    text:
      "A previous attempt returned the JSON below, and it failed validation. Return a corrected version of the whole answer, fixing every problem listed.\n\n" +
      `Problems:\n${previous.problems.map((p) => `- ${p}`).join("\n")}\n\nPrevious attempt:\n${previous.raw}`,
  };
}

/**
 * Validates strictly and retries once with the problems spelled out.
 * If the retry fails too, throws a GeneratorError carrying the
 * problems and the raw output, so the teacher sees what happened
 * instead of a broken pack being loaded.
 */
async function withOneRetry<T>(
  llm: LlmClient,
  system: string,
  content: PromptBlock[],
  schema: Record<string, unknown>,
  build: (parsed: unknown) => T,
  validate: (value: T) => string[],
): Promise<{ value: T; attempts: number }> {
  const first = await attempt(llm, system, content, schema, build, validate);
  if (first.value && first.problems.length === 0) return { value: first.value, attempts: 1 };
  const second = await attempt(llm, system, [...content, retryNote(first)], schema, build, validate);
  if (second.value && second.problems.length === 0) return { value: second.value, attempts: 2 };
  throw new GeneratorError("The draft didn't pass validation, even after one retry.", second.problems, second.raw);
}

function lessonFrom(parsed: unknown): ModelLesson {
  const l = parsed as ModelLesson;
  if (!l || !Array.isArray(l.activities) || !Array.isArray(l.objects) || typeof l.plan_markdown !== "string") {
    throw new Error("expected a lesson with activities, objects and a plan");
  }
  return l;
}

export async function draftRealiaLesson(req: DraftRequest, llm: LlmClient): Promise<DraftLesson> {
  // Photos first, then the brief: the brief refers to "the photos above".
  const content: PromptBlock[] = [
    ...req.images.map((img): PromptBlock => ({ type: "image", mediaType: img.mediaType, base64: img.base64 })),
    { type: "text", text: briefText(req) },
  ];

  let plan = "";
  let summary = "";
  let teachNormally: TeachNormally[] = [];
  const { value: pack, attempts } = await withOneRetry(
    llm,
    SYSTEM_PROMPT,
    content,
    LESSON_SCHEMA as unknown as Record<string, unknown>,
    (parsed) => {
      const lesson = lessonFrom(parsed);
      plan = lesson.plan_markdown;
      summary = lesson.summary;
      teachNormally = lesson.teach_normally ?? [];
      return toPack(lesson, req.packId, req.referencePack);
    },
    (p) => {
      const problems = validatePack(p);
      if (!plan.trim()) problems.push("The teaching plan is empty.");
      return problems;
    },
  );
  return { pack, plan, summary, teachNormally, attempts };
}

// --- Regenerating one activity. ---
// No photos here: they were dropped after the first draft. The plan
// and the pack carry everything the exercise needs.

export interface RegenerateRequest {
  brief: LessonBrief;
  pack: LessonPack;
  plan: string;
  activityId: string;
}

function packWithReplacedItem(pack: LessonPack, index: number, a: ModelActivity, newObjects: ModelObject[]): LessonPack {
  const old = pack.items[index];
  const stillUsed = new Set(pack.items.filter((_, i) => i !== index).flatMap((it) => it.pairs.map((p) => p.zoneId)));
  const zones = pack.zones.filter((z) => !old.pairs.some((p) => p.zoneId === z.id) || stillUsed.has(z.id));
  const item = toItem({ ...a, id: old.id }, pack, zones);

  const draggables = [...pack.draggables];
  for (const o of newObjects) {
    const id = slug(o.id);
    if (!draggables.some((d) => d.id === id)) draggables.push({ id, label: o.label.trim(), ...(o.emoji.trim() ? { emoji: o.emoji.trim() } : {}) });
  }
  const items = pack.items.map((it, i) => (i === index ? item : it));
  const used = new Set(items.flatMap((it) => [...it.pairs.map((p) => p.objectId), ...(it.distractors ?? [])]));
  return normalizePack({ ...pack, zones, items, draggables: draggables.filter((d) => used.has(d.id)) });
}

export async function regenerateActivity(req: RegenerateRequest, llm: LlmClient): Promise<{ pack: LessonPack; attempts: number }> {
  const index = req.pack.items.findIndex((it) => it.id === req.activityId);
  if (index < 0) throw new GeneratorError(`No activity "${req.activityId}" in this pack.`, [], "");
  const current = req.pack.items[index];

  const content: PromptBlock[] = [
    {
      type: "text",
      text: [
        briefText({ brief: req.brief, images: [], documents: [] }).replace(/# Materials[\s\S]*$/, ""),
        "# The lesson so far",
        "The teaching plan the teacher is reviewing:",
        req.plan,
        "",
        "The current pack (JSON):",
        JSON.stringify(req.pack),
        "",
        "# What to do",
        `The teacher asked for a different version of activity "${current.id}" (${current.kind}, from ${current.source ?? "the materials"}).`,
        "Make one replacement activity from the same exercise: a different way to turn it into objects, or a different selection of its items — not the same activity again. Keep every answer correct, following the plan's answer key.",
        "Return the new activity, and any objects it needs that are not already in the pack (reuse existing object ids where they fit).",
      ].join("\n"),
    },
  ];

  const { value: pack, attempts } = await withOneRetry(
    llm,
    SYSTEM_PROMPT,
    content,
    ACTIVITY_REPLACEMENT_SCHEMA as unknown as Record<string, unknown>,
    (parsed) => {
      const r = parsed as { activity: ModelActivity; objects: ModelObject[] };
      if (!r?.activity || !Array.isArray(r.objects)) throw new Error("expected an activity and its objects");
      return packWithReplacedItem(req.pack, index, r.activity, r.objects);
    },
    validatePack,
  );
  return { pack, attempts };
}
