import type { LessonEvent, LessonPack } from "@realia/shared";

export interface ReportInput {
  code: string;
  events: LessonEvent[];
  pack: LessonPack;
}

interface RelationStat {
  relation: string;
  attempts: number;
  errorRate: number;
}

interface RescuedWord {
  word: string;
  stage: 2 | 3;
}

export interface SeedData {
  code: string;
  generatedAt: number;
  weakestRelations: RelationStat[];
  rescuedWords: RescuedWord[];
}

interface Analysis {
  date: string;
  durationMinutes: number | null;
  itemsAttempted: number;
  relationStats: RelationStat[];
  rescuedWords: RescuedWord[];
  hesitation: Array<{ itemIndex: number; prompt: string; ms: number }>;
  toReview: string[];
}

function analyze(input: ReportInput): Analysis {
  const { events, pack } = input;
  const zoneRelation = new Map(pack.zones.map((z) => [z.id, z.relation]));
  const cardWord = new Map(pack.cards.map((c) => [c.id, c.word]));
  const itemPrompt = new Map(pack.items.map((it, i) => [i, it.prompt]));

  const start = events.find((e) => e.type === "session" && e.phase === "start");
  const end = [...events].reverse().find((e) => e.type === "session" && e.phase === "end");
  const lastT = events.length ? events[events.length - 1].t : Date.now();

  const date = new Date(start?.t ?? lastT).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const durationMinutes =
    start && end ? Math.max(0, Math.round((end.t - start.t) / 60000)) : null;

  const shownItems = new Set<number>();
  let currentItem = -1;
  const firstDropMsByItem = new Map<number, number>();

  const byRelation = new Map<string, { attempts: number; correct: number }>();
  const maxRevealStageByCard = new Map<string, 1 | 2 | 3>();

  for (const e of events) {
    if (e.type === "item") {
      currentItem = e.index;
      shownItems.add(e.index);
    } else if (e.type === "drop") {
      if (currentItem >= 0 && !firstDropMsByItem.has(currentItem)) {
        firstDropMsByItem.set(currentItem, e.msSinceItemStart);
      }
      const relation = zoneRelation.get(e.zoneId) ?? (e.zoneId || "(no zone)");
      const bucket = byRelation.get(relation) ?? { attempts: 0, correct: 0 };
      bucket.attempts += 1;
      if (e.correct) bucket.correct += 1;
      byRelation.set(relation, bucket);
    } else if (e.type === "reveal") {
      const prev = maxRevealStageByCard.get(e.cardId) ?? 0;
      if (e.stage > prev) maxRevealStageByCard.set(e.cardId, e.stage);
    }
  }

  const relationStats: RelationStat[] = [...byRelation.entries()]
    .map(([relation, s]) => ({
      relation,
      attempts: s.attempts,
      errorRate: s.attempts ? 1 - s.correct / s.attempts : 0,
    }))
    .sort((a, b) => b.errorRate - a.errorRate);

  const rescuedWords: RescuedWord[] = [...maxRevealStageByCard.entries()]
    .filter((entry): entry is [string, 2 | 3] => entry[1] >= 2)
    .map(([cardId, stage]) => ({ word: cardWord.get(cardId) ?? cardId, stage }));

  const hesitation = [...firstDropMsByItem.entries()]
    .map(([itemIndex, ms]) => ({ itemIndex, prompt: itemPrompt.get(itemIndex) ?? "", ms }))
    .sort((a, b) => a.itemIndex - b.itemIndex);

  const toReview = relationStats
    .filter((r) => r.errorRate > 0)
    .slice(0, 3)
    .map((r) => r.relation);

  return {
    date,
    durationMinutes,
    itemsAttempted: shownItems.size,
    relationStats,
    rescuedWords,
    hesitation,
    toReview,
  };
}

export function buildSeed(input: ReportInput): SeedData {
  const a = analyze(input);
  return {
    code: input.code,
    generatedAt: Date.now(),
    weakestRelations: a.relationStats,
    rescuedWords: a.rescuedWords,
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function reviewSentence(toReview: string[]): string {
  if (toReview.length === 0) return "Nothing stands out to review — every relation held up.";
  if (toReview.length === 1) return `Next week, review: ${toReview[0]}.`;
  const last = toReview[toReview.length - 1];
  const rest = toReview.slice(0, -1).join(", ");
  return `Next week, review: ${rest} and ${last}.`;
}

/**
 * A single self-contained HTML page — inline CSS, no external
 * requests, no login, no charts, no dashboard (docs/PRD.md, "8. The
 * report"). Readable in under thirty seconds.
 */
export function renderReport(input: ReportInput): string {
  const a = analyze(input);

  const relationsRows = a.relationStats
    .map(
      (r) =>
        `<li><strong>${esc(r.relation)}</strong> — ${Math.round(r.errorRate * 100)}% missed (${r.attempts} attempt${r.attempts === 1 ? "" : "s"})</li>`,
    )
    .join("\n");

  const wordsRows = a.rescuedWords.length
    ? a.rescuedWords
        .map((w) => `<li><strong>${esc(w.word)}</strong> — needed the ${w.stage === 3 ? "translation" : "picture"}</li>`)
        .join("\n")
    : "<li>No word needed more than the audio.</li>";

  const hesitationRows = a.hesitation
    .map(
      (h) =>
        `<li>Item ${h.itemIndex + 1} (${esc(h.prompt)}) — ${(h.ms / 1000).toFixed(1)}s to first attempt</li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lesson report — ${esc(a.date)}</title>
<style>
  body {
    margin: 0;
    padding: 24px 16px 48px;
    max-width: 640px;
    margin-inline: auto;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a;
    background: #fff;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; margin: 28px 0 8px; }
  .review {
    font-size: 18px;
    font-weight: 600;
    background: #f3f0ff;
    border-radius: 10px;
    padding: 14px 16px;
    margin: 16px 0;
  }
  ul { margin: 0; padding-left: 20px; }
  li { margin: 4px 0; }
  .note { color: #888; font-size: 14px; }
</style>
</head>
<body>
  <h1>Lesson report</h1>
  <div class="meta">${esc(a.date)} · ${a.durationMinutes !== null ? `${a.durationMinutes} min` : "in progress"} · ${a.itemsAttempted} item${a.itemsAttempted === 1 ? "" : "s"} attempted</div>

  <div class="review">${esc(reviewSentence(a.toReview))}</div>

  <h2>Relations, worst first</h2>
  <ul>${relationsRows || "<li>No drops recorded.</li>"}</ul>

  <h2>Words that needed more than the audio</h2>
  <ul>${wordsRows}</ul>

  <h2>Time to first attempt</h2>
  <ul>${hesitationRows || "<li>No drops recorded.</li>"}</ul>

  <h2>Who talked</h2>
  <p class="note">Not available yet — this needs lesson recording and transcription, which ships with the next build.</p>
</body>
</html>
`;
}
