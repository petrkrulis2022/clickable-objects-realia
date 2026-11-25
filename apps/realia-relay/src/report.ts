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

/** A wrong placement in a sort, gap or match — e.g. "don't have to" put under "forbidden". */
interface Mistake {
  placed: string;
  into: string;
  count: number;
}

export interface SeedData {
  code: string;
  /** The pack that was actually played — the starting point for next lesson's draft. */
  packId: string;
  generatedAt: number;
  /** Worst first. For a place lesson these are relations ("under"); otherwise "activity: target". */
  weakestRelations: RelationStat[];
  rescuedWords: RescuedWord[];
  mistakes: Mistake[];
}

interface Analysis {
  date: string;
  durationMinutes: number | null;
  itemsAttempted: number;
  relationStats: RelationStat[];
  rescuedWords: RescuedWord[];
  hesitation: Array<{ itemIndex: number; prompt: string; ms: number }>;
  toReview: string[];
  mistakes: Mistake[];
  /** Every item is the original place kind — the report reads exactly as it always has. */
  allPlace: boolean;
}

function analyze(input: ReportInput): Analysis {
  const { events, pack } = input;
  const zoneRelation = new Map(pack.zones.map((z) => [z.id, z.relation]));
  const zoneLabel = new Map(pack.zones.map((z) => [z.id, z.label]));
  const objectLabel = new Map(pack.draggables.map((d) => [d.id, d.label]));
  const cardWord = new Map(pack.cards.map((c) => [c.id, c.word]));
  const itemPrompt = new Map(pack.items.map((it, i) => [i, it.prompt]));
  const allPlace = pack.items.every((it) => it.kind === "place");
  const mistakeCounts = new Map<string, Mistake>();

  /** What a drop was aiming at: a relation for a place item, otherwise "activity: target". */
  function targetName(itemIndex: number, zoneId: string): string {
    const item = pack.items[itemIndex];
    if (!item || item.kind === "place" || !zoneId) return zoneRelation.get(zoneId) ?? (zoneId || "(no zone)");
    const activity = item.source || `activity ${itemIndex + 1}`;
    const label = zoneLabel.get(zoneId) ?? zoneId;
    return `${activity}: ${item.kind === "gap" ? `gap ${label}` : label}`;
  }

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
      const relation = targetName(currentItem, e.zoneId);
      const item = pack.items[currentItem];
      if (!e.correct && e.zoneId && item && item.kind !== "place") {
        const placed = objectLabel.get(e.objectId) ?? e.objectId;
        const into = item.kind === "gap" ? `gap ${zoneLabel.get(e.zoneId) ?? e.zoneId}` : (zoneLabel.get(e.zoneId) ?? e.zoneId);
        const key = `${placed}\u0000${into}`;
        const m = mistakeCounts.get(key) ?? { placed, into, count: 0 };
        m.count += 1;
        mistakeCounts.set(key, m);
      }
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

  const mistakes = [...mistakeCounts.values()].sort((a, b) => b.count - a.count);

  return {
    date,
    durationMinutes,
    itemsAttempted: shownItems.size,
    relationStats,
    rescuedWords,
    hesitation,
    toReview,
    mistakes,
    allPlace,
  };
}

export function buildSeed(input: ReportInput): SeedData {
  const a = analyze(input);
  return {
    code: input.code,
    packId: input.pack.id,
    generatedAt: Date.now(),
    weakestRelations: a.relationStats,
    rescuedWords: a.rescuedWords,
    mistakes: a.mistakes,
  };
}

/** A gap activity's prompt is its whole text; the report only needs enough to recognise it. */
function shorten(s: string): string {
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function reviewSentence(toReview: string[], allPlace: boolean): string {
  if (toReview.length === 0) {
    return allPlace
      ? "Nothing stands out to review — every relation held up."
      : "Nothing stands out to review — every activity held up.";
  }
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

  // Only for sort/gap/match lessons, so a place-only report reads exactly as before.
  const mistakesSection = a.mistakes.length
    ? `\n  <h2>Wrong placements</h2>\n  <ul>${a.mistakes
        .map((m) => `<li><strong>${esc(m.placed)}</strong> → ${esc(m.into)}${m.count > 1 ? ` (${m.count}×)` : ""}</li>`)
        .join("\n")}</ul>\n`
    : "";

  const wordsRows = a.rescuedWords.length
    ? a.rescuedWords
        .map((w) => `<li><strong>${esc(w.word)}</strong> — needed the ${w.stage === 3 ? "translation" : "picture"}</li>`)
        .join("\n")
    : "<li>No word needed more than the audio.</li>";

  const hesitationRows = a.hesitation
    .map(
      (h) =>
        `<li>Item ${h.itemIndex + 1} (${esc(shorten(h.prompt))}) — ${(h.ms / 1000).toFixed(1)}s to first attempt</li>`,
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

  <div class="review">${esc(reviewSentence(a.toReview, a.allPlace))}</div>

  <h2>${a.allPlace ? "Relations, worst first" : "Where answers went wrong, worst first"}</h2>
  <ul>${relationsRows || "<li>No drops recorded.</li>"}</ul>
${mistakesSection}
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
