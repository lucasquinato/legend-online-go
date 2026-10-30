import { Inventory, InventoryError, itemTemplate } from "../../inventory.js";
import type { Message } from "../../messages.js";
import { initialEquipmentSource } from "../attributes/initial-equipment.js";
import { equipmentSource } from "./content.js";

const slots: Record<number, number[]> = { 101: [0], 103: [1], 104: [2], 106: [3], 107: [4, 5], 108: [6, 7], 117: [12], 118: [13] };
export interface EquipmentOwner { heroId: number; job: number; sex: number; level: number; capacity: number }

export function validateEquipment(item: Message, owner: EquipmentOwner, pos: number): void {
  const template = itemTemplate(item.template_id);
  if (!template || Number(template.MasterType) !== 1 || !slots[Number(template.SonType)]?.includes(pos))
    throw new InventoryError("Equipamento incompatível com este slot");
  if (!String(template.Job ?? "0").split(",").some(j => Number(j) === 0 || Number(j) === owner.job))
    throw new InventoryError("Equipamento de outra classe");
  if (![2, owner.sex].includes(Number(template.Sexs))) throw new InventoryError("Equipamento incompatível com o personagem");
  if (Number(template.NeedGrades) > owner.level) throw new InventoryError("Nível insuficiente para equipar");
  if (!(initialEquipmentSource(item) ?? equipmentSource(item))) throw new InventoryError("Os atributos desta categoria de equipamento ainda não foram reconstruídos");
}

/** Swap real instances without reallocating IDs or touching fashion's virtual slots. */
export function moveEquipment(inventory: Inventory, r: Message, owner: EquipmentOwner): void {
  if (![1, 4].includes(r.begin_bag_type) || ![1, 4].includes(r.end_bag_type) ||
      r.begin_obj_id !== (r.begin_bag_type === 4 ? owner.heroId : 0) ||
      r.end_obj_id !== (r.end_bag_type === 4 ? owner.heroId : 0))
    throw new InventoryError("Proprietário ou bolsa de equipamento inválido");
  const from = `${r.begin_bag_type}:${r.begin_obj_id}:${r.begin_pos}`, item = inventory.items[from];
  if (!item || item.count !== 1 || ![0, 1].includes(r.count) || Number(itemTemplate(item.template_id)?.MasterType) !== 1)
    throw new InventoryError("Equipamento ou quantidade inválida");
  if (item.is_locked) throw new InventoryError("Desbloqueie o equipamento antes de movê-lo");
  if (!Number.isSafeInteger(r.end_pos) || r.end_pos < 0 || (r.end_bag_type === 1 && r.end_pos >= owner.capacity))
    throw new InventoryError("Mochila sem espaço ou posição indisponível");
  if (r.begin_bag_type === 4 && !slots[Number(itemTemplate(item.template_id)?.SonType)]?.includes(r.begin_pos))
    throw new InventoryError("Slot de equipamento de origem inválido");
  if (r.end_bag_type === 4) validateEquipment(item, owner, r.end_pos);
  const to = `${r.end_bag_type}:${r.end_obj_id}:${r.end_pos}`, target = inventory.items[to];
  if (from === to) return;
  if (target) {
    if (target.is_locked || target.count !== 1 || Number(itemTemplate(target.template_id)?.MasterType) !== 1)
      throw new InventoryError("O destino está ocupado por um item incompatível ou protegido");
    if (r.begin_bag_type === 4) validateEquipment(target, owner, r.begin_pos);
    inventory.items[from] = { ...target, bag_type: r.begin_bag_type, object_id: r.begin_obj_id, pos: r.begin_pos };
    inventory.items[to] = { ...item, bag_type: r.end_bag_type, object_id: r.end_obj_id, pos: r.end_pos };
    return;
  }
  // Existing Inventory validates capacity for empty common-bag slots.
  inventory.move({ ...r, count: 1 });
}
