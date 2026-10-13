import type { ClientMessage, ServerMessage } from "@realia/shared";

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

export interface WsClientOptions {
  url: string;
  code: string;
  onMessage: (msg: ServerMessage) => void;
}

export interface WsClient {
  send(msg: ClientMessage): void;
  destroy(): void;
}

/**
 * Reconnects with exponential backoff and re-joins (re-syncing full
 * room state) on every reconnect, per docs/PRD.md, "4. Relay and live
 * sync". Deployed over meet.google.com this must be wss with a real
 * certificate; ws:// only survives mixed-content rules on localhost.
 */
export function connect(opts: WsClientOptions): WsClient {
  let ws: WebSocket | null = null;
  let destroyed = false;
  let backoffMs = INITIAL_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function send(msg: ClientMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function open() {
    ws = new WebSocket(opts.url);

    ws.addEventListener("open", () => {
      backoffMs = INITIAL_BACKOFF_MS;
      send({ type: "join", code: opts.code });
    });

    ws.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        opts.onMessage(msg);
      } catch {
        // ignore malformed frames
      }
    });

    ws.addEventListener("close", scheduleReconnect);
    ws.addEventListener("error", () => ws?.close());
  }

  function scheduleReconnect() {
    if (destroyed) return;
    reconnectTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      open();
    }, backoffMs);
  }

  open();

  return {
    send,
    destroy() {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
