import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";

export const advancedEquipment: {items:number[];recipes:Message[];skills:Message[];properties:Message[];upgrades:Message[]} = JSON.parse(readFileSync(join(projectRoot,"reference/equipment/advanced.json"),"utf8"));
export const halidomIds = new Set(advancedEquipment.items);
export const halidomRecipes = new Map(advancedEquipment.recipes.map(r=>[Number(r.Id),r]));
export const refinementLevels = new Map(advancedEquipment.upgrades.map(r=>[Number(r.Grades),Number(r.Data)]));
