import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { mounts, fieldsByPrimary, primaries, type Primary } from "./content.js";
import type { KingProgress } from "./state.js";

const policy = JSON.parse(readFileSync(join(projectRoot, "reference/mounts/king-policy.json"), "utf8"));
// Observed server policy, not a level-dependent curve invented from the UI.
export const capturedKingPercent: number = policy.extraPercent;
const content = JSON.parse(readFileSync(join(projectRoot, "reference/mounts/content.json"), "utf8"));
const perLevel = String(content.configs.find((row: any) => row.ConfigName === "mount_king_level_add_property").ConfigValue).split(",").map(Number);
export const kingPercent = (king?: KingProgress): number => king?.extraPercent ?? capturedKingPercent;
export function kingAttribute(id: number, name: Primary, king?: KingProgress): number {
  const base = Number(mounts.get(id)![fieldsByPrimary[name]]) + (king?.level ?? 0) * perLevel[primaries.indexOf(name)]!;
  return base + Math.floor(base * kingPercent(king) / 100);
}
