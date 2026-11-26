import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidGeneratedAudioFile,
  loadValidPack,
  PACK_ID_RE,
  PackValidationError,
  type LessonPack,
} from "@realia/shared";

// Built-in packs (apps/realia-relay/packs) are the lessons that come with
// Realia. They live with the relay, not in the extension: a lesson file
// holds every answer, so no student's install may carry one. A generated pack
// (approved on the options page) exists only at runtime, so it lives
// in the relay's own directory, together with the mp3s generated for
// its new words at approval time and the teaching plan the teacher
// approved it with. Both clients fetch every pack from the relay, so
// teacher and student always resolve the identical bytes.
//
// Every pack is normalised and strictly validated on the way in and
// on the way out: an invalid pack is never stored and never served.
//
// What is stored next to a pack is exactly: the pack JSON, mp3 audio
// (checked to be mp3), and the plan as text. Never an image — the
// coursebook photos a pack was generated from never reach the relay.

export interface PackDirs {
  /** apps/realia-relay/packs — the built-in lessons, read-only here. */
  bundled: string;
  /** Approved generated packs, one JSON file + one directory each. */
  custom: string;
}

export interface PackSummary {
  id: string;
  title: string;
  custom: boolean;
}

export interface SavePackInput {
  pack: unknown;
  /** file name -> base64 mp3, e.g. { "c-forbidden-normal.mp3": "SUQz..." } */
  audio?: Record<string, string>;
  plan?: string;
}

const MAX_AUDIO_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PLAN_CHARS = 200_000;

export class PackStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

/** An mp3 starts with an ID3 tag or an MPEG frame sync. Anything else (an image, say) is refused. */
function looksLikeMp3(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  if (bytes.subarray(0, 3).toString("latin1") === "ID3") return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/**
 * Lesson files are served the way the report is: at an unguessable
 * link, /packs/<id>/<token>. Knowing a lesson's id (the student does —
 * it's in the room state) is not enough to read it. Not real security,
 * and not meant to be — no accounts, so the student's install stays two
 * clicks — but it closes walking the id space. The token goes only to
 * the teacher: in the save response, and in her teacher-only "lesson"
 * message. Tokens persist in the relay's own directory.
 */
function createTokenStore(path: string) {
  let tokens: Record<string, string> | null = null;
  function all(): Record<string, string> {
    tokens ??= existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, string>) : {};
    return tokens;
  }
  return {
    /** The lesson's token, created on first use. */
    tokenFor(id: string): string {
      const t = all();
      if (!t[id]) {
        t[id] = randomBytes(12).toString("base64url").slice(0, 16);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, JSON.stringify(t, null, 2), "utf8");
      }
      return t[id];
    },
    matches(id: string, token: string): boolean {
      const expected = all()[id];
      if (!expected || expected.length !== token.length) return false;
      return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
    },
  };
}

