import type { CitySave } from "../../city-world.js";
import { gameDay } from "../../game-clock.js";
import { campaignRules } from "./rules.js";
import { CurrencyError } from "../currencies/index.js";
export interface HeroEntrySave {
  day: string;
  used: number;
}
export function heroEntries(saved: CitySave, now: number): number {
  const day = gameDay(now);
  if (saved.heroEntries?.day !== day) saved.heroEntries = { day, used: 0 };
  const base = Number(
    campaignRules.config.find(
      (c) => c.ConfigName === "single_hero_base_enter_count",
    )?.ConfigValue ?? 3,
  );
  return Math.max(0, base - saved.heroEntries.used);
}
export function reserveHeroEntries(
  saved: CitySave,
  count: number,
  now: number,
): string {
  if (heroEntries(saved, now) < count)
    throw new CurrencyError("Tentativas heroicas com recompensa insuficientes");
  saved.heroEntries!.used += count;
  return saved.heroEntries!.day;
}
