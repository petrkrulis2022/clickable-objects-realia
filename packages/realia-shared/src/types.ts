// Shared protocol and pack types for Realia. Both apps/realia and
// apps/realia-relay (and apps/meeting-assist, which generates packs)
// import from here so the protocol and the pack format cannot drift.
// See docs/PRD.md, "Object model and sync protocol", and the
// generalised pack format in docs/PRD.md, "12. The textbook-to-pack
// generator".

// All coordinates are 0..1 within the stage rectangle, never pixels.
export type Vec = { x: number; y: number };
export type Size = { w: number; h: number };
export type Role = "teacher" | "student";

/**
 * Rendering hint for objects produced by the generalised item kinds
 * (sort, gap, match). Absent means today's look — every object the
 * original `place` lesson produces leaves it unset, so that lesson
 * renders exactly as before.
 *  - chip: a compact text-first draggable (no 88px minimum)
 *  - bin:  a labelled, always-visible zone that holds several objects
 *  - slot: a labelled, always-visible zone that holds one object
 *  - text: a read-only block of text (a gap exercise's sentence)
 */
export type ObjectVariant = "chip" | "bin" | "slot" | "text";

export interface StageObject {
  id: string;
  kind: "draggable" | "zone" | "card" | "label" | "text";
  label: string;
  emoji?: string;
  pos: Vec; // top-left corner
  size: Size;
  z: number;
  draggableBy: Role[] | "both";
  visibleTo: Role[] | "both";
  heldBy?: Role | null; // soft lock while someone is dragging
  variant?: ObjectVariant;
}

export interface Zone extends StageObject {
  kind: "zone";
  accepts: string[]; // ids that are correct here — more than one for a sort bin
  relation: string; // 'under', 'on', 'in' for a place zone; '' otherwise
  /** Shown on a correct placement (the item's feedback). Place zones build a sentence from the template instead. */
  feedback?: string;
}

export interface CardAudio {
  normal: string;
  slow: string;
}

export interface Card extends StageObject {
  kind: "card";
  word: string;
  translation: string;
  /**
   * Pre-generated audio, never synthesised at runtime. "audio/x.mp3"
   * is bundled with the extension; "/packs/<packId>/audio/x.mp3" was
   * generated with ElevenLabs when the teacher approved the pack and
   * is served by the relay. null = no audio exists for this word: the
   * card is silent and visibly marked, never spoken by a fallback voice.
   */
  audio: CardAudio | null;
  // reveal stage is per viewer and is NOT synced
}

// A backdrop is a picture, not an object: never dragged, never a drop target,
// drawn below everything. It is room state, not an entry in `objects`.
// Only images bundled with the extension — never a remote URL, never an
// uploaded photo.
export interface Backdrop {
  src: string; // packaged with the extension, never a remote URL
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
  /** `packId` is the joiner's selected pack. Used only when this join creates the room (the teacher); a later joiner gets the room's pack. */
  | { type: "join"; code: string; packId?: string }
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
  | { type: "revealProgress"; cardId: string; stage: 1 | 2 | 3; role: Role }
  // An infogap item was completed: every placement matches the teacher's
  // reference, and both sides now see the same stage. Sent once, right
  // after the patch that reveals it; clients animate the reveal.
  | { type: "complete"; itemId: string };

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

// --- Lesson pack schema ---
// The original format (docs/PRD.md, "The demo content pack") is still
// accepted on disk: normalizePack() turns its { prompt, object, zone }
// items into `place` items and its anchored zones into PackZones, so
// a2-prepositions-place.json loads unchanged.

export interface PackSceneryItem {
  id: string;
  label: string;
  emoji?: string;
  pos: Vec;
  size: Size;
}

export interface PackDraggable {
  id: string;
  label: string;
  emoji?: string;
}

export interface PackZone {
  id: string;
  label: string; // free text: "forbidden", "gap 3", "primary school"
  anchor?: string; // scenery id (or 'both') — place zones only
  relation?: string; // for the sentence template — place zones only
  offset?: Vec; // from the anchor's centre — place zones only
  pos?: Vec; // explicit top-left when there is no anchor; otherwise laid out automatically
  size?: Size; // explicit size, only together with pos
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
  /** Omitted = the bundled "audio/<word>-normal.mp3" pair (the original pack). null = silent. See Card.audio. */
  audio?: CardAudio | null;
}

/**
 *  - place: one object, one anchored zone, sentence from the template (the original lesson)
 *  - sort:  many objects, a few bins; several pairs share a zoneId
 *  - gap:   objects into numbered gaps in a displayed text (also word order, timelines)
 *  - match: one-to-one pairing
 *  - infogap: an information gap. The teacher sees a reference
 *    arrangement (`reference`), the student sees loose objects (`pairs`),
 *    and neither sees the other's set until every placement matches.
 *    Not `gap`: that is fill-in-the-blank, a different mechanic.
 */
export type ItemKind = "place" | "sort" | "gap" | "match" | "infogap";

export interface PackPair {
  objectId: string;
  zoneId: string;
}

export interface PackItem {
  id: string;
  kind: ItemKind;
  prompt: string; // what the teacher says or, for a gap, the displayed text
  feedback?: string; // shown on a correct placement
  pairs: PackPair[]; // every correct (object, zone) combination
  /**
   * Wrong-answer chips: shown with the others, correct in no zone. A gap
   * item needs at least two — with exactly one chip per gap the last
   * answer goes in by elimination, with no English involved.
   */
  distractors?: string[];
  /**
   * infogap only: the teacher's arrangement — teacher-only objects shown
   * already in their zones. `pairs` holds the student's objects and where
   * they belong; each zone has one of each, with the same label.
   */
  reference?: PackPair[];
  backdrop?: string; // key into pack.backdrops; omit to keep current
  /** Teacher-facing: which coursebook exercise this came from, e.g. "Grammar 1a". */
  source?: string;
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

/** What one pack item resolves to on the stage. */
export interface ResolvedItem {
  objects: StageObject[];
  /** undefined = keep whatever backdrop is already showing (docs/PRD.md, "Backdrops"). */
  backdrop: Backdrop | null | undefined;
  prompt: string;
}
