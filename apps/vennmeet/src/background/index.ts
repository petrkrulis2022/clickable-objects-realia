// Service worker. Forwards the "toggle-layer" command (manifest.json
// commands) to the active tab's content script — the one hotkey,
// registered through manifest commands so it never competes with a
// platform's own shortcuts (docs/SPEC-VENNMEET.md, "Architecture").
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-layer") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-layer" }).catch(() => {
      /* no content script on this tab (not a supported platform) */
    });
  }
});