export function createPackStore(dirs: PackDirs) {
  const cache = new Map<string, LessonPack>();
  // A leading dot: no pack id can start with one, so no lesson can ever overwrite it.
  const tokens = createTokenStore(join(dirs.custom, ".tokens.json"));

  function customJson(id: string) {
    return join(dirs.custom, `${id}.json`);
  }
  function customDir(id: string) {
    return join(dirs.custom, id);
  }
  function assertId(id: string) {
    if (!PACK_ID_RE.test(id)) throw new PackStoreError(`"${id}" is not a pack id`, 400);
  }

  function isBundled(id: string): boolean {
    return existsSync(join(dirs.bundled, `${id}.json`));
  }

  /** Normalised, validated pack. Throws PackStoreError(404) if missing, (422) if invalid. */
  function load(id: string): LessonPack {
    assertId(id);
    const cached = cache.get(id);
    if (cached) return cached;

    const path = existsSync(customJson(id)) ? customJson(id) : join(dirs.bundled, `${id}.json`);
    if (!existsSync(path)) throw new PackStoreError(`pack "${id}" not found`, 404);
    let pack: LessonPack;
    try {
      pack = loadValidPack(JSON.parse(readFileSync(path, "utf8")));
    } catch (err) {
      if (err instanceof PackValidationError) throw new PackStoreError(`pack "${id}" is invalid`, 422, err.problems);
      throw new PackStoreError(`pack "${id}" could not be read`, 422, [String(err)]);
    }
    if (pack.id !== id) throw new PackStoreError(`pack file "${id}" contains pack "${pack.id}"`, 422);
    cache.set(id, pack);
    return pack;
  }

  /** Validates, then writes the pack, its audio and its plan. Nothing is written unless all of it is acceptable. */
  function save(input: SavePackInput): LessonPack {
    let pack: LessonPack;
    try {
      pack = loadValidPack(input.pack);
    } catch (err) {
      if (err instanceof PackValidationError) throw new PackStoreError("The pack is invalid", 422, err.problems);
      throw new PackStoreError(err instanceof Error ? err.message : "The pack is invalid", 422);
    }
    if (isBundled(pack.id)) throw new PackStoreError(`"${pack.id}" is a pack shipped with the extension and cannot be replaced`, 409);

    const audio = new Map<string, Buffer>();
    for (const [file, b64] of Object.entries(input.audio ?? {})) {
      if (!isValidGeneratedAudioFile(file)) throw new PackStoreError(`"${file}" is not an allowed audio file name`, 400);
      if (typeof b64 !== "string") throw new PackStoreError(`audio "${file}" must be base64 text`, 400);
      const bytes = Buffer.from(b64, "base64");
      if (bytes.length > MAX_AUDIO_FILE_BYTES) throw new PackStoreError(`audio "${file}" is too large`, 413);
      if (!looksLikeMp3(bytes)) throw new PackStoreError(`audio "${file}" is not an mp3`, 415);
      audio.set(file, bytes);
    }

    // Every generated audio path the pack refers to must exist once this save completes.
    const prefix = `/packs/${pack.id}/audio/`;
    for (const card of pack.cards) {
      for (const path of card.audio ? [card.audio.normal, card.audio.slow] : []) {
        if (!path.startsWith(prefix)) continue;
        const file = path.slice(prefix.length);
        if (!audio.has(file) && !existsSync(join(customDir(pack.id), "audio", file))) {
          throw new PackStoreError(`card "${card.id}" refers to audio "${file}" that was not provided`, 422);
        }
      }
    }

    if (input.plan !== undefined && (typeof input.plan !== "string" || input.plan.length > MAX_PLAN_CHARS)) {
      throw new PackStoreError("The plan must be text", 400);
    }

    mkdirSync(join(customDir(pack.id), "audio"), { recursive: true });
    for (const [file, bytes] of audio) writeFileSync(join(customDir(pack.id), "audio", file), bytes);
    if (input.plan !== undefined) writeFileSync(join(customDir(pack.id), "plan.md"), input.plan, "utf8");
    writeFileSync(customJson(pack.id), JSON.stringify(pack, null, 2), "utf8");
    cache.set(pack.id, pack);
    tokens.tokenFor(pack.id); // generated when the pack is saved
    return pack;
  }

  /** The lesson's unguessable link. Teacher only. */
  function linkFor(id: string): string {
    load(id); // only for a lesson that exists and is valid
    return `/packs/${id}/${tokens.tokenFor(id)}`;
  }

  /** The lesson, if the token is its token; otherwise throws 404, the same as a lesson that doesn't exist. */
  function loadWithToken(id: string, token: string): LessonPack {
    if (!PACK_ID_RE.test(id) || !tokens.matches(id, token)) throw new PackStoreError("not found", 404);
    return load(id);
  }

  function list(): PackSummary[] {
    const out: PackSummary[] = [];
    for (const [dir, custom] of [[dirs.bundled, false], [dirs.custom, true]] as const) {
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json") || file.startsWith(".")) continue;
        const id = file.slice(0, -".json".length);
        try {
          const pack = load(id);
          out.push({ id, title: pack.title, custom });
        } catch {
          /* an invalid pack is not offered */
        }
      }
    }
    return out;
  }

  /** Absolute path of a generated audio file, or null. Never anything outside the pack's audio directory. */
  function audioFile(id: string, file: string): string | null {
    if (!PACK_ID_RE.test(id) || !isValidGeneratedAudioFile(file)) return null;
    const path = join(customDir(id), "audio", file);
    return existsSync(path) ? path : null;
  }

  function plan(id: string): string | null {
    if (!PACK_ID_RE.test(id)) return null;
    const path = join(customDir(id), "plan.md");
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  return { load, save, list, audioFile, plan, linkFor, loadWithToken, tokenMatches: tokens.matches };
}

export type PackStore = ReturnType<typeof createPackStore>;
