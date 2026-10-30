import { buffers, description, ids, skills, type Row } from "./content.js";

function protectsRemoval(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /nao\s+(?:(?:pode|podem)\s+ser|e\s+possivel|pode)\s+(?:dispers|purific|remov|dissip)/.test(normalized);
}
const descriptionProtected = new Set<number>();
for (const [id, row] of skills) if (protectsRemoval(description(id))) for (const buffer of ids(row.BufferIds)) descriptionProtected.add(buffer);

/** Local policy, separate from effect execution so eligibility can evolve later. */
export function effectCanBeRemoved(row: Row, kind: string, duration: number): boolean {
  return duration > 0 && kind !== "limit" && Number(row.Dispel ?? 0) === 0 &&
    !descriptionProtected.has(Number(row.Id)) && !protectsRemoval(String(row.BufferName ?? ""));
}
/** Adds the explicit property to old battle saves without overwriting a saved decision. */
export function ensureEffectRemoval(effects: { template: number; kind: string; maximum: number; removable?: boolean }[]): void {
  for (const effect of effects) if (typeof effect.removable !== "boolean") {
    const row = buffers.get(effect.template);
    effect.removable = !!row && effectCanBeRemoved(row, effect.kind, effect.maximum);
  }
}
