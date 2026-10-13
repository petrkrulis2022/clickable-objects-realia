// Listens for the MAIN-world share watcher's postMessage (the only
// channel between the MAIN and ISOLATED worlds). Filtered by
// event.source === window (same-document only) and the marker, so
// this can't be triggered by the host page's own messages. No
// network, no mic — safe to import from interview mode.
const MARKER = "sv-share-watcher";

export function onShareChange(cb: (sharing: boolean) => void): () => void {
  function handler(e: MessageEvent) {
    if (e.source !== window) return;
    if (e.data?.source !== MARKER) return;
    if (e.data.type === "share-start") cb(true);
    else if (e.data.type === "share-end") cb(false);
  }
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
