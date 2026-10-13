import { WebSocketServer } from "ws";
import type { ClientMessage } from "@vennmeet/shared";
import { applyMove, applyPin, applyPut, applyRemove, join, leaveRoom, propose, type Room } from "./rooms.js";

const PORT = 8788;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let room: Room | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "propose") {
      if (room) return;
      room = propose(ws, msg.name);
      return;
    }

    if (msg.type === "join") {
      if (room) return;
      const joined = join(msg.code, ws, msg.name);
      if (!joined) {
        ws.close(4004, "room not found");
        return;
      }
      room = joined;
      return;
    }

    if (!room) return; // must propose or join before anything else is accepted

    switch (msg.type) {
      case "put":
        applyPut(room, msg.card);
        break;
      case "move":
        applyMove(room, ws, msg.id, msg.pos);
        break;
      case "pin":
        applyPin(room, ws, msg.id);
        break;
      case "remove":
        applyRemove(room, ws, msg.id);
        break;
      case "leave":
        leaveRoom(room, ws);
        room = null;
        break;
      default:
        break;
    }
  });

  ws.on("close", () => {
    if (room) leaveRoom(room, ws);
  });
});

console.log(`[vennmeet-relay] listening on ws://localhost:${PORT}`);
