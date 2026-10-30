import { Inventory, InventoryError, itemKey, itemTemplate } from "../../inventory.js";
import type { Message } from "../../messages.js";
import { tables } from "../settlement/content.js";

const config = (name: string) => tables.ConfigInfos?.find(row => row.ConfigName === name)?.ConfigValue;
export const storageRules = {
  base: Number(config("Player_BagCount")),
  rowSize: Number(config("Player_BagAdd")),
  rowCosts: String(config("AddBag_Count")).split(",").map(Number),
  rentalCosts: Object.fromEntries(String(config("rental_bag_day_cost")).split("|").map(row => {
    const [days, cost] = row.split(",").map(Number);
    return [String(days), cost! * 2];
  })) as Record<string, number>,
  treasureCost: Number(config("Buy_StoneBag")),
};
if (storageRules.base !== 42 || storageRules.rowSize !== 7 || storageRules.rowCosts.some(c => !Number.isSafeInteger(c) || c <= 0) || storageRules.treasureCost !== 1000)
  throw new Error("Tabelas recuperadas da mochila inválidas");

export const storageTypes = new Set([205, 224, 228, 312, 329, 343, 344, 752, 753, 760, 761]);
export const storageEligible = (item: Message) => storageTypes.has(Number(itemTemplate(item.template_id)?.SonType));
export const permanentCapacity = (player: Message) => storageRules.base + Number(player.bag_count ?? 0);
export const stoneCapacity = (player: Message) => Number(player.stoneBagCount ?? player.$125?.value ?? 0);
/** Choose the final acquisition destination before searching for capacity. */
export function storageDestination(player: Message, item: Message): number {
  if (![1, 34].includes(item.bag_type) || (item.object_id ?? 0) !== 0) return item.bag_type;
  return stoneCapacity(player) > 0 && storageEligible(item) ? 34 : 1;
}
export function validateStorageDestination(player: Message, item: Message, bag: number, owner: number): void {
  if (bag === 34 && (owner !== 0 || stoneCapacity(player) <= 0 || !storageEligible(item)))
    throw new InventoryError("Este item não pode entrar na Bolsa do Tesouro");
}
/** Existing items are relocated atomically, keeping IDs, binding and protection.
 * No common-bag vacancy is involved. A full treasure bag aborts the operation. */
export function transferTreasures(inventory: Inventory, player: Message, now: number): void {
  if (stoneCapacity(player) <= 0) return;
  const staged = structuredClone(inventory.items);
  const destination = new Inventory(staged, { nextId: 1 }, bag => storageCapacity(player, bag, now));
  const sources = Object.values(staged).filter(i => i.bag_type === 1 && (i.object_id ?? 0) === 0 && storageEligible(i)).sort((a, b) => a.pos - b.pos);
  for (const source of sources) {
    const from = itemKey(source), max = Number(itemTemplate(source.template_id)?.MaxCount);
    if (!Number.isSafeInteger(source.count) || source.count <= 0 || !Number.isSafeInteger(max) || max < 1 || source.count > max)
      throw new InventoryError("Pilha de tesouro inválida");
    if (!source.is_locked) {
      const targets = Object.values(staged).filter(i => i.bag_type === 34 && (i.object_id ?? 0) === 0 && i.pos < stoneCapacity(player) && !i.is_locked && i.count < max && stackSignature(i) === stackSignature(source)).sort((a, b) => a.pos - b.pos);
      for (const target of targets) {
        const remaining = staged[from];
        if (!remaining) break;
        moveStorage(destination, player, { begin_bag_type: 1, begin_obj_id: 0, begin_pos: source.pos, end_bag_type: 34, end_obj_id: 0, end_pos: target.pos, count: Math.min(remaining.count, max - target.count) }, now);
      }
    }
    if (staged[from]) moveStorage(destination, player, { begin_bag_type: 1, begin_obj_id: 0, begin_pos: source.pos, end_bag_type: 34, end_obj_id: 0, end_pos: -1, count: 0 }, now);
  }
  for (const key of Object.keys(inventory.items)) delete inventory.items[key];
  Object.assign(inventory.items, staged);
}
export function dateTime(value: unknown): number {
  if (typeof value !== "string" || !value) return NaN;
  return Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z");
}
export const serverDate = (time: number) => new Date(time).toISOString().slice(0, 19).replace("T", " ");
export function expired(item: Message, now: number): boolean {
  const minutes = Number(item.valid_date ?? 0), start = dateTime(item.begin_date);
  return minutes > 0 && Number.isFinite(start) && start + minutes * 60000 <= now;
}
export function storageCapacity(player: Message, bag: number, now: number, withdraw = false): number {
  if (bag === 34) return stoneCapacity(player);
  if (bag !== 1) return 100;
  const active = dateTime(player.rentalBagTime) > now;
  return permanentCapacity(player) + (active || withdraw ? Math.min(2, Number(player.status ?? 0)) * 49 : 0);
}
// Stack identity excludes presentation and location fields, but preserves binding,
// validity, enhancement and every unknown protocol field. Missing zero defaults
// do not make otherwise identical objects incompatible.
export function stackSignature(item: Message): string {
  const ignored = new Set(["id", "count", "pos", "bag_type", "object_id", "user_id", "exist", "is_new"]);
  if (!Number(item.valid_date ?? 0)) ignored.add("begin_date");
  return JSON.stringify(Object.entries(item).filter(([k, v]) => !ignored.has(k) && v !== 0 && v !== false && v !== "" && v !== undefined).sort(([a], [b]) => a.localeCompare(b)));
}
function validSlot(pos: number, limit: number): void {
  if (!Number.isSafeInteger(pos) || pos < 0 || pos >= limit) throw new InventoryError("Posição de mochila indisponível");
}
function validBag(bag: number, owner: number): void {
  if (![1, 34].includes(bag) || owner !== 0) throw new InventoryError("Bolsa de armazenamento inválida");
}
export function moveStorage(inventory: Inventory, player: Message, r: Message, now: number): void {
  validBag(r.begin_bag_type, r.begin_obj_id);
  validBag(r.end_bag_type, r.end_obj_id);
  const from = `${r.begin_bag_type}:0:${r.begin_pos}`, item = inventory.items[from];
  validSlot(r.begin_pos, storageCapacity(player, r.begin_bag_type, now, true));
  if (!item) throw new InventoryError("Item não encontrado");
  const count = r.count === 0 ? item.count : r.count;
  if (!Number.isSafeInteger(count) || count <= 0 || count > item.count) throw new InventoryError("Quantidade de item inválida");
  const limit = storageCapacity(player, r.end_bag_type, now);
  const pos = r.end_pos === -1 ? Array.from({ length: limit }, (_, p) => p).find(p => !inventory.items[`${r.end_bag_type}:0:${p}`]) ?? -1 : r.end_pos;
  validSlot(pos, limit);
  const to = `${r.end_bag_type}:0:${pos}`, target = inventory.items[to];
  if (from === to) return;
  if (r.end_bag_type === 34 && !storageEligible(item)) throw new InventoryError("Este item não pertence à bolsa de tesouros");
  const max = Number(itemTemplate(item.template_id)?.MaxCount);
  if (!Number.isSafeInteger(max) || max < 1) throw new InventoryError("Limite de pilha desconhecido");
  if (target && max > 1 && stackSignature(item) === stackSignature(target) && target.count < max) {
    const amount = Math.min(count, max - target.count);
    inventory.consume(from, amount);
    target.count += amount;
    return; // Overflow remains in its source slot, never disappears or needs free space.
  }
  if (target) {
    if (count !== item.count) throw new InventoryError("Para trocar itens, mova a pilha inteira");
    if (r.begin_bag_type === 34 && !storageEligible(target)) throw new InventoryError("O item de destino não pertence à bolsa de tesouros");
    validSlot(r.begin_pos, storageCapacity(player, r.begin_bag_type, now));
    inventory.items[from] = { ...target, bag_type: r.begin_bag_type, object_id: 0, pos: r.begin_pos };
    inventory.items[to] = { ...item, bag_type: r.end_bag_type, object_id: 0, pos };
    return;
  }
  inventory.move({ ...r, end_pos: pos });
}

