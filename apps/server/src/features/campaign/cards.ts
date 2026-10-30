import { randomInt } from "node:crypto";
import type { CampaignCard } from "./content.js";

/** Local distribution: original server weights were not included in the client. */
export function campaignCardDeck(
  pool: CampaignCard[],
  count: number,
): CampaignCard[] {
  if (!pool.length || !Number.isInteger(count) || count < 1 || count > 20)
    throw new Error("Recompensas de carta indisponíveis");
  return Array.from({ length: count }, () =>
    structuredClone(pool[randomInt(pool.length)]!),
  );
}
