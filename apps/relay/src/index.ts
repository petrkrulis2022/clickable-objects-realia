import { WebSocketServer } from "ws";

const PORT = 8787;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  console.log("[relay] client connected");

  ws.on("close", () => {
    console.log("[relay] client disconnected");
  });
});

console.log(`[relay] listening on ws://localhost:${PORT}`);
