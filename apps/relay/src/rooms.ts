import type { RoomState, Role, StageObject } from "@co/shared";
import type { WebSocket } from "ws";

// One second of silence clears the soft lock even if the holder never
// sends an explicit drop (crash, closed laptop lid, etc).
const SILENCE_LOCK_MS = 1000;

export interface Room {
  state: RoomState;
  connections: Partial<Record<Role, WebSocket>>;
  lockTimers: Map<string, NodeJS.Timeout>;
}

const rooms = new Map<string, Room>();

function isOpen(ws: WebSocket | undefined): ws is WebSocket {
  return !!ws && ws.readyState === ws.OPEN;
}

function emptyState(code: string): RoomState {
  return { code, rev: 0, objects: {}, backdrop: null, activity: null };
}

/** Joins `code`, creating the room if needed. Returns the assigned role, or null if both seats are taken. */
export function joinRoom(code: string, ws: WebSocket): { room: Room; role: Role } | null {
  let room = rooms.get(code);
  if (!room) {
    room = { state: emptyState(code), connections: {}, lockTimers: new Map() };
    rooms.set(code, room);
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
  return { room, role };
}

export function leaveRoom(room: Room, role: Role) {
  if (room.connections[role]) delete room.connections[role];
  if (!isOpen(room.connections.teacher) && !isOpen(room.connections.student)) {
    for (const t of room.lockTimers.values()) clearTimeout(t);
    rooms.delete(room.state.code);
  }
}

export function broadcast(room: Room, exceptRole: Role | null, message: unknown) {
  const payload = JSON.stringify(message);
  for (const role of ["teacher", "student"] as const) {
    if (role === exceptRole) continue;
    const ws = room.connections[role];
    if (isOpen(ws)) ws.send(payload);
  }
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
export function applyMove(room: Room, role: Role, id: string, pos: { x: number; y: number }) {
  const obj = room.state.objects[id];
  if (!obj) return;
  if (obj.heldBy && obj.heldBy !== role) return; // held by the other role, reject

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

export function applyDrop(room: Room, role: Role, id: string) {
  const obj = room.state.objects[id];
  if (!obj || obj.heldBy !== role) return;

  const timer = room.lockTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    room.lockTimers.delete(id);
  }
  obj.heldBy = null;
  bumpAndBroadcastPatch(room, obj);
}

/** Seeds a freshly created room's objects (demo scene / a pack, later). Ignored if the room already has objects. */
export function seedIfEmpty(room: Room, objects: StageObject[]) {
  if (Object.keys(room.state.objects).length > 0) return;
  for (const obj of objects) room.state.objects[obj.id] = obj;
}
