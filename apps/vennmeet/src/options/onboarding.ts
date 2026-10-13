const SEEN_KEY = "venn.onboardingSeen";

// Four short screens, verbatim from docs/SPEC-VENNMEET.md,
// "6. Minutes, debrief and onboarding".
const SCREENS = [
  "Three layers: yours, theirs, and the shared middle.",
  "It cannot listen - point at the permission list, which has no microphone.",
  "A private-only meeting touches no network at all.",
  "The shared layer is always invited and always visible to both of you.",
];

export async function hasSeenOnboarding(): Promise<boolean> {
  const result = await chrome.storage.local.get(SEEN_KEY);
  return !!result[SEEN_KEY];
}

/** Shows the four screens, resolving once the user finishes. Reopening (docs/SPEC-VENNMEET.md: "reopens from the popup") just calls this again — it doesn't depend on the seen flag to run. */
export function showOnboarding(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;

    const overlay = document.createElement("div");
    overlay.className = "venn-onboarding-overlay";
    const modal = document.createElement("div");
    modal.className = "venn-onboarding-modal";
    overlay.appendChild(modal);

    const stepEl = document.createElement("div");
    stepEl.className = "venn-onboarding-step";
    const textEl = document.createElement("p");
    const dotsEl = document.createElement("div");
    dotsEl.className = "venn-onboarding-dots";
    stepEl.append(textEl, dotsEl);
    modal.appendChild(stepEl);

    const buttons = document.createElement("div");
    buttons.className = "venn-onboarding-buttons";
    const backBtn = document.createElement("button");
    backBtn.className = "venn-btn";
    backBtn.textContent = "Back";
    const nextBtn = document.createElement("button");
    nextBtn.className = "venn-btn venn-btn-primary";
    buttons.append(backBtn, nextBtn);
    modal.appendChild(buttons);

    function render() {
      textEl.textContent = SCREENS[index];
      dotsEl.innerHTML = "";
      SCREENS.forEach((_, i) => {
        const dot = document.createElement("span");
        dot.className = "venn-onboarding-dot" + (i === index ? " venn-active" : "");
        dotsEl.appendChild(dot);
      });
      backBtn.style.visibility = index === 0 ? "hidden" : "visible";
      nextBtn.textContent = index === SCREENS.length - 1 ? "Done" : "Next";
    }

    backBtn.addEventListener("click", () => {
      if (index > 0) {
        index -= 1;
        render();
      }
    });
    nextBtn.addEventListener("click", async () => {
      if (index < SCREENS.length - 1) {
        index += 1;
        render();
      } else {
        await chrome.storage.local.set({ [SEEN_KEY]: true });
        overlay.remove();
        resolve();
      }
    });

    render();
    root.appendChild(overlay);
  });
}
