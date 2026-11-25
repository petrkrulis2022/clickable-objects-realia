import type {
  ItemKind,
  LessonPack,
  PackBackdrop,
  PackCard,
  PackDraggable,
  PackItem,
  PackPair,
  PackSceneryItem,
  PackZone,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Brings any pack — the original on-disk format or the generalised
 * one — into the single in-memory shape everything else uses.
 *
 * Original format: items are { prompt, object, zone, backdrop? } and
 * zones are { id, anchor, relation, offset } with no label. Those
 * become `place` items with one pair, ids `item-1`..`item-n`, and
 * zones labelled with their own id — exactly the label the original
 * runner gave them, so the shipped lesson resolves byte-identically.
 *
 * Best effort and non-throwing for anything object-shaped: it never
 * judges, it only reshapes. validatePack() is what decides whether
 * the result can be loaded, and it is defensive about every field,
 * because a pack can come from a model.
 */
export function normalizePack(raw: unknown): LessonPack {
  if (!isRecord(raw)) throw new Error("A pack must be a JSON object");

  const scenery = arr(raw.scenery).filter(isRecord).map(
    (s): PackSceneryItem => ({
      id: str(s.id),
      label: str(s.label),
      ...(optStr(s.emoji) !== undefined ? { emoji: optStr(s.emoji) } : {}),
      pos: s.pos as PackSceneryItem["pos"],
      size: s.size as PackSceneryItem["size"],
    }),
  );

  const draggables = arr(raw.draggables).filter(isRecord).map(
    (d): PackDraggable => ({
      id: str(d.id),
      label: str(d.label),
      ...(optStr(d.emoji) ? { emoji: optStr(d.emoji) } : {}),
    }),
  );

  const zones = arr(raw.zones).filter(isRecord).map((z): PackZone => {
    const zone: PackZone = { id: str(z.id), label: optStr(z.label) ?? str(z.id) };
    if (z.anchor !== undefined) zone.anchor = str(z.anchor);
    if (z.relation !== undefined) zone.relation = str(z.relation);
    if (z.offset !== undefined) zone.offset = z.offset as PackZone["offset"];
    if (z.pos !== undefined) zone.pos = z.pos as PackZone["pos"];
    if (z.size !== undefined) zone.size = z.size as PackZone["size"];
    return zone;
  });

  const backdrops: Record<string, PackBackdrop> = {};
  if (isRecord(raw.backdrops)) {
    for (const [key, b] of Object.entries(raw.backdrops)) {
      if (isRecord(b)) backdrops[key] = b as unknown as PackBackdrop;
    }
  }

  const cards = arr(raw.cards).filter(isRecord).map((c): PackCard => {
    const card: PackCard = { id: str(c.id), word: str(c.word), translation: str(c.translation) };
    if (optStr(c.emoji)) card.emoji = optStr(c.emoji);
    if (c.audio === null) card.audio = null;
    else if (isRecord(c.audio)) card.audio = { normal: str(c.audio.normal), slow: str(c.audio.slow) };
    return card;
  });

  const items = arr(raw.items).filter(isRecord).map((it, i): PackItem => {
    const isOriginalFormat = it.pairs === undefined && (it.object !== undefined || it.zone !== undefined);
    const pairs: PackPair[] = isOriginalFormat
      ? [{ objectId: str(it.object), zoneId: str(it.zone) }]
      : arr(it.pairs)
          .filter(isRecord)
          .map((p) => ({ objectId: str(p.objectId), zoneId: str(p.zoneId) }));
    // An unknown kind is kept as-is (not coerced) so validatePack can name it.
    const kind = isOriginalFormat ? "place" : (str(it.kind) as ItemKind);
    const item: PackItem = {
      id: optStr(it.id) ?? `item-${i + 1}`,
      kind,
      prompt: str(it.prompt),
      pairs,
    };
    if (Array.isArray(it.distractors)) item.distractors = it.distractors.map(str);
    if (optStr(it.feedback)) item.feedback = optStr(it.feedback);
    if (optStr(it.backdrop)) item.backdrop = optStr(it.backdrop);
    if (optStr(it.source)) item.source = optStr(it.source);
    return item;
  });

  return {
    id: str(raw.id),
    title: str(raw.title),
    translationLang: str(raw.translationLang),
    scenery,
    draggables,
    zones,
    backdrops,
    sentenceTemplate: str(raw.sentenceTemplate),
    cards,
    items,
  };
}
