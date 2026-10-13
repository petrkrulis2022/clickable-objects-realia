import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// Scaffold step — the real session flow (ElevenLabs conversational
// agent + Scribe transcription) arrives in prompts 3-4. For now this
// just proves the service starts and accepts a websocket connection.
const PORT = 8789;

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  console.log("[screenview-practice] client connected");
  ws.on("close", () => console.log("[screenview-practice] client disconnected"));
});

httpServer.listen(PORT, () => {
  console.log(`[screenview-practice] listening on http://localhost:${PORT}`);
});
