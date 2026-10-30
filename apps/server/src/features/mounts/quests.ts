import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { CityState } from "../../city-state.js";
import type { StoryQuest } from "../quests/index.js";
import { questClaimed } from "../quests/index.js";
import { mountTutorialQuests } from "./tutorial-quests.js";

export const mountQuests: StoryQuest[] = [...JSON.parse(readFileSync(join(projectRoot, "reference/mounts/quests.json"), "utf8")).quests, ...mountTutorialQuests];
/** Client TaskTemplate condition 203 reads MountsManager.mountInfo.grade. */
export function updateMountObjectives(state: CityState, grade: number): void {
  for (const definition of mountQuests) {
    const id = Number(definition.template.TemplateId), quest = state.quests[id];
    if (!quest?.is_accept || questClaimed(state, id)) continue;
    for (const [index, condition] of definition.conditions.entries()) {
      if (Number(condition.CondictionType) !== 203) continue;
      quest[`condition_${index + 1}`] = Math.min(Number(condition.Para2), grade);
    }
    quest.is_complete = definition.conditions.every((condition, index) => Number(condition.Para2) > 0 &&
      Number(quest[`condition_${index + 1}`] ?? 0) >= Number(condition.Para2)) ? 1 : 0;
  }
}
