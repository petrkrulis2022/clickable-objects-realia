import type { StageObject } from "@co/shared";
import { mountOverlay } from "./overlay";

console.log("[clickable-objects] content script loaded on", location.href);

// Hardcoded test objects for "2. Overlay and stage" — the real pack
// loader arrives in "7. Teacher panel and activity runner". Positions
// mirror the demo pack's scenery layout (docs/PRD.md).
const TEST_OBJECTS: StageObject[] = [
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

const overlay = mountOverlay();
overlay.setBackdrop(null);
overlay.setObjects(TEST_OBJECTS);
