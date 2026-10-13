import type { Role } from "@screenview/shared";
import { listRoles } from "../options/roles";

console.log("[screenview] popup loaded");

const SELECTED_ROLE_KEY = "screenview.selectedRoleId";
const MODE_KEY = "screenview.mode";

async function main() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  const heading = document.createElement("h1");
  heading.textContent = "ScreenView";
  app.appendChild(heading);

  const roles: Role[] = await listRoles();
  const select = document.createElement("select");
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = roles.length ? "No role selected" : "No roles yet — open the coverage map first";
  select.appendChild(noneOpt);
  for (const role of roles) {
    const opt = document.createElement("option");
    opt.value = role.id;
    opt.textContent = role.title;
    select.appendChild(opt);
  }
  const storedRole = await chrome.storage.local.get(SELECTED_ROLE_KEY);
  select.value = (storedRole[SELECTED_ROLE_KEY] as string | undefined) ?? "";
  select.addEventListener("change", () => {
    void chrome.storage.local.set({ [SELECTED_ROLE_KEY]: select.value || null });
  });
  const roleLabel = document.createElement("label");
  roleLabel.textContent = "Role for this call";
  roleLabel.appendChild(select);
  app.appendChild(roleLabel);

  const modeSelect = document.createElement("select");
  for (const [value, label] of [
    ["interview", "Interview mode — coverage deck only, no mic"],
    ["practice", "Practice mode — session loop, requests the mic"],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    modeSelect.appendChild(opt);
  }
  const storedMode = await chrome.storage.local.get(MODE_KEY);
  modeSelect.value = (storedMode[MODE_KEY] as string | undefined) ?? "interview";
  modeSelect.addEventListener("change", () => {
    void chrome.storage.local.set({ [MODE_KEY]: modeSelect.value });
  });
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Mode (reload the call page after changing)";
  modeLabel.appendChild(modeSelect);
  app.appendChild(modeLabel);

  const optionsLink = document.createElement("button");
  optionsLink.className = "sv-link-btn";
  optionsLink.textContent = "Open coverage map";
  optionsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
  app.appendChild(optionsLink);

  // "Onboarding shows once and reopens from the popup"
  // (docs/SPEC-SCREENVIEW.md, "6. Interview mode and onboarding") — the
  // #onboarding hash forces it regardless of the seen flag.
  const onboardingLink = document.createElement("button");
  onboardingLink.className = "sv-link-btn";
  onboardingLink.textContent = "View onboarding";
  onboardingLink.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("options.html#onboarding") });
  });
  app.appendChild(onboardingLink);
}

void main();
