import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import type { AdventureReference } from "../../adventure-combat.js";
import { skillTemplates, actionTemplates } from "../../combat.js";

export interface CampaignStage {
  nodeIndex: number;
  reference: AdventureReference;
  xp: number;
  spirit: number;
  gold?: number;
  drops?: { model: Message; count: number }[];
  movie?: CityPacket;
}
export interface CampaignDefinition {
  id: number;
  map: number;
  definition: Record<string, string>;
  legacy?: boolean;
  nodeIndices?: number[];
  cardPool: CampaignCard[];
  cardsDelayMs?: number;
  entry?: CityPacket;
  load?: CityPacket[];
  stages?: CampaignStage[];
  completion?: CityPacket[];
  completionXp?: number;
  observedDrops?: { potion?: Message; cards?: Message };
  reconstructedFrom?: string;
  battleIndices?: number[];
}
export interface CampaignCard {
  templateId: number;
  count: number;
  bind: number;
}
const data = JSON.parse(
  readFileSync(join(projectRoot, "reference/campaign/content.json"), "utf8"),
) as {
  campaigns: CampaignDefinition[];
  heroes: Record<string, Record<string, string>>;
  pawns: Record<string, Record<string, string>>;
  skills: Record<string, Record<string, string>>;
  actions: Record<string, Record<string, string>>;
};
const extra = JSON.parse(
  readFileSync(
    join(projectRoot, "reference/campaign/hero-content.json"),
    "utf8",
  ),
) as typeof data;
data.campaigns.push(...extra.campaigns);
for (const key of ["heroes", "pawns", "skills", "actions"] as const)
  Object.assign(data[key], extra[key]);
const expanded = JSON.parse(
  readFileSync(join(projectRoot, "reference/campaign/expanded-content.json"), "utf8"),
) as typeof data;
// Replace table-only prototypes in place; old campaign and labyrinth IDs stay stable.
for (const c of expanded.campaigns) {
  const index = data.campaigns.findIndex(old => old.id === c.id);
  if (index >= 0) data.campaigns[index] = c;
  else data.campaigns.push(c);
}
for (const key of ["heroes", "pawns", "skills", "actions"] as const)
  Object.assign(data[key], expanded[key]);
export const campaignDefinitions = new Map(
  data.campaigns.map((c) => [c.id, c]),
);
export const campaignByMap = new Map(data.campaigns.map((c) => [c.map, c]));
// Existing tutorial definitions retain their original bytes/behavior.
for (const [id, row] of Object.entries(data.skills))
  if (!skillTemplates.has(Number(id))) skillTemplates.set(Number(id), row);
for (const [id, row] of Object.entries(data.actions))
  if (!actionTemplates.has(Number(id))) actionTemplates.set(Number(id), row);
export const campaignHeroNumbers = data.heroes;
export const campaignPawnNumbers = data.pawns;
export const campaignQuests = JSON.parse(
  readFileSync(join(projectRoot, "reference/campaign/quests.json"), "utf8"),
) as { template: Message; conditions: Message[]; items: Message[] }[];
export function campaignBattleIndices(campaign: number, base = 3): number[] {
  if (campaign === 1001) return [0, 1];
  const explicit = campaignDefinitions.get(campaign)?.battleIndices;
  if (explicit) return [...explicit];
  let index = base;
  for (const c of data.campaigns) {
    if (c.legacy || c.battleIndices) continue;
    const indices = (c.stages ?? []).map((_, i) => index + i);
    if (c.id === campaign) return indices;
    index += indices.length;
  }
  return [];
}
export function addCampaignBattles(battles: AdventureReference[]): void {
  for (const c of data.campaigns)
    if (!c.legacy && !c.battleIndices)
      for (const s of c.stages ?? [])
        battles.push(structuredClone(s.reference));
}
/** Append after the deployed labyrinth references, without remapping saved victories. */
export function addExpandedCampaignBattles(battles: AdventureReference[]): void {
  for (const c of data.campaigns)
    if (c.battleIndices)
      for (const [i, stage] of (c.stages ?? []).entries()) {
        if (battles.length !== c.battleIndices[i])
          throw new Error(`Índice de campanha incompatível: ${c.id}`);
        battles.push(structuredClone(stage.reference));
      }
}
const battleIndices = new Set(data.campaigns.flatMap(c => campaignBattleIndices(c.id)));
export function isCampaignBattle(index: number): boolean {
  return battleIndices.has(index);
}
