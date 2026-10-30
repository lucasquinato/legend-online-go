import { blockMultiplier, intrinsicCriticalMultiplier, criticalChance as resolvedCriticalChance } from "./special-attributes.js";
export const DEFENSE_K_MIN = 5;
export const DEFENSE_K_ADDITIONAL = 2;
export const DEFENSE_K_REFERENCE = 1_500_000;
export const DEFENSE_K_EXPONENT = 3;
// Compatibility export: the minimum, not the coefficient used for every defence.
export const DEFENSE_EFFECTIVENESS = DEFENSE_K_MIN;
export function defenseEffectiveness(defence: number): number {
  const d = Number.isFinite(defence) ? Math.max(0, defence) : 0;
  // Both ratios are <= 1: no D³ or reference/D overflow, including D=0.
  const ratio = d <= DEFENSE_K_REFERENCE
    ? (d / DEFENSE_K_REFERENCE) ** DEFENSE_K_EXPONENT
    : (DEFENSE_K_REFERENCE / d) ** DEFENSE_K_EXPONENT;
  const share = d <= DEFENSE_K_REFERENCE ? ratio / (1 + ratio) : 1 / (1 + ratio);
  const upper = DEFENSE_K_MIN + DEFENSE_K_ADDITIONAL;
  const coefficient = DEFENSE_K_MIN + DEFENSE_K_ADDITIONAL * share;
  // Keep the strict asymptote when floating-point rounding would reach the upper bound.
  return coefficient === upper ? upper - Number.EPSILON * upper : coefficient;
}
export function baseDamage(attack: number, defence: number): number {
  const a = Number.isFinite(attack) ? Math.max(0, attack) : 0;
  const d = Number.isFinite(defence) ? Math.max(0, defence) : 0;
  if (a === 0) return 0;
  // Normalize by the larger attribute: A² / (A + K*D), without A² or K*D overflow.
  const scale = Math.max(a, d), scaledAttack = a / scale;
  return a * scaledAttack / (scaledAttack + defenseEffectiveness(d) * (d / scale));
}
export { blockChance } from "./special-attributes.js";
// Retain the existing (points, targetLevel, bonusPP) helper API. The additional
// attacker level is explicit for live combat; older callers default to equal levels.
export function criticalChance(points:number,defenderLevel:number,bonusPoints=0,attackerLevel=defenderLevel,reductionDecimal=0):number {
  return resolvedCriticalChance(points,attackerLevel,defenderLevel,bonusPoints,reductionDecimal);
}
export function offensiveDamage(attack: number, defence: number, coefficient: number, fixed = 0): number {
  return Math.max(0, baseDamage(attack, defence) * coefficient + fixed);
}
export function resolveDamage(raw: number, critical: boolean, blocked: boolean, outgoing = 0, incoming = 0, multipliers?: { critical: number; block: number }): number {
  return Math.max(1, Math.round(raw * (critical ? multipliers?.critical ?? intrinsicCriticalMultiplier(0,1) : 1) * (blocked ? multipliers?.block ?? blockMultiplier(0,1) : 1) * Math.max(0, 1 + (outgoing + incoming) / 100)));
}
/** Shared by free combat and the scripted tutorial; protection is a policy. */
export function applyHealth(target: { hp: number; maxHp: number }, requested: number, minimumHp = 0): { value: number; display: number; left: number } {
  const value = requested < 0 ? -Math.min(-requested, Math.max(0, target.maxHp - target.hp))
    : minimumHp > 0 ? Math.min(requested, Math.max(0, target.hp - minimumHp)) : requested;
  target.hp = Math.max(minimumHp, Math.min(target.maxHp, target.hp - value));
  return { value, display: requested < 0 ? requested : value, left: target.hp };
}
