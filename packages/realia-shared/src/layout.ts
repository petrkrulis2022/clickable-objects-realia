import type {
  Backdrop,
  Card,
  CardAudio,
  LessonPack,
  PackCard,
  PackItem,
  PackSceneryItem,
  ResolvedItem,
  Size,
  StageObject,
  TeacherLesson,
  Vec,
  Zone,
} from "./types.js";

// The activity runner (docs/PRD.md, "The activity runner"): resolves
// one pack item into a full, fresh object set, in 0..1 stage
// coordinates. Lives here, not in the relay, because three places
// must agree on it exactly: the relay (what is played), the
// generator's validator (what is allowed), and the approval screen's
// preview (what the teacher sees before the lesson).

// --- The original `place` layout. Unchanged: the shipped lesson must
// resolve byte-identically (see the golden fixture test). ---

const TRAY_Y = 0.84;
const TRAY_SIZE = { w: 0.09, h: 0.11 };
const CARD_Y = 0.03;
const CARD_SIZE = { w: 0.13, h: 0.13 };
const ZONE_SIZE = { w: 0.18, h: 0.1 };

function evenlySpacedX(index: number, count: number, itemWidth: number): number {
  const margin = 0.04;
  if (count <= 1) return margin;
  const usable = 1 - margin * 2 - itemWidth;
  return margin + (usable * index) / (count - 1);
}

function centerOf(s: { pos: Vec; size: { w: number; h: number } }): Vec {
  return { x: s.pos.x + s.size.w / 2, y: s.pos.y + s.size.h / 2 };
}

