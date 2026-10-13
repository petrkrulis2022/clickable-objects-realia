import type { Deck, Mode } from "@vennmeet/shared";

console.log("[venn] popup loaded");

const SELECTED_DECK_KEY = "venn.selectedDeckId";
const MODE_KEY = "venn.mode";

async function listPrivateDecks(): Promise<Deck[]> {
  const result = await chrome.storage.local.get("venn.decks");
  const decks = (result["venn.decks"] as Record<string, Deck> | undefined) ?? {};
  return Object.values(decks).filter((d) => d.visibility === "private");
}

async function main() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  const heading = document.createElement("h1");
  heading.textContent = "Venn";
  app.appendChild(heading);

  const decks = await listPrivateDecks();
  const select = document.createElement("select");
  select.className = "venn-deck-select";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = decks.length ? "No deck for this call" : "No decks yet — open options to create one";
  select.appendChild(noneOpt);
  for (const deck of decks) {
    const opt = document.createElement("option");
    opt.value = deck.id;
    opt.textContent = deck.name;
    select.appendChild(opt);
  }

  const stored = await chrome.storage.local.get(SELECTED_DECK_KEY);
  select.value = (stored[SELECTED_DECK_KEY] as string | undefined) ?? "";

  select.addEventListener("change", () => {
    void chrome.storage.local.set({ [SELECTED_DECK_KEY]: select.value || null });
  });

  const label = document.createElement("label");
  label.textContent = "Deck for this call";
  label.appendChild(select);
  app.appendChild(label);

  // The shared layer (propose/join) arrives in "5. The relay and the
  // shared layer" — for now this is a read-only indicator, defaulting
  // to private-only since there's no shared mechanism yet to change it.
  const modeResult = await chrome.storage.local.get(MODE_KEY);
  const mode = (modeResult[MODE_KEY] as Mode | undefined) ?? "private-only";
  const modeEl = document.createElement("p");
  modeEl.className = "venn-mode";
  modeEl.textContent = `Mode: ${mode.replace("-", " ")}`;
  app.appendChild(modeEl);

  const optionsLink = document.createElement("button");
  optionsLink.className = "venn-link-btn";
  optionsLink.textContent = "Open deck editor";
  optionsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
  app.appendChild(optionsLink);
}

void main();
