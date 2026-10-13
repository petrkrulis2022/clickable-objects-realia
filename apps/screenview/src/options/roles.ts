import type { Role, Story } from "@screenview/shared";

const ROLES_KEY = "screenview.roles"; // Record<id, Role>

function genId(): string {
  return crypto.randomUUID();
}

async function readAll(): Promise<Record<string, Role>> {
  const result = await chrome.storage.local.get(ROLES_KEY);
  return (result[ROLES_KEY] as Record<string, Role> | undefined) ?? {};
}

async function writeAll(roles: Record<string, Role>): Promise<void> {
  await chrome.storage.local.set({ [ROLES_KEY]: roles });
}

export async function listRoles(): Promise<Role[]> {
  const roles = await readAll();
  return Object.values(roles);
}

export async function getRole(id: string): Promise<Role | undefined> {
  const roles = await readAll();
  return roles[id];
}

export async function saveRole(role: Role): Promise<void> {
  const roles = await readAll();
  roles[role.id] = role;
  await writeAll(roles);
}

export async function deleteRole(id: string): Promise<void> {
  const roles = await readAll();
  delete roles[id];
  await writeAll(roles);
}

export function newStory(): Story {
  return {
    id: genId(),
    title: "Untitled",
    situation: "",
    task: "",
    action: "",
    result: "",
    draftedByModel: false,
  };
}

/**
 * One story may cover several competencies — `storyIds` on each
 * competency is the one source of truth; linking doesn't mutate the
 * story. A drafted story is a no-op here (docs/SPEC-SCREENVIEW.md:
 * "blocks the story from use until the candidate edits it") — enforced
 * at this layer, not just in the drag handler, so nothing can link a
 * draft by calling this directly.
 */
export function linkStoryToCompetency(role: Role, storyId: string, competencyId: string): Role {
  const story = role.stories.find((s) => s.id === storyId);
  if (!story || story.draftedByModel) return role;
  return {
    ...role,
    competencies: role.competencies.map((c) =>
      c.id === competencyId && !c.storyIds.includes(storyId)
        ? { ...c, storyIds: [...c.storyIds, storyId] }
        : c,
    ),
  };
}

export function unlinkStoryFromCompetency(role: Role, storyId: string, competencyId: string): Role {
  return {
    ...role,
    competencies: role.competencies.map((c) =>
      c.id === competencyId ? { ...c, storyIds: c.storyIds.filter((id) => id !== storyId) } : c,
    ),
  };
}
