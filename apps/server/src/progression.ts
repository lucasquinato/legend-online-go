import type { Message } from "./messages.js";
import type { CityPatch } from "./city-state.js";
import { characterLevels } from "./features/fashion/appraisal.js";

export class ExperienceError extends Error {}
export function grantExperience(player: Message, amount: number): void {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(Number(player.gp ?? 0) + amount) ||
    !Number.isSafeInteger(Number(player.totalGp ?? 0) + amount)
  )
    throw new ExperienceError("Experiência inválida ou limite excedido");
  player.gp = Number(player.gp ?? 0) + amount;
  player.totalGp = Number(player.totalGp ?? 0) + amount;
  while (
    characterLevels.has(player.grades + 1) &&
    player.gp >= characterLevels.get(player.grades + 1)!
  ) {
    player.gp -= characterLevels.get(player.grades + 1)!;
    player.grades++;
  }
}
/** totalGp records earned XP; captured gp changes can also include level rollover. */
export function experienceReward(patches: CityPatch[]): number {
  const total = patches.find((p) => p.path.join(".") === "player.totalGp");
  const current =
    total ?? patches.find((p) => p.path.join(".") === "player.gp");
  if (!current) return 0;
  if (typeof current.before !== "number" || typeof current.after !== "number")
    throw new ExperienceError("Recompensa de XP sem quantidade conhecida");
  const amount = current.after - current.before;
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new ExperienceError("Recompensa de XP inválida");
  return amount;
}
export function repairExperience(player: Message): boolean {
  if (Number(player.gp) >= 0) return false;
  let xp = Number(player.totalGp),
    level = 1;
  if (!Number.isSafeInteger(xp) || xp < 0)
    throw new ExperienceError("XP acumulado inválido para recuperação");
  while (
    characterLevels.has(level + 1) &&
    xp >= characterLevels.get(level + 1)!
  ) {
    xp -= characterLevels.get(level + 1)!;
    level++;
  }
  player.grades = level;
  player.gp = xp;
  return true;
}
