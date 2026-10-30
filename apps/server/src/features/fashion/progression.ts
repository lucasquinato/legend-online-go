import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { itemTemplate, InventoryError } from "../../inventory.js";
import type { Message } from "../../messages.js";
import { fields, protoInt } from "../../protocol.js";

const reference = JSON.parse(
  readFileSync(join(projectRoot, "reference/fashion-progression.json"), "utf8"),
);
export const fashionLevels = new Map<number, Message>(
  reference.levels.map((r: Message) => [Number(r.Grades), r]),
);
const properties = new Map<number, Message>(
  reference.properties.map((r: Message) => [Number(r.TemplateId), r]),
);
export const MAX_FASHION_LEVEL = Math.max(...fashionLevels.keys());
export interface FashionProgress {
  level: number;
  xp: number;
  // Preserve newer protocol fields without tying this backend to client files.
  fields: Record<string, number>;
}
export function fashionProgress(body?: string): FashionProgress {
  const values = Object.fromEntries(
    body
      ? fields(Buffer.from(body, "base64"))
          .filter((f) => f.wire === 0)
          .map((f) => [String(f.number), Number(f.value)])
      : [],
  );
  return { level: values["2"] ?? 0, xp: values["1"] ?? 0, fields: values };
}
export function fashionXp(template: number): number {
  if (template === 208020) return reference.config.Fashion_Soul;
  if (template === 208021) return reference.config.Fashion_Lucky;
  const row = itemTemplate(template);
  if (
    row?.MasterType === "1" &&
    [109, 110, 111, 112].includes(Number(row.SonType))
  )
    return Number(row.SonType) === 109
      ? reference.config.Fashion_Wing
      : reference.config.Fashion_Other;
  return 0;
}
export function advanceFashion(progress: FashionProgress, xp: number): void {
  if (!Number.isSafeInteger(xp) || xp <= 0)
    throw new InventoryError("Experiência de moda inválida");
  if (progress.level >= MAX_FASHION_LEVEL)
    throw new InventoryError(
      "A moda já está no nível máximo (200). O item foi preservado.",
    );
  progress.xp += xp;
  while (progress.level < MAX_FASHION_LEVEL) {
    const cost = Number(fashionLevels.get(progress.level + 1)!.Data);
    if (progress.xp < cost) break;
    progress.xp -= cost;
    progress.level++;
  }
  if (progress.level === MAX_FASHION_LEVEL) progress.xp = 0;
}
export function fashionBody(progress: FashionProgress): string {
  return Buffer.concat(
    Object.entries({
      ...progress.fields,
      "1": progress.xp,
      "2": progress.level,
    })
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([key, value]) => protoInt(Number(key), value)),
  ).toString("base64");
}
const stats = {
  Attack: "total_phy_attack",
  MagicAttack: "total_magic_attack",
  Defence: "total_phy_defence",
  MagicDefence: "total_magic_defence",
  Live: "total_live",
};
export function fashionBonuses(level: number): {
  flat: Message;
  percent: Message;
} {
  const ids = String(fashionLevels.get(level)?.TemplateName ?? "")
    .split(",")
    .map(Number);
  const result = { flat: {} as Message, percent: {} as Message };
  for (const id of ids) {
    const row = properties.get(id);
    if (!row) continue;
    for (const [key, attribute] of Object.entries(stats))
      (row.AddType === "1" ? result.flat : result.percent)[attribute] = Number(
        row[key] ?? 0,
      );
  }
  return result;
}
