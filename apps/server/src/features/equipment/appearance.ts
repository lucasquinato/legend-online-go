import type { Message } from "../../messages.js";
import { itemTemplate } from "../../inventory.js";
import type { CityState } from "../../city-state.js";

/** Equipment and fashion are independent layers; the client chooses which one to draw. */
export function equipmentAppearance(items: Record<string, Message>, heroId: number): { arm: string; cloth: string } {
  const visual = (pos: number, type: number): string => {
    const item = items[`4:${heroId}:${pos}`];
    if (!item || !item.exist || item.count !== 1 || Number(item.bag_type) !== 4 ||
        Number(item.object_id) !== heroId || Number(item.pos) !== pos) return "";
    const template = itemTemplate(Number(item.template_id));
    return Number(template?.MasterType) === 1 && Number(template?.SonType) === type
      ? String(template?.Avata ?? "") : "";
  };
  return { arm: visual(0, 101), cloth: visual(2, 104) };
}

export function synchronizeEquipmentAppearance(state: CityState): void {
  const visual = equipmentAppearance(state.items, Number(state.hero.hero_id));
  Object.assign(state.army, visual);
  Object.assign(state.hero, visual);
}

/** Battle HeroMsg uses different field names from ArmyMsg/SimpleHeroInfoMsg. */
export function applyBattleEquipmentAppearance(hero: Message, army: Message): void {
  hero.slot_avata = String(army.arm ?? "");
  hero.cloth_avate = String(army.cloth ?? "");
}
