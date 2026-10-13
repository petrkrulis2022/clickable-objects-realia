import type { ClientMessage, Id, ServerMessage, SharedCard, SharedRoom } from "@vennmeet/shared";

// Deployed against a real call this must be wss:// with a valid
// certificate (same mixed-content reasoning as Realia's relay). ws://
// only survives Chrome's mixed-content blocking on localhost.
const RELAY_URL = "ws://localhost:8788";
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

export interface SharedSessionCallbacks {
  onRoom: (room: SharedRoom, you: string) => void;
  onPatch: (changed: SharedCard[], removed: Id[]) => void;
  onPresent: (present: SharedRoom["present"]) => void;
  onDisconnected: () => void;
  /** The room this session was in no longer exists on the relay (e.g. a full relay restart) — reconnect keeps retrying, but the content script surfaces this so the UI can offer re-proposing rather than hanging silently. */
  onRoomLost: () => void;
}

export interface SharedSession {
  send(msg: ClientMessage): void;
  destroy(): void;
}

/**
 * CRITICAL (docs/SPEC-VENNMEET.md, "5. The relay and the shared
 * layer"): "when no shared layer is open, the extension must open no
 * socket at all - not an idle one." This function is the ONLY place a
 * WebSocket to the relay is ever constructed, and it only runs when
 * explicitly called — propose or join, a direct user action. Nothing
 * calls this eagerly on page load.
 */
export function startSharedSession(
  name: string,
  initial: { type: "propose" } | { type: "join"; code: string },
  callbacks: SharedSessionCallbacks,
): SharedSession {
  let ws: WebSocket | null = null;
  let destroyed = false;
  let backoffMs = INITIAL_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  // After the first successful join, reconnects always rejoin by code
  // (re-"propose"-ing on every reconnect would hand out a new code
  // each time, stranding whoever already has the old one).
  let rejoinCode: string | null = initial.type === "join" ? initial.code : null;
  let gotRoomThisAttempt = false;

  function send(msg: ClientMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function open() {
    gotRoomThisAttempt = false;
    ws = new WebSocket(RELAY_URL);

    ws.addEventListener("open", () => {
      backoffMs = INITIAL_BACKOFF_MS;
      if (rejoinCode) send({ type: "join", code: rejoinCode, name });
      else send({ type: "propose", name });
    });

    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      if (msg.type === "room") {
        gotRoomThisAttempt = true;
        rejoinCode = msg.room.code;
        callbacks.onRoom(msg.room, msg.you);
      } else if (msg.type === "patch") {
        callbacks.onPatch(msg.changed, msg.removed);
      } else if (msg.type === "present") {
        callbacks.onPresent(msg.present);
      }
    });

    ws.addEventListener("close", (e) => {
      if (e.code === 4004 && !gotRoomThisAttempt) callbacks.onRoomLost();
      scheduleReconnect();
    });
    ws.addEventListener("error", () => ws?.close());
  }

  function scheduleReconnect() {
    if (destroyed) return;
    callbacks.onDisconnected();
    reconnectTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      open();
    }, backoffMs);
  }

  open();

  return {
    send,
    destroy: () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      send({ type: "leave" });
      ws?.close();
    },
  };
}
