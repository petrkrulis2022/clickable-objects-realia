// Pure, DOM-free "which zone is nearest" geometry, so it can be unit
// tested without a browser. This only identifies a candidate zone —
// docs/PRD.md, "5. Server-side validation and the event log" moves
// the accept/reject decision to the relay; the client never decides
// correctness itself.

export interface ZoneCandidate {
  id: string;
  centerPx: { x: number; y: number };
}

export function findNearestZone(
  objectCenterPx: { x: number; y: number },
  zones: ZoneCandidate[],
  thresholdPx: number,
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const zone of zones) {
    const dx = objectCenterPx.x - zone.centerPx.x;
    const dy = objectCenterPx.y - zone.centerPx.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= thresholdPx && (!best || dist < best.dist)) {
      best = { id: zone.id, dist };
    }
  }
  return best?.id ?? null;
}
