import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LessonEvent } from "@realia/shared";

/**
 * One JSON line per LessonEvent, one file per room. Appended on the
 * relay only — never from the client — so a client crash or reload
 * can never lose a lesson. See docs/PRD.md, "5. Server-side
 * validation and the event log".
 */
export function createEventLog(roomsDir: string) {
  function logPath(code: string): string {
    return join(roomsDir, `${code}.jsonl`);
  }

  function append(code: string, event: LessonEvent) {
    mkdirSync(roomsDir, { recursive: true });
    appendFileSync(logPath(code), JSON.stringify(event) + "\n", "utf8");
  }

  /** A room's full event log, in append order. Used to build the report (prompt 8). */
  function read(code: string): LessonEvent[] {
    const path = logPath(code);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LessonEvent);
  }

  return { append, read };
}

export type EventLog = ReturnType<typeof createEventLog>;
