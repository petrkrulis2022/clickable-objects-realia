import type { LessonPack, ServerMessage, StageObject } from "@realia/shared";
import { attachCardsController } from "./cards";
import { attachDragController } from "./drag";
import { mountOverlay } from "./overlay";
import { buildZoneAnchorLabel, getSelectedPackId, loadPack } from "./pack";
import { attachTeacherPanel, type TeacherPanelController } from "./teacherPanel";
import { connect } from "./ws";

// Deployed against a real meet.google.com session this must be wss://
// with a valid certificate (docs/PRD.md, "The relay"). ws:// only
// survives Chrome's mixed-content blocking on localhost.
const RELAY_URL = "ws://localhost:8787";

export interface Session {
  destroy(): void;
}

/**
 * Joins the room, then plays whatever pack the ROOM is playing. The
 * pack this browser has selected is sent with the join and only
 * matters if this join creates the room (the teacher, joining first);
 * the student always loads the teacher's pack, named in the room
 * state, never their own saved selection.
 */
export function startSession(code: string): Session {
  let destroyed = false;
  let cleanup: (() => void) | null = null;

  (async () => {
    const selectedPackId = await getSelectedPackId();
    if (destroyed) return;

    const overlay = mountOverlay();
    const objects: StageObject[] = [];
    let pack: LessonPack | null = null;
    let zoneAnchorLabel: Record<string, string> = {};
    let teacherPanel: TeacherPanelController | null = null;

    const drag = attachDragController({
      overlay,
      objects,
      getSentenceContext: () => ({ template: pack?.sentenceTemplate ?? "", zoneAnchorLabel }),
      sendMove: (id, pos) => client.send({ type: "move", id, pos }),
      sendDrop: (id, zoneId) => client.send({ type: "drop", id, zoneId }),
    });

    const cards = attachCardsController({
      overlay,
      objects,
      sendReveal: (cardId, stage) => client.send({ type: "reveal", cardId, stage }),
    });

    async function usePack(packId: string): Promise<void> {
      if (pack?.id === packId) return;
      try {
        pack = await loadPack(packId);
        zoneAnchorLabel = buildZoneAnchorLabel(pack);
      } catch (err) {
        // The room's objects still arrive in full with the state, so the
        // lesson stays playable; only the teacher panel's item list and
        // place sentences need the pack.
        console.error("[realia] couldn't load the room's pack:", err);
        pack = null;
        zoneAnchorLabel = {};
      }
    }

    async function handle(msg: ServerMessage) {
      switch (msg.type) {
        case "state": {
          const roomPackId = msg.state.activity?.packId;
          const packChanged = roomPackId !== undefined && pack?.id !== roomPackId;
          if (roomPackId) await usePack(roomPackId);
          if (destroyed) return;

          objects.length = 0;
          objects.push(...Object.values(msg.state.objects));
          drag.setMyRole(msg.yourRole);
          overlay.setBackdrop(msg.state.backdrop);
          overlay.setObjects(objects);
          console.log("[realia] joined room", code, "as", msg.yourRole, "playing", roomPackId);

          if (msg.yourRole === "teacher" && pack && (!teacherPanel || packChanged)) {
            teacherPanel?.destroy();
            const panelPack = pack;
            teacherPanel = attachTeacherPanel({
              overlay,
              pack: panelPack,
              initialItemIndex: msg.state.activity?.itemIndex ?? 0,
              onSetActivity: (itemIndex) => client.send({ type: "setActivity", packId: panelPack.id, itemIndex }),
              onMark: (itemIndex, verdict) => client.send({ type: "mark", itemIndex, verdict }),
            });
          }
          break;
        }
        case "patch":
          drag.applyRemotePatch(msg.changed, msg.removed);
          if (msg.backdrop !== undefined) overlay.setBackdrop(msg.backdrop);
          break;
        case "peer":
          console.log("[realia] peer", msg.role, msg.connected ? "connected" : "disconnected");
          break;
        case "verdict":
          drag.onVerdict(msg.id, msg.zoneId, msg.correct);
          break;
        case "revealProgress":
          overlay.setCardPeerProgress(msg.cardId, msg.stage);
          break;
        case "complete":
          // Arrives right after the patch that put the full stage in front of both people.
          overlay.playReveal();
          break;
      }
    }

    // Strictly in arrival order: a patch that arrives while the state's
    // pack is still loading must not be applied ahead of that state.
    let queue = Promise.resolve();
    const client = connect({
      url: RELAY_URL,
      code,
      packId: selectedPackId,
      onMessage: (msg) => {
        queue = queue.then(() => handle(msg)).catch((err) => console.error("[realia]", err));
      },
    });

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
