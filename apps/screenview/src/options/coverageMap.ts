import type { Competency, Role, Story } from "@screenview/shared";
import { parseCompetencies } from "./competencyParser";
import { isLongLine, LONG_LINE_MESSAGE } from "./longLineWarning";
import {
  deleteRole,
  getRole,
  linkStoryToCompetency,
  listRoles,
  newStory,
  saveRole,
  unlinkStoryFromCompetency,
} from "./roles";

function genId(): string {
  return crypto.randomUUID();
}

function emptyRole(): Role {
  return { id: genId(), title: "New role", company: "", jobDescription: "", competencies: [], stories: [] };
}

/**
 * Re-parsing the JD must not forget which story a competency was
 * already linked to. Parsed competencies get fresh ids every call, so
 * matching is by `sourcePhrase` (case-insensitive) against what's
 * already on the role — the one piece of state a phrase match can
 * carry forward.
 */
export function mergeCompetencies(existing: Competency[], parsed: Competency[]): Competency[] {
  return parsed.map((p) => {
    const prior = existing.find((e) => e.sourcePhrase.toLowerCase() === p.sourcePhrase.toLowerCase());
    return prior ? { ...p, id: prior.id, storyIds: prior.storyIds } : p;
  });
}

export function mountCoverageMap(root: HTMLElement) {
  root.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "sv-layout";
  root.appendChild(layout);

  const sidebar = document.createElement("div");
  sidebar.className = "sv-sidebar";
  layout.appendChild(sidebar);

  const main = document.createElement("div");
  main.className = "sv-main";
  layout.appendChild(main);

  let roles: Role[] = [];
  let selectedId: string | null = null;
  let editingStoryId: string | null = null;

  async function refreshSidebar() {
    roles = await listRoles();
    renderSidebar();
  }

  function renderSidebar() {
    sidebar.innerHTML = "";

    const newBtn = document.createElement("button");
    newBtn.className = "sv-btn sv-btn-primary";
    newBtn.textContent = "+ New role";
    newBtn.addEventListener("click", async () => {
      const role = emptyRole();
      await saveRole(role);
      await refreshSidebar();
      await selectRole(role.id);
    });
    sidebar.appendChild(newBtn);

    const list = document.createElement("div");
    list.className = "sv-role-list";
    for (const role of roles) {
      const item = document.createElement("div");
      item.className = "sv-role-item" + (role.id === selectedId ? " sv-selected" : "");
      const gaps = role.competencies.filter((c) => c.storyIds.length === 0).length;
      item.innerHTML = `<strong>${escapeHtml(role.title)}</strong><span class="sv-badge">${
        role.competencies.length === 0 ? "—" : gaps === 0 ? "covered" : `${gaps} gap${gaps === 1 ? "" : "s"}`
      }</span>`;
      item.addEventListener("click", () => selectRole(role.id));
      list.appendChild(item);
    }
    sidebar.appendChild(list);
  }

  async function selectRole(id: string) {
    selectedId = id;
    editingStoryId = null;
    renderSidebar();
    const role = await getRole(id);
    if (role) renderRole(role);
  }

  async function persist(role: Role) {
    await saveRole(role);
    roles = roles.map((r) => (r.id === role.id ? role : r));
    renderSidebar();
  }

  function renderRole(role: Role) {
    main.innerHTML = "";

    const header = document.createElement("div");
    header.className = "sv-header";
    const titleInput = document.createElement("input");
    titleInput.className = "sv-role-title";
    titleInput.value = role.title;
    titleInput.addEventListener("change", async () => {
      role.title = titleInput.value;
      await persist(role);
    });
    const companyInput = document.createElement("input");
    companyInput.className = "sv-role-company";
    companyInput.placeholder = "Company";
    companyInput.value = role.company;
    companyInput.addEventListener("change", async () => {
      role.company = companyInput.value;
      await persist(role);
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "sv-btn sv-btn-danger";
    deleteBtn.textContent = "Delete role";
    deleteBtn.addEventListener("click", async () => {
      await deleteRole(role.id);
      selectedId = null;
      await refreshSidebar();
      main.innerHTML = "";
    });
    header.append(titleInput, companyInput, deleteBtn);
    main.appendChild(header);

    const jdSection = document.createElement("div");
    jdSection.className = "sv-jd-section";
    const jdLabel = document.createElement("label");
    jdLabel.textContent = "Job description";
    const jdTextarea = document.createElement("textarea");
    jdTextarea.className = "sv-jd-textarea";
    jdTextarea.rows = 6;
    jdTextarea.value = role.jobDescription;
    jdTextarea.placeholder = "Paste the job description here, then parse it.";
    const parseBtn = document.createElement("button");
    parseBtn.className = "sv-btn sv-btn-primary";
    parseBtn.textContent = "Parse competencies";
    parseBtn.addEventListener("click", async () => {
      role.jobDescription = jdTextarea.value;
      const parsed = parseCompetencies(role.jobDescription);
      role.competencies = mergeCompetencies(role.competencies, parsed);
      await persist(role);
      renderRole(role);
    });
    jdSection.append(jdLabel, jdTextarea, parseBtn);
    main.appendChild(jdSection);

    const mapSection = document.createElement("div");
    mapSection.className = "sv-map-section";
    const mapHeading = document.createElement("h2");
    const gapCount = role.competencies.filter((c) => c.storyIds.length === 0).length;
    mapHeading.textContent =
      role.competencies.length === 0
        ? "Coverage map"
        : gapCount === 0
          ? "Coverage map — fully covered"
          : `Coverage map — ${gapCount} gap${gapCount === 1 ? "" : "s"}`;
    mapSection.appendChild(mapHeading);

    const grid = document.createElement("div");
    grid.className = "sv-competency-grid";
    for (const competency of role.competencies) {
      grid.appendChild(renderCompetencyCard(role, competency));
    }
    mapSection.appendChild(grid);
    main.appendChild(mapSection);

    const storiesSection = document.createElement("div");
    storiesSection.className = "sv-stories-section";
    const storiesHeading = document.createElement("h2");
    storiesHeading.textContent = "Your stories";
    storiesSection.appendChild(storiesHeading);

    const shelf = document.createElement("div");
    shelf.className = "sv-story-shelf";
    for (const story of role.stories) {
      shelf.appendChild(renderStoryCard(role, story));
    }
    storiesSection.appendChild(shelf);

    const newStoryBtn = document.createElement("button");
    newStoryBtn.className = "sv-btn";
    newStoryBtn.textContent = "+ New story";
    newStoryBtn.addEventListener("click", async () => {
      const story = newStory();
      role.stories.push(story);
      await persist(role);
      editingStoryId = story.id;
      renderRole(role);
    });
    storiesSection.appendChild(newStoryBtn);
    main.appendChild(storiesSection);

    if (editingStoryId) {
      const story = role.stories.find((s) => s.id === editingStoryId);
      if (story) main.appendChild(renderStoryEditor(role, story));
    }

    function renderCompetencyCard(role: Role, competency: Competency): HTMLElement {
      const el = document.createElement("div");
      const covered = competency.storyIds.length > 0;
      el.className = "sv-competency-card " + (covered ? "sv-covered" : "sv-gap");
      el.title = `From the JD: "${competency.sourcePhrase}"`;

      const name = document.createElement("strong");
      name.textContent = competency.name;
      el.appendChild(name);

      const badge = document.createElement("span");
      badge.className = "sv-gap-badge";
      badge.textContent = covered ? "covered" : "gap";
      el.appendChild(badge);

      const linked = document.createElement("div");
      linked.className = "sv-linked-stories";
      for (const storyId of competency.storyIds) {
        const story = role.stories.find((s) => s.id === storyId);
        if (!story) continue;
        const chip = document.createElement("span");
        chip.className = "sv-story-chip";
        chip.textContent = story.title;
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", async () => {
          const updated = unlinkStoryFromCompetency(role, story.id, competency.id);
          Object.assign(role, updated);
          await persist(role);
          renderRole(role);
        });
        chip.appendChild(removeBtn);
        linked.appendChild(chip);
      }
      el.appendChild(linked);

      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("sv-dropzone-active");
      });
      el.addEventListener("dragleave", () => el.classList.remove("sv-dropzone-active"));
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        el.classList.remove("sv-dropzone-active");
        const storyId = e.dataTransfer?.getData("text/sv-story-id");
        if (!storyId) return;
        const story = role.stories.find((s) => s.id === storyId);
        if (!story) return;
        if (story.draftedByModel) {
          showToast("Edit this story before linking it — drafted stories can't be used as-is.");
          return;
        }
        const updated = linkStoryToCompetency(role, storyId, competency.id);
        Object.assign(role, updated);
        await persist(role);
        renderRole(role);
      });

      return el;
    }

    function renderStoryCard(role: Role, story: Story): HTMLElement {
      const el = document.createElement("div");
      el.className = "sv-story-card" + (story.draftedByModel ? " sv-drafted" : "");
      el.draggable = !story.draftedByModel;
      el.title = story.draftedByModel
        ? "Drafted — edit it before it can be linked"
        : "Drag onto a competency to link";

      const title = document.createElement("strong");
      title.textContent = story.title;
      el.appendChild(title);

      if (story.draftedByModel) {
        const badge = document.createElement("span");
        badge.className = "sv-draft-badge";
        badge.textContent = "draft — edit to unlock";
        el.appendChild(badge);
      }

      const editBtn = document.createElement("button");
      editBtn.className = "sv-btn sv-btn-small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        editingStoryId = story.id;
        renderRole(role);
      });
      el.appendChild(editBtn);

      el.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/sv-story-id", story.id);
      });

      return el;
    }

    function renderStoryEditor(role: Role, story: Story): HTMLElement {
      const el = document.createElement("div");
      el.className = "sv-story-editor";

      const heading = document.createElement("h3");
      heading.textContent = story.draftedByModel ? "Edit story (drafted — unlocks on save)" : "Edit story";
      el.appendChild(heading);

      const titleInput = document.createElement("input");
      titleInput.value = story.title;
      titleInput.placeholder = "Title";
      el.appendChild(titleInput);

      const fields: { key: "situation" | "task" | "action" | "result"; label: string }[] = [
        { key: "situation", label: "Situation" },
        { key: "task", label: "Task" },
        { key: "action", label: "Action" },
        { key: "result", label: "Result" },
      ];
      const textareas: Record<string, HTMLTextAreaElement> = {};
      for (const field of fields) {
        const wrap = document.createElement("label");
        wrap.textContent = field.label;
        const textarea = document.createElement("textarea");
        textarea.rows = 2;
        textarea.value = story[field.key];
        const warning = document.createElement("div");
        warning.className = "sv-warning";
        const check = () => {
          warning.textContent = isLongLine(textarea.value) ? LONG_LINE_MESSAGE : "";
        };
        textarea.addEventListener("input", check);
        check();
        textareas[field.key] = textarea;
        wrap.append(textarea, warning);
        el.appendChild(wrap);
      }

      // Not a network call — a local memory-jogging prompt, matching
      // the SPEC's "it can ask questions that help someone remember a
      // story". Anything it seeds is marked drafted and locked out of
      // linking until the candidate rewrites it in their own words.
      const draftBtn = document.createElement("button");
      draftBtn.className = "sv-btn";
      draftBtn.textContent = "Help me remember (draft)";
      draftBtn.addEventListener("click", () => {
        textareas.situation.value ||= "[draft] What was the situation — where were you, what was at stake?";
        textareas.task.value ||= "[draft] What was your task specifically?";
        textareas.action.value ||= "[draft] What did you actually do, step by step?";
        textareas.result.value ||= "[draft] What was the outcome, in numbers if you can?";
        story.draftedByModel = true;
        renderRole(role);
      });
      el.appendChild(draftBtn);

      const saveBtn = document.createElement("button");
      saveBtn.className = "sv-btn sv-btn-primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", async () => {
        story.title = titleInput.value || "Untitled";
        story.situation = textareas.situation.value;
        story.task = textareas.task.value;
        story.action = textareas.action.value;
        story.result = textareas.result.value;
        // Editing and saving is what the SPEC means by "edits it" —
        // the one way a drafted story becomes linkable again.
        story.draftedByModel = false;
        editingStoryId = null;
        await persist(role);
        renderRole(role);
      });
      el.appendChild(saveBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "sv-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        editingStoryId = null;
        renderRole(role);
      });
      el.appendChild(cancelBtn);

      return el;
    }
  }

  function showToast(message: string) {
    const toast = document.createElement("div");
    toast.className = "sv-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  void refreshSidebar();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
