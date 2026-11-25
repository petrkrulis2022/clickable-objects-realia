import { ServiceError } from "./api";

/**
 * A failure the teacher can act on: the message, the validation
 * problems, and — when the draft couldn't be made valid — the model's
 * raw output, folded away. Nothing broken is ever loaded instead.
 */
export function renderServiceError(heading: string, err: unknown): HTMLElement {
  const box = document.createElement("div");
  box.className = "co-error";
  const title = document.createElement("p");
  title.textContent = `${heading}: ${err instanceof Error ? err.message : String(err)}`;
  box.appendChild(title);

  if (err instanceof ServiceError && err.problems.length > 0) {
    const list = document.createElement("ul");
    for (const p of err.problems.slice(0, 12)) {
      const li = document.createElement("li");
      li.textContent = p;
      list.appendChild(li);
    }
    box.appendChild(list);
  }
  if (err instanceof ServiceError && err.raw) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Show what the model returned";
    const pre = document.createElement("pre");
    pre.textContent = err.raw;
    details.append(summary, pre);
    box.appendChild(details);
  }
  return box;
}