// "both" (docs/PRD.md's between_chair_table zone) is the one anchor
// value that doesn't name a single scenery id. A real multi-anchor
// system is out of v0 scope, so this is special-cased for the one
// pack that uses it: the midpoint of the table and the chair.
function anchorCenter(anchor: string, bySceneryId: Map<string, PackSceneryItem>): Vec {
  if (anchor === "both") {
    const table = bySceneryId.get("table");
    const chair = bySceneryId.get("chair");
    if (!table || !chair) throw new Error('anchor "both" needs a table and a chair in scenery');
    const a = centerOf(table);
    const b = centerOf(chair);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const s = bySceneryId.get(anchor);
  if (!s) throw new Error(`unknown zone anchor "${anchor}"`);
  return centerOf(s);
}

/** The bundled-file convention of the original pack: one pair per word, shipped with the extension. */
function cardAudio(c: PackCard): CardAudio | null {
  if (c.audio === undefined) return { normal: `audio/${c.word}-normal.mp3`, slow: `audio/${c.word}-slow.mp3` };
  return c.audio;
}

function resolveCards(pack: LessonPack): Card[] {
  return pack.cards.map((c, i) => ({
    id: c.id,
    kind: "card",
    label: c.word,
    word: c.word,
    translation: c.translation,
    emoji: c.emoji,
    audio: cardAudio(c),
    pos: { x: evenlySpacedX(i, pack.cards.length, CARD_SIZE.w), y: CARD_Y },
    size: CARD_SIZE,
    z: 3,
    draggableBy: "both",
    visibleTo: "both",
  }));
}

function resolvePlaceItem(pack: LessonPack, item: PackItem): StageObject[] {
  const bySceneryId = new Map(pack.scenery.map((s) => [s.id, s]));
  const objects: StageObject[] = [];

  for (const s of pack.scenery) {
    objects.push({
      id: s.id,
      kind: "label",
      label: s.label,
      emoji: s.emoji,
      pos: s.pos,
      size: s.size,
      z: 1,
      draggableBy: "both",
      visibleTo: "both",
    });
  }

  pack.draggables.forEach((d, i) => {
    objects.push({
      id: d.id,
      kind: "draggable",
      label: d.label,
      emoji: d.emoji,
      pos: { x: evenlySpacedX(i, pack.draggables.length, TRAY_SIZE.w), y: TRAY_Y },
      size: TRAY_SIZE,
      z: 2,
      draggableBy: "both",
      visibleTo: "both",
    });
  });

  objects.push(...resolveCards(pack));

  const pair = item.pairs[0];
  const zoneDef = pair ? pack.zones.find((z) => z.id === pair.zoneId) : undefined;
  if (zoneDef) {
    const center = anchorCenter(zoneDef.anchor ?? "", bySceneryId);
    const offset = zoneDef.offset ?? { x: 0, y: 0 };
    const zone: Zone = {
      id: zoneDef.id,
      kind: "zone",
      label: zoneDef.label,
      pos: {
        x: center.x + offset.x - ZONE_SIZE.w / 2,
        y: center.y + offset.y - ZONE_SIZE.h / 2,
      },
      size: ZONE_SIZE,
      z: 0,
      draggableBy: "both",
      visibleTo: "both",
      accepts: [pair.objectId],
      relation: zoneDef.relation ?? "",
    };
    objects.push(zone);
  }
  return objects;
}

// --- The generalised kinds: sort, gap, match. ---
// Positions are computed, never asked of the model: a generator that
// guesses coordinates produces overlapping zones, and the teacher
// would discover it mid-lesson. A zone with an explicit `pos` keeps it.

export const STAGE_MARGIN = 0.04;
const ROW_GAP = 0.02;
export const CHIP_H = 0.08;
const CHIP_GAP = 0.015;
const ZONES_BOTTOM = 0.68;
const TRAY_TOP = 0.72;
export const TRAY_MAX_ROWS = 3;
/** Room at the top of a bin for its label. */
export const BIN_HEADER_H = 0.07;
export const SLOT_PAD = 0.01;
const GAP_TEXT_H = 0.2;
const GAP_SLOT_H = 0.11;
const MATCH_MAX_COLS = 3;
const MATCH_MAX_H = 0.24;
const EPS = 1e-9;

const CONTENT_W = 1 - 2 * STAGE_MARGIN;

interface Rect {
  pos: Vec;
  size: Size;
}

/** Top of the area below the reveal-card row (cards stay on every item, as in the original runner). */
function contentTop(pack: LessonPack): number {
  return pack.cards.length > 0 ? CARD_Y + CARD_SIZE.h + 0.03 : STAGE_MARGIN;
}

/** Distinct values in first-seen order. */
function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

function rowOfRects(count: number, top: number, height: number, maxW: number): Rect[] {
  const w = Math.min(maxW, (CONTENT_W - (count - 1) * ROW_GAP) / count);
  const used = count * w + (count - 1) * ROW_GAP;
  const left = STAGE_MARGIN + (CONTENT_W - used) / 2;
  return Array.from({ length: count }, (_, i) => ({
    pos: { x: left + i * (w + ROW_GAP), y: top },
    size: { w, h: height },
  }));
}

/**
 * How wide a chip needs to be for its text: two lines of a short word,
 * a phrase, or a sentence (a true/false statement, an answer to match).
 * Width, not height, is what long text needs on a 16:9 stage.
 */
export function chipWidthForLabel(maxLabelLength: number): number {
  if (maxLabelLength <= 14) return 0.14;
  if (maxLabelLength <= 28) return 0.2;
  return 0.3;
}

/** Where zones go for this item, and how big its chips are. */
export interface ItemGeometry {
  zoneRects: Map<string, Rect>;
  chip: Size;
  text: Rect | null;
}

export function itemGeometry(pack: LessonPack, item: PackItem): ItemGeometry {
  const zoneIds = distinct(item.pairs.map((p) => p.zoneId));
  const top = contentTop(pack);
  const n = Math.max(1, zoneIds.length);
  const labelLengths = [...itemObjectIds(item), ...(item.reference ?? []).map((r) => r.objectId)].map(
    (id) => (pack.draggables.find((d) => d.id === id)?.label ?? id).length,
  );
  const wanted = chipWidthForLabel(Math.max(0, ...labelLengths));
  let rects: Rect[] = [];
  let chipW = wanted;
  let text: Rect | null = null;

  if (item.kind === "sort") {
    rects = rowOfRects(n, top, ZONES_BOTTOM - top, 1);
    chipW = Math.min(wanted, rects[0].size.w - 2 * SLOT_PAD);
  } else if (item.kind === "gap") {
    text = { pos: { x: STAGE_MARGIN, y: top }, size: { w: CONTENT_W, h: GAP_TEXT_H } };
    rects = rowOfRects(n, top + GAP_TEXT_H + ROW_GAP, GAP_SLOT_H, wanted + 2 * SLOT_PAD);
    chipW = Math.min(wanted, rects[0].size.w - 2 * SLOT_PAD);
  } else if (item.kind === "match" || item.kind === "infogap") {
    const cols = Math.min(n, MATCH_MAX_COLS);
    const rows = Math.ceil(n / cols);
    const w = (CONTENT_W - (cols - 1) * ROW_GAP) / cols;
    const h = Math.min(MATCH_MAX_H, (ZONES_BOTTOM - top - (rows - 1) * ROW_GAP) / rows);
    rects = Array.from({ length: n }, (_, i) => ({
      pos: { x: STAGE_MARGIN + (i % cols) * (w + ROW_GAP), y: top + Math.floor(i / cols) * (h + ROW_GAP) },
      size: { w, h },
    }));
    chipW = Math.min(wanted, w - 2 * SLOT_PAD);
  }

  const zoneRects = new Map<string, Rect>();
  zoneIds.forEach((id, i) => {
    const def = pack.zones.find((z) => z.id === id);
    const explicit = def?.pos ? { pos: def.pos, size: def.size ?? rects[i]?.size ?? { w: 0.2, h: 0.1 } } : null;
    zoneRects.set(id, explicit ?? rects[i]);
  });
  return { zoneRects, chip: { w: chipW, h: CHIP_H }, text };
}

/** How many chips of this size a bin can hold without overlapping. */
export function binCapacity(zoneSize: Size, chip: Size): { cols: number; rows: number } {
  const cols = Math.max(1, Math.floor((zoneSize.w - SLOT_PAD + EPS) / (chip.w + SLOT_PAD)));
  const rows = Math.max(0, Math.floor((zoneSize.h - BIN_HEADER_H - SLOT_PAD + EPS) / (chip.h + SLOT_PAD)));
  return { cols, rows };
}

/**
 * Where an object lands when it is dropped correctly. Bins stack
 * objects into a grid (slot by slot — the relay tracks which are
 * taken); slots hold one object at their foot; an original place zone
 * snaps to its centre, exactly as before.
 */
export function snapPosition(zone: Zone, obj: Pick<StageObject, "size">, slotIndex: number): Vec {
  if (zone.variant === "bin") {
    const { cols, rows } = binCapacity(zone.size, obj.size);
    const capacity = Math.max(1, cols * Math.max(1, rows));
    const i = Math.min(slotIndex, capacity - 1);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const usedW = cols * obj.size.w + (cols - 1) * SLOT_PAD;
    return {
      x: zone.pos.x + (zone.size.w - usedW) / 2 + col * (obj.size.w + SLOT_PAD),
      y: zone.pos.y + BIN_HEADER_H + row * (obj.size.h + SLOT_PAD),
    };
  }
  if (zone.variant === "slot") {
    return {
      x: zone.pos.x + (zone.size.w - obj.size.w) / 2,
      y: zone.pos.y + zone.size.h - obj.size.h - SLOT_PAD,
    };
  }
  return {
    x: zone.pos.x + zone.size.w / 2 - obj.size.w / 2,
    y: zone.pos.y + zone.size.h / 2 - obj.size.h / 2,
  };
}

/** How many objects a zone can hold at once. Original place zones are unlimited, as they always were. */
export function zoneCapacity(zone: Zone, chip: Size): number {
  if (zone.variant === "bin") {
    const { cols, rows } = binCapacity(zone.size, chip);
    return cols * rows;
  }
  if (zone.variant === "slot") return 1;
  return Number.POSITIVE_INFINITY;
}

/** Chips in rows at the foot of the stage, each row centred. */
export function trayPositions(count: number, chip: Size): Vec[] {
  const perRow = Math.max(1, Math.floor((CONTENT_W + CHIP_GAP + EPS) / (chip.w + CHIP_GAP)));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const used = inRow * chip.w + (inRow - 1) * CHIP_GAP;
    const left = STAGE_MARGIN + (CONTENT_W - used) / 2;
    return { x: left + (i % perRow) * (chip.w + CHIP_GAP), y: TRAY_TOP + row * (chip.h + CHIP_GAP) };
  });
}

