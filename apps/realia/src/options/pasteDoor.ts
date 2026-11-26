import { normalizePack, validatePack, type LessonPack, type PackItem } from "@realia/shared";

// The paste door (docs/PRD.md, "16. The paste door"): the teacher's own
// sentences, character for character, compiled straight to gap items.
// No model, no network: everything here is a pure function of the
// pasted text and the teacher's taps. Strict throughout — anything that
// doesn't parse is named by line and nothing is loaded; no answer is
// ever inferred.
//
//   1. You ___ take a calculator into the exam.
//   2. You [shouldn't] take a calculator.        <- answer marked in brackets
//   3. You [should | ought to] take regular breaks.  <- a gap with two answers
//   ---
//   shouldn't | 'd better | ought to | should | must to | don't must

const MAX_CHIPS = 8; // the per-item cap from section 12
const MIN_WRONG = 2; // a gap item needs at least two distractors
const MAX_GAPS = 6;
const MAX_TEXT = 400;
const MAX_ENTRY = 60;
const MAX_LINES = 40;

export interface PasteGap {
  /** Normalised bank keys of the entries correct here, or null if the teacher hasn't picked yet. */
  answers: string[] | null;
}

export interface PasteLine {
  /** 1-based, as in the textarea, for error messages. */
  lineNumber: number;
  /** The sentence as pasted, leading number removed; gaps appear as `\u0000n\u0000` placeholders. */
  template: string;
  gaps: PasteGap[];
}

export interface BankEntry {
  /** Exactly as pasted (trimmed) — this is the chip's text. */
  text: string;
  /** For matching only: case, curly quotes and spacing ignored. */
  key: string;
}

export interface PasteDraft {
  lines: PasteLine[];
  bank: BankEntry[];
}

export type ParseResult = { ok: true; draft: PasteDraft } | { ok: false; errors: string[] };
export type CompileResult = { ok: true; pack: LessonPack } | { ok: false; errors: string[] };

/** Matching key: ’ and ' are the same apostrophe, "Should" is "should". The chip keeps what was typed. */
export function bankKey(text: string): string {
  return text.trim().replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").toLowerCase();
}

const GAP_RE = /_{3,}|\[([^\]]*)\]/g;
const LEADING_NUMBER_RE = /^\s*\d+\s*[.)]?\s+/;
const SEPARATOR_RE = /^\s*-{3,}\s*$/;

