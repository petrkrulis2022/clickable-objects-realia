import {
  correctDropText,
  resolveItem,
  teacherLesson,
  snapPosition,
  zoneCapacity,
  type LessonEvent,
  type LessonPack,
  type PackItem,
  type Role,
  type RoomState,
  type StageObject,
  type Vec,
  type Zone,
} from "@realia/shared";
import type { WebSocket } from "ws";

// One second of silence clears the soft lock even if the holder never
// sends an explicit drop (crash, closed laptop lid, etc).
const SILENCE_LOCK_MS = 1000;

interface Placement {
  zoneId: string;
  slot: number;
}

export interface Room {
  state: RoomState;
  connections: Partial<Record<Role, WebSocket>>;
  lockTimers: Map<string, NodeJS.Timeout>;
  /** Position an object had just before its current hold began, so a wrong drop can revert to it. */
  dragStartPos: Map<string, Vec>;
  /** Where an object sat (zone + slot) before its current hold began, restored on a wrong drop. */
  dragStartPlacement: Map<string, Placement | null>;
  /** Objects currently sitting correctly in a zone. A bin holds several; a slot holds one. */
  placements: Map<string, Placement>;
  /** When the current activity item began. */
  itemStartedAt: number;
  /** Guards leaveRoom against firing "session end" twice — see its comment. */
  ended: boolean;
  /** The pack being played. Only the relay holds it; clients get their role's view of it. */
  pack: LessonPack | null;
  /** The pack item on the stage now — the relay needs its kind and answers, not just its index. */
  currentItem: PackItem | null;
  /** An infogap's reveal has happened. It fires once per item. */
  completed: boolean;
}

const rooms = new Map<string, Room>();

function isOpen(ws: WebSocket | undefined): ws is WebSocket {
  return !!ws && ws.readyState === ws.OPEN;
}

function emptyState(code: string): RoomState {
  return { code, rev: 0, objects: {}, backdrop: null, activity: null };
}

/** Joins `code`, creating the room if needed. `wasCreated` tells the caller to seed it and log a session-start event. */
export function joinRoom(
  code: string,
  ws: WebSocket,
): { room: Room; role: Role; wasCreated: boolean } | null {
  let room = rooms.get(code);
  let wasCreated = false;
  if (!room) {
    const now = Date.now();
    room = {
      state: emptyState(code),
      connections: {},
      lockTimers: new Map(),
      dragStartPos: new Map(),
      dragStartPlacement: new Map(),
      placements: new Map(),
      itemStartedAt: now,
      ended: false,
      pack: null,
      currentItem: null,
      completed: false,
    };
    rooms.set(code, room);
    wasCreated = true;
  }

  let role: Role;
  if (!isOpen(room.connections.teacher)) {
    role = "teacher";
  } else if (!isOpen(room.connections.student)) {
    role = "student";
  } else {
    return null; // room already has both seats filled
  }

  room.connections[role] = ws;
  return { room, role, wasCreated };
}

/**
 * Returns true if the room is now empty and was just torn down (a
 * "session end" moment) — exactly once per room. Both connections'
 * close handlers call this; readyState can already read CLOSED for
 * the *other* side before its own close handler has run (the two
 * close events race independently), so without the `ended` guard this
 * would fire "session end" twice for one lesson.
 */
export function leaveRoom(room: Room, role: Role): boolean {
  if (room.connections[role]) delete room.connections[role];
  if (room.ended) return false;
  if (!isOpen(room.connections.teacher) && !isOpen(room.connections.student)) {
    room.ended = true;
    for (const t of room.lockTimers.values()) clearTimeout(t);
    rooms.delete(room.state.code);
    return true;
  }
  return false;
}

export function broadcast(room: Room, exceptRole: Role | null, message: unknown) {
  const payload = JSON.stringify(message);
  for (const role of ["teacher", "student"] as const) {
    if (role === exceptRole) continue;
    const ws = room.connections[role];
    if (isOpen(ws)) ws.send(payload);
  }
}

function send(ws: WebSocket | undefined, message: unknown) {
  if (isOpen(ws)) ws.send(JSON.stringify(message));
}

