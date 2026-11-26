import { teacherLesson, type LessonPack } from "@realia/shared";
import { setSelectedPackId } from "../content/pack";
import { recordCardAudio, regenerateActivity, savePack, type DraftLesson, type LessonBrief } from "./api";
import { renderServiceError } from "./errors";
import { renderMarkdown } from "./markdown";
import { compilePaste, lineForPicker, pickAnswer, unansweredGaps, type PasteDraft } from "./pasteDoor";
import { renderStagePreview } from "./preview";

// The one approval screen (docs/PRD.md, "11. The approval screen"),
// extended for the generalised packs: every activity laid out as it
// will appear, the teaching plan, and the answer key — the teacher
// sees the key before the lesson, not during it. Approve, regenerate
// one activity, or discard. No free-text editing.
//
// It reviews both kinds of draft: one the model generated, and one the
// teacher pasted (docs/PRD.md, "16. The paste door"). A pasted draft
// has no plan and no regenerate (there is no model), and if she marked
// no answers, this is where she picks them — one tap per gap.

export type Review =
  | { origin: "generated"; draft: DraftLesson; brief: LessonBrief }
  | { origin: "pasted"; paste: PasteDraft; packId: string; translationLang: string };

export interface ApprovalHandlers {
  onApproved: (result: { pack: LessonPack; voiced: number; silent: number; reason?: string }) => void;
  onDiscard: () => void;
}

const KIND_NAMES: Record<string, string> = { place: "Place", sort: "Sort", gap: "Gaps", match: "Match", infogap: "Info gap" };

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** The answers the relay will accept for one activity — the same key the teacher panel gets, built by the same function. */
function answerKey(pack: LessonPack, itemIndex: number): HTMLElement {
  const item = teacherLesson(pack).items[itemIndex];
  const list = h("ul", "co-key-list");
  for (const line of item.key) list.appendChild(h("li", "", line));
  if (item.wrong.length) list.appendChild(h("li", "co-key-wrong", `wrong everywhere: ${item.wrong.join(", ")}`));
  return list;
}

/** "Not an error" notes: a gap that takes more than one answer, an answer that fits more than one gap. */
function multiAnswerNotes(pack: LessonPack, itemIndex: number): string[] {
  const item = pack.items[itemIndex];
  const label = new Map(pack.draggables.map((d) => [d.id, d.label]));
  const zone = new Map(pack.zones.map((z) => [z.id, z.label]));
  const byZone = new Map<string, Set<string>>();
  const byLabel = new Map<string, Set<string>>();
  for (const p of item.pairs) {
    const l = label.get(p.objectId) ?? p.objectId;
    const z = zone.get(p.zoneId) ?? p.zoneId;
    byZone.set(z, (byZone.get(z) ?? new Set()).add(l));
    byLabel.set(l, (byLabel.get(l) ?? new Set()).add(z));
  }
  const gap = (z: string) => (item.kind === "gap" ? `[${z}]` : `“${z}”`);
  const notes: string[] = [];
  for (const [z, ls] of byZone) if (ls.size > 1) notes.push(`${gap(z)} accepts ${[...ls].join(" or ")}.`);
  for (const [l, zs] of byLabel) if (zs.size > 1) notes.push(`“${l}” is right in ${[...zs].map(gap).join(" and ")}.`);
  return notes;
}

