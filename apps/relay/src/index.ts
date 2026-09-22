import { WebSocketServer } from "ws";
import type { ClientMessage, Role } from "@co/shared";
import { appendEvent } from "./eventLog.js";
import { applyDrop, applyMove, broadcast, joinRoom, leaveRoom, seedIfEmpty, type Room } from "./rooms.js";
import { DEMO_OBJECTS } from "./seed.js";

const PORT = 8787;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let session: { room: Room; role: Role; code: string } | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      if (session) return; // already joined
      const joined = joinRoom(msg.code, ws);
      if (!joined) {
        ws.close(4000, "room full");
        return;
      }
      session = { room: joined.room, role: joined.role, code: msg.code };
      if (joined.wasCreated) {
        seedIfEmpty(joined.room, DEMO_OBJECTS);
        appendEvent(msg.code, { t: Date.now(), type: "session", phase: "start" });
      }

      ws.send(JSON.stringify({ type: "state", state: joined.room.state, yourRole: joined.role }));
      broadcast(joined.room, joined.role, { type: "peer", role: joined.role, connected: true });
      return;
    }

    if (!session) return; // must join before anything else is accepted

    switch (msg.type) {
      case "move":
        applyMove(session.room, session.role, msg.id, msg.pos);
        break;
      case "drop": {
        const event = applyDrop(session.room, session.role, msg.id, msg.zoneId, ws);
        if (event) appendEvent(session.code, event);
        break;
      }
      // 'reveal', 'setActivity' and 'mark' arrive in later prompts
      // (6 and 7). Ignored for now rather than half-implemented.
      default:
        break;
    }
  });

  ws.on("close", () => {
    if (!session) return;
    broadcast(session.room, session.role, { type: "peer", role: session.role, connected: false });
    const sessionEnded = leaveRoom(session.room, session.role);
    if (sessionEnded) {
      appendEvent(session.code, { t: Date.now(), type: "session", phase: "end" });
    }
  });
});

console.log(`[relay] listening on ws://localhost:${PORT}`);
