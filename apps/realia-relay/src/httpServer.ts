import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { LessonPack } from "@realia/shared";
import type { SeedData } from "./report.js";
import { loadPack, saveCustomPack } from "./packs.js";

const REPORTS_DIR = join(process.cwd(), "reports");

export function reportToken(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

/** Writes the report HTML and seed JSON for a room, alongside each other. */
export function writeReport(code: string, html: string, seed: SeedData) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, `${code}.html`), html, "utf8");
  writeFileSync(join(REPORTS_DIR, `${code}.seed.json`), JSON.stringify(seed, null, 2), "utf8");
}

/**
 * Serves the report at /r/:code/:token — an unguessable URL, no login
 * (docs/PRD.md, "8. The report"). Shares the relay's port with the
 * WebSocket server (pass this server into `new WebSocketServer({
 * server })` instead of giving ws its own port).
 */
export function createReportServer(): { server: Server; registerToken: (code: string, token: string) => void } {
  const tokens = new Map<string, string>();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Approved AI-generated packs (docs/PRD.md, "10. The plan
    // generator" / "11. The approval screen"): POST stores one on the
    // relay, GET serves it back so the client fetches the same bytes
    // the relay itself will resolve for setActivity, instead of the
    // bundled chrome.runtime.getURL path that only covers static packs.
    if (req.method === "POST" && url.pathname === "/packs") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const pack = JSON.parse(body) as LessonPack;
          if (!pack.id) throw new Error("pack is missing an id");
          saveCustomPack(pack);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, packId: pack.id }));
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Invalid pack" }));
        }
      });
      return;
    }

    const packMatch = url.pathname.match(/^\/packs\/([A-Za-z0-9_-]+)$/);
    if (req.method === "GET" && packMatch) {
      try {
        const pack = loadPack(packMatch[1]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(pack));
      } catch {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "pack not found" }));
      }
      return;
    }

    const match = url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/);
    if (!match) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    const [, code, token] = match;
    const htmlPath = join(REPORTS_DIR, `${code}.html`);
    if (tokens.get(code) !== token || !existsSync(htmlPath)) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(htmlPath, "utf8"));
  });

  return { server, registerToken: (code, token) => tokens.set(code, token) };
}
