import { type Message } from "./messages.js";
import { isAttribute } from "./attributes.js";
import { nextGoldBalance } from "./gold.js";
export interface CityState {
  player: Message;
  hero: Message;
  economy: Message;
  army: Message;
  items: Record<string, Message>;
  quests: Record<string, Message>;
  buildings: Record<string, Message>;
  mails: Record<string, Message>;
  fashions: Record<string, Message>;
  fashionIds: number[];
  farms: Record<string, Message>;
  tower: Message;
  packets: Record<string, CityPacket>;
  pawnStock?: Message[];
}
export interface CityPacket {
  authoritative?: boolean;
  opcode: number;
  message?: Message;
  body?: string;
  delayMs?: number;
}
export interface CityPatch {
  path: string[];
  before?: any;
  after?: any;
}
export function emptyCity(): CityState {
  return {
    player: {},
    hero: {},
    economy: {},
    army: {},
    items: {},
    quests: {},
    buildings: {},
    mails: {},
    fashions: {},
    fashionIds: [],
    farms: {},
    tower: {},
    packets: {},
  };
}
export function mergeRows(
  previous: Message[] = [],
  next: Message[] = [],
  key = "pos",
): Message[] {
  const rows = new Map(previous.map((r) => [r[key], r]));
  for (const r of next)
    rows.set(r[key], { ...rows.get(r[key]), ...structuredClone(r) });
  return [...rows.values()];
}
export function ingestCity(state: CityState, packet: CityPacket): void {
  const m = packet.message;
  if (!m) return;
  switch (packet.opcode) {
    case 3:
      Object.assign(state.player, m);
      break;
    case 109:
      Object.assign(state.economy, m);
      break;
    case 4725:
      state.packets[4725] = structuredClone(packet);
      break;
    case 113:
      Object.assign(state.hero, m);
      break;
    case 150:
      Object.assign(state.army, m);
      if (m.simple_hero_info) Object.assign(state.hero, m.simple_hero_info);
      break;
    case 100:
      state.pawnStock = structuredClone(m.armyPawn ?? []);
      break;
    case 112:
      for (const q of m.quest ?? [])
        state.quests[q.template_id] = { ...state.quests[q.template_id], ...q };
      if (m.states) {
        state.player.quest_site = m.states;
        state.player.quest_site_len = m.states_length;
      }
      break;
    case 115:
      for (const v of m.moved ?? []) {
        const key = `${v.item?.bag_type ?? v.change_type}:${v.change_obj_id ?? 0}:${v.change_pos}`;
        if (v.item?.exist) state.items[key] = structuredClone(v.item);
        else delete state.items[key];
      }
      break;
    case 4130:
      for (const b of m.building ?? [])
        state.buildings[b.building_id] = {
          ...state.buildings[b.building_id],
          ...b,
        };
      break;
    case 4131:
    case 148:
      for (const v of m.mailInfos ?? [])
        state.mails[v.id] = { ...state.mails[v.id], ...v };
      break;
    case 4542:
      for (const v of m.info ?? [])
        state.fashions[v.temp_id] = { ...state.fashions[v.temp_id], ...v };
      if (m.fashionIds) state.fashionIds = m.fashionIds;
      break;
    case 4386:
    case 4387: {
      const previous = state.farms[m.user_id] ?? {};
      state.farms[m.user_id] = {
        ...previous,
        ...m,
        farmLandInfo: mergeRows(previous.farmLandInfo, m.farmLandInfo),
      };
      break;
    }
    case 4205:
      Object.assign(state.tower, m);
      break;
    case 4373:
      if (m.towerInfo?.[0]) Object.assign(state.tower, m.towerInfo[0]);
      break;
  }
}
export function cityDiff(
  before: any,
  after: any,
  path: string[] = [],
): CityPatch[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length &&
    before.every(
      (r: any, i: number) =>
        r &&
        typeof r === "object" &&
        after[i] &&
        r.pos === after[i].pos &&
        r.masterType === after[i].masterType,
    )
  )
    return before.flatMap((r: any, i: number) =>
      cityDiff(r, after[i], [...path, String(i)]),
    );
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  )
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap((k) => cityDiff(before[k], after[k], [...path, k]));
  return [{ path, before, after }];
}
export function valueAt(object: any, path: string[]): any {
  for (const k of path) object = object?.[k];
  return object;
}
const deltaKeys = new Set([
  "gp",
  "totalGp",
  "strategy",
  "point",
  "gift_token",
  "gold_total_count",
  "crystals_count",
  "cur_population",
  "skill_point",
  "count",
  "total_gp",
  "today_from_friend_gp",
  "total_phy_attack",
  "total_magic_attack",
  "total_phy_defence",
  "total_magic_defence",
  "total_live",
  "base_phy_attack",
  "base_magic_attack",
  "base_phy_defence",
  "base_magic_defence",
  "base_live",
  "hp",
  "fighting_capacity",
  "fightingCapacity",
]);
export function applyCityPatch(state: CityState, patch: CityPatch): void {
  if (patch.path.join(".") === "economy.gold_total_count") {
    if (typeof patch.before !== "number" || typeof patch.after !== "number")
      throw new Error("Alteração de ouro sem quantidade conhecida");
    state.economy.gold_total_count = nextGoldBalance(
      state.economy.gold_total_count,
      patch.after - patch.before,
    );
    return;
  }
  let target: any = state;
  for (const k of patch.path.slice(0, -1)) target = target[k] ??= {};
  const key = patch.path.at(-1)!;
  if (patch.after === undefined) {
    delete target[key];
    return;
  }
  if (
    key === "bytes" &&
    typeof patch.before === "string" &&
    typeof patch.after === "string" &&
    typeof target[key] === "string"
  ) {
    const before = Buffer.from(patch.before, "base64"),
      after = Buffer.from(patch.after, "base64"),
      current = Buffer.from(target[key], "base64");
    if (before.length === after.length && current.length === after.length) {
      for (let i = 0; i < current.length; i++) {
        const mask = before[i]! ^ after[i]!;
        current[i] = (current[i]! & ~mask) | (after[i]! & mask);
      }
      target[key] = current.toString("base64");
      return;
    }
  }
  target[key] =
    typeof patch.before === "number" &&
    typeof patch.after === "number" &&
    typeof target[key] === "number" &&
    (deltaKeys.has(key) || (patch.path[0] === "hero" && isAttribute(key)))
      ? target[key] + patch.after - patch.before
      : structuredClone(patch.after);
}
