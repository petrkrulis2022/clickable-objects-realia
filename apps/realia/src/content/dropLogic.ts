// Pure, DOM-free "which zone is nearest" geometry, so it can be unit
// tested without a browser. This only identifies a candidate zone —
// docs/PRD.md, "5. Server-side validation and the event log" moves
// the accept/reject decision to the relay; the client never decides
// correctness itself.

export interface ZoneCandidate {
  id: string;
  centerPx: { x: number; y: number };
  /** The zone's rectangle. A drop whose centre lands inside it is aimed at it, however big it is (a sort bin). */
  rectPx?: { x: number; y: number; w: number; h: number };
}

function contains(r: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * The zone a drop is aimed at: the one whose rectangle contains the
 * object's centre (smallest first, if they nest), otherwise the
 * nearest centre within the threshold. Only bins and slots pass a
 * rectangle — a sort bin is far bigger than the threshold. The
 * original place zones pass none, so they keep the nearest-centre
 * rule exactly as before (their corners lie beyond the threshold, and
 * containment would accept drops the original lesson rejected).
 */
export function findNearestZone(
  objectCenterPx: { x: number; y: number },
  zones: ZoneCandidate[],
  thresholdPx: number,
): string | null {
  const containing = zones
    .filter((z) => z.rectPx && contains(z.rectPx, objectCenterPx))
    .sort((a, b) => a.rectPx!.w * a.rectPx!.h - b.rectPx!.w * b.rectPx!.h);
  if (containing.length > 0) return containing[0].id;

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
