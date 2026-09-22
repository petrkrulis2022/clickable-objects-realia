import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Backdrop, Card, LessonPack, PackSceneryItem, StageObject, Vec, Zone } from "@co/shared";

// Single source of truth for pack content: bundled with the extension
// (apps/extension/public/packs), so the teacher's client and the relay
// resolve the exact same file rather than drifting copies. The relay
// just reads it off disk — no HTTP/asset serving needed here, since
// pack ASSETS (audio, backdrop images) are extension-bundled and
// referenced by pack-relative path strings the client resolves itself.
const PACK_DIR = join(process.cwd(), "..", "extension", "public", "packs");

const packCache = new Map<string, LessonPack>();

export function loadPack(packId: string): LessonPack {
  const cached = packCache.get(packId);
  if (cached) return cached;
  const pack = JSON.parse(readFileSync(join(PACK_DIR, `${packId}.json`), "utf8")) as LessonPack;
  packCache.set(packId, pack);
  return pack;
}

// The pack schema doesn't specify draggable/card tray positions (only
// scenery has pos/size) or a zone's own size — those are the "starting
// layout" the runner is responsible for. Fixed, evenly spaced rows
// keep it predictable lesson to lesson.
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

export interface ResolvedItem {
  objects: StageObject[];
  /** undefined = keep whatever backdrop is already showing (docs/PRD.md, "Backdrops"). */
  backdrop: Backdrop | null | undefined;
  prompt: string;
}

/**
 * The activity runner (docs/PRD.md, "The activity runner" + "7.
 * Teacher panel and activity runner"): resolves one pack item into a
 * full, fresh object set. Scenery is always present; draggables and
 * cards are always present in a fixed tray, reset to their start
 * position; only the current item's single target zone is live.
 */
export function resolveItem(pack: LessonPack, itemIndex: number): ResolvedItem {
  const item = pack.items[itemIndex];
  if (!item) throw new Error(`item ${itemIndex} out of range for pack "${pack.id}"`);

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

  pack.cards.forEach((c, i) => {
    const card: Card = {
      id: c.id,
      kind: "card",
      label: c.word,
      word: c.word,
      translation: c.translation,
      emoji: c.emoji,
      // Matches the file names produced by scripts/generate-audio.ts
      // (and its local-testing stand-in), one pair per word.
      audio: { normal: `audio/${c.word}-normal.mp3`, slow: `audio/${c.word}-slow.mp3` },
      pos: { x: evenlySpacedX(i, pack.cards.length, CARD_SIZE.w), y: CARD_Y },
      size: CARD_SIZE,
      z: 3,
      draggableBy: "both",
      visibleTo: "both",
    };
    objects.push(card);
  });

  const zoneDef = pack.zones.find((z) => z.id === item.zone);
  if (zoneDef) {
    const center = anchorCenter(zoneDef.anchor, bySceneryId);
    const zone: Zone = {
      id: zoneDef.id,
      kind: "zone",
      label: zoneDef.id,
      pos: {
        x: center.x + zoneDef.offset.x - ZONE_SIZE.w / 2,
        y: center.y + zoneDef.offset.y - ZONE_SIZE.h / 2,
      },
      size: ZONE_SIZE,
      z: 0,
      draggableBy: "both",
      visibleTo: "both",
      accepts: [item.object],
      relation: zoneDef.relation,
    };
    objects.push(zone);
  }

  return {
    objects,
    backdrop: item.backdrop ? (pack.backdrops[item.backdrop] ?? null) : undefined,
    prompt: item.prompt,
  };
}
