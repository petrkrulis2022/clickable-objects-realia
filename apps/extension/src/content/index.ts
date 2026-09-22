import type { StageObject, Zone } from "@co/shared";
import { attachDragController } from "./drag";
import { mountOverlay } from "./overlay";

console.log("[clickable-objects] content script loaded on", location.href);

// Hardcoded local test scene for "2. Overlay and stage" and
// "3. Dragging and drop zones, local only". The real pack loader
// (docs/PRD.md, a2-prepositions-place) arrives in
// "7. Teacher panel and activity runner".
const SCENERY: StageObject[] = [
  {
    id: "table",
    kind: "label",
    label: "table",
    emoji: "🪑",
    pos: { x: 0.18, y: 0.55 },
    size: { w: 0.22, h: 0.22 },
    z: 1,
    draggableBy: "both",
    visibleTo: "both",
  },
  {
    id: "box",
    kind: "label",
    label: "box",
    emoji: "📦",
    pos: { x: 0.5, y: 0.58 },
    size: { w: 0.16, h: 0.18 },
    z: 1,
    draggableBy: "both",
    visibleTo: "both",
  },
  {
    id: "chair",
    kind: "label",
    label: "chair",
    emoji: "🪑",
    pos: { x: 0.76, y: 0.55 },
    size: { w: 0.16, h: 0.22 },
    z: 1,
    draggableBy: "both",
    visibleTo: "both",
  },
];

const ZONES: Zone[] = [
  {
    id: "on_table",
    kind: "zone",
    label: "on_table",
    pos: { x: 0.16, y: 0.46 },
    size: { w: 0.26, h: 0.1 },
    z: 0,
    draggableBy: "both",
    visibleTo: "both",
    accepts: ["keys"],
    relation: "on",
  },
  {
    id: "in_box",
    kind: "zone",
    label: "in_box",
    pos: { x: 0.46, y: 0.5 },
    size: { w: 0.2, h: 0.12 },
    z: 0,
    draggableBy: "both",
    visibleTo: "both",
    accepts: ["cup"],
    relation: "in",
  },
];

const DRAGGABLES: StageObject[] = [
  {
    id: "keys",
    kind: "draggable",
    label: "keys",
    emoji: "🔑",
    pos: { x: 0.06, y: 0.84 },
    size: { w: 0.09, h: 0.11 },
    z: 2,
    draggableBy: "both",
    visibleTo: "both",
  },
  {
    id: "cup",
    kind: "draggable",
    label: "cup",
    emoji: "☕",
    pos: { x: 0.2, y: 0.84 },
    size: { w: 0.09, h: 0.11 },
    z: 2,
    draggableBy: "both",
    visibleTo: "both",
  },
];

// Sentence-building needs the label of what each zone is anchored to.
// Once packs load for real (prompt 7), this comes from PackZone.anchor
// resolved against the pack's scenery list.
const ZONE_ANCHOR_LABEL: Record<string, string> = {
  on_table: "table",
  in_box: "box",
};

const objects: StageObject[] = [...SCENERY, ...ZONES, ...DRAGGABLES];

const overlay = mountOverlay();
overlay.setBackdrop(null);
overlay.setObjects(objects);

attachDragController({
  overlay,
  objects,
  sentenceTemplate: "The {object} is {relation} the {anchor}.",
  zoneAnchorLabel: ZONE_ANCHOR_LABEL,
});
