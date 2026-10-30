import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Message } from "../../messages.js";
import { settlementBuildingFields } from "./balance.js";

export const tables: Record<string, Message[]> = JSON.parse(
  readFileSync(join(projectRoot, "reference/settlement-tables.json"), "utf8"),
);
for (const row of tables.BuildingTempInfos!) Object.assign(row, settlementBuildingFields(row));
export const buildingTemplates = new Map(
  tables.BuildingTempInfos!.map((r) => [Number(r.TemplateId), r]),
);
export const pawnTemplates = new Map(
  tables
    .PawnTempInfos!.filter(
      (r) => Number(r.NeedBuilding) > 0 && Number(r.MasterType) <= 11,
    )
    .map((r) => [Number(r.TemplateId), r]),
);
export const troopFamilies = [...pawnTemplates.values()].filter(
  (r) => Number(r.Level) === 1,
);
export const effectTemplates = new Map(
  tables.EffectTempInfos!.map((r) => [Number(r.TemplateId), r]),
);
export const configValue = (name: string, fallback = 0): number =>
  Number(
    tables.ConfigInfos!.find((r) => r.ConfigName === name)?.ConfigValue ??
      fallback,
  );
export const upgrade = (
  type: number,
  level: number,
  template = 0,
): Message | undefined =>
  tables.UpGradeTempInfos!.find(
    (r) =>
      Number(r.Types) === type &&
      Number(r.Grades) === level &&
      Number(r.TemplateId) === template,
  );
export const buildingAt = (son: number, level: number): Message | undefined =>
  tables.BuildingTempInfos!.find(
    (r) => Number(r.SonType) === son && Number(r.BuildingGrade) === level,
  );
export const researchSons = [
  1304, 1420, 1421, 1422, 1423, 1424, 1441, 1442, 1443, 1444, 1445, 1446, 2304,
  2420, 2421, 2422, 2423, 2424, 2441, 2442, 2443, 2444, 2445, 2446,
];

/** PawnProperty.getTotalJoin; temp_data is the base, never an already-added skill bonus. */
export function pawnValue(pawn: Message, index: number): number {
  const field = [
    "Attack",
    "Defence",
    "MagicAttack",
    "MagicDefence",
    "Live",
    "ForceHit",
  ][index]!;
  const base = Number(
    pawnTemplates.get(pawn.tempate_id)?.[field] ??
      pawn.pawnLive?.[index]?.temp_data ??
      0,
  );
  if (!base) return 0;
  const p = pawn.pawnLive?.[index] ?? {};
  return Math.floor(
    ((((base +
      Number(p.bag_Data ?? 0) +
      Number(p.star_Data ?? 0) +
      Number(p.effect_Data ?? 0)) *
      (100 + Number(p.effect_Per ?? 0))) /
      100) *
      (100 +
        Number(p.bag_Per ?? 0) +
        Number(p.star_Per ?? 0) +
        Number(p.skill_Per ?? 0))) /
      100 +
      Number(p.skill_Data ?? 0),
  );
}
