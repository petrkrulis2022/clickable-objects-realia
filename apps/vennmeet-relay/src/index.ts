import { WebSocketServer } from "ws";

const PORT = 8788;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  console.log("[vennmeet-relay] client connected");

  ws.on("close", () => {
    console.log("[vennmeet-relay] client disconnected");
  });
});

console.log(`[vennmeet-relay] listening on ws://localhost:${PORT}`);
