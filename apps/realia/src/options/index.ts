import { getSelectedPackId, setSelectedPackId } from "../content/pack";
import { assistStatus, fetchPlan, listPacks, type DraftLesson, type LessonBrief } from "./api";
import { mountApprovalScreen, type Review } from "./approvalScreen";
import { mountLessonForm } from "./lessonForm";
import { renderMarkdown } from "./markdown";

// The options page: which lesson the next room plays, and the one
// place lessons are prepared — form, then the approval screen.

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

let audioAvailable = false;

async function renderStatus(el: HTMLElement) {
  try {
    const s = await assistStatus();
    audioAvailable = s.elevenLabs;
    el.replaceChildren();
    if (!s.anthropic) el.appendChild(h("p", "co-note co-warn", "ANTHROPIC_API_KEY isn't set on meeting-assist, so lessons can't be drafted yet. Set it in the terminal that runs the service, then restart it."));
    if (!s.elevenLabs) el.appendChild(h("p", "co-note", "No ELEVENLABS_API_KEY on meeting-assist: new words will be silent (marked 🔇) until one is set."));
  } catch {
    audioAvailable = false;
    el.replaceChildren(h("p", "co-note co-warn", "meeting-assist isn't running (pnpm dev:meeting-assist), so lessons can't be drafted. Choosing a lesson below still works."));
  }
}

async function renderLessons(el: HTMLElement) {
  el.replaceChildren(h("h2", "", "Lesson for the next room"));
  let packs: { id: string; title: string; custom: boolean }[];
  try {
    packs = (await listPacks()).packs;
  } catch {
    el.appendChild(h("p", "co-note co-warn", "The relay isn't running (pnpm dev:relay), so lessons can't be listed."));
    return;
  }
  const selected = await getSelectedPackId();
  const list = h("ul", "co-lessons");
  for (const p of packs.sort((a, b) => Number(b.custom) - Number(a.custom) || b.id.localeCompare(a.id))) {
    const li = h("li", p.id === selected ? "co-lesson co-selected" : "co-lesson");
    li.append(h("span", "co-lesson-title", p.title), h("span", "co-lesson-tag", p.custom ? "prepared" : "built in"));
    if (p.id === selected) li.appendChild(h("span", "co-lesson-current", "next room plays this"));
    else {
      const use = h("button", "co-draft-btn co-small", "Use this lesson");
      use.addEventListener("click", async () => {
        await setSelectedPackId(p.id);
        await renderLessons(el);
      });
      li.appendChild(use);
    }
    if (p.custom) {
      const view = h("button", "co-draft-btn co-small", "Plan");
      view.addEventListener("click", async () => {
        const plan = await fetchPlan(p.id);
        const box = h("div", "co-plan-view");
        box.appendChild(plan ? renderMarkdown(plan) : h("p", "", "No plan was saved with this lesson."));
        li.after(box);
        view.disabled = true;
      });
      li.appendChild(view);
    }
    list.appendChild(li);
  }
  el.append(list, h("p", "co-draft-hint", "A room plays the lesson that was selected when it was created. To switch lessons, create a new room code in the popup."));
}

function main() {
  const root = document.getElementById("app");
  if (!root) return;
  const statusEl = h("div", "co-status");
  const lessonsEl = h("section", "co-lessons-section");
  const work = h("section", "co-work");
  root.replaceChildren(statusEl, lessonsEl, work);

  function showForm() {
    lessonsEl.hidden = false;
    void mountLessonForm(work, {
      onDraft: (draft: DraftLesson, brief: LessonBrief) => showApproval({ origin: "generated", draft, brief }),
      onPaste: (paste, packId, translationLang) => showApproval({ origin: "pasted", paste, packId, translationLang }),
    });
  }

  /** The one review screen, for every door. */
  function showApproval(review: Review) {
    lessonsEl.hidden = true; // one screen: the review, nothing else
    mountApprovalScreen(work, review, audioAvailable, {
      onDiscard: showForm,
      onApproved: ({ pack, voiced, silent, reason }) => {
        lessonsEl.hidden = false;
        void renderLessons(lessonsEl);
        work.replaceChildren(
          h("h2", "", "Saved"),
          h("p", "", `“${pack.title}” is the lesson the next room will play.`),
          ...(voiced ? [h("p", "co-note", `${voiced} word(s) recorded with ElevenLabs.`)] : []),
          ...(silent ? [h("p", "co-note co-warn", `${silent} word(s) are silent and marked 🔇. ${reason ?? ""}`)] : []),
          h("p", "co-draft-hint", "Create a room code in the popup, then open the Meet call."),
        );
        const again = h("button", "co-draft-btn", "Prepare another lesson");
        again.addEventListener("click", showForm);
        work.appendChild(again);
      },
    });
    window.scrollTo(0, 0);
  }

  void renderStatus(statusEl);
  void renderLessons(lessonsEl);
  showForm();
}

main();
