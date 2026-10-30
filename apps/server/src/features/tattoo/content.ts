import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
const data: { configs: Record<string,string>[]; engraving: Record<string,string>[] } = JSON.parse(readFileSync(join(projectRoot,"reference/tattoo/content.json"),"utf8"));
export const config = (key: string) => data.configs.find(r=>r.ConfigName===key)!.ConfigValue!;
export const engravingRows = new Map(data.engraving.map(r=>[Number(r.Grades),r]));
export const unlockedSlots = (level: number) => level < 70 ? 0 : level < 72 ? 2 : level < 74 ? 4 : Math.min(8,5+Math.floor((level-74)/2));
export const properties = [0,1,2,3,5] as const;
export const primaryFields: Record<number,string> = {0:"total_power",1:"total_agility",2:"total_intellect",3:"total_captain",5:"total_physique"};
export const dyes = {1:208101,2:208102} as const;
/** Uncaptured server choices are explicit, versioned local simulation rules. */
export const localTattooPolicy = {
  revision: 1, equalPropertyWeights: true, negativeProgression: "accumulated-client-range" as const,
  engravingProperties: [0,1,2,5], engravingFailure: "keep-level" as const,
  engravingSuccess: "first-two-table-weights" as const,
  autoBuyUnitPrice: {1:1,2:3} as Record<number,number>,
};
export const materialPerAttempt = 100;