// --- Who receives what. ---
// The relay decides visibility, not the renderer: a client is sent an
// object only if its role is in that object's visibleTo. An object it
// can't see is absent from every frame — state and patches alike — not
// sent and hidden.

const ROLES = ["teacher", "student"] as const;

function canSee(obj: StageObject, role: Role): boolean {
  return obj.visibleTo === "both" || obj.visibleTo.includes(role);
}

function canDrag(obj: StageObject, role: Role): boolean {
  return obj.draggableBy === "both" || obj.draggableBy.includes(role);
}

/**
 * What `role` may receive of `obj`, or null. Every zone also loses its
 * `accepts` list, for every kind: an answer list in a browser is an
 * answer key in a browser, and no client needs one — the relay judges
 * every drop. The teacher's key arrives separately, through the role
 * filter (sendLesson).
 */
function viewFor(_room: Room, obj: StageObject, role: Role): StageObject | null {
  if (!canSee(obj, role)) return null;
  if (obj.kind === "zone") return { ...(obj as Zone), accepts: [] } as Zone;
  return obj;
}

/** The teacher panel's prompts and answer key, to the teacher alone. Nothing pack-level ever goes to the student. */
export function sendLesson(room: Room) {
  if (room.pack) send(room.connections.teacher, { type: "lesson", lesson: teacherLesson(room.pack) });
}

/** The room state as `role` is allowed to see it. */
export function stateFor(room: Room, role: Role): RoomState {
  const objects: Record<string, StageObject> = {};
  for (const obj of Object.values(room.state.objects)) {
    const view = viewFor(room, obj, role);
    if (view) objects[obj.id] = view;
  }
  return { ...room.state, objects };
}

/** Sends one patch to each connected role, built for that role. A role with nothing visible in it gets nothing. */
function broadcastPatch(
  room: Room,
  changed: StageObject[],
  removedBefore: StageObject[],
  extra: { backdrop?: RoomState["backdrop"] } = {},
) {
  for (const role of ROLES) {
    const ws = room.connections[role];
    if (!isOpen(ws)) continue;
    const visibleChanged = changed.map((o) => viewFor(room, o, role)).filter((o): o is StageObject => o !== null);
    // Only ids this role could see before; it never learns of anything else, removed or not.
    const removed = removedBefore.filter((o) => canSee(o, role)).map((o) => o.id);
    if (visibleChanged.length === 0 && removed.length === 0 && extra.backdrop === undefined) continue;
    ws.send(JSON.stringify({ type: "patch", rev: room.state.rev, changed: visibleChanged, removed, ...extra }));
  }
}

function bumpAndBroadcastPatch(room: Room, obj: StageObject) {
  room.state.rev += 1;
  broadcastPatch(room, [obj], []);
}

/** The soft lock: the first move on an object claims it for that role. */
export function applyMove(room: Room, role: Role, id: string, pos: Vec) {
  const obj = room.state.objects[id];
  if (!obj) return;
  if (!canSee(obj, role) || !canDrag(obj, role)) return; // never move what this role can't see or hold
  if (obj.heldBy && obj.heldBy !== role) return; // held by the other role, reject

  if (!obj.heldBy) {
    room.dragStartPos.set(id, { ...obj.pos });
    // Picking an object up takes it out of the zone it was sitting in.
    room.dragStartPlacement.set(id, room.placements.get(id) ?? null);
    room.placements.delete(id);
  }
  obj.heldBy = role;
  obj.pos = pos;
  bumpAndBroadcastPatch(room, obj);

  const existing = room.lockTimers.get(id);
  if (existing) clearTimeout(existing);
  room.lockTimers.set(
    id,
    setTimeout(() => {
      const current = room.state.objects[id];
      if (current && current.heldBy === role) {
        current.heldBy = null;
        bumpAndBroadcastPatch(room, current);
      }
      room.lockTimers.delete(id);
    }, SILENCE_LOCK_MS),
  );
}

