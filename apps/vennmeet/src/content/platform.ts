// Which call platform the content script is running on. Used only to
// key stored prefs per platform (docs/SPEC-VENNMEET.md, "remembered
// per platform") — never to read or query the platform's own DOM.
export type Platform = "meet" | "zoom" | "teams";

export function detectPlatform(): Platform {
  const host = location.hostname;
  if (host.includes("zoom.us")) return "zoom";
  if (host.includes("teams.microsoft.com") || host.includes("teams.live.com")) return "teams";
  return "meet";
}
