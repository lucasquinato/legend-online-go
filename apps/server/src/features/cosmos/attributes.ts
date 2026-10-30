import type { AttributeSource } from "../../attributes.js";
import type { CombatModifierKind } from "../attributes/combat-modifiers.js";
import { attributeFields, buffers, templates } from "./content.js";
import type { CosmosSave } from "./state.js";
import { cosmosVisible, unlimitedCosmos } from "./availability.js";
/** Raw data only. The central calculator owns primary conversion and slot math. */
export function cosmosAttributeSource(save: CosmosSave, eligible: (slot: number) => boolean): AttributeSource {
  const source: AttributeSource = { kind: "equipment", evidence: "recovered-table", values: {}, factors: [], combatModifiers: [] };
  for (const star of Object.values(save.instances).filter(row => row.bag === 2 && eligible(row.pos))) {
    const row = templates.get(star.templateId);
    if (!cosmosVisible(row) || !row || [1,6].includes(Number(row.Profile))) continue;
    const refinement = star.pos < 8 ? save.slots[star.pos]?.grade ?? 0 : 0;
    const own: Record<string, number> = {};
    for (const [field, key] of Object.entries(attributeFields)) {
      const value = Number(row[field] ?? 0);
      if (value) own[`total_${key}`] = value;
    }
    source.factors!.push({ values: own, factor: star.level, percent: refinement });
    const b = buffers.get(Number(row.DefaultSkill)); if (!b) continue;
    const percent = Number(b.ValuePercent), value = Number(b.AttackValue), type = Number(b.AttackType);
    const kind: CombatModifierKind | undefined = type === 27 ? "damageVariancePercent" : type === 32 ? "outgoingDamagePercent" : type === 21 ? (percent ? "lifeSteal" : "healOnAttack") : type === 24 ? "reflect" : type === 30 ? "damageImmunityChance" : type === 15 ? (percent ? "damageReductionPercent" : "flatDamageReduction") : type === 31 ? "criticalAvoidancePoints" : type === 17 ? "criticalDamageBonusPercent" : undefined;
    if (!kind) throw new Error(`Efeito de Cosmo desconhecido: ${b.Id}`);
    const cap = unlimitedCosmos.has(star.templateId) ? undefined : String(b.BufferName).match(/m[aá]x\.?\s*(\d+)/i)?.[1];
    source.combatModifiers!.push({ kind, origin: { instanceId: star.id, templateId: star.templateId, bufferId: Number(b.Id), slot: star.pos }, level: star.level, refinement, value, percent,
      ...(["healOnAttack", "lifeSteal", "reflect"].includes(kind) ? { chance: 10 } : {}), ...(cap ? { cap: Number(cap) } : {}), ...(type === 32 ? { cannotCritical: true } : {}) });
    if(kind==="lifeSteal"||kind==="reflect")Object.assign(source.combatModifiers!.at(-1)!,{trigger:kind==="lifeSteal"?"onAttack":"onDamageReceived",basis:kind==="lifeSteal"?"damageDealt":"damageReceived"});
    if(kind==="damageImmunityChance")source.combatModifiers!.at(-1)!.trigger="onDamageReceived";
  }
  return source;
}