export function trayRowsNeeded(count: number, chip: Size): number {
  const perRow = Math.max(1, Math.floor((CONTENT_W + CHIP_GAP + EPS) / (chip.w + CHIP_GAP)));
  return Math.ceil(count / perRow);
}

/** Every chip an item shows: the objects its pairs use, then its distractors. */
export function itemObjectIds(item: PackItem): string[] {
  return distinct([...item.pairs.map((p) => p.objectId), ...(item.distractors ?? [])]);
}

/** Id of the text block a gap item displays. The colon keeps it out of the pack-id namespace. */
export function gapTextId(item: PackItem): string {
  return `text:${item.id}`;
}

/** A deterministic shuffle (same order on teacher, student and relay, every time), seeded by the item id. */
function shuffleStable(ids: string[], seed: string): string[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function resolveGeneralItem(pack: LessonPack, item: PackItem): StageObject[] {
  const geo = itemGeometry(pack, item);
  const objects: StageObject[] = [];
  const variant = item.kind === "sort" ? "bin" : "slot";

  for (const [zoneId, rect] of geo.zoneRects) {
    const def = pack.zones.find((z) => z.id === zoneId);
    const zone: Zone = {
      id: zoneId,
      kind: "zone",
      label: def?.label ?? zoneId,
      pos: rect.pos,
      size: rect.size,
      z: 0,
      draggableBy: "both",
      visibleTo: "both",
      accepts: distinct(item.pairs.filter((p) => p.zoneId === zoneId).map((p) => p.objectId)),
      relation: def?.relation ?? "",
      variant,
    };
    objects.push(zone);
  }

  if (geo.text) {
    objects.push({
      id: gapTextId(item),
      kind: "text",
      label: item.prompt,
      pos: geo.text.pos,
      size: geo.text.size,
      z: 1,
      draggableBy: [],
      visibleTo: "both",
      variant: "text",
    });
  }

  // Distractors are mixed in among the right answers, never parked at the end where they'd give themselves away.
  // In an infogap the loose objects are the student's alone: the teacher
  // must not see them (or where they go) until the reveal.
  const studentOnly = item.kind === "infogap";
  const objectIds = shuffleStable(itemObjectIds(item), item.id);
  const tray = trayPositions(objectIds.length, geo.chip);
  objectIds.forEach((id, i) => {
    const def = pack.draggables.find((d) => d.id === id);
    objects.push({
      id,
      kind: "draggable",
      label: def?.label ?? id,
      ...(def?.emoji ? { emoji: def.emoji } : {}),
      pos: tray[i],
      size: geo.chip,
      z: 2,
      draggableBy: studentOnly ? ["student"] : "both",
      visibleTo: studentOnly ? ["student"] : "both",
      variant: "chip",
    });
  });

  // The teacher's reference arrangement: already in its zones, fixed, and
  // never sent to the student (the relay filters by visibleTo).
  for (const r of item.reference ?? []) {
    const zone = objects.find((o): o is Zone => o.kind === "zone" && o.id === r.zoneId);
    if (!zone) continue;
    const def = pack.draggables.find((d) => d.id === r.objectId);
    objects.push({
      id: r.objectId,
      kind: "draggable",
      label: def?.label ?? r.objectId,
      ...(def?.emoji ? { emoji: def.emoji } : {}),
      pos: snapPosition(zone, { size: geo.chip }, 0),
      size: geo.chip,
      z: 2,
      draggableBy: [],
      visibleTo: ["teacher"],
      variant: "chip",
    });
  }

  objects.push(...resolveCards(pack));
  return objects;
}

/**
 * Resolves one pack item into a full, fresh object set. Scenery and
 * the whole draggable tray appear only for `place` items (the
 * original lesson); the generalised kinds show just the objects their
 * pairs use. Reveal cards stay on every item, as they always have.
 */
export function resolveItem(pack: LessonPack, itemIndex: number): ResolvedItem {
  const item = pack.items[itemIndex];
  if (!item) throw new Error(`item ${itemIndex} out of range for pack "${pack.id}"`);

  const objects = item.kind === "place" ? resolvePlaceItem(pack, item) : resolveGeneralItem(pack, item);
  const backdrop: Backdrop | null | undefined = item.backdrop ? (pack.backdrops[item.backdrop] ?? null) : undefined;
  return { objects, backdrop, prompt: item.prompt };
}

// --- What the relay tells people, built from the pack it holds. ---

/**
 * zone id -> the label to slot into sentenceTemplate's {anchor}, from the
 * pack's own scenery labels. "both" (between_chair_table) is the table
 * and the chair — the same two anchorCenter positions the zone between.
 * (The original client took the first two scenery labels, which in the
 * shipped pack are the table and the box.)
 */
export function buildZoneAnchorLabel(pack: LessonPack): Record<string, string> {
  const bySceneryId = new Map(pack.scenery.map((s) => [s.id, s.label]));
  const out: Record<string, string> = {};
  for (const z of pack.zones) {
    if (z.anchor === undefined) continue;
    out[z.id] =
      z.anchor === "both"
        ? `${bySceneryId.get("table") ?? "table"} and ${bySceneryId.get("chair") ?? "chair"}`
        : (bySceneryId.get(z.anchor) ?? z.anchor);
  }
  return out;
}

/**
 * What appears under the stage after a correct drop: a place zone's
 * sentence from the template ("The keys are on the table."), exactly as
 * the client used to build it; otherwise the item's feedback line, if any.
 * Built on the relay, so no client needs the pack to show it.
 */
export function correctDropText(pack: LessonPack, item: PackItem, zone: Zone, placed: StageObject): string | undefined {
  if (item.kind !== "place") return item.feedback || undefined;
  if (!zone.relation || !pack.sentenceTemplate) return undefined;
  return pack.sentenceTemplate
    .replace("{object}", placed.label)
    .replace("{relation}", zone.relation)
    .replace("{anchor}", buildZoneAnchorLabel(pack)[zone.id] ?? zone.relation);
}

/** The teacher panel's view of a pack: prompts and the answer key. Sent to the teacher only. */
export function teacherLesson(pack: LessonPack): TeacherLesson {
  const objectLabel = new Map(pack.draggables.map((d) => [d.id, d.label]));
  const zoneLabel = new Map(pack.zones.map((z) => [z.id, z.label]));
  return {
    packId: pack.id,
    title: pack.title,
    items: pack.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      prompt: item.prompt,
      ...(item.source ? { source: item.source } : {}),
      // By label, once each: two chips of the same word (one per gap it fills) are one line of the key.
      key: [
        ...new Set(
          item.pairs.map((p) => {
            const zone = zoneLabel.get(p.zoneId) ?? p.zoneId;
            return `${objectLabel.get(p.objectId) ?? p.objectId} → ${item.kind === "gap" ? `[${zone}]` : zone}`;
          }),
        ),
      ],
      wrong: (item.distractors ?? []).map((d) => objectLabel.get(d) ?? d),
    })),
  };
}
