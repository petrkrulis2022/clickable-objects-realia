import type { LessonPack } from "@realia/shared";
import { setSelectedPackId } from "../content/pack";
import { recordCardAudio, regenerateActivity, savePack, type DraftLesson, type LessonBrief } from "./api";
import { renderServiceError } from "./errors";
import { renderMarkdown } from "./markdown";
import { renderStagePreview } from "./preview";

// The one approval screen (docs/PRD.md, "11. The approval screen"),
// extended for the generalised packs: every activity laid out as it
// will appear, the teaching plan, and the answer key — the teacher
// sees the key before the lesson, not during it. Three actions:
// approve, regenerate one activity, or discard. No free-text editing.

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

/** The answers the relay will accept for one activity — read off the pack itself, so it can't disagree with what's played. */
function answerKey(pack: LessonPack, itemIndex: number): HTMLElement {
  const item = pack.items[itemIndex];
  const objectLabel = new Map(pack.draggables.map((d) => [d.id, d.label]));
  const zoneLabel = new Map(pack.zones.map((z) => [z.id, z.label]));
  const list = h("ul", "co-key-list");
  for (const p of item.pairs) {
    const zone = zoneLabel.get(p.zoneId) ?? p.zoneId;
    list.appendChild(h("li", "", `${objectLabel.get(p.objectId) ?? p.objectId} → ${item.kind === "gap" ? `[${zone}]` : zone}`));
  }
  if (item.distractors?.length) {
    list.appendChild(h("li", "co-key-wrong", `wrong everywhere: ${item.distractors.map((d) => objectLabel.get(d) ?? d).join(", ")}`));
  }
  return list;
}

export function mountApprovalScreen(
  root: HTMLElement,
  draft: DraftLesson,
  brief: LessonBrief,
  audioAvailable: boolean,
  handlers: ApprovalHandlers,
): void {
  let pack = draft.pack;
  let busy = false;

  function render() {
    root.replaceChildren();

    root.append(h("h2", "", `Review: ${pack.title}`), h("p", "co-approval-summary", draft.summary));

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

    if (draft.teachNormally.length > 0) {
      const section = h("section", "co-teach-normally");
      section.append(h("h3", "", "Taught normally — no objects"));
      const list = h("ul");
      for (const t of draft.teachNormally) {
        const li = h("li");
        li.append(h("strong", "", t.exercise), document.createTextNode(` — ${t.why}`));
        list.appendChild(li);
      }
      section.appendChild(list);
      root.appendChild(section);
    }

    root.append(h("h3", "", `Activities (${pack.items.length})`));
    pack.items.forEach((item, i) => {
      const card = h("article", "co-activity");
      const head = h("div", "co-activity-head");
      head.append(
        h("span", "co-activity-num", String(i + 1)),
        h("span", `co-kind co-kind-${item.kind}`, KIND_NAMES[item.kind] ?? item.kind),
        h("span", "co-activity-source", item.source ?? ""),
      );
      const regen = h("button", "co-draft-btn co-small", "Regenerate this activity");
      regen.disabled = busy;
      regen.addEventListener("click", () => void regenerate(item.id, regen));
      head.appendChild(regen);

      card.append(head, h("p", "co-activity-prompt", item.prompt), renderStagePreview(pack, i));
      const key = h("div", "co-activity-key");
      key.append(h("span", "co-key-title", "Answer key"), answerKey(pack, i));
      if (item.feedback) key.appendChild(h("p", "co-activity-feedback", `On a correct drop: “${item.feedback}”`));
      card.appendChild(key);
      root.appendChild(card);
    });

    const planSection = h("details", "co-plan");
    planSection.open = true;
    const planSummary = h("summary", "", "Teaching plan");
    const copy = h("button", "co-draft-btn co-small", "Copy plan");
    copy.addEventListener("click", async (e) => {
      e.preventDefault();
      await navigator.clipboard.writeText(draft.plan);
      copy.textContent = "Copied ✓";
    });
    planSummary.appendChild(copy);
    planSection.append(planSummary, renderMarkdown(draft.plan));
    root.appendChild(planSection);

    const status = h("div", "co-draft-status");
    status.id = "co-approval-status";
    const actions = h("div", "co-approval-actions");
    const approve = h("button", "co-draft-btn co-draft-btn-primary", "Approve — use this lesson");
    const discard = h("button", "co-draft-btn", "Discard");
    approve.disabled = busy;
    discard.disabled = busy;
    approve.addEventListener("click", () => void approveDraft(approve, status));
    discard.addEventListener("click", () => {
      if (confirm("Discard this draft? Nothing is saved.")) handlers.onDiscard();
    });
    actions.append(approve, discard);
    root.append(status, actions);
  }

  async function regenerate(activityId: string, button: HTMLButtonElement) {
    busy = true;
    button.textContent = "Regenerating…";
    root.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
    try {
      pack = await regenerateActivity({ brief, pack, plan: draft.plan, activityId });
      busy = false;
      render();
    } catch (err) {
      busy = false;
      render();
      root.querySelector("#co-approval-status")?.replaceChildren(renderServiceError("Couldn't regenerate that activity", err));
    }
  }

  async function approveDraft(button: HTMLButtonElement, status: HTMLElement) {
    busy = true;
    root.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = true));
    try {
      const newWords = pack.cards.filter((c) => c.audio === null).length;
      status.replaceChildren(newWords > 0 && audioAvailable ? `Recording ${newWords} word(s) with ElevenLabs…` : "Saving…");
      button.textContent = "Saving…";
      const recorded = await recordCardAudio(pack);
      status.replaceChildren("Saving the lesson…");
      await savePack(recorded.pack, recorded.audio, draft.plan);
      await setSelectedPackId(recorded.pack.id);
      handlers.onApproved({ pack: recorded.pack, voiced: recorded.voiced.length, silent: recorded.silent.length, reason: recorded.reason });
    } catch (err) {
      busy = false;
      render();
      root.querySelector("#co-approval-status")?.replaceChildren(renderServiceError("Couldn't save the lesson", err));
    }
  }

  render();
}
