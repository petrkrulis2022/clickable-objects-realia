import type { ServerMessage, StageObject } from "@co/shared";
import { attachDragController } from "./drag";
import { mountOverlay } from "./overlay";
import { connect } from "./ws";

// Deployed against a real meet.google.com session this must be wss://
// with a valid certificate (docs/PRD.md, "The relay"). ws:// only
// survives Chrome's mixed-content blocking on localhost.
const RELAY_URL = "ws://localhost:8787";

// Temporary local-test mapping until real packs load (prompt 7)
// replaces this with PackZone.anchor resolved against pack scenery.
const ZONE_ANCHOR_LABEL: Record<string, string> = {
  on_table: "table",
  in_box: "box",
};

export interface Session {
  destroy(): void;
}

export function startSession(code: string): Session {
  const overlay = mountOverlay();
  const objects: StageObject[] = [];

  const drag = attachDragController({
    overlay,
    objects,
    sentenceTemplate: "The {object} is {relation} the {anchor}.",
    zoneAnchorLabel: ZONE_ANCHOR_LABEL,
    sendMove: (id, pos) => client.send({ type: "move", id, pos }),
    sendDrop: (id, zoneId) => client.send({ type: "drop", id, zoneId }),
  });

  function onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "state":
        objects.length = 0;
        objects.push(...Object.values(msg.state.objects));
        drag.setMyRole(msg.yourRole);
        overlay.setBackdrop(msg.state.backdrop);
        overlay.setObjects(objects);
        console.log("[clickable-objects] joined room", code, "as", msg.yourRole);
        break;
      case "patch":
        drag.applyRemotePatch(msg.changed, msg.removed);
        if (msg.backdrop !== undefined) overlay.setBackdrop(msg.backdrop);
        break;
      case "peer":
        console.log(
          "[clickable-objects] peer",
          msg.role,
          msg.connected ? "connected" : "disconnected",
        );
        break;
      case "verdict":
        break; // "5. Server-side validation and the event log"
    }
  }

  const client = connect({ url: RELAY_URL, code, onMessage });

  return {
    destroy: () => {
      client.destroy();
      drag.destroy();
      overlay.destroy();
    },
  };
}
