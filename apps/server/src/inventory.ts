import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./config.js";
import type { Message } from "./messages.js";
import {localEquipmentTemplate} from "./features/equipment/requirements.js";
import { localMountItem } from "./features/mounts/catalog-overrides.js";
export class InventoryError extends Error {}
export interface InventoryIds {
  nextId: number;
}
export interface InventoryPolicy {
  created?: (item: Message) => void;
  signature?: (item: Message) => string;
  usable?: (item: Message) => boolean;
  destination?: (item: Message) => number;
  validateDestination?: (item: Message, bag: number, owner: number) => void;
  materialBags?: (template: number, bag: number) => number[];
}
const templates: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(join(projectRoot, "reference/item-templates.json"), "utf8"),
).items;
export const itemTemplate = (id: number) => templates[id] && localMountItem(localEquipmentTemplate(id === 208061 ? { ...templates[id]!, IsCanBatch: "true", SonType: "203" } : templates[id]!));
export function itemKey(item: Message): string {
  return `${item.bag_type}:${item.object_id ?? 0}:${item.pos}`;
}
function signature(item: Message): string {
  return JSON.stringify(
    Object.entries(item)
      .filter(
        ([k]) =>
          ![
            "id",
            "count",
            "pos",
            "bag_type",
            "object_id",
            "user_id",
            "exist",
          ].includes(k),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
export function sellPrice(item: Message): number {
  const t = itemTemplate(item.template_id);
  if (!t || Number(t.SellGold) <= 0)
    throw new InventoryError("Item sem preço de venda recuperado");
  if ([1, 2, 3, 4].some((n) => Number(item[`join_${n}`]) > 0))
    throw new InventoryError("Retire as gemas antes de vender");
  if (
    [113, 114, 115, 116].includes(Number(t.SonType)) ||
    Number(item.mould_grade ?? 0) > 0
  )
    throw new InventoryError(
      "Venda dessa categoria especial ainda não reconstruída",
    );
  const grade = Number(item.strengthen_grade ?? 0);
  if (
    !Number.isSafeInteger(grade) ||
    grade < 0 ||
    grade > Number(t.StrengthenMax)
  )
    throw new InventoryError("Fortalecimento inválido");
  let cost = 0;
  const level = Number(t.NeedGrades),
    quality = Number(t.Profile);
  for (let n = 0; n < grade; n++)
    cost += Math.trunc(
      level >= 80
        ? Math.pow(Math.floor(level / 10) + 1, 2) *
            (quality >= 6 ? quality + 2 : quality) *
            Math.pow(n + 1, 2.1) *
            10
        : Math.pow(1.5, Math.trunc(level / 10) + 1) *
            (quality + 1) *
            Math.pow(n + 1, 2.2) *
            5 +
            500,
    );
  const price = Math.trunc(Number(t.SellGold) + 0.7 * cost);
  if (!Number.isSafeInteger(price) || price <= 0)
    throw new InventoryError("Preço de venda inválido");
  return price;
}
export class Inventory {
  constructor(
    readonly items: Record<string, Message>,
    private ids: InventoryIds,
    private capacity: number | ((bag: number, owner: number) => number) = 100,
    private policy: InventoryPolicy = {},
  ) {
    ids.nextId = Math.max(
      ids.nextId,
      ...Object.values(items)
        .map((i) => Number(i.id) + 1)
        .filter(Number.isFinite),
    );
  }
  private quantity(count: number): void {
    if (!Number.isSafeInteger(count) || count <= 0)
      throw new InventoryError("Quantidade de item inválida");
  }
  private limit(bag: number, owner: number): number {
    return typeof this.capacity === "number" ? this.capacity : this.capacity(bag, owner);
  }
  private allocate(): number {
    if (!Number.isSafeInteger(this.ids.nextId) || this.ids.nextId > 2147483647)
      throw new InventoryError("Limite de identificadores de item");
    return this.ids.nextId++;
  }
  normalizeIds(): void {
    const seen = new Set<number>();
    for (const item of Object.values(this.items)) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id))
        item.id = this.allocate();
      seen.add(item.id);
    }
  }
  freeSlot(bag: number, owner: number): number {
    for (let pos = 0; pos < this.limit(bag, owner); pos++)
      if (!this.items[`${bag}:${owner}:${pos}`]) return pos;
    return -1;
  }
  consume(key: string, count: number): Message {
    this.quantity(count);
    const item = this.items[key];
    if (!item || item.count < count)
      throw new InventoryError("Item ou quantidade insuficiente");
    if (this.policy.usable && !this.policy.usable(item))
      throw new InventoryError("Item protegido, vencido ou em armazenamento indisponível");
    const consumed = structuredClone(item);
    consumed.count = count;
    item.count -= count;
    if (item.count === 0) delete this.items[key];
    return consumed;
  }
  /** Automatic material costs follow visible slot order, independent of save insertion order. */
  countTemplate(template: number, bag = 1, owner = 0): number {
    return Object.values(this.items).filter(item => item.template_id === template &&
      (this.policy.materialBags?.(template, bag) ?? [bag]).includes(item.bag_type) &&
      (item.object_id ?? 0) === owner && (!this.policy.usable || this.policy.usable(item)))
      .reduce((sum, item) => sum + Number(item.count), 0);
  }
  consumeTemplate(
    template: number,
    count: number,
    bag = 1,
    owner = 0,
  ): Message[] {
    this.quantity(count);
    const stacks = Object.entries(this.items)
      .filter(
        ([, i]) =>
          i.template_id === template &&
          (this.policy.materialBags?.(template, bag) ?? [bag]).includes(i.bag_type) &&
          (i.object_id ?? 0) === owner &&
          (!this.policy.usable || this.policy.usable(i)),
      )
      .sort(([, a], [, b]) => a.bag_type - b.bag_type || a.pos - b.pos);
    if (
      stacks.some(([, i]) => !Number.isSafeInteger(i.count) || i.count <= 0) ||
      stacks.reduce((n, [, i]) => n + i.count, 0) < count
    )
      throw new InventoryError("Item ou quantidade insuficiente");
    const consumed: Message[] = [];
    for (const [key, item] of stacks) {
      if (!count) break;
      const amount = Math.min(count, item.count);
      consumed.push(this.consume(key, amount));
      count -= amount;
    }
    return consumed;
  }
  add(model: Message, count: number): void {
    this.quantity(count);
    model = { ...model, object_id: model.object_id ?? 0 };
    if (this.policy.destination) model.bag_type = this.policy.destination(model);
    this.policy.validateDestination?.(model, model.bag_type, model.object_id);
    const max = Number(itemTemplate(model.template_id)?.MaxCount);
    if (!Number.isSafeInteger(max) || max < 1)
      throw new InventoryError("Limite de pilha desconhecido");
    const compatible = Object.values(this.items).filter(
      (i) =>
        i.bag_type === model.bag_type &&
        (i.object_id ?? 0) === model.object_id &&
        (this.policy.signature ?? signature)(i) === (this.policy.signature ?? signature)(model) &&
        i.pos < this.limit(model.bag_type, model.object_id) &&
        (!this.policy.usable || this.policy.usable(i)) &&
        i.count < max,
    );
    if (this.policy.signature) compatible.sort((a, b) => a.pos - b.pos);
    const empty = Array.from({ length: this.limit(model.bag_type, model.object_id) }, (_, pos) => pos).filter(
      (pos) => !this.items[`${model.bag_type}:${model.object_id}:${pos}`],
    );
    if (
      compatible.reduce((n, i) => n + max - i.count, 0) + empty.length * max <
      count
    )
      throw new InventoryError("Mochila sem espaço");
    for (const item of compatible) {
      const add = Math.min(count, max - item.count);
      item.count += add;
      count -= add;
      if (!count) return;
    }
    if (empty.includes(model.pos))
      (empty.splice(empty.indexOf(model.pos), 1), empty.unshift(model.pos));
    while (count) {
      const pos = empty.shift()!,
        amount = Math.min(max, count);
      const item = {
        ...structuredClone(model),
        id: this.allocate(),
        pos,
        count: amount,
        exist: 1,
      };
      this.policy.created?.(item);
      this.items[itemKey(item)] = item;
      count -= amount;
    }
  }
  move(request: Message): void {
    const from = `${request.begin_bag_type}:${request.begin_obj_id}:${request.begin_pos}`;
    const item = this.items[from];
    if (!item) throw new InventoryError("Item não encontrado");
    this.policy.validateDestination?.(item, request.end_bag_type, request.end_obj_id);
    const count = request.count === 0 ? item.count : request.count;
    this.quantity(count);
    let pos =
      request.end_pos === -1
        ? this.freeSlot(request.end_bag_type, request.end_obj_id)
        : request.end_pos;
    let to = `${request.end_bag_type}:${request.end_obj_id}:${pos}`;
    if (
      !Number.isSafeInteger(pos) ||
      pos < 0 ||
      pos >= this.limit(request.end_bag_type, request.end_obj_id) ||
      from === to ||
      count > item.count
    )
      throw new InventoryError("Movimento de item inválido");
    let target = this.items[to];
    const max = Number(itemTemplate(item.template_id)?.MaxCount ?? 1);
    if (
      target &&
      (max === 1 || signature(item) !== signature(target)) &&
      request.end_bag_type === 1
    ) {
      pos = this.freeSlot(1, request.end_obj_id);
      if (pos < 0) throw new InventoryError("Mochila sem espaço");
      to = `1:${request.end_obj_id}:${pos}`;
      target = undefined;
    }
    if (target) {
      if (signature(item) !== signature(target))
        throw new InventoryError("Itens incompatíveis no destino");
      if (target.count + count > max) {
        if (request.end_bag_type !== 1)
          throw new InventoryError("Slot temporário sem espaço");
        const staged = structuredClone(this.items),
          ids = { ...this.ids };
        const inventory = new Inventory(staged, ids, this.capacity, this.policy);
        inventory.consume(from, count);
        const fill = Math.max(0, max - target.count);
        staged[to]!.count += fill;
        inventory.add(
          { ...item, bag_type: 1, object_id: request.end_obj_id, pos },
          count - fill,
        );
        for (const key of Object.keys(this.items)) delete this.items[key];
        Object.assign(this.items, staged);
        this.ids.nextId = ids.nextId;
        return;
      }
      this.consume(from, count);
      target.count += count;
    } else {
      const moved = {
        ...structuredClone(item),
        bag_type: request.end_bag_type,
        object_id: request.end_obj_id,
        pos,
        count,
        id: count < item.count ? this.allocate() : item.id,
      };
      this.consume(from, count);
      this.items[to] = moved;
    }
  }
}
export function inventoryUpdates(
  before: Record<string, Message>,
  after: Record<string, Message>,
): Message[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => {
      const [bag, owner, pos] = k.split(":").map(Number);
      return {
        change_type: bag,
        change_obj_id: owner,
        change_pos: pos,
        ...(after[k] ? { item: after[k] } : {}),
      };
    });
}
