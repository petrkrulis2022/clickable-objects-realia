import { resolveItem, type Card, type LessonPack, type StageObject } from "@realia/shared";

/**
 * A small, static picture of one activity as it will appear on the
 * stage. It uses the same resolveItem the relay plays from, so what
 * the teacher approves is laid out exactly as it will run — positions
 * are percentages of a 16:9 box, as on the real stage.
 */
export function renderStagePreview(pack: LessonPack, itemIndex: number): HTMLElement {
  const stage = document.createElement("div");
  stage.className = "co-preview";
  let objects: StageObject[];
  try {
    objects = resolveItem(pack, itemIndex).objects;
  } catch (err) {
    stage.textContent = `Can't lay this out: ${err instanceof Error ? err.message : String(err)}`;
    return stage;
  }

  for (const o of [...objects].sort((a, b) => a.z - b.z)) {
    const el = document.createElement("div");
    el.className = `co-preview-obj co-preview-${o.variant ?? o.kind}`;
    el.style.left = `${o.pos.x * 100}%`;
    el.style.top = `${o.pos.y * 100}%`;
    el.style.width = `${o.size.w * 100}%`;
    el.style.height = `${o.size.h * 100}%`;

    if (o.kind === "zone" && !o.variant) {
      el.title = "drop zone";
    } else if (o.kind === "card") {
      const card = o as Card;
      el.textContent = `${card.word}${card.audio ? "" : " 🔇"}`;
      el.title = card.audio ? card.translation : `${card.translation} — no recording yet`;
    } else if (o.kind === "text") {
      for (const [i, part] of o.label.split(/\[(\d+)\]/).entries()) {
        if (i % 2 === 0) el.appendChild(document.createTextNode(part));
        else {
          const mark = document.createElement("span");
          mark.className = "co-preview-gap";
          mark.textContent = part;
          el.appendChild(mark);
        }
      }
    } else {
      el.textContent = `${o.emoji ? `${o.emoji} ` : ""}${o.label}`;
    }
    stage.appendChild(el);
  }
  return stage;
}
