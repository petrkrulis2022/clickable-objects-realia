// A small Markdown renderer for the teaching plan: headings, lists,
// tables, paragraphs, **bold**, *italic* and `code`. It builds DOM
// nodes with textContent only — the plan comes from a model, so no
// part of it is ever parsed as HTML.

function appendInline(parent: HTMLElement, text: string) {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const token = m[0];
    const el = document.createElement(token.startsWith("**") ? "strong" : token.startsWith("`") ? "code" : "em");
    el.textContent = token.startsWith("**") ? token.slice(2, -2) : token.slice(1, -1);
    parent.appendChild(el);
    last = m.index! + token.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function renderMarkdown(markdown: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "co-markdown";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const p = document.createElement("p");
    appendInline(p, paragraph.join(" "));
    root.appendChild(p);
    paragraph = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const h = document.createElement(`h${Math.min(6, heading[1].length + 2)}`);
      appendInline(h, heading[2]);
      root.appendChild(h);
      i++;
      continue;
    }

    // A table: a header row, a |---| separator, then rows.
    if (trimmed.startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      flushParagraph();
      const table = document.createElement("table");
      const head = table.createTHead().insertRow();
      for (const c of cells(trimmed)) appendInline(head.appendChild(document.createElement("th")), c);
      const body = table.createTBody();
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = body.insertRow();
        for (const c of cells(lines[i])) appendInline(row.insertCell(), c);
        i++;
      }
      root.appendChild(table);
      continue;
    }

    const bullet = /^([-*•]|\d+[.)])\s+/;
    if (bullet.test(trimmed)) {
      flushParagraph();
      const ordered = /^\d/.test(trimmed);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (i < lines.length && bullet.test(lines[i].trim())) {
        const li = document.createElement("li");
        appendInline(li, lines[i].trim().replace(bullet, ""));
        list.appendChild(li);
        i++;
      }
      root.appendChild(list);
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }
  flushParagraph();
  return root;
}
