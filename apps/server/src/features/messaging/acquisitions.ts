import type { CityState } from "../../city-state.js";
import { currencies, currencyBalance, type Currency } from "../currencies/index.js";
import { itemTemplate } from "../../inventory.js";

export interface AcquisitionSnapshot {
  currencies: Record<Currency, number>;
  xp: number;
  items: Record<string, number>;
}
export interface AcquisitionGain {
  label: string;
  amount: number;
  item?: boolean;
}

/** Observe a specific operation, never a tick or a whole login/offline interval. */
export function acquisitionSnapshot(state: CityState): AcquisitionSnapshot {
  const items: Record<string, number> = {};
  for (const row of Object.values(state.items)) {
    if (row.exist === 0 || row.exist === false || !row.count) continue;
    items[row.template_id] = (items[row.template_id] ?? 0) + Number(row.count);
  }
  return {
    currencies: Object.fromEntries((Object.keys(currencies) as Currency[]).map(id => [id, currencyBalance(state, id)])) as Record<Currency, number>,
    xp: Number(state.player.totalGp ?? 0),
    items,
  };
}

/** Reports only positive, actually observed gains; moving/splitting stacks is neutral. */
export function acquisitionGains(before: AcquisitionSnapshot, after: AcquisitionSnapshot): AcquisitionGain[] {
  const result: AcquisitionGain[] = [];
  for (const id of Object.keys(currencies) as Currency[]) {
    const amount = after.currencies[id] - before.currencies[id];
    if (amount > 0) result.push({ label: currencies[id].label, amount });
  }
  const xp = after.xp - before.xp;
  if (xp > 0) result.push({ label: "XP", amount: xp });
  for (const [id, count] of Object.entries(after.items)) {
    const amount = count - (before.items[id] ?? 0);
    if (amount > 0) result.push({ label: itemTemplate(Number(id))?.TemplateName ?? `Item ${id}`, amount, item: true });
  }
  return result;
}

export function acquisitionText(gains: readonly AcquisitionGain[], source: string): string | undefined {
  const received = gains.filter(gain => gain.amount > 0);
  if (!received.length) return undefined;
  return `Você recebeu ${received.map(gain => gain.item ? `[${gain.label}] x${gain.amount}` : `${gain.amount} de ${gain.label}`).join(", ")} ${source}.`;
}
