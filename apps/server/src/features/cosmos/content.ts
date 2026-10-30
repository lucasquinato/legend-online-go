import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { localBufferDescriptions, localBufferPercentages } from "./availability.js";
export type Row = Record<string, string>;
const data = JSON.parse(readFileSync(join(projectRoot, "reference/cosmos/content.json"), "utf8")) as { templates: Row[]; buffers: Row[]; upgrades: Row[]; configs: Row[]; advancedRecipes: Row[] };
export const templates = new Map(data.templates.map(row => [Number(row.TemplateId), Number(row.Profile) === 8 ? { ...row, NeedGrades: "80" } : row]));
export const advancedRecipes = data.advancedRecipes;
export const refinementCurve = data.upgrades.filter(row=>Number(row.Types)===103).sort((a,b)=>Number(a.Grades)-Number(b.Grades));
export const buffers = new Map<number, Row>(data.buffers.map(row => {
  const buffer: Row = { ...row };
  if (localBufferDescriptions[Number(row.Id)]) buffer.BufferName=localBufferDescriptions[Number(row.Id)]!;
  if (localBufferPercentages[Number(row.Id)] !== undefined) buffer.ValuePercent=String(localBufferPercentages[Number(row.Id)]);
  return [Number(row.Id), buffer];
}));
export const cosmosQuests: { template: Row; conditions: Row[]; items: Row[] }[] = JSON.parse(readFileSync(join(projectRoot, "reference/cosmos/quests.json"), "utf8")).quests;
const upgradeType: Record<number, number> = { 2: 9, 3: 10, 4: 11, 5: 12, 6: 13, 7: 22, 8: 60 };
export function curve(profile: number): Row[] { return data.upgrades.filter(row => Number(row.Types) === upgradeType[profile]).sort((a,b) => Number(a.Grades) - Number(b.Grades)); }
export const config = (name: string): number => Number(data.configs.find(row => row.ConfigName === name)?.ConfigValue ?? 0);
export const quickLevels = String(data.configs.find(row => row.ConfigName === "astrology_free_function_level")!.ConfigValue).split(",").map(Number);
export const attributeFields: Record<string, string> = { Power: "power", Agility: "agility", Intellect: "intellect", Physique: "physique", Captain: "captain", Attack: "phy_attack", Defence: "phy_defence", MagicAttack: "magic_attack", MagicDefence: "magic_defence", ForceHit: "force_hit", Parry: "parry", Live: "live", Conat: "conat_army", Penetrate: "penetrate", StunAttr: "stunAttr" };
/** Original server odds are not in the client. Explicit replaceable local simulation. */
export const astrologyPolicy = {
  evidence: "local-balance" as const,
  nextStageChance: [50, 40, 30, 20, 0],
  qualityWeights: [
    { 1: 55, 2: 35, 3: 10 },
    { 1: 40, 2: 35, 3: 20, 4: 5 },
    { 1: 25, 2: 30, 3: 30, 4: 13, 5: 2 },
    { 2: 25, 3: 40, 4: 27, 5: 7, 7: 1 },
    { 3: 45, 4: 35, 5: 17, 7: 3 },
  ] as Record<number, number>[],
};
