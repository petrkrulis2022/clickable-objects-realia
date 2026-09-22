import type { ServerMessage, StageObject } from "@co/shared";
import { attachCardsController } from "./cards";
import { attachDragController } from "./drag";
import { mountOverlay } from "./overlay";
import { buildZoneAnchorLabel, loadPack } from "./pack";
import { attachTeacherPanel, type TeacherPanelController } from "./teacherPanel";
import { connect } from "./ws";

// Deployed against a real meet.google.com session this must be wss://
// with a valid certificate (docs/PRD.md, "The relay"). ws:// only
// survives Chrome's mixed-content blocking on localhost.
const RELAY_URL = "ws://localhost:8787";
const DEFAULT_PACK_ID = "a2-prepositions-place";

export interface Session {
  destroy(): void;
}

export function startSession(code: string): Session {
  let destroyed = false;
  let cleanup: (() => void) | null = null;

  (async () => {
    const pack = await loadPack(DEFAULT_PACK_ID);
    if (destroyed) return;
    const zoneAnchorLabel = buildZoneAnchorLabel(pack);

    const overlay = mountOverlay();
    const objects: StageObject[] = [];
    let teacherPanel: TeacherPanelController | null = null;

    const drag = attachDragController({
      overlay,
      objects,
      sentenceTemplate: pack.sentenceTemplate,
      zoneAnchorLabel,
      sendMove: (id, pos) => client.send({ type: "move", id, pos }),
      sendDrop: (id, zoneId) => client.send({ type: "drop", id, zoneId }),
    });

    const cards = attachCardsController({
      overlay,
      objects,
      sendReveal: (cardId, stage) => client.send({ type: "reveal", cardId, stage }),
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

          if (msg.yourRole === "teacher" && !teacherPanel) {
            teacherPanel = attachTeacherPanel({
              overlay,
              pack,
              initialItemIndex: msg.state.activity?.itemIndex ?? 0,
              onSetActivity: (itemIndex) =>
                client.send({ type: "setActivity", packId: pack.id, itemIndex }),
              onMark: (itemIndex, verdict) => client.send({ type: "mark", itemIndex, verdict }),
            });
          }
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
          drag.onVerdict(msg.id, msg.zoneId, msg.correct);
          break;
        case "revealProgress":
          overlay.setCardPeerProgress(msg.cardId, msg.stage);
          break;
      }
    }

    const client = connect({ url: RELAY_URL, code, onMessage });

    cleanup = () => {
      client.destroy();
      teacherPanel?.destroy();
      cards.destroy();
      drag.destroy();
      overlay.destroy();
    };
    if (destroyed) cleanup();
  })();

  return {
    destroy: () => {
      destroyed = true;
      cleanup?.();
    },
  };
}
