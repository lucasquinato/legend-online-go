import { config, primaries, upgradeRows, type Primary } from "./content.js";

export interface SoulProgress { grades: Record<Primary, number>; xp: number }
const sides = upgradeRows(144);
const centers = upgradeRows(145);
const costs = new Map(upgradeRows(146).map(row => [Number(row.Grades), Number(row.Data)]));
export const soulMaxGrade = Number(sides.at(-1)!.Grades);
export const soulTotalGrade = (soul: SoulProgress): number => primaries.reduce((sum, name) => sum + soul.grades[name], 0);

// Mirrors TempleteManager.getNewUpgradeGradeBy: Data is a cumulative interval,
// not the absolute threshold of a central level.
export function soulCenterPercent(soul: SoulProgress): number {
  let remaining = soulTotalGrade(soul);
  for (const row of centers) {
    if (remaining < Number(row.Data)) return Number(row.ActiveObject);
    remaining -= Number(row.Data);
  }
  return Number(centers.at(-1)!.ActiveObject);
}
export const soulSidePercent = (grade: number): number => Number(sides.find(row => Number(row.Grades) === grade)?.ActiveObject ?? 0);
export function soulExtraction(raw: number, soul: SoulProgress, name: Primary) {
  const pool = Math.min(Math.ceil(raw * soulCenterPercent(soul) / 100), config("mount_refining_soul_value_max", 100000));
  return { pool, bonus: Math.ceil(pool * soulSidePercent(soul.grades[name]) / 100) };
}
function nextSide(soul: SoulProgress): Primary | undefined {
  const minimum = Math.min(...primaries.map(name => soul.grades[name]));
  return minimum >= soulMaxGrade ? undefined : primaries.find(name => soul.grades[name] === minimum);
}
function nextCost(soul: SoulProgress): number {
  const cost = costs.get(soulTotalGrade(soul));
  if (!Number.isSafeInteger(cost) || !cost || cost <= 0) throw new Error("Curva de refino espiritual inválida.");
  return cost;
}
export function remainingSoulXP(soul: SoulProgress): number {
  const pending: SoulProgress = { grades: { ...soul.grades }, xp: 0 };
  let remaining = -soul.xp;
  for (let name = nextSide(pending); name; name = nextSide(pending)) {
    remaining += nextCost(pending);
    pending.grades[name]++;
  }
  return Math.max(0, remaining);
}
export function advanceSoul(soul: SoulProgress, xp: number): void {
  soul.xp += xp;
  for (let name = nextSide(soul); name; name = nextSide(soul)) {
    const cost = nextCost(soul);
    if (soul.xp < cost) return;
    soul.xp -= cost;
    soul.grades[name]++;
  }
  soul.xp = 0;
}
