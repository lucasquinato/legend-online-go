/** Permanent character properties. Combat executes these; providers only supply operands. */
export type CombatModifierKind = "damageVariancePercent" | "outgoingDamagePercent" | "damageReductionPercent" | "flatDamageReduction" | "criticalAvoidancePoints" | "criticalDamageBonusPercent" | "damageImmunityChance" | "healOnAttack" | "lifeSteal" | "reflect" | "furyOnAction" | "fateIgnoreDefence" | "fateReduction" | "fateReflect";
export interface CombatModifierInput {
  kind: CombatModifierKind;
  origin: { instanceId: number; templateId: number; bufferId: number; slot: number };
  level: number;
  refinement: number;
  value: number;
  percent: number;
  chance?: number;
  cap?: number;
  cannotCritical?: boolean;
  trigger?: "onAttack" | "onDamageReceived" | "onAction";
  basis?: "damageDealt" | "damageReceived";
}
export interface CalculatedCombatModifier extends CombatModifierInput {
  source: string;
  magnitude: number;
}
const kinds = new Set<CombatModifierKind>(["damageVariancePercent", "outgoingDamagePercent", "damageReductionPercent", "flatDamageReduction", "criticalAvoidancePoints", "criticalDamageBonusPercent", "damageImmunityChance", "healOnAttack", "lifeSteal", "reflect", "furyOnAction", "fateIgnoreDefence", "fateReduction", "fateReflect"]);
export function calculateCombatModifiers(sources: Record<string, { combatModifiers?: CombatModifierInput[] }>): CalculatedCombatModifier[] {
  return Object.entries(sources).flatMap(([source, row]) => (row.combatModifiers ?? []).map(input => {
    if (!kinds.has(input.kind) || !Number.isInteger(input.level) || input.level < 1 || !Number.isInteger(input.refinement) || input.refinement < 0 || !Number.isFinite(input.value) || !Number.isFinite(input.percent) || (input.chance !== undefined && (!Number.isFinite(input.chance) || input.chance < 0 || input.chance > 100)) || (input.cap !== undefined && (!Number.isSafeInteger(input.cap) || input.cap < 0))) throw new Error("Modificador permanente inválido");
    // Recovered StarHelper: percentage refinement adds points; fixed refinement scales its own value.
    const magnitude = input.percent !== 0
      ? Math.abs(input.percent) * input.level + input.refinement
      : Math.abs(input.value) * input.level + Math.floor(Math.abs(input.value) * input.level * input.refinement / 100);
    return { ...structuredClone(input), source, magnitude, ...(input.kind === "damageImmunityChance" ? { chance: Math.min(100,magnitude) } : {}) };
  }));
}
