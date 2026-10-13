import type { LessonEvent, RoomState, Role, StageObject, Vec, Zone } from "@realia/shared";
import type { WebSocket } from "ws";
import type { ResolvedItem } from "./packs.js";

// One second of silence clears the soft lock even if the holder never
// sends an explicit drop (crash, closed laptop lid, etc).
const SILENCE_LOCK_MS = 1000;

export interface Room {
  state: RoomState;
  connections: Partial<Record<Role, WebSocket>>;
  lockTimers: Map<string, NodeJS.Timeout>;
  /** Position an object had just before its current hold began, so a wrong drop can revert to it. */
  dragStartPos: Map<string, Vec>;
  /** When the current activity item began; "5" has no item system yet, so this is the session start. */
  itemStartedAt: number;
  /** Guards leaveRoom against firing "session end" twice — see its comment. */
  ended: boolean;
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
      itemStartedAt: now,
      ended: false,
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

function bumpAndBroadcastPatch(room: Room, obj: StageObject) {
  room.state.rev += 1;
  broadcast(room, null, {
    type: "patch",
    rev: room.state.rev,
    changed: [obj],
    removed: [],
  });
}

/** The soft lock: the first move on an object claims it for that role. */
export function applyMove(room: Room, role: Role, id: string, pos: Vec) {
  const obj = room.state.objects[id];
  if (!obj) return;
  if (obj.heldBy && obj.heldBy !== role) return; // held by the other role, reject

  if (!obj.heldBy) room.dragStartPos.set(id, { ...obj.pos });
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

/**
 * The relay decides correctness, never the client (docs/PRD.md, "5.
 * Server-side validation"): looks up the claimed zone, checks its
 * `accepts` list, snaps to the zone centre if correct or reverts to
 * the pre-drag position if not, replies with a verdict to the
 * dropper alone, and returns the LessonEvent for the caller to log.
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

  const zone = zoneId ? (room.state.objects[zoneId] as Zone | undefined) : undefined;
  const correct = !!zone && zone.kind === "zone" && zone.accepts.includes(id);
  const startPos = room.dragStartPos.get(id) ?? obj.pos;
  room.dragStartPos.delete(id);

  obj.pos = correct
    ? { x: zone!.pos.x + zone!.size.w / 2 - obj.size.w / 2, y: zone!.pos.y + zone!.size.h / 2 - obj.size.h / 2 }
    : startPos;
  obj.heldBy = null;

  bumpAndBroadcastPatch(room, obj);
  send(ws, { type: "verdict", id, zoneId: zoneId ?? "", correct });

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
 * Replaces the room's objects wholesale with a resolved pack item —
 * "Advancing an item... resets objects to that item's layout"
 * (docs/PRD.md, "7. Teacher panel and activity runner"). Mutates state
 * only; does not broadcast (see setItem/seedInitialItem below), so a
 * fresh room's first joiner gets one consistent 'state' snapshot
 * rather than a 'patch' arriving ahead of it.
 */
function applyItem(
  room: Room,
  packId: string,
  itemIndex: number,
  resolved: ResolvedItem,
): { changed: StageObject[]; removed: string[] } {
  const newIds = new Set(resolved.objects.map((o) => o.id));
  const removed = Object.keys(room.state.objects).filter((id) => !newIds.has(id));

  room.state.objects = {};
  for (const obj of resolved.objects) room.state.objects[obj.id] = obj;
  room.state.activity = { packId, itemIndex };
  if (resolved.backdrop !== undefined) room.state.backdrop = resolved.backdrop;

  room.dragStartPos.clear();
  for (const t of room.lockTimers.values()) clearTimeout(t);
  room.lockTimers.clear();
  room.itemStartedAt = Date.now();

  return { changed: resolved.objects, removed };
}

/** Seeds a freshly created room's first item. No broadcast — there's no peer yet, and the joiner gets it via 'state'. */
export function seedInitialItem(room: Room, packId: string, itemIndex: number, resolved: ResolvedItem) {
  applyItem(room, packId, itemIndex, resolved);
}

/** Advances/changes the activity for a room that may already have a connected peer — broadcasts the change. */
export function setItem(room: Room, packId: string, itemIndex: number, resolved: ResolvedItem) {
  const { changed, removed } = applyItem(room, packId, itemIndex, resolved);
  room.state.rev += 1;
  broadcast(room, null, {
    type: "patch",
    rev: room.state.rev,
    changed,
    removed,
    ...(resolved.backdrop !== undefined ? { backdrop: resolved.backdrop } : {}),
  });
}

/** Teacher-only nav; ignored from the student (docs/PRD.md: "// teacher only"). */
export function applySetActivity(
  room: Room,
  role: Role,
  packId: string,
  itemIndex: number,
  resolved: ResolvedItem,
): LessonEvent | null {
  if (role !== "teacher") return null;
  setItem(room, packId, itemIndex, resolved);
  return { t: Date.now(), type: "item", index: itemIndex, prompt: resolved.prompt };
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
