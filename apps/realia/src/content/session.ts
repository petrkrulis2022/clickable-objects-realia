import type { ServerMessage, StageObject, TeacherLesson } from "@realia/shared";
import { attachCardsController } from "./cards";
import { attachDragController } from "./drag";
import { mountOverlay } from "./overlay";
import { getSelectedPackId } from "./pack";
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
 * Joins the room and plays whatever the ROOM is playing, entirely from
 * the WebSocket. The pack this browser has selected is sent with the
 * join and only matters if this join creates the room (the teacher,
 * joining first).
 *
 * No pack is ever fetched here: a pack holds every answer, so a
 * student's browser must not have one. The relay sends each role only
 * what it may see — objects through the role filter, sentences and
 * feedback in verdicts, and to the teacher alone a "lesson" message
 * with the prompts and the answer key for the panel.
 */
export function startSession(code: string): Session {
  let destroyed = false;
  let cleanup: (() => void) | null = null;

  (async () => {
    const selectedPackId = await getSelectedPackId();
    if (destroyed) return;

    const overlay = mountOverlay();
    const objects: StageObject[] = [];
    let teacherPanel: TeacherPanelController | null = null;
    let panelPackId: string | null = null;
    let currentItemIndex = 0;

    const drag = attachDragController({
      overlay,
      objects,
      sendMove: (id, pos) => client.send({ type: "move", id, pos }),
      sendDrop: (id, zoneId) => client.send({ type: "drop", id, zoneId }),
    });

    const cards = attachCardsController({
      overlay,
      objects,
      sendReveal: (cardId, stage) => client.send({ type: "reveal", cardId, stage }),
    });

    function showTeacherPanel(lesson: TeacherLesson) {
      if (teacherPanel && panelPackId === lesson.packId) return;
      teacherPanel?.destroy();
      panelPackId = lesson.packId;
      teacherPanel = attachTeacherPanel({
        overlay,
        lesson,
        initialItemIndex: currentItemIndex,
        onSetActivity: (itemIndex) => client.send({ type: "setActivity", packId: lesson.packId, itemIndex }),
        onMark: (itemIndex, verdict) => client.send({ type: "mark", itemIndex, verdict }),
      });
    }

    function handle(msg: ServerMessage) {
      switch (msg.type) {
        case "state":
          objects.length = 0;
          objects.push(...Object.values(msg.state.objects));
          currentItemIndex = msg.state.activity?.itemIndex ?? 0;
          drag.setMyRole(msg.yourRole);
          overlay.setBackdrop(msg.state.backdrop);
          overlay.setObjects(objects);
          console.log("[realia] joined room", code, "as", msg.yourRole);
          break;
        case "lesson":
          // Teacher only — the relay never sends this to the student.
          showTeacherPanel(msg.lesson);
          break;
        case "patch":
          drag.applyRemotePatch(msg.changed, msg.removed);
          if (msg.backdrop !== undefined) overlay.setBackdrop(msg.backdrop);
          break;
        case "peer":
          console.log("[realia] peer", msg.role, msg.connected ? "connected" : "disconnected");
          break;
        case "verdict":
          drag.onVerdict(msg.id, msg.zoneId, msg.correct, msg.feedback);
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

    const client = connect({ url: RELAY_URL, code, packId: selectedPackId, onMessage: handle });

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
