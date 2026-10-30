import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { itemTemplate, InventoryError } from "../../inventory.js";
import { varint, protoInt } from "../../protocol.js";
import { AttributeCalculator } from "../../attributes.js";
import { fashionAttributeSources } from "../attributes/fashion.js";
import type { Message } from "../../messages.js";
const reference = JSON.parse(
  readFileSync(join(projectRoot, "reference/fashion-refinement.json"), "utf8"),
);
export const refinementTypes = [109, 110, 111, 112];
const table = new Map<string, Message>(
  reference.rows.map((r: Message) => [`${r.SonType}:${r.Level}`, r]),
);
export interface RefinementPart {
  level: number;
  xp: number;
}
export type RefinementProgress = Record<string, RefinementPart>;
export const initialRefinement = (): RefinementProgress =>
  Object.fromEntries(refinementTypes.map((t) => [t, { level: 0, xp: 0 }]));
export function refinementBody(progress: RefinementProgress): string {
  return Buffer.concat(
    [112, 109, 110, 111].map((t) => {
      const p = progress[t]!,
        body = Buffer.concat([
          protoInt(1, t),
          protoInt(2, p.level),
          protoInt(3, p.xp),
        ]);
      return Buffer.concat([varint(10), varint(body.length), body]);
    }),
  ).toString("base64");
}
function gate(
  progress: RefinementProgress,
  collection: Record<string, Message>,
  type: number,
  level: number,
): string | undefined {
  const row = table.get(`${type}:${level}`);
  if (!row) return "Esta parte já atingiu o nível máximo de refinação";
  const owned = Object.keys(collection).filter(
    (id) => Number(itemTemplate(Number(id))?.SonType) === type,
  ).length;
  if (!owned) return "Ative uma moda desta parte antes de refinar";
  if (owned < Number(row.NeedCount))
    return `Necessário ativar ${row.NeedCount} modas desta parte`;
  if (
    refinementTypes.some(
      (t) => t !== type && progress[t]!.level < Number(row.OtherLevel),
    )
  )
    return `As outras partes precisam atingir refinação ${row.OtherLevel}`;
}
export function planRefinement(
  progress: RefinementProgress,
  collection: Record<string, Message>,
  type: number,
  count: number,
): { progress: RefinementProgress; consumed: number } {
  if (
    !refinementTypes.includes(type) ||
    !Number.isSafeInteger(count) ||
    count <= 0
  )
    throw new InventoryError("Pedido de refinação inválido");
  const part = progress[type]!;
  const error = gate(progress, collection, type, part.level + 1);
  if (error) throw new InventoryError(error);
  let ceiling = part.level,
    required = -part.xp;
  while (!gate(progress, collection, type, ceiling + 1)) {
    ceiling++;
    required += Number(table.get(`${type}:${ceiling}`)!.Exp);
  }
  const consumed = Math.min(
    count,
    Math.ceil(required / Number(reference.item.Property1)),
  );
  const next = structuredClone(progress),
    target = next[type]!;
  target.xp += consumed * Number(reference.item.Property1);
  while (target.level < ceiling) {
    const cost = Number(table.get(`${type}:${target.level + 1}`)!.Exp);
    if (target.xp < cost) break;
    target.xp -= cost;
    target.level++;
  }
  // Stop consumption at collection/shared-level gates; don't waste the rest of a requested batch.
  if (target.level === ceiling) target.xp = 0;
  return { progress: next, consumed };
}
export function refinementBonuses(
  progress: RefinementProgress,
  fashionLevel: number,
  collection: Record<string, Message>,
): Message {
  const { total_initial_fury, ...values } = AttributeCalculator.sourceValues(fashionAttributeSources(fashionLevel, collection, progress)["fashion:refinement"]!);
  return values;
}
export function refinementRage(progress: RefinementProgress): number {
  const milestone =
    Math.floor(
      Math.min(...refinementTypes.map((t) => progress[t]!.level)) / 10,
    ) * 10;
  return Number(table.get(`109:${milestone}`)!.SpAdd);
}
