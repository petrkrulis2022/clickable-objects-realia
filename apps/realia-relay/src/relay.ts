import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import type { ClientMessage, LessonPack, Role } from "@realia/shared";
import { createEventLog } from "./eventLog.js";
import { createPackStore, PackStoreError } from "./packs.js";
import { buildSeed, renderReport, type SeedData } from "./report.js";
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
  stateFor,
  type Room,
} from "./rooms.js";

export const DEFAULT_PACK_ID = "a2-prepositions-place";

export interface RelayDirs {
  /** apps/realia/public/packs */
  bundledPacks: string;
  /** Approved generated packs (+ their audio and plan). */
  customPacks: string;
  reports: string;
  rooms: string;
}

export interface RelayOptions {
  port: number;
  dirs: RelayDirs;
  log?: (message: string) => void;
}

/**
 * Who may call the relay's HTTP API from a browser: the extension's
 * own pages (options page) and the content script running on Meet.
 * Not any other website — otherwise any page the teacher has open
 * could read packs and plans off localhost, or write packs into it.
 */
const ALLOWED_ORIGIN_RE = /^(chrome-extension:\/\/[a-p]{32}|https:\/\/meet\.google\.com)$/;
const MAX_BODY_BYTES = 25 * 1024 * 1024; // a pack plus its mp3s, base64

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

function reportToken(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

/** Returns false (and has answered) if the request came from a browser origin that isn't allowed. */
function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // not a cross-origin browser request (curl, the report opened directly)
  if (!ALLOWED_ORIGIN_RE.test(origin)) {
    res.writeHead(403, { "content-type": "text/plain" }).end("origin not allowed");
    return false;
  }
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  return true;
}

