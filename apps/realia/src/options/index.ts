import type { LessonPack } from "@realia/shared";
import { setSelectedPack } from "../content/pack";
import { mountDraftForm, type DraftPlan } from "./draftFromMaterials";
import { mountApprovalScreen } from "./approvalScreen";

const RELAY_URL = "http://localhost:8787";

console.log("[clickable-objects] options page loaded");

function main() {
  const root = document.getElementById("app");
  if (!root) return;
  showDraftForm();

  function showDraftForm() {
    mountDraftForm(root!, {
      onDraftReady: (draft: DraftPlan, referencePack: LessonPack) => showApprovalScreen(draft, referencePack),
    });
  }

  function showApprovalScreen(draft: DraftPlan, referencePack: LessonPack) {
    mountApprovalScreen(root!, draft, referencePack, {
      onStartOver: () => showDraftForm(),
      onApprove: (pack) => void approve(pack),
    });
  }

  async function approve(pack: LessonPack) {
    root!.innerHTML = "<p>Saving…</p>";
    try {
      const res = await fetch(`${RELAY_URL}/packs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pack),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);

      await setSelectedPack(pack.id, true);
      root!.innerHTML = "";
      const done = document.createElement("div");
      done.className = "co-approval-done";
      done.innerHTML = `<p>Saved. Next time you open a Meet call, this plan loads automatically.</p>`;
      const again = document.createElement("button");
      again.className = "co-draft-btn";
      again.textContent = "Draft another plan";
      again.addEventListener("click", () => showDraftForm());
      done.appendChild(again);
      root!.appendChild(done);
    } catch (err) {
      root!.innerHTML = `<p class="co-draft-status">Couldn't save: ${err instanceof Error ? err.message : String(err)} — is the relay running?</p>`;
      const retry = document.createElement("button");
      retry.className = "co-draft-btn";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => showApprovalScreen({ items: pack.items, summary: "" }, pack));
      root!.appendChild(retry);
    }
  }
}

main();
