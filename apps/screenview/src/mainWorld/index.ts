// Main-world content script. Wraps getDisplayMedia so the ISOLATED-
// world layer (which cannot see the page's own calls to it) learns
// when a screen share starts and ends. Communicates via postMessage —
// the only channel between the MAIN and ISOLATED worlds — tagged with
// a marker so it can't be confused with the page's own messages. Same
// pattern as apps/vennmeet/src/mainWorld/index.ts.
//
// "It hides on screen share like every layer in this system - hide,
// never cloak" (docs/SPEC-SCREENVIEW.md, "6. Interview mode and
// onboarding"). This only ever *reports* share state; it never tries
// to keep anything visible to the user while excluding it from what's
// captured.

const MARKER = "sv-share-watcher";

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
