import type { Card, CardKind, Deck, Section, Template } from "@vennmeet/shared";
import { MAX_CARDS_PER_SECTION } from "../content/design";
import { TEMPLATES } from "../templates/index";
import {
  createDecksFromTemplate,
  deleteDeck,
  exportDeckJson,
  getDeck,
  importDeckJson,
  listDecks,
  saveDeck,
} from "./decks";
import { isLongLine, LONG_LINE_MESSAGE } from "./longLineWarning";

function genId(): string {
  return crypto.randomUUID();
}

const CARD_KINDS: CardKind[] = ["phrase", "list", "checklist", "number", "note", "goal", "decision", "action"];

function emptyCard(kind: CardKind): Card {
  switch (kind) {
    case "phrase":
      return { id: genId(), kind, text: "" };
    case "list":
      return { id: genId(), kind, title: "Untitled", lines: [] };
    case "checklist":
      return { id: genId(), kind, title: "Untitled", items: [] };
    case "number":
      return { id: genId(), kind, title: "Untitled", value: "" };
    case "note":
      return { id: genId(), kind, title: "Untitled", text: "" };
    case "goal":
      return { id: genId(), kind, title: "Untitled", want: "" };
    case "decision":
      return { id: genId(), kind, text: "", agreedBy: "", at: new Date().toISOString() };
    case "action":
      return { id: genId(), kind, text: "", owner: "" };
  }
}

