import { binCapacity, itemGeometry, itemObjectIds, resolveItem, TRAY_MAX_ROWS, trayRowsNeeded } from "./layout.js";
import { normalizePack } from "./normalize.js";
import type { LessonPack, StageObject } from "./types.js";

// Strict validation, applied before any pack is loaded, saved or
// shown for approval (docs/PRD.md, "12. The textbook-to-pack generator": "Validate strictly before
// returning, and never load an invalid pack"). Packs come from a
// model, so nothing here trusts a field's type just because the
// TypeScript type says so.

export const MAX_OBJECTS_PER_ITEM = 8;
export const MAX_ZONES_PER_ITEM = 6;
export const MAX_ITEMS = 40;

/** Pack ids are file names on the relay, so they must be safe ones. */
export const PACK_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Ids of objects, zones, cards, scenery, items. Lowercase, no spaces, no path characters. */
export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
/** Only images bundled with the extension — never a URL, never an uploaded photo. */
export const BACKDROP_SRC_RE = /^backdrops\/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
const BUNDLED_AUDIO_RE = /^audio\/[a-z0-9_-]+\.mp3$/;
const GENERATED_AUDIO_FILE_RE = /^[a-z0-9][a-z0-9_-]{0,63}\.mp3$/;

const LIMITS = {
  title: 120,
  translationLang: 40,
  sentenceTemplate: 200,
  objectLabel: 60,
  zoneLabel: 140,
  sceneryLabel: 40,
  word: 40,
  translation: 80,
  prompt: 400,
  feedback: 200,
  source: 80,
};

const MAX_PACK_JSON_BYTES = 256 * 1024;
const POS_TOLERANCE = 1e-6;
const OVERLAP_TOLERANCE = 0.005;

export class PackValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid pack: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}`);
    this.name = "PackValidationError";
  }
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isVec(v: unknown): v is { x: number; y: number } {
  return typeof v === "object" && v !== null && isNum((v as { x: unknown }).x) && isNum((v as { y: unknown }).y);
}

function isSize(v: unknown): v is { w: number; h: number } {
  return (
    typeof v === "object" && v !== null && isNum((v as { w: unknown }).w) && isNum((v as { h: unknown }).h) &&
    (v as { w: number }).w > 0 && (v as { h: number }).h > 0
  );
}

/** How a gap zone labelled `label` is marked inside a gap item's text. */
export function gapMarker(label: string): string {
  return `[${label}]`;
}

/** Generated audio for a pack is served from /packs/<packId>/audio/<file>, and only from there. */
export function generatedAudioPath(packId: string, file: string): string {
  return `/packs/${packId}/audio/${file}`;
}

export function isValidGeneratedAudioFile(file: string): boolean {
  return GENERATED_AUDIO_FILE_RE.test(file);
}

function checkText(problems: string[], where: string, value: unknown, max: number, required = true) {
  if (typeof value !== "string") {
    if (required || value !== undefined) problems.push(`${where} must be text`);
    return;
  }
  if (required && value.trim() === "") problems.push(`${where} is empty`);
  if (value.length > max) problems.push(`${where} is longer than ${max} characters`);
  // Belt and braces against an image (or anything else) being smuggled into a pack as text.
  if (/data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(value)) problems.push(`${where} contains embedded data`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) problems.push(`${where} contains control characters`);
}

function insideStage(o: StageObject): boolean {
  return (
    o.pos.x >= -POS_TOLERANCE &&
    o.pos.y >= -POS_TOLERANCE &&
    o.pos.x + o.size.w <= 1 + POS_TOLERANCE &&
    o.pos.y + o.size.h <= 1 + POS_TOLERANCE
  );
}

function overlaps(a: StageObject, b: StageObject): boolean {
  const w = Math.min(a.pos.x + a.size.w, b.pos.x + b.size.w) - Math.max(a.pos.x, b.pos.x);
  const h = Math.min(a.pos.y + a.size.h, b.pos.y + b.size.h) - Math.max(a.pos.y, b.pos.y);
  return w > OVERLAP_TOLERANCE && h > OVERLAP_TOLERANCE;
}

/** An infogap's teacher set: one reference object per zone, its label matching the student's object for that zone. */
function infogapProblems(pack: LessonPack, item: LessonPack["items"][number], where: string, objectIds: Set<string>): string[] {
  const problems: string[] = [];
  const reference = item.reference ?? [];
  if (reference.length === 0) return [`${where} is an infogap activity with no reference arrangement for the teacher`];
  const studentObjects = new Set(item.pairs.map((p) => p.objectId));
  const refObjects = new Set(reference.map((r) => r.objectId));
  if (refObjects.size > MAX_OBJECTS_PER_ITEM) {
    problems.push(`${where} has ${refObjects.size} objects on the teacher's side (at most ${MAX_OBJECTS_PER_ITEM})`);
  }
  if (refObjects.size !== reference.length) problems.push(`${where} lists a reference object twice`);
  for (const r of reference) {
    if (!objectIds.has(r.objectId)) problems.push(`${where} reference refers to unknown object "${r.objectId}"`);
    if (studentObjects.has(r.objectId)) problems.push(`${where} uses "${r.objectId}" on both the teacher's and the student's side`);
  }
  const label = new Map(pack.draggables.map((d) => [d.id, d.label.trim().toLowerCase()]));
  const zones = new Set(item.pairs.map((p) => p.zoneId));
  const refZones = reference.map((r) => r.zoneId);
  if (new Set(refZones).size !== refZones.length || refZones.length !== zones.size || refZones.some((z) => !zones.has(z))) {
    problems.push(`${where} needs exactly one reference object in each of its zones`);
  }
  for (const p of item.pairs) {
    const ref = reference.find((r) => r.zoneId === p.zoneId);
    if (ref && label.get(ref.objectId) !== label.get(p.objectId)) {
      problems.push(`${where}: the teacher's "${ref.objectId}" and the student's "${p.objectId}" share a zone but not a label`);
    }
  }
  return problems;
}

