import type { Engine } from "./engine.js";
import type { Message } from "../../messages.js";

export const BATTLE_PRESSURE = Object.freeze({ intervalMs:60000, percentPerStep:50 });
export interface BattlePressure { elapsedMs:number; notifiedSteps:number; resync?:boolean; }
export function enableBattlePressure(e:Engine):void { e.pressure??={elapsedMs:0,notifiedSteps:0}; }
export function advanceBattlePressure(e:Engine,elapsedMs:number):void {
  if(e.pressure)e.pressure.elapsedMs+=Math.max(0,elapsedMs);
}
export function battlePressureSteps(e:Engine):number { return Math.floor((e.pressure?.elapsedMs??0)/BATTLE_PRESSURE.intervalMs); }
export function battlePressureRemaining(e:Engine):number { return BATTLE_PRESSURE.intervalMs-(e.pressure?.elapsedMs??0)%BATTLE_PRESSURE.intervalMs; }
export function battlePressureDamage(e:Engine,value:number):number {
  return value>0?Math.max(1,Math.round(value*(1+battlePressureSteps(e)*BATTLE_PRESSURE.percentPerStep/100))):value;
}
/** The original client ADDS damage_improve; notices must contain only the delta. */
export function battlePressureNotice(e:Engine,battleId:string):Message|undefined {
  if(!e.pressure)return;
  const steps=battlePressureSteps(e),delta=steps-e.pressure.notifiedSteps;
  if(delta<=0&&!e.pressure.resync)return;
  e.pressure.notifiedSteps=steps;
  delete e.pressure.resync;
  return {battle_id:battleId,count_down:battlePressureRemaining(e),damage_improve:delta*BATTLE_PRESSURE.percentPerStep};
}
/** A recreated battle model needs the total, not the last incremental notice. */
export function syncBattlePressure(e:Engine,prepare:Message):void {
  prepare.count_down=battlePressureRemaining(e);
  prepare.damage_improve=battlePressureSteps(e)*BATTLE_PRESSURE.percentPerStep;
}