export function mountEditor(root: HTMLElement) {
  root.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "venn-editor-layout";
  root.appendChild(layout);

  const sidebar = document.createElement("div");
  sidebar.className = "venn-editor-sidebar";
  layout.appendChild(sidebar);

  const main = document.createElement("div");
  main.className = "venn-editor-main";
  layout.appendChild(main);

  let decks: Deck[] = [];
  let selectedId: string | null = null;

  async function refreshSidebar() {
    decks = await listDecks();
    renderSidebar();
  }

  function renderSidebar() {
    sidebar.innerHTML = "";

    const newBtn = document.createElement("button");
    newBtn.className = "venn-btn venn-btn-primary";
    newBtn.textContent = "+ New from template";
    newBtn.addEventListener("click", () => showTemplatePicker());
    sidebar.appendChild(newBtn);

    const importBtn = document.createElement("button");
    importBtn.className = "venn-btn";
    importBtn.textContent = "Import JSON";
    importBtn.addEventListener("click", () => importFile());
    sidebar.appendChild(importBtn);

    const list = document.createElement("div");
    list.className = "venn-deck-list";
    for (const deck of decks) {
      const item = document.createElement("div");
      item.className = "venn-deck-item" + (deck.id === selectedId ? " venn-selected" : "");
      item.innerHTML = `<strong>${escapeHtml(deck.name)}</strong><span class="venn-badge">${deck.visibility}</span>`;
      item.addEventListener("click", () => selectDeck(deck.id));
      list.appendChild(item);
    }
    sidebar.appendChild(list);
  }

  async function selectDeck(id: string) {
    selectedId = id;
    renderSidebar();
    const deck = await getDeck(id);
    if (deck) renderDeckEditor(deck);
  }

  function showTemplatePicker() {
    main.innerHTML = "";
    const heading = document.createElement("h2");
    heading.textContent = "Choose a template";
    main.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "venn-template-grid";
    for (const template of TEMPLATES) {
      const card = document.createElement("button");
      card.className = "venn-template-card";
      card.innerHTML = `<strong>${escapeHtml(template.name)}</strong><span>${template.layers.join(" + ")}</span>`;
      card.addEventListener("click", () => createFromTemplate(template));
      grid.appendChild(card);
    }
    main.appendChild(grid);
  }

  async function createFromTemplate(template: Template) {
    let layersOverride: Array<"private" | "shared"> | undefined;
    if (template.id === "blank") {
      // Blank's layers are "chosen at start" (docs/SPEC-VENNMEET.md, Templates table).
      const choice = window.prompt("Use this for: (p)rivate, (s)hared, or (b)oth?", "p");
      layersOverride =
        choice?.toLowerCase().startsWith("b")
          ? ["private", "shared"]
          : choice?.toLowerCase().startsWith("s")
            ? ["shared"]
            : ["private"];
    }
    const newDecks = createDecksFromTemplate(template, layersOverride);
    for (const deck of newDecks) await saveDeck(deck);
    await refreshSidebar();
    await selectDeck(newDecks[0].id);
  }

  function importFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const deck = importDeckJson(text);
      await saveDeck(deck);
      await refreshSidebar();
      await selectDeck(deck.id);
    });
    input.click();
  }

  function renderDeckEditor(deck: Deck) {
    main.innerHTML = "";

    const header = document.createElement("div");
    header.className = "venn-editor-header";
    const nameInput = document.createElement("input");
    nameInput.className = "venn-deck-name";
    nameInput.value = deck.name;
    nameInput.addEventListener("change", async () => {
      deck.name = nameInput.value;
      await persist(deck);
    });
    header.appendChild(nameInput);

    const exportBtn = document.createElement("button");
    exportBtn.className = "venn-btn";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", () => downloadJson(deck));
    header.appendChild(exportBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "venn-btn venn-btn-danger";
    deleteBtn.textContent = "Delete deck";
    deleteBtn.addEventListener("click", async () => {
      await deleteDeck(deck.id);
      selectedId = null;
      await refreshSidebar();
      main.innerHTML = "";
    });
    header.appendChild(deleteBtn);

    main.appendChild(header);

    const sectionsEl = document.createElement("div");
    sectionsEl.className = "venn-sections";
    main.appendChild(sectionsEl);

    deck.sections.forEach((section, i) => {
      sectionsEl.appendChild(renderSection(deck, section, i));
    });

    const addSectionBtn = document.createElement("button");
    addSectionBtn.className = "venn-btn";
    addSectionBtn.textContent = "+ Add section";
    addSectionBtn.addEventListener("click", async () => {
      deck.sections.push({ id: genId(), title: "New section", cards: [] });
      await persist(deck);
      renderDeckEditor(deck);
    });
    main.appendChild(addSectionBtn);

    async function persist(d: Deck) {
      await saveDeck(d);
      decks = decks.map((x) => (x.id === d.id ? d : x));
    }

    function renderSection(deck: Deck, section: Section, index: number): HTMLElement {
      const el = document.createElement("div");
      el.className = "venn-section-editor";

      const titleRow = document.createElement("div");
      titleRow.className = "venn-section-title-row";
      const titleInput = document.createElement("input");
      titleInput.value = section.title;
      titleInput.addEventListener("change", async () => {
        section.title = titleInput.value;
        await persist(deck);
      });
      titleRow.appendChild(titleInput);

      const upBtn = smallBtn("↑", async () => {
        if (index === 0) return;
        [deck.sections[index - 1], deck.sections[index]] = [deck.sections[index], deck.sections[index - 1]];
        await persist(deck);
        renderDeckEditor(deck);
      });
      const downBtn = smallBtn("↓", async () => {
        if (index === deck.sections.length - 1) return;
        [deck.sections[index + 1], deck.sections[index]] = [deck.sections[index], deck.sections[index + 1]];
        await persist(deck);
        renderDeckEditor(deck);
      });
      const deleteSectionBtn = smallBtn("✕", async () => {
        deck.sections.splice(index, 1);
        await persist(deck);
        renderDeckEditor(deck);
      });
      titleRow.append(upBtn, downBtn, deleteSectionBtn);
      el.appendChild(titleRow);

      const cardsEl = document.createElement("div");
      cardsEl.className = "venn-cards-editor";
      section.cards.forEach((card, cardIndex) => {
        cardsEl.appendChild(renderCardEditor(deck, section, card, cardIndex));
      });
      el.appendChild(cardsEl);

      if (section.cards.length < MAX_CARDS_PER_SECTION) {
        const addCardRow = document.createElement("div");
        const select = document.createElement("select");
        for (const kind of CARD_KINDS) {
          const opt = document.createElement("option");
          opt.value = kind;
          opt.textContent = kind;
          select.appendChild(opt);
        }
        const addBtn = document.createElement("button");
        addBtn.className = "venn-btn";
        addBtn.textContent = "+ Add card";
        addBtn.addEventListener("click", async () => {
          section.cards.push(emptyCard(select.value as CardKind));
          await persist(deck);
          renderDeckEditor(deck);
        });
        addCardRow.append(select, addBtn);
        el.appendChild(addCardRow);
      } else {
        const capNote = document.createElement("p");
        capNote.className = "venn-cap-note";
        capNote.textContent = `Six cards is the cap for one section — move something out first.`;
        el.appendChild(capNote);
      }

      return el;
    }

    function renderCardEditor(deck: Deck, section: Section, card: Card, cardIndex: number): HTMLElement {
      const el = document.createElement("div");
      el.className = "venn-card-editor";

      const kindLabel = document.createElement("span");
      kindLabel.className = "venn-card-kind-label";
      kindLabel.textContent = card.kind;
      el.appendChild(kindLabel);

      const fields = document.createElement("div");
      fields.className = "venn-card-fields";
      el.appendChild(fields);

      function textField(
        label: string,
        value: string,
        onChange: (v: string) => void,
        warnLongLines = false,
      ): HTMLElement {
        const wrap = document.createElement("label");
        wrap.textContent = label;
        const input = document.createElement("input");
        input.value = value;
        const warning = document.createElement("div");
        warning.className = "venn-warning";
        const check = () => {
          warning.textContent = warnLongLines && isLongLine(input.value) ? LONG_LINE_MESSAGE : "";
        };
        input.addEventListener("input", check);
        input.addEventListener("change", async () => {
          onChange(input.value);
          await persist(deck);
        });
        check();
        wrap.append(input, warning);
        return wrap;
      }

      switch (card.kind) {
        case "phrase":
          fields.appendChild(textField("Text", card.text, (v) => (card.text = v), true));
          break;
        case "note":
          fields.appendChild(textField("Title", card.title, (v) => (card.title = v)));
          fields.appendChild(textField("Text", card.text, (v) => (card.text = v), true));
          break;
        case "list":
          fields.appendChild(textField("Title", card.title, (v) => (card.title = v)));
          fields.appendChild(
            textField("Lines (one per row, separated by |)", card.lines.join(" | "), (v) => {
              card.lines = v.split("|").map((s) => s.trim()).filter(Boolean);
            }),
          );
          break;
        case "checklist":
          fields.appendChild(textField("Title", card.title, (v) => (card.title = v)));
          fields.appendChild(
            textField(
              "Items (one per row, separated by |)",
              card.items.map((i) => i.text).join(" | "),
              (v) => {
                card.items = v
                  .split("|")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((text) => ({ text, done: false }));
              },
            ),
          );
          break;
        case "number":
          fields.appendChild(textField("Title", card.title, (v) => (card.title = v)));
          fields.appendChild(textField("Value", card.value, (v) => (card.value = v)));
          fields.appendChild(textField("Spoken form", card.spoken ?? "", (v) => (card.spoken = v)));
          break;
        case "goal":
          fields.appendChild(textField("Title", card.title, (v) => (card.title = v)));
          fields.appendChild(textField("Want", card.want, (v) => (card.want = v), true));
          fields.appendChild(textField("Walk-away", card.walkAway ?? "", (v) => (card.walkAway = v), true));
          break;
        case "decision":
          fields.appendChild(textField("Decision", card.text, (v) => (card.text = v), true));
          fields.appendChild(textField("Agreed by", card.agreedBy, (v) => (card.agreedBy = v)));
          break;
        case "action":
          fields.appendChild(textField("Action", card.text, (v) => (card.text = v), true));
          fields.appendChild(textField("Owner", card.owner, (v) => (card.owner = v)));
          fields.appendChild(textField("Due", card.due ?? "", (v) => (card.due = v)));
          break;
      }

      const deleteBtn = smallBtn("✕", async () => {
        section.cards.splice(cardIndex, 1);
        await persist(deck);
        renderDeckEditor(deck);
      });
      el.appendChild(deleteBtn);

      return el;
    }
  }

  function smallBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "venn-btn venn-btn-small";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function downloadJson(deck: Deck) {
    const json = exportDeckJson(deck);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  void refreshSidebar();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
