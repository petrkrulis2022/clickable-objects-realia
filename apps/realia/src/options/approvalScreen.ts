import type { LessonPack, PackItem } from "@realia/shared";
import { buildZoneAnchorLabel } from "../content/pack";
import type { DraftPlan } from "./draftFromMaterials";

const ASSIST_URL = "http://localhost:8790";

export interface ApprovalHandlers {
  /** "Looks right" — saves the assembled pack as the one the next session loads. */
  onApprove: (pack: LessonPack) => void;
  /** Back to the upload form, discarding this draft. */
  onStartOver: () => void;
}

function genPackId(): string {
  return `draft-${Date.now()}`;
}

function assemblePack(referencePack: LessonPack, items: PackItem[]): LessonPack {
  return { ...referencePack, id: genPackId(), items };
}

/**
 * One screen, three buttons, no free-text editing — exactly the shape
 * docs/PRD.md spec'd for this ("11. The approval screen"): "Looks
 * right" saves it and closes; "swap this activity" regenerates the
 * selected item only; "too easy" regenerates the whole set, asking
 * for more variety. Swap is a local, instant substitution (no LLM
 * round trip) so it reliably completes well under the PRD's 10-second
 * budget; "too easy" does call the assist service again, since it's
 * asking for a materially different session.
 */
export function mountApprovalScreen(
  root: HTMLElement,
  draft: DraftPlan,
  referencePack: LessonPack,
  handlers: ApprovalHandlers,
): void {
  let items = [...draft.items];
  let summary = draft.summary;
  let selectedIndex: number | null = null;
  const anchorLabel = buildZoneAnchorLabel(referencePack);

  root.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = "Review next session's plan";
  root.appendChild(heading);

  const summaryEl = document.createElement("p");
  summaryEl.className = "co-approval-summary";
  root.appendChild(summaryEl);

  const listEl = document.createElement("ol");
  listEl.className = "co-approval-list";
  root.appendChild(listEl);

  const statusEl = document.createElement("p");
  statusEl.className = "co-draft-status";
  root.appendChild(statusEl);

  const actions = document.createElement("div");
  actions.className = "co-approval-actions";
  root.appendChild(actions);

  const approveBtn = document.createElement("button");
  approveBtn.className = "co-draft-btn co-draft-btn-primary";
  approveBtn.textContent = "Looks right";
  approveBtn.addEventListener("click", () => {
    handlers.onApprove(assemblePack(referencePack, items));
  });

  const swapBtn = document.createElement("button");
  swapBtn.className = "co-draft-btn";
  swapBtn.textContent = "Swap this activity";
  swapBtn.addEventListener("click", () => {
    if (selectedIndex === null) return;
    items[selectedIndex] = regenerateItem(referencePack, items, selectedIndex, anchorLabel);
    render();
  });

  const tooEasyBtn = document.createElement("button");
  tooEasyBtn.className = "co-draft-btn";
  tooEasyBtn.textContent = "Too easy";
  tooEasyBtn.addEventListener("click", async () => {
    tooEasyBtn.disabled = true;
    statusEl.textContent = "Drafting a more varied session…";
    try {
      const res = await fetch(`${ASSIST_URL}/plan/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: "realia",
          referencePack,
          focusNotes: "This group found the last session too easy — use more items and a wider variety of relations/zones than a typical session.",
          materials: [],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      items = body.draft.items;
      summary = body.draft.summary;
      selectedIndex = null;
      statusEl.textContent = "";
      render();
    } catch (err) {
      statusEl.textContent = `Couldn't regenerate: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      tooEasyBtn.disabled = false;
    }
  });

  const startOverBtn = document.createElement("button");
  startOverBtn.className = "co-draft-btn";
  startOverBtn.textContent = "Start over";
  startOverBtn.addEventListener("click", () => handlers.onStartOver());

  actions.append(approveBtn, swapBtn, tooEasyBtn, startOverBtn);

  function render() {
    summaryEl.textContent = summary;
    listEl.innerHTML = "";
    items.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = "co-approval-item" + (i === selectedIndex ? " co-selected" : "");
      li.textContent = item.prompt;
      li.addEventListener("click", () => {
        selectedIndex = i;
        render();
      });
      listEl.appendChild(li);
    });
    swapBtn.disabled = selectedIndex === null;
  }

  render();
}

/**
 * Local, instant substitution for "swap this activity" — no model
 * call. Picks a different (object, zone) pair from the reference
 * pack's existing combinations, skipping ones already in the current
 * list. Prompt phrasing is a simple generic template, not the natural
 * wording an LLM-drafted item gets; that's an accepted trade for being
 * reliably instant rather than a network round trip.
 */
function regenerateItem(
  referencePack: LessonPack,
  currentItems: PackItem[],
  indexToReplace: number,
  anchorLabel: Record<string, string>,
): PackItem {
  const used = new Set(currentItems.filter((_, i) => i !== indexToReplace).map((it) => `${it.object}:${it.zone}`));
  const candidates: { object: string; zone: string }[] = [];
  for (const draggable of referencePack.draggables) {
    for (const zone of referencePack.zones) {
      const key = `${draggable.id}:${zone.id}`;
      if (!used.has(key)) candidates.push({ object: draggable.id, zone: zone.id });
    }
  }
  if (candidates.length === 0) return currentItems[indexToReplace];

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const draggable = referencePack.draggables.find((d) => d.id === pick.object)!;
  const zone = referencePack.zones.find((z) => z.id === pick.zone)!;
  return {
    prompt: `Put the ${draggable.label} ${zone.relation} the ${anchorLabel[zone.id] ?? zone.anchor}.`,
    object: pick.object,
    zone: pick.zone,
  };
}
