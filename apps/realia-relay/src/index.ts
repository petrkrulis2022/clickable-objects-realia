import { WebSocketServer } from "ws";
import type { ClientMessage, Role } from "@realia/shared";
import { appendEvent, readEvents } from "./eventLog.js";
import { createReportServer, reportToken, writeReport } from "./httpServer.js";
import { loadPack, resolveItem } from "./packs.js";
import { buildSeed, renderReport } from "./report.js";
import {
  applyDrop,
  applyMark,
  applyMove,
  applyReveal,
  applySetActivity,
  broadcast,
  joinRoom,
  leaveRoom,
  seedInitialItem,
  type Room,
} from "./rooms.js";

const PORT = 8787;
const DEFAULT_PACK_ID = "a2-prepositions-place";

const { server: httpServer, registerToken } = createReportServer();
const wss = new WebSocketServer({ server: httpServer });

function endSession(code: string) {
  appendEvent(code, { t: Date.now(), type: "session", phase: "end" });
  const events = readEvents(code);
  const pack = loadPack(DEFAULT_PACK_ID);
  const html = renderReport({ code, events, pack });
  const seed = buildSeed({ code, events, pack });
  writeReport(code, html, seed);
  const token = reportToken();
  registerToken(code, token);
  console.log(`[relay] report ready: http://localhost:${PORT}/r/${code}/${token}`);
}

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
        appendEvent(msg.code, { t: Date.now(), type: "session", phase: "start" });
        const pack = loadPack(DEFAULT_PACK_ID);
        const resolved = resolveItem(pack, 0);
        seedInitialItem(joined.room, DEFAULT_PACK_ID, 0, resolved);
        appendEvent(msg.code, { t: Date.now(), type: "item", index: 0, prompt: resolved.prompt });
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
      case "reveal":
        appendEvent(session.code, applyReveal(session.room, session.role, msg.cardId, msg.stage));
        break;
      case "setActivity": {
        const pack = loadPack(msg.packId);
        const resolved = resolveItem(pack, msg.itemIndex);
        const event = applySetActivity(session.room, session.role, msg.packId, msg.itemIndex, resolved);
        if (event) appendEvent(session.code, event);
        break;
      }
      case "mark": {
        const event = applyMark(session.role, msg.itemIndex, msg.verdict);
        if (event) appendEvent(session.code, event);
        break;
      }
      default:
        break;
    }
  });

  ws.on("close", () => {
    if (!session) return;
    broadcast(session.room, session.role, { type: "peer", role: session.role, connected: false });
    const sessionEnded = leaveRoom(session.room, session.role);
    if (sessionEnded) endSession(session.code);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[relay] listening on ws://localhost:${PORT} (reports served over the same port)`);
});