export function parsePaste(input: string): ParseResult {
  const errors: string[] = [];
  const rows = input.replace(/\r\n?/g, "\n").split("\n");
  const separators = rows.map((r, i) => (SEPARATOR_RE.test(r) ? i : -1)).filter((i) => i >= 0);
  if (separators.length === 0) {
    return { ok: false, errors: ["There's no --- line. Put the word bank below a line of three dashes."] };
  }
  for (const extra of separators.slice(1)) {
    errors.push(`Line ${extra + 1}: a second --- line. Use exactly one, between the sentences and the word bank.`);
  }
  const sep = separators[0];

  // --- The word bank. ---
  const bank: BankEntry[] = [];
  for (let i = sep + 1; i < rows.length; i++) {
    if (!rows[i].trim() || separators.includes(i)) continue;
    for (const raw of rows[i].split("|")) {
      const text = raw.trim();
      if (!text) {
        errors.push(`Line ${i + 1}: an empty entry in the word bank (two | with nothing between, or a | at the end).`);
        continue;
      }
      if (text.length > MAX_ENTRY) errors.push(`Line ${i + 1}: "${text.slice(0, 30)}…" is too long for a chip (at most ${MAX_ENTRY} characters).`);
      const key = bankKey(text);
      if (bank.some((b) => b.key === key)) errors.push(`Line ${i + 1}: "${text}" is in the word bank twice.`);
      else bank.push({ text, key });
    }
  }
  if (bank.length === 0) errors.push(`The word bank below the --- line (line ${sep + 1}) is empty.`);

  // --- The sentences. ---
  const lines: PasteLine[] = [];
  for (let i = 0; i < sep; i++) {
    const row = rows[i];
    if (!row.trim()) continue;
    const lineNumber = i + 1;
    const text = row.replace(LEADING_NUMBER_RE, "").trimEnd();
    const gaps: PasteGap[] = [];
    let template = "";
    let last = 0;
    let lineOk = true;
    for (const m of text.matchAll(GAP_RE)) {
      template += text.slice(last, m.index) + `\u0000${gaps.length + 1}\u0000`;
      last = m.index! + m[0].length;
      if (m[0].startsWith("[")) {
        const answers = m[1].split("|").map((a) => a.trim()).filter(Boolean);
        if (answers.length === 0) {
          errors.push(`Line ${lineNumber}: an empty [ ] — write the answer inside it, or use ___ for a gap.`);
          lineOk = false;
          continue;
        }
        const keys: string[] = [];
        for (const a of answers) {
          if (!bank.some((b) => b.key === bankKey(a))) {
            errors.push(`Line ${lineNumber}: "${a}" isn't in the word bank. Every answer has to be one of the chips.`);
            lineOk = false;
          }
          keys.push(bankKey(a));
        }
        gaps.push({ answers: keys });
      } else {
        gaps.push({ answers: null });
      }
    }
    template += text.slice(last);
    if (/[[\]]/.test(template)) {
      errors.push(`Line ${lineNumber}: a [ without its ] (or the other way round).`);
      lineOk = false;
    }
    if (gaps.length === 0) {
      errors.push(`Line ${lineNumber} has no gap. Mark each gap with ___ (three or more underscores) or with the answer in [brackets].`);
      continue;
    }
    if (gaps.length > MAX_GAPS) errors.push(`Line ${lineNumber} has ${gaps.length} gaps; at most ${MAX_GAPS} per sentence.`);
    if (displayText(template).length > MAX_TEXT) errors.push(`Line ${lineNumber} is too long (at most ${MAX_TEXT} characters).`);
    if (lineOk) lines.push({ lineNumber, template, gaps });
  }
  if (lines.length === 0 && !errors.some((e) => e.includes("has no gap"))) {
    errors.push("There are no sentences above the --- line.");
  }
  if (lines.length > MAX_LINES) errors.push(`At most ${MAX_LINES} sentences at once.`);

  // Brackets are all or nothing: never guess which unmarked gap means what.
  const marked = lines.flatMap((l) => l.gaps).filter((g) => g.answers !== null).length;
  const total = lines.flatMap((l) => l.gaps).length;
  if (marked > 0 && marked < total) {
    for (const l of lines) {
      l.gaps.forEach((g, k) => {
        if (g.answers === null) {
          errors.push(`Line ${l.lineNumber}: gap ${k + 1} has no answer in [brackets]. Mark every gap's answer, or none and pick them on the next screen.`);
        }
      });
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, draft: { lines, bank } };
}

/** The sentence with gap n shown as the marker [n] — the gap item's displayed text. */
function displayText(template: string): string {
  return template.replace(/\u0000(\d+)\u0000/g, "[$1]");
}

/** Gaps still waiting for the teacher's pick (only when nothing was bracketed). */
export function unansweredGaps(draft: PasteDraft): Array<{ line: number; gap: number }> {
  const out: Array<{ line: number; gap: number }> = [];
  draft.lines.forEach((l, line) => l.gaps.forEach((g, gap) => g.answers === null && out.push({ line, gap })));
  return out;
}

/** One tap on the review screen: this bank entry is the answer to that gap. Returns a new draft. */
export function pickAnswer(draft: PasteDraft, line: number, gap: number, key: string): PasteDraft {
  return {
    ...draft,
    lines: draft.lines.map((l, i) =>
      i !== line ? l : { ...l, gaps: l.gaps.map((g, k) => (k === gap ? { answers: [key] } : g)) },
    ),
  };
}

/** The sentence for the picker, with each gap as ___ or its chosen answer. */
export function lineForPicker(line: PasteLine, bank: BankEntry[]): Array<string | { gap: number; answer: string | null }> {
  const parts: Array<string | { gap: number; answer: string | null }> = [];
  line.template.split("\u0000").forEach((piece, i) => {
    if (i % 2 === 0) {
      if (piece) parts.push(piece);
      return;
    }
    const gap = Number(piece) - 1;
    const key = line.gaps[gap].answers?.[0];
    parts.push({ gap, answer: key ? (bank.find((b) => b.key === key)?.text ?? null) : null });
  });
  return parts;
}

/**
 * Compiles a fully answered draft to a pack of gap items. Per sentence:
 * a zone per gap (labelled "1", "2"…), a chip per answer occurrence (an
 * entry that fills two gaps of one sentence needs two chips), and as
 * distractors the bank entries wrong for every gap of that sentence —
 * entries that fit no gap anywhere first — up to the 8-chip cap.
 */
export function compilePaste(draft: PasteDraft, opts: { packId: string; translationLang: string }): CompileResult {
  const errors: string[] = [];
  if (unansweredGaps(draft).length) return { ok: false, errors: ["Pick an answer for every gap first."] };

  const bankIndex = new Map(draft.bank.map((b, i) => [b.key, i]));
  const usedAnywhere = new Set(draft.lines.flatMap((l) => l.gaps.flatMap((g) => g.answers ?? [])));
  // Entries that fit no gap at all are the bank's designed wrong answers: they go in first.
  const wrongOrder = [
    ...draft.bank.filter((b) => !usedAnywhere.has(b.key)),
    ...draft.bank.filter((b) => usedAnywhere.has(b.key)),
  ];

  const draggables = new Map<string, { id: string; label: string }>();
  const chip = (entryIndex: number, copy: number) => {
    const id = copy === 1 ? `w${entryIndex + 1}` : `w${entryIndex + 1}-${copy}`;
    if (!draggables.has(id)) draggables.set(id, { id, label: draft.bank[entryIndex].text });
    return id;
  };

  const zones: { id: string; label: string }[] = [];
  const items: PackItem[] = [];
  draft.lines.forEach((line, li) => {
    const itemId = `p${li + 1}`;
    const pairs: PackItem["pairs"] = [];
    const gapsFor = new Map<string, number[]>(); // entry key -> gap numbers it fits in this sentence
    line.gaps.forEach((g, k) => {
      zones.push({ id: `${itemId}-g${k + 1}`, label: String(k + 1) });
      for (const key of g.answers!) gapsFor.set(key, [...(gapsFor.get(key) ?? []), k]);
    });
    let answerChips = 0;
    for (const [key, gaps] of gapsFor) {
      // One chip per gap this entry can fill, each allowed in every one of those gaps.
      for (let copy = 1; copy <= gaps.length; copy++) {
        const id = chip(bankIndex.get(key)!, copy);
        answerChips += 1;
        for (const k of gaps) pairs.push({ objectId: id, zoneId: `${itemId}-g${k + 1}` });
      }
    }
    const room = MAX_CHIPS - answerChips;
    const wrong = wrongOrder.filter((b) => !gapsFor.has(b.key)).slice(0, Math.max(0, room));
    if (answerChips > MAX_CHIPS) {
      errors.push(`Line ${line.lineNumber} needs ${answerChips} chips for its answers; at most ${MAX_CHIPS} fit.`);
    } else if (wrong.length < MIN_WRONG) {
      errors.push(
        `Line ${line.lineNumber} needs at least ${MIN_WRONG} entries in the word bank that are wrong for every one of its gaps — otherwise the last gap is solved by counting. Add wrong answers to the bank.`,
      );
    }
    items.push({
      id: itemId,
      kind: "gap",
      prompt: displayText(line.template),
      pairs,
      distractors: wrong.map((b) => chip(bankIndex.get(b.key)!, 1)),
      source: `line ${line.lineNumber}`,
    });
  });
  if (errors.length) return { ok: false, errors };

  const first = displayText(draft.lines[0].template).replace(/\[\d+\]/g, "___");
  const pack = normalizePack({
    id: opts.packId,
    title: `Pasted: ${first.length > 60 ? `${first.slice(0, 57)}…` : first}`,
    translationLang: opts.translationLang || "none",
    scenery: [],
    draggables: [...draggables.values()],
    zones,
    backdrops: {},
    sentenceTemplate: "",
    cards: [],
    items,
  });
  const problems = validatePack(pack);
  return problems.length ? { ok: false, errors: problems } : { ok: true, pack };
}

/** lesson-20261126-x7k2qa — the same shape of id the generator gives a draft. */
export function newPastePackId(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `lesson-${date}-${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}
