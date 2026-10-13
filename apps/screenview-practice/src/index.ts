import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { PracticeClientMessage, PracticeSessionStartRequest } from "@screenview/shared";
import { SessionStore, handleClientMessage, speakQuestion } from "./server.js";
import { createElevenLabsScribeAdapter, createNullTranscribeAdapter } from "./scribeAdapter.js";
import { createElevenLabsVoiceAgentAdapter, createNullVoiceAgentAdapter } from "./agentAdapter.js";

const PORT = 8789;

// No key configured here — falls back to the null adapters, which is
// why this service runs and is fully testable without any ElevenLabs
// account. See scribeAdapter.ts / agentAdapter.ts for what swapping in
// the real ones means and what's unverified about them.
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const deps = {
  scribe: apiKey ? createElevenLabsScribeAdapter(apiKey) : createNullTranscribeAdapter(),
  agent: apiKey && voiceId ? createElevenLabsVoiceAgentAdapter(apiKey, voiceId) : createNullVoiceAgentAdapter(),
};

const store = new SessionStore();

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && req.url === "/session/start") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const request = JSON.parse(body) as PracticeSessionStartRequest;
        const started = store.start(request);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(started));
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }

  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  const sessionToken = new URL(req.url ?? "", "http://localhost").searchParams.get("token") ?? "";
  const session = store.get(sessionToken);
  if (!session) {
    ws.close(4001, "unknown session token");
    return;
  }

  console.log("[screenview-practice] client connected");
  void speakQuestion(session, deps, (m) => ws.send(JSON.stringify(m)));

  ws.on("message", (raw) => {
    let message: PracticeClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    void handleClientMessage(session, message, deps, (m) => ws.send(JSON.stringify(m)));
  });

  ws.on("close", () => {
    console.log("[screenview-practice] client disconnected");
    store.end(sessionToken);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[screenview-practice] listening on http://localhost:${PORT}`);
});