/** The lowest slot in `zone` no other object occupies, or null if the zone is full. */
function freeSlot(room: Room, zone: Zone, obj: StageObject): number | null {
  const taken = new Set<number>();
  for (const [objectId, p] of room.placements) {
    if (objectId !== obj.id && p.zoneId === zone.id) taken.add(p.slot);
  }
  const capacity = zoneCapacity(zone, obj.size);
  for (let slot = 0; slot < capacity; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/**
 * The relay decides correctness, never the client (docs/PRD.md, "5.
 * Server-side validation"): looks up the claimed zone, checks its
 * `accepts` list, snaps into the zone if correct or reverts to the
 * pre-drag position if not, replies with a verdict to the dropper
 * alone, and returns the LessonEvent for the caller to log.
 *
 * A zone can accept several objects (a sort bin) and an object can be
 * accepted by several zones (a gap two answers could fill). A correct
 * object dropped on a zone that is already full (a gap already
 * filled) goes back without being logged as a mistake: the answer
 * wasn't wrong, the space was taken.
 */
export function applyDrop(
  room: Room,
  role: Role,
  id: string,
  zoneId: string | null,
  ws: WebSocket,
): LessonEvent | null {
  const obj = room.state.objects[id];
  if (!obj || obj.heldBy !== role) return null;

  const timer = room.lockTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    room.lockTimers.delete(id);
  }

  const target = zoneId ? room.state.objects[zoneId] : undefined;
  const zone = target && target.kind === "zone" ? (target as Zone) : undefined;
  const accepted = !!zone && zone.accepts.includes(id);
  const slot = accepted ? freeSlot(room, zone!, obj) : null;
  const correct = accepted && slot !== null;

  const startPos = room.dragStartPos.get(id) ?? obj.pos;
  const startPlacement = room.dragStartPlacement.get(id) ?? null;
  room.dragStartPos.delete(id);
  room.dragStartPlacement.delete(id);

  if (correct) {
    obj.pos = snapPosition(zone!, obj, slot!);
    room.placements.set(id, { zoneId: zone!.id, slot: slot! });
  } else {
    obj.pos = startPos;
    if (startPlacement) room.placements.set(id, startPlacement);
  }
  obj.heldBy = null;

  bumpAndBroadcastPatch(room, obj);
  // The sentence or feedback line is built here, so no client needs the pack to show it.
  const feedback = correct && room.pack && room.currentItem ? correctDropText(room.pack, room.currentItem, zone!, obj) : undefined;
  send(ws, { type: "verdict", id, zoneId: zoneId ?? "", correct, ...(feedback ? { feedback } : {}) });
  if (correct) completeInfogapIfMatched(room);

  if (accepted && !correct) return null; // the zone was full — not the student's mistake
  return {
    t: Date.now(),
    type: "drop",
    objectId: id,
    zoneId: zoneId ?? "",
    correct,
    msSinceItemStart: Date.now() - room.itemStartedAt,
  };
}

/**
 * The infogap reveal. When every one of the student's objects sits in
 * its zone, the item completes — once: the teacher's reference set is
 * removed and the student's objects become visible to both, so for the
 * first time both see the same stage. Then a `complete` message, after
 * that patch, tells both clients to animate it.
 */
function completeInfogapIfMatched(room: Room) {
  const item = room.currentItem;
  if (!item || item.kind !== "infogap" || room.completed) return;
  const allPlaced = item.pairs.every((p) => room.placements.get(p.objectId)?.zoneId === p.zoneId);
  if (!allPlaced) return;
  room.completed = true;

  const reference = (item.reference ?? []).map((r) => room.state.objects[r.objectId]).filter(Boolean);
  for (const r of reference) delete room.state.objects[r.id];
  const revealed: StageObject[] = [];
  for (const p of item.pairs) {
    const obj = room.state.objects[p.objectId];
    if (!obj) continue;
    obj.visibleTo = "both";
    revealed.push(obj);
  }
  room.state.rev += 1;
  broadcastPatch(room, revealed, reference);
  broadcast(room, null, { type: "complete", itemId: item.id });
}

/**
 * A reveal is logged but never enters synced RoomState (docs/PRD.md,
 * "6. Reveal cards": "the state is per viewer and must never enter
 * synced room state"). The teacher still needs to see live progress,
 * so a student's reveal is forwarded to the teacher alone via
 * 'revealProgress' — outside the patch/rev system entirely. Returns
 * the LessonEvent for the caller to log.
 */
export function applyReveal(
  room: Room,
  role: Role,
  cardId: string,
  stage: 1 | 2 | 3,
): LessonEvent {
  if (role === "student") {
    send(room.connections.teacher, { type: "revealProgress", cardId, stage, role });
  }
  return { t: Date.now(), type: "reveal", cardId, stage, role };
}

/**
 * Replaces the room's objects wholesale with one pack item —
 * "Advancing an item... resets objects to that item's layout"
 * (docs/PRD.md, "7. Teacher panel and activity runner"). Mutates state
 * only; does not broadcast (see setItem/seedInitialItem below), so a
 * fresh room's first joiner gets one consistent 'state' snapshot
 * rather than a 'patch' arriving ahead of it.
 */
function applyItem(room: Room, pack: LessonPack, itemIndex: number) {
  const resolved = resolveItem(pack, itemIndex);
  const before = Object.values(room.state.objects);

  room.pack = pack;
  room.currentItem = pack.items[itemIndex];
  room.completed = false;
  room.state.objects = {};
  for (const obj of resolved.objects) room.state.objects[obj.id] = obj;
  room.state.activity = { packId: pack.id, itemIndex };
  if (resolved.backdrop !== undefined) room.state.backdrop = resolved.backdrop;

  room.dragStartPos.clear();
  room.dragStartPlacement.clear();
  room.placements.clear();
  for (const t of room.lockTimers.values()) clearTimeout(t);
  room.lockTimers.clear();
  room.itemStartedAt = Date.now();

  return { changed: resolved.objects, before, backdrop: resolved.backdrop, prompt: resolved.prompt };
}

/** Seeds a freshly created room's first item. No broadcast — there's no peer yet, and the joiner gets it via 'state'. Returns the item's prompt. */
export function seedInitialItem(room: Room, pack: LessonPack, itemIndex: number): string {
  return applyItem(room, pack, itemIndex).prompt;
}

/** Advances/changes the activity for a room that may already have a connected peer — broadcasts the change. */
export function setItem(room: Room, pack: LessonPack, itemIndex: number): string {
  const { changed, before, backdrop, prompt } = applyItem(room, pack, itemIndex);
  room.state.rev += 1;
  // Removed, per role: what it could see before and either is gone or it can no longer see.
  const removedBefore = before.filter((old) => {
    const now = room.state.objects[old.id];
    return !now || ROLES.some((r) => canSee(old, r) && !canSee(now, r));
  });
  for (const role of ROLES) {
    const ws = room.connections[role];
    if (!isOpen(ws)) continue;
    const visibleChanged = changed.map((o) => viewFor(room, o, role)).filter((o): o is StageObject => o !== null);
    const removed = removedBefore
      .filter((old) => canSee(old, role) && !(room.state.objects[old.id] && canSee(room.state.objects[old.id], role)))
      .map((o) => o.id);
    ws.send(
      JSON.stringify({ type: "patch", rev: room.state.rev, changed: visibleChanged, removed, ...(backdrop !== undefined ? { backdrop } : {}) }),
    );
  }
  return prompt;
}

/** Teacher-only nav; ignored from the student (docs/PRD.md: "// teacher only"). */
export function applySetActivity(
  room: Room,
  role: Role,
  pack: LessonPack,
  itemIndex: number,
): LessonEvent | null {
  if (role !== "teacher") return null;
  const prompt = setItem(room, pack, itemIndex);
  return { t: Date.now(), type: "item", index: itemIndex, prompt };
}

/** Teacher-only; ignored from the student (docs/PRD.md: "// teacher only"). */
export function applyMark(
  role: Role,
  itemIndex: number,
  verdict: "correct" | "retry",
): LessonEvent | null {
  if (role !== "teacher") return null;
  return { t: Date.now(), type: "mark", index: itemIndex, verdict };
}
