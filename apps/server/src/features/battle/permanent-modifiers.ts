import { blockMultiplier, specialCriticalMultiplier, type CriticalStats } from "./special-attributes.js";
import type { CalculatedCombatModifier, CombatModifierKind } from "../attributes/combat-modifiers.js";

export type PermanentModifiers = CalculatedCombatModifier[];
export const modifierSum = (list: PermanentModifiers, kind: CombatModifierKind): number => list.filter(m => m.kind === kind).reduce((n, m) => n + m.magnitude, 0);
export const criticalMultiplier = (modifiers: PermanentModifiers, stats: CriticalStats = {critical:0,level:1,penetration:0}): number => specialCriticalMultiplier(stats, modifierSum(modifiers, "criticalDamageBonusPercent"));
export function permanentDamage(raw: number, critical: boolean, blocked: boolean, attacker: PermanentModifiers, defender: PermanentModifiers, roll: () => number, stats?: { attacker: CriticalStats; defender: {block:number;level:number} }): number {
  const criticalScale = critical ? criticalMultiplier(attacker, stats?.attacker) : 1;
  const variance = modifierSum(attacker, "damageVariancePercent");
  const spread = variance ? Math.max(0, 1 + (roll() * 2 - 1) * variance / 100) : 1;
  return Math.max(0, raw * criticalScale * (blocked ? blockMultiplier(stats?.defender.block ?? 0,stats?.defender.level ?? 1) : 1) * spread *
    Math.max(0, 1 + (modifierSum(attacker, "outgoingDamagePercent") - modifierSum(defender, "damageReductionPercent")) / 100) - modifierSum(defender, "flatDamageReduction"));
}
export function modifierActivates(m: CalculatedCombatModifier, roll: () => number): boolean {
  return roll() < Math.max(0, Math.min(100, m.chance ?? 100)) / 100;
}
export function modifierAmount(m: CalculatedCombatModifier, damage: number): number {
  const value = Math.round(m.kind === "healOnAttack" ? m.magnitude : damage * m.magnitude / 100);
  return Math.max(0, m.cap === undefined ? value : Math.min(value, m.cap));
}
