import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";
import type { CityState } from "../../city-state.js";
import { buildingTemplates, pawnTemplates } from "../settlement/content.js";
import { normalizeLabyrinthQuestConditions } from "../labyrinth/quest.js";

export interface StoryQuest {
  template: Message;
  conditions: Message[];
  items: Message[];
}
export const storyQuests = (JSON.parse(readFileSync(join(projectRoot, "reference/quests/story.json"), "utf8")) as { quests: StoryQuest[] }).quests;
for (const quest of storyQuests) normalizeLabyrinthQuestConditions(quest.conditions);
const definitions = new Map(storyQuests.map(q => [Number(q.template.TemplateId), q]));
export const storyQuest = (id: number): StoryQuest | undefined => definitions.get(id);
export function questClaimed(state: CityState, id: number): boolean {
  const quest = state.quests[id];
  if (quest?.is_complete && !quest.is_accept) return true;
  const bytes = Buffer.from(state.player.quest_site?.bytes ?? "", "base64");
  const bit = id - 1;
  return id > 0 && !!((bytes[Math.floor(bit / 8)] ?? 0) & (1 << (bit % 8)));
}
export function questParents(template: Message): number[] {
  return String(template.PreQuestId).split(",").filter(Boolean).map(Number);
}
export function questInDateWindow(template: Message, now: number): boolean {
  const date = (value: string) => Date.parse(value.replace(" ", "T") + "Z");
  return now >= date(template.StartDate) && now <= date(template.EndDate);
}
export function markQuestClaimed(state: CityState, id: number, now: number): void {
  const quest = state.quests[id]!;
  quest.is_complete = 1;
  quest.is_accept = 0;
  quest.repeat_finish = Math.max(1, Number(quest.repeat_finish ?? 0));
  quest.completed_date = new Date(now).toISOString().slice(0, 19).replace("T", " ");
  const old = Buffer.from(state.player.quest_site?.bytes ?? "", "base64");
  // TaskManage reads statesLength - 1 bytes: preserve its trailing padding byte.
  const bytes = Buffer.alloc(Math.max(old.length, Math.ceil(id / 8) + 1));
  old.copy(bytes);
  bytes[Math.floor((id - 1) / 8)]! |= 1 << ((id - 1) % 8);
  state.player.quest_site = { bytes: bytes.toString("base64") };
  state.player.quest_site_len = bytes.length;
}
export function questSnapshot(state: CityState, templates: Message[], finished?: number): Message {
  const definitions = new Map(templates.map(t => [Number(t.TemplateId), t]));
  const quests = finished === undefined
    ? Object.values(state.quests).filter(q => q.is_accept && !questClaimed(state, q.template_id))
    : [state.quests[finished]!];
  quests.sort((a, b) => Number(definitions.get(a.template_id)?.Sort ?? 0) - Number(definitions.get(b.template_id)?.Sort ?? 0) || a.template_id - b.template_id);
  return { quest: quests, states: state.player.quest_site, states_length: state.player.quest_site_len };
}
export function updateStoryObjectives(
  state: CityState,
  clearedCampaigns: number[],
  counters: Record<string, number>,
  defeatedBoss: (campaign: number, template: number) => boolean,
): void {
  const troops = [...(state.pawnStock ?? []), ...(state.army.armyPawn ?? [])];
  for (const definition of storyQuests) {
    const quest = state.quests[Number(definition.template.TemplateId)];
    if (!quest?.is_accept || !definition.conditions.length) continue;
    const conditions = definition.conditions.slice(0, 4);
    for (const [index, condition] of conditions.entries()) {
      const target = Number(condition.Para1), goal = Number(condition.Para2);
      let progress: number | undefined;
      switch (Number(condition.CondictionType)) {
        case 1: progress = Number(state.player.grades); break;
        case 2:
          progress = Math.max(0, ...Object.values(state.buildings)
            .filter(b => Number(b.son_type) === target)
            .map(b => Number(buildingTemplates.get(Number(b.template_id))?.BuildingGrade ?? 0)));
          break;
        case 3:
          progress = troops.filter(p => Number(p.son_type) === 100 + target)
            .reduce((total, p) => total + Number(p.own_pawns ?? 0), 0);
          break;
        case 10:
          progress = Math.max(0, ...troops.filter(p => Number(p.son_type) === 100 + target)
            .map(p => Number(pawnTemplates.get(Number(p.tempate_id))?.Level ?? 0)));
          break;
        case 14: progress = clearedCampaigns.includes(target) ? 1 : 0; break;
        case 23: progress = Number(state.player.novice_process) >= target ? goal : 0; break;
        case 26: progress = defeatedBoss(Number(condition.Para3), target) ? 1 : 0; break;
        case 34: progress = counters.formation ?? 0; break;
      }
      if (progress !== undefined && goal > 0) {
        const key = `condition_${index + 1}`;
        quest[key] = Math.min(goal, Math.max(Number(quest[key] ?? 0), progress));
      }
    }
    quest.is_complete = conditions.every((condition, index) =>
      Number(condition.Para2) > 0 && Number(quest[`condition_${index + 1}`] ?? 0) >= Number(condition.Para2)) ? 1 : 0;
  }
}
