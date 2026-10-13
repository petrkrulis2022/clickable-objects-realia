import type { Card, Id, Pos, ServerMessage, SharedCard, SharedRoom } from "@vennmeet/shared";
import type { WebSocket } from "ws";

// One second of silence clears the soft lock even if the holder never
// releases explicitly (docs/SPEC-VENNMEET.md, "Who can move what").
const SILENCE_LOCK_MS = 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface Room {
  code: string;
  rev: number;
  cards: Record<Id, SharedCard>;
  /** Source of truth for presence — the `present` array is always derived from this, never stored separately, so it can't drift (e.g. two people sharing a display name). */
  connections: Map<WebSocket, { name: string; joinedAt: string }>;
  lockTimers: Map<Id, NodeJS.Timeout>;
}

const rooms = new Map<string, Room>();

function randomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function isOpen(ws: WebSocket): boolean {
  return ws.readyState === ws.OPEN;
}

function present(room: Room): SharedRoom["present"] {
  return [...room.connections.values()];
}

function snapshot(room: Room): SharedRoom {
  return { code: room.code, rev: room.rev, cards: room.cards, present: present(room) };
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (isOpen(ws)) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage, except?: WebSocket) {
  const payload = JSON.stringify(msg);
  for (const ws of room.connections.keys()) {
    if (ws !== except && isOpen(ws)) ws.send(payload);
  }
}

function addConnection(room: Room, ws: WebSocket, name: string) {
  room.connections.set(ws, { name, joinedAt: new Date().toISOString() });
  send(ws, { type: "room", room: snapshot(room), you: name });
  broadcast(room, { type: "present", present: present(room) }, ws);
}

/** No database, no accounts, no history — a fresh room, entirely in memory (docs/SPEC-VENNMEET.md, "The relay holds nothing"). */
export function propose(ws: WebSocket, name: string): Room {
  const room: Room = {
    code: randomCode(),
    rev: 0,
    cards: {},
    connections: new Map(),
    lockTimers: new Map(),
  };
  rooms.set(room.code, room);
  addConnection(room, ws, name);
  return room;
}

/** Returns null for an unknown code — the caller closes the socket; there's no error ServerMessage variant in the given protocol. */
export function join(code: string, ws: WebSocket, name: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  addConnection(room, ws, name);
  return room;
}

/** Room dropped when both sides leave (docs/SPEC-VENNMEET.md, "The relay holds nothing"). Returns true if the room was just torn down. */
export function leaveRoom(room: Room, ws: WebSocket): boolean {
  const who = room.connections.get(ws);
  room.connections.delete(ws);
  if (who) {
    // Release any card this connection was holding.
    for (const card of Object.values(room.cards)) {
      if (card.heldBy === who.name) card.heldBy = null;
    }
    broadcast(room, { type: "present", present: present(room) });
  }
  if (room.connections.size === 0) {
    for (const t of room.lockTimers.values()) clearTimeout(t);
    rooms.delete(room.code);
    return true;
  }
  return false;
}

function bumpAndBroadcastPatch(room: Room, changed: SharedCard[], removed: Id[] = []) {
  room.rev += 1;
  broadcast(room, { type: "patch", rev: room.rev, changed, removed });
}

export function applyPut(room: Room, card: Card) {
  const existing = room.cards[card.id];
  room.cards[card.id] = { ...card, pos: existing?.pos, pinnedBy: existing?.pinnedBy, heldBy: existing?.heldBy ?? null };
  bumpAndBroadcastPatch(room, [room.cards[card.id]]);
}

/** The soft lock: the first move on a card claims it for that connection's name (docs/SPEC-VENNMEET.md, "Who can move what"). */
export function applyMove(room: Room, ws: WebSocket, id: Id, pos: Pos) {
  const who = room.connections.get(ws);
  const card = room.cards[id];
  if (!who || !card) return;
  if (card.heldBy && card.heldBy !== who.name) return; // held by someone else, reject
  if (card.pinnedBy) return; // pinned cards can't be dragged by anyone but their creator — see applyPin

  card.heldBy = who.name;
  card.pos = pos;
  bumpAndBroadcastPatch(room, [card]);

  const existingTimer = room.lockTimers.get(id);
  if (existingTimer) clearTimeout(existingTimer);
  room.lockTimers.set(
    id,
    setTimeout(() => {
      const current = room.cards[id];
      if (current && current.heldBy === who.name) {
        current.heldBy = null;
        bumpAndBroadcastPatch(room, [current]);
      }
      room.lockTimers.delete(id);
    }, SILENCE_LOCK_MS),
  );
}

/** "A card can be pinned by its creator so it cannot be dragged or deleted by the other person" — the relay doesn't know "creator", so pin is granted to whoever is first to pin an unpinned card. */
export function applyPin(room: Room, ws: WebSocket, id: Id) {
  const who = room.connections.get(ws);
  const card = room.cards[id];
  if (!who || !card || card.pinnedBy) return;
  card.pinnedBy = who.name;
  card.heldBy = null;
  bumpAndBroadcastPatch(room, [card]);
}

export function applyRemove(room: Room, ws: WebSocket, id: Id) {
  const who = room.connections.get(ws);
  const card = room.cards[id];
  if (!who || !card) return;
  if (card.pinnedBy && card.pinnedBy !== who.name) return; // pinned cards can't be deleted by the other person
  delete room.cards[id];
  const timer = room.lockTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    room.lockTimers.delete(id);
  }
  bumpAndBroadcastPatch(room, [], [id]);
}
