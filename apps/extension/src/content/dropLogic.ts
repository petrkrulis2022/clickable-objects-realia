// Pure, DOM-free drop-target decision logic so it can be unit tested
// without a browser. See docs/PRD.md, "Draggable objects and drop zones":
// "the nearest zone whose centre is within 0.06 of the stage width."

export interface ZoneCandidate {
  id: string;
  accepts: string[];
  centerPx: { x: number; y: number };
}

export function findAcceptingZone(
  objectId: string,
  objectCenterPx: { x: number; y: number },
  zones: ZoneCandidate[],
  thresholdPx: number,
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const zone of zones) {
    if (!zone.accepts.includes(objectId)) continue;
    const dx = objectCenterPx.x - zone.centerPx.x;
    const dy = objectCenterPx.y - zone.centerPx.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= thresholdPx && (!best || dist < best.dist)) {
      best = { id: zone.id, dist };
    }
  }
  return best?.id ?? null;
}