export function arrangeStorage(inventory: Inventory, player: Message, r: Message, now: number): void {
  const bag = r.bagType;
  validBag(bag, 0);
  const current = Object.values(inventory.items).filter(i => i.bag_type === bag && (i.object_id ?? 0) === 0);
  const positions = new Set<number>(), sources = new Set<number>();
  const entries: Message[] = r.arrangeInfo ?? [];
  if (entries.length !== current.length) throw new InventoryError("A mochila mudou: organize novamente");
  const ordered: Message[] = entries.map(e => {
    validSlot(e.newplace, storageCapacity(player, bag, now, true));
    const item = inventory.items[`${bag}:0:${e.oldplace}`];
    if (!item || sources.has(e.oldplace) || positions.has(e.newplace)) throw new InventoryError("Organização de mochila inválida");
    if (e.newplace >= storageCapacity(player, bag, now) && e.newplace !== e.oldplace) throw new InventoryError("Renove o aluguel antes de reorganizar os slots temporários");
    sources.add(e.oldplace); positions.add(e.newplace);
    if (!Number.isSafeInteger(item.count) || item.count <= 0) throw new InventoryError("Quantidade inválida no armazenamento");
    return { ...structuredClone(item), pos: e.newplace };
  });
  const merged: Message[] = [];
  for (const item of ordered) {
    if (r.isStackItem && !item.is_locked) {
      const max = Number(itemTemplate(item.template_id)?.MaxCount);
      if (!Number.isSafeInteger(max) || max < 1) throw new InventoryError("Limite de pilha desconhecido");
      for (const target of merged) {
        if (target.is_locked || stackSignature(target) !== stackSignature(item)) continue;
        const amount = Math.min(item.count, Math.max(0, max - target.count));
        target.count += amount; item.count -= amount;
        if (!item.count) break;
      }
    }
    if (item.count) merged.push(item);
  }
  // Preserve the exact permutation when not stacking; compact survivors into the
  // client-provided target slots when piles have merged.
  const slots = ordered.map(i => i.pos);
  for (const item of current) delete inventory.items[itemKey(item)];
  merged.forEach((item, index) => {
    item.pos = slots[index]!;
    inventory.items[itemKey(item)] = item;
  });
  if (bag === 1) transferTreasures(inventory, player, now);
}

export function expansion(player: Message, rows: number): { extra: number; cost: number } {
  const current = Number(player.bag_count ?? 0) / storageRules.rowSize;
  if (!Number.isInteger(current) || current < 0 || current > 26 || !Number.isSafeInteger(rows) || rows < 1 || current + rows > 26) throw new InventoryError("Expansão de mochila inválida");
  let cost = 0;
  for (let n = current + 1; n <= current + rows; n++) cost += storageRules.rowCosts[Math.min(n - 1, storageRules.rowCosts.length - 1)]!;
  return { extra: (current + rows) * storageRules.rowSize, cost };
}
