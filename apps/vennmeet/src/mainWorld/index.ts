// Main-world content script (docs/SPEC-VENNMEET.md, "Architecture":
// "Share watcher, main world"). Wraps getDisplayMedia so the ISOLATED-
// world layer (which cannot see the page's own calls to it) learns
// when a screen share starts and ends. Communicates via postMessage —
// the only channel between the MAIN and ISOLATED worlds — tagged with
// a marker so it can't be confused with the page's own messages.
//
// "3. Hide on screen share": hide, never cloak. This only ever
// *reports* share state; it never tries to keep anything visible to
// the user while excluding it from what's captured.

const MARKER = "venn-share-watcher";

function post(type: "share-start" | "share-end") {
  window.postMessage({ source: MARKER, type }, "*");
}

const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

navigator.mediaDevices.getDisplayMedia = async function (...args) {
  const stream = await originalGetDisplayMedia(...args);

  post("share-start");

  const tracks = stream.getTracks();
  let endedCount = 0;
  const onTrackEnded = () => {
    endedCount += 1;
    if (endedCount >= tracks.length) post("share-end");
  };
  for (const track of tracks) {
    track.addEventListener("ended", onTrackEnded, { once: true });
  }

  return stream;
};