function answerPreflight(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(204, {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    // Chrome's private-network check: Meet (public) calling the relay (localhost).
    ...(req.headers["access-control-request-private-network"] ? { "access-control-allow-private-network": "true" } : {}),
  });
  res.end();
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  // Requiring JSON forces a CORS preflight for any cross-origin caller,
  // so a page that isn't allowed can't even make the relay do work.
  if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return Promise.reject(new HttpError(415, "Send JSON (content-type: application/json)"));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createRelay(opts: RelayOptions) {
  const log = opts.log ?? ((m: string) => console.log(m));
  const packs = createPackStore({ bundled: opts.dirs.bundledPacks, custom: opts.dirs.customPacks });
  const events = createEventLog(opts.dirs.rooms);
  const reportTokens = new Map<string, string>();

  /** The pack a request names, or the shipped default if it can't be loaded — a room must always have a lesson. */
  function loadPackOrDefault(packId: string | undefined): LessonPack {
    if (packId) {
      try {
        return packs.load(packId);
      } catch (err) {
        log(`[relay] pack "${packId}" could not be loaded (${err instanceof Error ? err.message : String(err)}); using the default`);
      }
    }
    return packs.load(DEFAULT_PACK_ID);
  }

  function writeReport(code: string, html: string, seed: SeedData) {
    mkdirSync(opts.dirs.reports, { recursive: true });
    writeFileSync(join(opts.dirs.reports, `${code}.html`), html, "utf8");
    writeFileSync(join(opts.dirs.reports, `${code}.seed.json`), JSON.stringify(seed, null, 2), "utf8");
  }

  /** The report is built from the pack that was actually played, not the default. */
  function endSession(code: string, packId: string | undefined) {
    events.append(code, { t: Date.now(), type: "session", phase: "end" });
    const pack = loadPackOrDefault(packId);
    const lessonEvents = events.read(code);
    writeReport(code, renderReport({ code, events: lessonEvents, pack }), buildSeed({ code, events: lessonEvents, pack }));
    const token = reportToken();
    reportTokens.set(code, token);
    log(`[relay] report ready: http://localhost:${opts.port}/r/${code}/${token}`);
  }

  /** Newest seed (last lesson's results), optionally for one pack — the "from last lesson" door's input. */
  function latestSeed(packId: string | null): SeedData | null {
    if (!existsSync(opts.dirs.reports)) return null;
    const seeds = readdirSync(opts.dirs.reports)
      .filter((f) => f.endsWith(".seed.json"))
      .map((f) => join(opts.dirs.reports, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    for (const path of seeds) {
      try {
        const seed = JSON.parse(readFileSync(path, "utf8")) as SeedData;
        if (!packId || seed.packId === packId) return seed;
      } catch {
        /* skip an unreadable seed */
      }
    }
    return null;
  }

  async function handleHttp(req: IncomingMessage, res: ServerResponse) {
    if (!applyCors(req, res)) return;
    if (req.method === "OPTIONS") return answerPreflight(req, res);

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }

    if (req.method === "GET" && path === "/packs") return sendJson(res, 200, { packs: packs.list() });

    // An approved pack, with the mp3s generated for its new words and its teaching plan.
    if (req.method === "POST" && path === "/packs") {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const isBare = body && typeof body === "object" && "items" in body; // the earlier client posted the pack itself
      const pack = packs.save(
        isBare
          ? { pack: body }
          : {
              pack: body.pack,
              audio: body.audio as Record<string, string> | undefined,
              plan: body.plan as string | undefined,
            },
      );
      return sendJson(res, 200, { ok: true, packId: pack.id });
    }

    const audioMatch = path.match(/^\/packs\/([^/]+)\/audio\/([^/]+)$/);
    if (req.method === "GET" && audioMatch) {
      const file = packs.audioFile(audioMatch[1], audioMatch[2]);
      if (!file) throw new HttpError(404, "not found");
      res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "max-age=3600" });
      res.end(readFileSync(file));
      return;
    }

    const planMatch = path.match(/^\/packs\/([^/]+)\/plan$/);
    if (req.method === "GET" && planMatch) {
      const plan = packs.plan(planMatch[1]);
      if (plan === null) throw new HttpError(404, "no plan saved for this pack");
      res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" }).end(plan);
      return;
    }

    const packMatch = path.match(/^\/packs\/([^/]+)$/);
    if (req.method === "GET" && packMatch) return sendJson(res, 200, packs.load(packMatch[1]));

    if (req.method === "GET" && path === "/reports/latest-seed") {
      const seed = latestSeed(url.searchParams.get("packId"));
      if (!seed) throw new HttpError(404, "no lesson report yet");
      return sendJson(res, 200, seed);
    }

    // The report at /r/:code/:token — an unguessable URL, no login (docs/PRD.md, "8. The report").
    const reportMatch = path.match(/^\/r\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/);
    if (req.method === "GET" && reportMatch) {
      const [, code, token] = reportMatch;
      const htmlPath = join(opts.dirs.reports, `${code}.html`);
      if (reportTokens.get(code) !== token || !existsSync(htmlPath)) throw new HttpError(404, "not found");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(htmlPath, "utf8"));
      return;
    }

    throw new HttpError(404, "not found");
  }

  const server: Server = createServer((req, res) => {
    handleHttp(req, res).catch((err: unknown) => {
      if (res.headersSent) return;
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, problems: err.problems });
      if (err instanceof PackStoreError) return sendJson(res, err.status, { error: err.message, problems: err.problems });
      log(`[relay] ${req.method} ${req.url} failed: ${err instanceof Error ? err.message : String(err)}`);
      sendJson(res, 500, { error: "Internal error" });
    });
  });

  const wss = new WebSocketServer({ server });

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
          // The room starts on the pack its creator (the teacher) selected.
          events.append(msg.code, { t: Date.now(), type: "session", phase: "start" });
          const pack = loadPackOrDefault(msg.packId);
          const prompt = seedInitialItem(joined.room, pack, 0);
          events.append(msg.code, { t: Date.now(), type: "item", index: 0, prompt });
        }

        ws.send(JSON.stringify({ type: "state", state: stateFor(joined.room, joined.role), yourRole: joined.role }));
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
          if (event) events.append(session.code, event);
          break;
        }
        case "reveal":
          events.append(session.code, applyReveal(session.room, session.role, msg.cardId, msg.stage));
          break;
        case "setActivity": {
          let pack: LessonPack;
          try {
            pack = packs.load(msg.packId);
          } catch (err) {
            log(`[relay] setActivity refused: ${err instanceof Error ? err.message : String(err)}`);
            break;
          }
          if (msg.itemIndex < 0 || msg.itemIndex >= pack.items.length) break;
          const event = applySetActivity(session.room, session.role, pack, msg.itemIndex);
          if (event) events.append(session.code, event);
          break;
        }
        case "mark": {
          const event = applyMark(session.role, msg.itemIndex, msg.verdict);
          if (event) events.append(session.code, event);
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
      if (sessionEnded) endSession(session.code, session.room.state.activity?.packId);
    });
  });

  return {
    server,
    /** Resolves with the port actually bound (pass port 0 for any free port). */
    listen: () =>
      new Promise<number>((resolve) => {
        server.listen(opts.port, () => {
          const address = server.address();
          resolve(typeof address === "object" && address ? address.port : opts.port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close(() => resolve());
      }),
    /** For tests: the report token issued for a room, once its session has ended. */
    reportTokenFor: (code: string) => reportTokens.get(code),
  };
}
