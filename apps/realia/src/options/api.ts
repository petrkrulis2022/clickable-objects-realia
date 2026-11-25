import { loadValidPack, type LessonPack } from "@realia/shared";
import { RELAY_HTTP_URL } from "../content/pack";

// The options page's only two services. Keys live on them, never here:
// this page sends photos and the brief to meeting-assist, and an
// approved pack to the relay — nothing goes anywhere else.
export const ASSIST_URL = "http://localhost:8790";

export type Door = "coursebook" | "last-lesson" | "scratch";

export interface LessonBrief {
  door: Door;
  lengthMinutes: number;
  format: "one-to-one" | "group";
  level: string;
  firstLanguage: string;
  doneAndNew: string;
  focus?: string;
}

export interface RawMaterial {
  kind: "text" | "pdf" | "docx" | "audio" | "image";
  filename: string;
  text?: string;
  base64?: string;
  mediaType?: string;
}

export interface TeachNormally {
  exercise: string;
  why: string;
}

export interface DraftLesson {
  pack: LessonPack;
  plan: string;
  summary: string;
  teachNormally: TeachNormally[];
  attempts: number;
}

/** A failed request, with the details the teacher should see (validation problems, the model's raw output). */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
    readonly raw = "",
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    const service = url.startsWith(ASSIST_URL) ? "meeting-assist (pnpm dev:meeting-assist)" : "the relay (pnpm dev:relay)";
    throw new ServiceError(`Couldn't reach ${service} — is it running?`);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; problems?: string[]; raw?: string };
  if (!res.ok) throw new ServiceError(body.error ?? `Request failed (${res.status})`, body.problems ?? [], body.raw ?? "");
  return body as T;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return call<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function assistStatus() {
  return call<{ anthropic: boolean; elevenLabs: boolean; model: string }>(`${ASSIST_URL}/status`);
}

export async function draftLesson(body: {
  brief: LessonBrief;
  materials: RawMaterial[];
  referencePack?: LessonPack;
  lastLesson?: unknown;
}): Promise<DraftLesson> {
  const { draft } = await postJson<{ draft: DraftLesson }>(`${ASSIST_URL}/plan/draft`, { product: "realia", ...body });
  // Validated by the service; validated again here — never show or load an invalid pack.
  return { ...draft, pack: loadValidPack(draft.pack) };
}

export async function regenerateActivity(body: { brief: LessonBrief; pack: LessonPack; plan: string; activityId: string }): Promise<LessonPack> {
  const { draft } = await postJson<{ draft: { pack: LessonPack } }>(`${ASSIST_URL}/plan/draft`, {
    product: "realia",
    mode: "regenerate",
    ...body,
  });
  return loadValidPack(draft.pack);
}

export interface RecordedAudio {
  pack: LessonPack;
  audio: Record<string, string>;
  voiced: string[];
  silent: string[];
  reason?: string;
}

/** At approval: record every new word (normal and slow) with ElevenLabs, once. */
export function recordCardAudio(pack: LessonPack): Promise<RecordedAudio> {
  return postJson<RecordedAudio>(`${ASSIST_URL}/plan/audio`, { pack });
}

export function savePack(pack: LessonPack, audio: Record<string, string>, plan: string) {
  return postJson<{ ok: true; packId: string }>(`${RELAY_HTTP_URL}/packs`, { pack, audio, plan });
}

export function listPacks() {
  return call<{ packs: { id: string; title: string; custom: boolean }[] }>(`${RELAY_HTTP_URL}/packs`);
}

export async function fetchPack(packId: string): Promise<LessonPack> {
  return loadValidPack(await call<unknown>(`${RELAY_HTTP_URL}/packs/${encodeURIComponent(packId)}`));
}

/** Last lesson's results for a pack, or null if it hasn't been played yet. */
export async function latestSeed(packId: string): Promise<unknown | null> {
  try {
    return await call<unknown>(`${RELAY_HTTP_URL}/reports/latest-seed?packId=${encodeURIComponent(packId)}`);
  } catch {
    return null;
  }
}

export async function fetchPlan(packId: string): Promise<string | null> {
  const res = await fetch(`${RELAY_HTTP_URL}/packs/${encodeURIComponent(packId)}/plan`).catch(() => null);
  return res && res.ok ? res.text() : null;
}
