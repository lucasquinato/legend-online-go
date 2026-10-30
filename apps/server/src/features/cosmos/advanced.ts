import { curve, refinementCurve } from "./content.js";
/** Confirmed local rules; original attempt XP and dust conversion were not recovered. */
export const advancedPolicy = { refinementGold: 1000000, refinementXp: 10, dustXp: 1, dustItem: 208061, dustPerItem: 10 } as const;
export function refinementPlan(slot: {grade:number;xp:number}, attempts:number) {
  const result={...slot,attempts:0};
  while(result.attempts<attempts&&result.grade<10) {
    result.attempts++;result.xp+=advancedPolicy.refinementXp;
    while(result.grade<10) {
      const cost=Number(refinementCurve.find(row=>Number(row.Grades)===result.grade+1)!.Data);
      if(result.xp<cost)break;result.xp-=cost;result.grade++;
    }
  }
  if(result.grade===10)result.xp=0;
  return result;
}
export function sacredRemainingXP(level:number,xp:number):number {
  return Math.max(0,curve(8).filter(row=>Number(row.Grades)>level).reduce((sum,row)=>sum+Number(row.Data),0)-xp);
}
