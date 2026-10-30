import { curve, templates } from "./content.js";
import type { Cosmo } from "./state.js";
export function maximumLevel(profile: number): number { return Math.max(1, ...curve(profile).map(row => Number(row.Grades))); }
export function transferableXP(star: Cosmo): number {
  const row = templates.get(star.templateId)!;
  return Number(row.SellGp) + star.xp + curve(Number(row.Profile)).filter(step => Number(step.Grades) <= star.level).reduce((sum, step) => sum + Number(step.Data), 0);
}
export function absorbXP(star: Cosmo, amount: number): void {
  const profile = Number(templates.get(star.templateId)!.Profile);
  star.xp += amount;
  while (star.level < maximumLevel(profile)) {
    const cost = Number(curve(profile).find(row => Number(row.Grades) === star.level + 1)!.Data);
    if (star.xp < cost) break;
    star.xp -= cost; star.level++;
  }
  // Excess remains transferable, rather than silently destroying invested XP at level cap.
}
