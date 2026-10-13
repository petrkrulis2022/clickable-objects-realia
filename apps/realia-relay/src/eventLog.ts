import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LessonEvent } from "@realia/shared";

const ROOMS_DIR = join(process.cwd(), "rooms");

function logPath(code: string): string {
  return join(ROOMS_DIR, `${code}.jsonl`);
}

/**
 * Appends one LessonEvent as one JSON line to this room's log file.
 * Appended on the relay only — never from the client — so a client
 * crash or reload can never lose a lesson. See docs/PRD.md,
 * "5. Server-side validation and the event log".
 */
export function appendEvent(code: string, event: LessonEvent) {
  mkdirSync(ROOMS_DIR, { recursive: true });
  appendFileSync(logPath(code), JSON.stringify(event) + "\n", "utf8");
}

/** Reads a room's full event log back, in append order. Used to build the report (prompt 8). */
export function readEvents(code: string): LessonEvent[] {
  const path = logPath(code);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LessonEvent);
}
