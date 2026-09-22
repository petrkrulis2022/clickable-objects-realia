import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LessonEvent } from "@co/shared";

const ROOMS_DIR = join(process.cwd(), "rooms");

/**
 * Appends one LessonEvent as one JSON line to this room's log file.
 * Appended on the relay only — never from the client — so a client
 * crash or reload can never lose a lesson. See docs/PRD.md,
 * "5. Server-side validation and the event log".
 */
export function appendEvent(code: string, event: LessonEvent) {
  mkdirSync(ROOMS_DIR, { recursive: true });
  appendFileSync(join(ROOMS_DIR, `${code}.jsonl`), JSON.stringify(event) + "\n", "utf8");
}
