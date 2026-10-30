import type { AttributeSource } from "../../attributes.js";
import type { TitleCatalog } from "./catalog.js";
import { titleAttributeUnlock } from "./catalog.js";
import { titleOwned, validateTitleSave, type TitleSave } from "./state.js";

const prefix = "titles:";
export interface TitleAttributeContext { job: 1 | 2 | 3; level: number; now: number; }
export function titleAttributesAvailable(save: TitleSave, level: number, now: number): boolean {
  return level >= titleAttributeUnlock.minimumLevel && save.attributeAccess.unlocked && save.attributeAccess.unlockedAt! <= now;
}

/** Raw title sources only. Conversion, percentage application and power belong to AttributeCalculator. */
export function titleAttributeSources(save: TitleSave, catalog: TitleCatalog, context: TitleAttributeContext): Record<string, AttributeSource> {
  validateTitleSave(save);
  if (![1, 2, 3].includes(context.job) || !Number.isSafeInteger(context.level) || context.level < 0 || !Number.isSafeInteger(context.now) || context.now < 0 || context.now > 8640000000000000) throw new Error("Contexto de atributos de títulos inválido");
  const sources: Record<string, AttributeSource> = {};
  if (!titleAttributesAvailable(save, context.level, context.now)) return sources;
  for (const entry of Object.values(save.entries)) {
    const title = catalog.get(entry.id);
    if (!title || (title.job !== 0 && title.job !== context.job) || !titleOwned(save, catalog, title.id, context.now)) continue;
    if (title.buffers.length) throw new Error(`Buffers de atributos de título ainda não suportados: ${title.id}`);
    const source: AttributeSource = { kind: "permanent", evidence: "recovered-table", values: {}, percentages: {} };
    for (const effect of title.effects) {
      const target = effect.mode === "flat" ? source.values : source.percentages!;
      for (const [key, value] of Object.entries(effect.values)) target[key] = (target[key] ?? 0) + value;
    }
    if (Object.keys(source.values).length || Object.keys(source.percentages!).length) sources[`${prefix}${title.id}`] = source;
  }
  return sources;
}

/** Replace the entire title namespace, including expired/revoked sources; never subtract from another system. */
export function synchronizeTitleAttributes(sources: Record<string, AttributeSource>, save: TitleSave, catalog: TitleCatalog, context: TitleAttributeContext): void {
  const next = titleAttributeSources(save, catalog, context);
  for (const key of Object.keys(sources)) if (key.startsWith(prefix)) delete sources[key];
  Object.assign(sources, next);
}