/** Every problem with a pack, in plain language. Empty means it can be loaded. */
export function validatePack(pack: LessonPack): string[] {
  const problems: string[] = [];

  let json = "";
  try {
    json = JSON.stringify(pack);
  } catch {
    return ["pack is not serialisable"];
  }
  if (json.length > MAX_PACK_JSON_BYTES) problems.push(`pack is larger than ${MAX_PACK_JSON_BYTES / 1024} KB`);

  if (typeof pack.id !== "string" || !PACK_ID_RE.test(pack.id)) problems.push(`pack id "${pack.id}" is not a safe id`);
  checkText(problems, "title", pack.title, LIMITS.title);
  checkText(problems, "translationLang", pack.translationLang, LIMITS.translationLang);
  checkText(problems, "sentenceTemplate", pack.sentenceTemplate, LIMITS.sentenceTemplate, false);

  // Every id that becomes a stage object must be unique across the whole pack.
  const stageIds = new Map<string, string>();
  function claimId(id: unknown, what: string) {
    if (typeof id !== "string" || !ID_RE.test(id)) {
      problems.push(`${what} id "${String(id)}" must be lowercase letters, digits, - or _`);
      return;
    }
    const prior = stageIds.get(id);
    if (prior) problems.push(`id "${id}" is used by both ${prior} and ${what}`);
    else stageIds.set(id, what);
  }

  for (const s of pack.scenery) {
    claimId(s.id, `scenery "${s.id}"`);
    checkText(problems, `scenery "${s.id}" label`, s.label, LIMITS.sceneryLabel);
    if (!isVec(s.pos) || !isSize(s.size)) problems.push(`scenery "${s.id}" needs a position and size`);
  }
  for (const d of pack.draggables) {
    claimId(d.id, `object "${d.id}"`);
    checkText(problems, `object "${d.id}" label`, d.label, LIMITS.objectLabel);
    checkText(problems, `object "${d.id}" emoji`, d.emoji, 16, false);
  }
  const zoneById = new Map(pack.zones.map((z) => [z.id, z]));
  for (const z of pack.zones) {
    claimId(z.id, `zone "${z.id}"`);
    checkText(problems, `zone "${z.id}" label`, z.label, LIMITS.zoneLabel);
    if (z.anchor !== undefined) {
      const known = z.anchor === "both" || pack.scenery.some((s) => s.id === z.anchor);
      if (!known) problems.push(`zone "${z.id}" is anchored to unknown scenery "${z.anchor}"`);
      if (!z.relation) problems.push(`zone "${z.id}" is anchored but has no relation`);
      if (z.offset !== undefined && !isVec(z.offset)) problems.push(`zone "${z.id}" has a malformed offset`);
    }
    if (z.pos !== undefined && !isVec(z.pos)) problems.push(`zone "${z.id}" has a malformed position`);
    if (z.size !== undefined && (!isSize(z.size) || z.pos === undefined)) {
      problems.push(`zone "${z.id}" has a size without a valid position`);
    }
  }
  for (const c of pack.cards) {
    claimId(c.id, `card "${c.id}"`);
    checkText(problems, `card "${c.id}" word`, c.word, LIMITS.word);
    checkText(problems, `card "${c.id}" translation`, c.translation, LIMITS.translation);
    checkText(problems, `card "${c.id}" emoji`, c.emoji, 16, false);
    if (c.audio === undefined && !/^[a-z0-9_-]+$/.test(c.word)) {
      problems.push(`card "${c.id}" has no audio field and no bundled file can match its word`);
    }
    if (c.audio) {
      for (const path of [c.audio.normal, c.audio.slow]) {
        const bundled = typeof path === "string" && BUNDLED_AUDIO_RE.test(path);
        const prefix = `/packs/${pack.id}/audio/`;
        const generated =
          typeof path === "string" && path.startsWith(prefix) && isValidGeneratedAudioFile(path.slice(prefix.length));
        if (!bundled && !generated) problems.push(`card "${c.id}" audio path "${String(path)}" is not allowed`);
      }
    }
  }
  for (const [key, b] of Object.entries(pack.backdrops)) {
    if (!ID_RE.test(key)) problems.push(`backdrop key "${key}" is not a safe id`);
    if (typeof b.src !== "string" || !BACKDROP_SRC_RE.test(b.src)) {
      problems.push(`backdrop "${key}" must be an image bundled with the extension`);
    }
    if (b.fit !== "cover" && b.fit !== "contain") problems.push(`backdrop "${key}" fit must be cover or contain`);
    if (b.dim !== undefined && (!isNum(b.dim) || b.dim < 0 || b.dim > 1)) problems.push(`backdrop "${key}" dim must be 0..1`);
  }

  if (pack.items.length === 0) problems.push("pack has no activities");
  if (pack.items.length > MAX_ITEMS) problems.push(`pack has more than ${MAX_ITEMS} activities`);

  const objectIds = new Set(pack.draggables.map((d) => d.id));
  const itemIds = new Set<string>();
  pack.items.forEach((item, i) => {
    const where = `activity ${i + 1}`;
    if (typeof item.id !== "string" || !ID_RE.test(item.id)) problems.push(`${where} id "${item.id}" is not a safe id`);
    else if (itemIds.has(item.id)) problems.push(`${where} id "${item.id}" is used twice`);
    else itemIds.add(item.id);

    if (!["place", "sort", "gap", "match", "infogap"].includes(item.kind)) {
      problems.push(`${where} has unknown kind "${String(item.kind)}"`);
      return;
    }
    checkText(problems, `${where} prompt`, item.prompt, LIMITS.prompt);
    checkText(problems, `${where} feedback`, item.feedback, LIMITS.feedback, false);
    checkText(problems, `${where} source`, item.source, LIMITS.source, false);
    if (item.backdrop !== undefined && !(item.backdrop in pack.backdrops)) {
      problems.push(`${where} uses unknown backdrop "${item.backdrop}"`);
    }

    if (!Array.isArray(item.pairs) || item.pairs.length === 0) {
      problems.push(`${where} has no answers (zero pairs)`);
      return;
    }
    let pairsOk = true;
    const seenPairs = new Set<string>();
    for (const p of item.pairs) {
      if (!objectIds.has(p.objectId)) {
        problems.push(`${where} refers to unknown object "${p.objectId}"`);
        pairsOk = false;
      }
      if (!zoneById.has(p.zoneId)) {
        problems.push(`${where} refers to unknown zone "${p.zoneId}"`);
        pairsOk = false;
      }
      const key = `${p.objectId}->${p.zoneId}`;
      if (seenPairs.has(key)) problems.push(`${where} lists the pair ${key} twice`);
      seenPairs.add(key);
    }
    if (!pairsOk) return;

    const distractors = item.distractors ?? [];
    if (!Array.isArray(distractors)) problems.push(`${where} distractors must be a list`);
    for (const d of distractors) {
      if (!objectIds.has(d)) problems.push(`${where} has unknown distractor "${d}"`);
      if (item.pairs.some((p) => p.objectId === d)) problems.push(`${where} lists "${d}" as both an answer and a distractor`);
    }
    if (new Set(distractors).size !== distractors.length) problems.push(`${where} lists a distractor twice`);
    if (item.kind === "place" || item.kind === "sort" || item.kind === "infogap") {
      if (distractors.length) problems.push(`${where} is a ${item.kind} activity and can't have distractors`);
    }
    if (item.kind === "gap" && distractors.length < 2) {
      problems.push(`${where} is a gap activity and needs at least two distractors (wrong-answer chips), or the last gap is solved by elimination`);
    }
    // A distractor that reads the same as a right answer would be marked wrong for a correct choice.
    const labelOf = new Map(pack.draggables.map((d) => [d.id, d.label.trim().toLowerCase()]));
    const answerLabels = new Set(item.pairs.map((p) => labelOf.get(p.objectId)));
    for (const d of distractors) {
      if (answerLabels.has(labelOf.get(d))) problems.push(`${where} distractor "${d}" reads the same as a correct answer`);
    }

    // The 8-object cap is per item for every kind but infogap. An infogap
    // item holds two sets no one ever sees together, so the cap applies per
    // role view: the student's set here (pairs), the teacher's below
    // (reference).
    const itemObjects = new Set([...item.pairs.map((p) => p.objectId), ...distractors]);
    const itemZones = new Set(item.pairs.map((p) => p.zoneId));
    if (item.kind === "infogap") problems.push(...infogapProblems(pack, item, where, objectIds));
    else if (item.reference !== undefined) problems.push(`${where} has a reference set, which only an infogap activity has`);
    if (itemObjects.size > MAX_OBJECTS_PER_ITEM) problems.push(`${where} has ${itemObjects.size} objects (at most ${MAX_OBJECTS_PER_ITEM})`);
    if (itemZones.size > MAX_ZONES_PER_ITEM) problems.push(`${where} has ${itemZones.size} zones (at most ${MAX_ZONES_PER_ITEM})`);

    if (item.kind === "place") {
      if (item.pairs.length !== 1) problems.push(`${where} is a place activity and must have exactly one answer`);
      const zone = zoneById.get(item.pairs[0].zoneId);
      if (zone && zone.anchor === undefined) problems.push(`${where} is a place activity but its zone has no anchor`);
      if (pack.draggables.length > MAX_OBJECTS_PER_ITEM) {
        problems.push(`a place activity shows every object, and this pack has more than ${MAX_OBJECTS_PER_ITEM}`);
      }
    } else {
      for (const zoneId of itemZones) {
        if (zoneById.get(zoneId)?.anchor !== undefined) {
          problems.push(`${where} is a ${item.kind} activity but zone "${zoneId}" is anchored to scenery (place only)`);
        }
      }
    }
    if (item.kind === "sort" && itemZones.size < 2) problems.push(`${where} is a sort with fewer than two bins`);
    if (item.kind === "match" || item.kind === "infogap") {
      const objs = item.pairs.map((p) => p.objectId);
      const zones = item.pairs.map((p) => p.zoneId);
      if (new Set(objs).size !== objs.length || new Set(zones).size !== zones.length) {
        problems.push(`${where} is a ${item.kind}, so every object and every zone must appear exactly once`);
      }
    }
    if (item.kind === "gap" && item.prompt && itemZones.size > 0) {
      // The displayed text has to show where each gap is: a gap zone
      // labelled "3" appears in the text as the marker "[3]".
      for (const zoneId of itemZones) {
        const label = zoneById.get(zoneId)?.label ?? "";
        if (!item.prompt.includes(gapMarker(label))) {
          problems.push(`${where} text does not show gap ${gapMarker(label)}`);
        }
      }
    }
  });

  if (problems.length > 0) return problems; // geometry needs a structurally sound pack

  // Geometry: resolve every item exactly as the relay will, and check it.
  pack.items.forEach((item, i) => {
    const where = `activity ${i + 1}`;
    let objects: StageObject[];
    try {
      objects = resolveItem(pack, i).objects;
    } catch (err) {
      problems.push(`${where} cannot be laid out: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    for (const o of objects) {
      if (!isVec(o.pos) || !isSize(o.size) || !insideStage(o)) problems.push(`${where}: "${o.id}" is outside the stage`);
    }
    const zones = objects.filter((o) => o.kind === "zone");
    for (let a = 0; a < zones.length; a++) {
      for (let b = a + 1; b < zones.length; b++) {
        if (overlaps(zones[a], zones[b])) problems.push(`${where}: zones "${zones[a].id}" and "${zones[b].id}" overlap`);
      }
    }
    if (item.kind === "place") return;

    const geo = itemGeometry(pack, item);
    const count = itemObjectIds(item).length;
    if (trayRowsNeeded(count, geo.chip) > TRAY_MAX_ROWS) problems.push(`${where}: the objects do not fit on the stage`);
    for (const zone of zones) {
      if (geo.chip.w > zone.size.w + POS_TOLERANCE || geo.chip.h > zone.size.h + POS_TOLERANCE) {
        problems.push(`${where}: an object is too big for zone "${zone.id}"`);
      }
      if (item.kind === "sort") {
        const { cols, rows } = binCapacity(zone.size, geo.chip);
        const needed = new Set(item.pairs.filter((p) => p.zoneId === zone.id).map((p) => p.objectId)).size;
        if (needed > cols * rows) problems.push(`${where}: bin "${zone.id}" holds ${cols * rows} objects but ${needed} belong in it`);
      }
    }
  });

  return problems;
}

/** Normalise then validate; throws PackValidationError if the pack must not be loaded. */
export function loadValidPack(raw: unknown): LessonPack {
  const pack = normalizePack(raw);
  const problems = validatePack(pack);
  if (problems.length > 0) throw new PackValidationError(problems);
  return pack;
}
