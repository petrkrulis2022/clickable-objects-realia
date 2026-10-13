import type { Deck, Mode } from "@vennmeet/shared";

console.log("[venn] popup loaded");

const SELECTED_DECK_KEY = "venn.selectedDeckId";
const MODE_KEY = "venn.mode";
const NAME_KEY = "venn.myName";

async function listPrivateDecks(): Promise<Deck[]> {
  const result = await chrome.storage.local.get("venn.decks");
  const decks = (result["venn.decks"] as Record<string, Deck> | undefined) ?? {};
  return Object.values(decks).filter((d) => d.visibility === "private");
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function getMyName(): Promise<string> {
  const stored = await chrome.storage.local.get(NAME_KEY);
  return (stored[NAME_KEY] as string | undefined) ?? "";
}

async function main() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  const heading = document.createElement("h1");
  heading.textContent = "Venn";
  app.appendChild(heading);

  const decks = await listPrivateDecks();
  const select = document.createElement("select");
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

  const nameInput = document.createElement("input");
  nameInput.placeholder = "Your name (shown to the other side)";
  nameInput.value = await getMyName();
  nameInput.addEventListener("change", () => void chrome.storage.local.set({ [NAME_KEY]: nameInput.value }));
  app.appendChild(nameInput);

  const modeEl = document.createElement("p");
  modeEl.className = "venn-mode";
  app.appendChild(modeEl);
  async function refreshMode() {
    const modeResult = await chrome.storage.local.get(MODE_KEY);
    const mode = (modeResult[MODE_KEY] as Mode | undefined) ?? "private-only";
    modeEl.textContent = `Mode: ${mode.replace("-", " ")}`;
  }
  await refreshMode();

  const statusEl = document.createElement("p");
  statusEl.className = "venn-status";
  app.appendChild(statusEl);

  const proposeBtn = document.createElement("button");
  proposeBtn.className = "venn-link-btn";
  proposeBtn.textContent = "Propose a shared layer";
  proposeBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim() || "Me";
    const tabId = await activeTabId();
    if (!tabId) return;
    statusEl.textContent = "Proposing...";
    const result = await chrome.tabs.sendMessage(tabId, { type: "venn-propose", name }).catch(() => undefined);
    if (!result) {
      statusEl.textContent = "Couldn't reach the layer — is this a supported call?";
      return;
    }
    if ("error" in result) statusEl.textContent = result.error;
    else statusEl.textContent = `Share this code: ${result.code}`;
    await refreshMode();
  });
  app.appendChild(proposeBtn);

  const joinRow = document.createElement("div");
  joinRow.className = "venn-join-row";
  const codeInput = document.createElement("input");
  codeInput.placeholder = "CODE";
  codeInput.maxLength = 6;
  const joinBtn = document.createElement("button");
  joinBtn.className = "venn-link-btn";
  joinBtn.textContent = "Join";
  joinBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim() || "Me";
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    const tabId = await activeTabId();
    if (!tabId) return;
    statusEl.textContent = "Joining...";
    const result = await chrome.tabs.sendMessage(tabId, { type: "venn-join", name, code }).catch(() => undefined);
    if (!result) {
      statusEl.textContent = "Couldn't reach the layer — is this a supported call?";
      return;
    }
    if ("error" in result) statusEl.textContent = result.error;
    else statusEl.textContent = "Joined the shared layer.";
    await refreshMode();
  });
  joinRow.append(codeInput, joinBtn);
  app.appendChild(joinRow);

  const optionsLink = document.createElement("button");
  optionsLink.className = "venn-link-btn";
  optionsLink.textContent = "Open deck editor";
  optionsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
  app.appendChild(optionsLink);
}

void main();
