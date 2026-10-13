const SEEN_KEY = "screenview.onboardingSeen";

// Four short screens, verbatim from docs/SPEC-SCREENVIEW.md,
// "6. Interview mode and onboarding".
const SCREENS = [
  "ScreenView makes you better before the interview; it is not running during one.",
  "Start with the coverage map: which requirements have no story behind them.",
  "The support fades on purpose - by session five there are no blocks.",
  "If you have been told no notes, do not use interview mode.",
];

export async function hasSeenOnboarding(): Promise<boolean> {
  const result = await chrome.storage.local.get(SEEN_KEY);
  return !!result[SEEN_KEY];
}

/** Shows the four screens, resolving once the user finishes. "Reopens from the popup" (SPEC) just calls this again — it doesn't depend on the seen flag to run. */
export function showOnboarding(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;

    const overlay = document.createElement("div");
    overlay.className = "sv-onboarding-overlay";
    const modal = document.createElement("div");
    modal.className = "sv-onboarding-modal";
    overlay.appendChild(modal);

    const stepEl = document.createElement("div");
    stepEl.className = "sv-onboarding-step";
    const textEl = document.createElement("p");
    const dotsEl = document.createElement("div");
    dotsEl.className = "sv-onboarding-dots";
    stepEl.append(textEl, dotsEl);
    modal.appendChild(stepEl);

    const buttons = document.createElement("div");
    buttons.className = "sv-onboarding-buttons";
    const backBtn = document.createElement("button");
    backBtn.className = "sv-btn";
    backBtn.textContent = "Back";
    const nextBtn = document.createElement("button");
    nextBtn.className = "sv-btn sv-btn-primary";
    buttons.append(backBtn, nextBtn);
    modal.appendChild(buttons);

    function render() {
      textEl.textContent = SCREENS[index];
      dotsEl.innerHTML = "";
      SCREENS.forEach((_, i) => {
        const dot = document.createElement("span");
        dot.className = "sv-onboarding-dot" + (i === index ? " sv-active" : "");
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
