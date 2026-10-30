/** Project balance: probabilities are returned in [0,1]; named *Points/*Percent
 * functions return percentage points, never probabilities. No persistent writes. */
export const SPECIAL_BALANCE = Object.freeze({
  criticalReferencePerLevel:375, criticalPotential:225, referenceHalf:.5,
  naturalAttackerWeight:2, criticalReductionWeight:.5,
  criticalBaseMultiplier:1.5, criticalExcessBonus:.5, excessResistance:20,
  blockReferencePerLevel:187.5, blockPotential:75, blockChanceCap:50,
  blockBaseReduction:40, blockExcessReduction:20,
  penetrationReference:120000, penetrationExponent:.7, penetrationSlope:.7,
  penetrationBlockPoints:10, penetrationBlockCap:20, penetrationCriticalPoints:20,
});
const finite = (n:number):number => Number.isFinite(n)?n:0;
export const attributePoints = (n:number):number => Math.max(0,finite(n));
export const battleLevel = (n:number):number => Number.isSafeInteger(n)&&n>0?n:1;
const clamp = (n:number,low:number,high:number):number => Math.max(low,Math.min(high,n));
// Algebraically value/(value+reference), without overflow on large point totals.
const share = (value:number,reference:number):number => value>0?1/(1+reference/value):0;

export const criticalReference = (level:number):number => SPECIAL_BALANCE.criticalReferencePerLevel*battleLevel(level);
export function criticalPotential(points:number,attackerLevel:number):number {
  return SPECIAL_BALANCE.criticalPotential*share(attributePoints(points),criticalReference(attackerLevel)*SPECIAL_BALANCE.referenceHalf);
}
export function naturalCriticalFactor(attackerLevel:number,defenderLevel:number):number {
  const attacking=SPECIAL_BALANCE.naturalAttackerWeight*battleLevel(attackerLevel);
  return attacking/(attacking+battleLevel(defenderLevel));
}
export function criticalBaseChance(points:number,attackerLevel:number,defenderLevel:number,bonusPoints=0):number {
  return clamp(criticalPotential(points,attackerLevel)*naturalCriticalFactor(attackerLevel,defenderLevel)+finite(bonusPoints),0,100)/100;
}
export function reduceCriticalChance(baseChance:number,reductionDecimal:number):number {
  return clamp(finite(baseChance),0,1)/(1+SPECIAL_BALANCE.criticalReductionWeight*Math.abs(finite(reductionDecimal)));
}
export function criticalChance(points:number,attackerLevel:number,defenderLevel=attackerLevel,bonusPoints=0,reductionDecimal=0):number {
  return reduceCriticalChance(criticalBaseChance(points,attackerLevel,defenderLevel,bonusPoints),reductionDecimal);
}
export function intrinsicCriticalMultiplier(points:number,attackerLevel:number):number {
  const reference=criticalReference(attackerLevel),excess=Math.max(0,attributePoints(points)-reference);
  return SPECIAL_BALANCE.criticalBaseMultiplier+SPECIAL_BALANCE.criticalExcessBonus*share(excess,SPECIAL_BALANCE.excessResistance*reference);
}
export const blockReference = (level:number):number => SPECIAL_BALANCE.blockReferencePerLevel*battleLevel(level);
export function baseBlockChance(points:number,defenderLevel:number,bonusPoints=0):number {
  const potential=SPECIAL_BALANCE.blockPotential*share(attributePoints(points),blockReference(defenderLevel)*SPECIAL_BALANCE.referenceHalf);
  return clamp(potential+finite(bonusPoints),0,SPECIAL_BALANCE.blockChanceCap)/100;
}
export function blockReductionPercent(points:number,defenderLevel:number):number {
  const reference=blockReference(defenderLevel),excess=Math.max(0,attributePoints(points)-reference);
  return SPECIAL_BALANCE.blockBaseReduction+SPECIAL_BALANCE.blockExcessReduction*share(excess,SPECIAL_BALANCE.excessResistance*reference);
}
export const blockMultiplier = (points:number,defenderLevel:number):number => 1-blockReductionPercent(points,defenderLevel)/100;
export function penetrationFactor(points:number):number {
  const x=attributePoints(points)/SPECIAL_BALANCE.penetrationReference;
  return x<=1?x**SPECIAL_BALANCE.penetrationExponent:1+SPECIAL_BALANCE.penetrationSlope*(x-1);
}
export const penetrationBlockReductionPoints = (points:number):number => Math.min(SPECIAL_BALANCE.penetrationBlockCap,SPECIAL_BALANCE.penetrationBlockPoints*penetrationFactor(points));
export const penetrationCriticalBonusPoints = (points:number):number => SPECIAL_BALANCE.penetrationCriticalPoints*penetrationFactor(points);
export function blockChance(points:number,penetration:number,defenderLevel:number,bonusPoints=0):number {
  return Math.max(0,baseBlockChance(points,defenderLevel,bonusPoints)-penetrationBlockReductionPoints(penetration)/100);
}
export interface CriticalStats { critical:number;level:number;penetration:number; }
export function specialCriticalMultiplier(stats:CriticalStats,externalBonusPoints=0):number {
  return Math.max(0,intrinsicCriticalMultiplier(stats.critical,stats.level)+penetrationCriticalBonusPoints(stats.penetration)/100+finite(externalBonusPoints)/100);
}