export function mountApprovalScreen(root: HTMLElement, review: Review, audioAvailable: boolean, handlers: ApprovalHandlers): void {
  const generated = review.origin === "generated" ? review : null;
  let paste = review.origin === "pasted" ? review.paste : null;
  const asksForAnswers = paste ? unansweredGaps(paste).length > 0 : false;
  let pack: LessonPack | null = generated ? generated.draft.pack : null;
  let compileErrors: string[] = [];
  let busy = false;

  function recompile() {
    if (review.origin !== "pasted" || !paste) return;
    if (unansweredGaps(paste).length > 0) {
      pack = null;
      compileErrors = [];
      return;
    }
    const result = compilePaste(paste, { packId: review.packId, translationLang: review.translationLang });
    pack = result.ok ? result.pack : null;
    compileErrors = result.ok ? [] : result.errors;
  }

  function renderPicker(draft: PasteDraft): HTMLElement {
    const section = h("section", "co-picker");
    const left = unansweredGaps(draft).length;
    section.append(
      h("h3", "", "Pick each gap's answer"),
      h("p", "co-draft-hint", left ? `${left} gap(s) left. One tap per gap; tap another word to change it. Nothing is guessed for you.` : "Every gap has its answer. Tap another word to change one."),
    );
    draft.lines.forEach((line, li) => {
      const row = h("div", "co-picker-line");
      const sentence = h("p", "co-picker-sentence");
      for (const part of lineForPicker(line, draft.bank)) {
        if (typeof part === "string") sentence.appendChild(document.createTextNode(part));
        else sentence.appendChild(h("span", part.answer ? "co-picker-gap co-filled" : "co-picker-gap", part.answer ?? `(${part.gap + 1})`));
      }
      row.appendChild(sentence);
      line.gaps.forEach((g, gi) => {
        const choices = h("div", "co-picker-choices");
        if (line.gaps.length > 1) choices.appendChild(h("span", "co-picker-label", `(${gi + 1})`));
        for (const entry of draft.bank) {
          const chosen = g.answers?.[0] === entry.key;
          const b = h("button", chosen ? "co-chip co-chosen" : "co-chip", entry.text);
          b.addEventListener("click", () => {
            paste = pickAnswer(paste!, li, gi, entry.key);
            recompile();
            render();
          });
          choices.appendChild(b);
        }
        row.appendChild(choices);
      });
      section.appendChild(row);
    });
    return section;
  }

  function render() {
    root.replaceChildren();

    if (generated) {
      root.append(h("h2", "", `Review: ${generated.draft.pack.title}`), h("p", "co-approval-summary", generated.draft.summary));
    } else {
      root.append(
        h("h2", "", "Review: pasted exercise"),
        h("p", "co-approval-summary", "Your sentences exactly as pasted, one gap activity per sentence. No model was used."),
      );
    }

    if (paste && asksForAnswers) root.appendChild(renderPicker(paste));
    if (compileErrors.length) {
      const box = h("div", "co-error");
      box.appendChild(h("p", "", "This can't be loaded yet:"));
      const list = h("ul");
      for (const e of compileErrors) list.appendChild(h("li", "", e));
      box.appendChild(list);
      root.appendChild(box);
    }

    if (pack) {
      const newWords = pack.cards.filter((c) => c.audio === null);
      if (newWords.length > 0) {
        root.append(
          h(
            "p",
            audioAvailable ? "co-note" : "co-note co-warn",
            audioAvailable
              ? `When you approve, ${newWords.length} new word(s) will be recorded with ElevenLabs (normal and slow): ${newWords.map((c) => c.word).join(", ")}.`
              : `No ElevenLabs key on the service: ${newWords.map((c) => c.word).join(", ")} will be silent, marked 🔇 on the card. No robot voice is used instead.`,
          ),
        );
      }

      if (generated && generated.draft.teachNormally.length > 0) {
        const section = h("section", "co-teach-normally");
        section.append(h("h3", "", "Taught normally — no objects"));
        const list = h("ul");
        for (const t of generated.draft.teachNormally) {
          const li = h("li");
          li.append(h("strong", "", t.exercise), document.createTextNode(` — ${t.why}`));
          list.appendChild(li);
        }
        section.appendChild(list);
        root.appendChild(section);
      }

      const current = pack;
      root.append(h("h3", "", `Activities (${current.items.length})`));
      current.items.forEach((item, i) => {
        const card = h("article", "co-activity");
        const head = h("div", "co-activity-head");
        head.append(
          h("span", "co-activity-num", String(i + 1)),
          h("span", `co-kind co-kind-${item.kind}`, KIND_NAMES[item.kind] ?? item.kind),
          h("span", "co-activity-source", item.source ?? ""),
        );
        if (generated) {
          const regen = h("button", "co-draft-btn co-small", "Regenerate this activity");
          regen.disabled = busy;
          regen.addEventListener("click", () => void regenerate(item.id, regen));
          head.appendChild(regen);
        }

        card.append(head, h("p", "co-activity-prompt", item.prompt), renderStagePreview(current, i));
        const key = h("div", "co-activity-key");
        key.append(h("span", "co-key-title", "Answer key"), answerKey(current, i));
        for (const note of multiAnswerNotes(current, i)) key.appendChild(h("p", "co-activity-feedback", `Not an error: ${note}`));
        if (item.feedback) key.appendChild(h("p", "co-activity-feedback", `On a correct drop: “${item.feedback}”`));
        card.appendChild(key);
        root.appendChild(card);
      });
    }

    if (generated) {
      const planSection = h("details", "co-plan");
      planSection.open = true;
      const planSummary = h("summary", "", "Teaching plan");
      const copy = h("button", "co-draft-btn co-small", "Copy plan");
      copy.addEventListener("click", async (e) => {
        e.preventDefault();
        await navigator.clipboard.writeText(generated.draft.plan);
        copy.textContent = "Copied ✓";
      });
      planSummary.appendChild(copy);
      planSection.append(planSummary, renderMarkdown(generated.draft.plan));
      root.appendChild(planSection);
    }

    const status = h("div", "co-draft-status");
    status.id = "co-approval-status";
    const actions = h("div", "co-approval-actions");
    const approve = h("button", "co-draft-btn co-draft-btn-primary", "Approve — use this lesson");
    const discard = h("button", "co-draft-btn", "Discard");
    approve.disabled = busy || !pack;
    discard.disabled = busy;
    approve.addEventListener("click", () => void approveDraft(approve, status));
    discard.addEventListener("click", () => {
      if (confirm("Discard this draft? Nothing is saved.")) handlers.onDiscard();
    });
    actions.append(approve, discard);
    root.append(status, actions);
  }

  async function regenerate(activityId: string, button: HTMLButtonElement) {
    if (!generated || !pack) return;
    busy = true;
    button.textContent = "Regenerating…";
    root.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
    try {
      pack = await regenerateActivity({ brief: generated.brief, pack, plan: generated.draft.plan, activityId });
      busy = false;
      render();
    } catch (err) {
      busy = false;
      render();
      root.querySelector("#co-approval-status")?.replaceChildren(renderServiceError("Couldn't regenerate that activity", err));
    }
  }

  async function approveDraft(button: HTMLButtonElement, status: HTMLElement) {
    if (!pack) return;
    busy = true;
    root.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
    try {
      let final = pack;
      let audio: Record<string, string> = {};
      let voiced = 0;
      let silent = 0;
      let reason: string | undefined;
      // New words are recorded at approval, for every door. A pack with none (a pasted exercise) needs no service at all.
      const newWords = pack.cards.filter((c) => c.audio === null).length;
      if (newWords > 0) {
        status.replaceChildren(audioAvailable ? `Recording ${newWords} word(s) with ElevenLabs…` : "Saving…");
        button.textContent = "Saving…";
        const recorded = await recordCardAudio(pack);
        ({ pack: final, audio, reason } = recorded);
        voiced = recorded.voiced.length;
        silent = recorded.silent.length;
      }
      status.replaceChildren("Saving the lesson…");
      await savePack(final, audio, generated?.draft.plan);
      await setSelectedPackId(final.id);
      handlers.onApproved({ pack: final, voiced, silent, reason });
    } catch (err) {
      busy = false;
      render();
      root.querySelector("#co-approval-status")?.replaceChildren(renderServiceError("Couldn't save the lesson", err));
    }
  }

  recompile();
  render();
}
