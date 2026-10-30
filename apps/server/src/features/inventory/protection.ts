import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { InventoryError } from "../../inventory.js";
import type { Message } from "../../messages.js";

export interface StorageProtection { salt: string; hash: string }
export function createProtection(password: unknown): StorageProtection {
  if (typeof password !== "string" || !/^\d{6}$/.test(password) || /^(\d)\1{5}$/.test(password) || /^(012345|123456|234567|345678|456789|987654|876543|765432|654321|543210)$/.test(password))
    throw new InventoryError("Use seis dígitos diferentes de sequências simples na senha secundária");
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 32).toString("hex") };
}
export function checkProtection(saved: StorageProtection | undefined, password: unknown): boolean {
  if (!saved || typeof password !== "string" || !/^\d{6}$/.test(password)) return false;
  return timingSafeEqual(Buffer.from(saved.hash, "hex"), scryptSync(password, saved.salt, 32));
}
export function lockStorage(items: Record<string, Message>, r: Message, confirmed: boolean): void {
  const bag = r.op_type === 1 ? 1 : r.op_type === 5 ? 34 : 0;
  if (!bag || !Number.isSafeInteger(r.item_pos) || r.item_pos < 0) throw new InventoryError("Proteção de armazenamento inválida");
  const item = items[`${bag}:0:${r.item_pos}`];
  if (!item) throw new InventoryError("Item não encontrado");
  if (!confirmed) throw new InventoryError("Confirme a senha secundária antes de alterar a proteção");
  item.is_locked = item.is_locked ? 0 : 1;
}
