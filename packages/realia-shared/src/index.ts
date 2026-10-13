// Shared protocol types for Realia.
// TypeScript types only — no runtime code. Both apps/realia and
// apps/realia-relay import from here so the protocol cannot drift
// between them. See docs/PRD.md, section "Object model and sync
// protocol" (written when this app was still called Clickable
// Objects and lived at apps/extension / apps/relay — see docs/REPO.md).

// All coordinates are 0..1 within the stage rectangle, never pixels.
export type Vec = { x: number; y: number };
export type Role = "teacher" | "student";

export interface StageObject {
  id: string;
  kind: "draggable" | "zone" | "card" | "label";
  label: string;
  emoji?: string;
  pos: Vec; // top-left corner
  size: { w: number; h: number };
  z: number;
  draggableBy: Role[] | "both";
  visibleTo: Role[] | "both";
  heldBy?: Role | null; // soft lock while someone is dragging
}

export interface Zone extends StageObject {
  kind: "zone";
  accepts: string[]; // ids that are correct here
  relation: string; // 'under', 'on', 'in' - used to build the sentence
}

export interface Card extends StageObject {
  kind: "card";
  word: string;
  translation: string;
  audio: { normal: string; slow: string }; // files shipped with the pack
  // reveal stage is per viewer and is NOT synced
}

// A backdrop is a picture, not an object: never dragged, never a drop target,
// drawn below everything. It is room state, not an entry in `objects`.
export interface Backdrop {
  src: string; // packaged with the pack, never a remote URL
  fit: "cover" | "contain";
  dim?: number; // 0..1, darkens it so objects stay readable
}

export interface RoomState {
  code: string;
  rev: number;
  objects: Record<string, StageObject>;
  backdrop: Backdrop | null;
  activity: { packId: string; itemIndex: number } | null;
}

// Messages are small and one-directional in intent: the client asks, the
// relay decides, both clients are told.
export type ClientMessage =
  | { type: "join"; code: string }
  | { type: "move"; id: string; pos: Vec }
  | { type: "drop"; id: string; zoneId: string | null }
  | { type: "reveal"; cardId: string; stage: 1 | 2 | 3 } // logged, not broadcast
  | { type: "setActivity"; packId: string; itemIndex: number } // teacher only
  | { type: "mark"; itemIndex: number; verdict: "correct" | "retry" }; // teacher only

export type ServerMessage =
  | { type: "state"; state: RoomState; yourRole: Role }
  | {
      type: "patch";
      rev: number;
      changed: StageObject[];
      removed: string[];
      backdrop?: Backdrop | null;
    }
  | { type: "verdict"; id: string; zoneId: string; correct: boolean }
  | { type: "peer"; role: Role; connected: boolean }
  // Not in the PRD's protocol table. Added in "6. Reveal cards" so the
  // teacher's dots can update live: a student's 'reveal' is logged
  // (see LessonEvent below) but, per the PRD, never enters synced
  // RoomState — this is a lightweight, teacher-only notification of it,
  // outside the rev/patch reconciliation system entirely.
  | { type: "revealProgress"; cardId: string; stage: 1 | 2 | 3; role: Role };

// The event log is appended on the relay, never on the client, so a
// refresh cannot lose a lesson.
export type LessonEvent =
  | { t: number; type: "session"; phase: "start" | "end" }
  | { t: number; type: "item"; index: number; prompt: string }
  | {
      t: number;
      type: "drop";
      objectId: string;
      zoneId: string;
      correct: boolean;
      msSinceItemStart: number;
    }
  | { t: number; type: "reveal"; cardId: string; stage: 1 | 2 | 3; role: Role }
  | { t: number; type: "mark"; index: number; verdict: "correct" | "retry" };

// --- Lesson pack schema (docs/PRD.md, "The demo content pack") ---

export interface PackSceneryItem {
  id: string;
  label: string;
  emoji?: string;
  pos: Vec;
  size: { w: number; h: number };
}

export interface PackDraggable {
  id: string;
  label: string;
  emoji?: string;
}

export interface PackZone {
  id: string;
  anchor: string; // scenery id, or 'both' for a zone anchored between two
  relation: string;
  offset: Vec;
}

export interface PackBackdrop {
  src: string;
  fit: "cover" | "contain";
  dim?: number;
}

export interface PackCard {
  id: string;
  word: string;
  translation: string;
  emoji?: string;
}

export interface PackItem {
  prompt: string;
  object: string; // draggable id
  zone: string; // zone id
  backdrop?: string; // key into pack.backdrops; omit to keep current
}

export interface LessonPack {
  id: string;
  title: string;
  translationLang: string;
  scenery: PackSceneryItem[];
  draggables: PackDraggable[];
  zones: PackZone[];
  backdrops: Record<string, PackBackdrop>;
  sentenceTemplate: string;
  cards: PackCard[];
  items: PackItem[];
}
