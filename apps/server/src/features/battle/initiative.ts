import type { Actor, Choice, Engine } from "./engine.js";
import { skills } from "./content.js";
import { advanceBattlePressure } from "./pressure.js";

export const INITIATIVE = Object.freeze({ maximum:3000, perSecond:1000, rune:400, normal:2300, special:3000 });
export function traceInitiative(e:Engine,event:string,detail:Record<string,unknown>):void {
  if(e.initiative&&e.battleId)console.info("battle-initiative",JSON.stringify({battle:e.battleId,event,...detail}));
}
export interface InitiativeCharge { value:number; updatedAt:number; resumeAt:number; cycle:number; }
export interface InitiativeClock { version:1; lastAt:number; pausedAt?:number; }
export function initiativeCost(skill:number):number {
  const row=skills.get(skill),family=Number(row?.SonType);
  if(family>=9001&&family<=9010)return INITIATIVE.rune;
  return Number(row?.Priority)===3?INITIATIVE.special:INITIATIVE.normal;
}
function charge(e:Engine,a:Actor):InitiativeCharge {
  return a.initiative??={value:0,updatedAt:e.initiative!.lastAt,resumeAt:e.initiative!.lastAt,cycle:0};
}
/** Enabled explicitly by adapters; the damage executor and AI simulations stay pure. */
export function startInitiative(e:Engine,now:number):void {
  if(e.initiative)return;
  e.initiative={version:1,lastAt:now};
  for(const a of e.actors)charge(e,a);
  // Preserve accepted reservations from an older battle save.
  for(const c of e.queue)reserveInitiative(e,c,now);
}
export function advanceInitiative(e:Engine,now:number):void {
  if(!e.initiative||e.initiative.pausedAt!==undefined)return;
  const at=Math.max(e.initiative.lastAt,now);
  advanceBattlePressure(e,at-e.initiative.lastAt);
  for(const a of e.actors){
    const s=charge(e,a);
    if(a.hp>0)s.value=Math.min(INITIATIVE.maximum,s.value+Math.max(0,at-Math.max(s.updatedAt,s.resumeAt))*INITIATIVE.perSecond/1000);
    s.updatedAt=at;
  }
  e.initiative.lastAt=at;
  // Migrate reservations saved before a category cost changed.
  for(const c of e.queue)if(c.initiativeCost!==undefined&&c.initiativeCost!==initiativeCost(c.skill)){
    const a=e.actors.find(a=>a.id===c.actor);if(!a)continue;
    const s=charge(e,a);c.initiativeCost=initiativeCost(c.skill);
    c.readyAt=Math.max(at,s.resumeAt)+Math.max(0,c.initiativeCost-s.value)*1000/INITIATIVE.perSecond;
  }
}
export function reserveInitiative(e:Engine,c:Choice,now:number):void {
  if(!e.initiative)return;
  advanceInitiative(e,now);
  const a=e.actors.find(a=>a.id===c.actor);if(!a)return;
  const s=charge(e,a);
  c.selectedAt=now;c.initiativeCost=initiativeCost(c.skill);c.initiativeCycle=s.cycle;
  c.readyAt=Math.max(now,s.resumeAt)+Math.max(0,c.initiativeCost-s.value)*1000/INITIATIVE.perSecond;
}
/** Ready actions keep their original timestamp while waiting for another animation. */
export function takeInitiativeChoice(e:Engine,now:number):Choice|undefined {
  if(!e.initiative)return e.queue.shift();
  advanceInitiative(e,now);
  if(e.initiative.pausedAt!==undefined)return;
  e.queue=e.queue.filter(c=>{const a=e.actors.find(a=>a.id===c.actor);return a&&a.hp>0&&c.initiativeCycle===a.initiative?.cycle;});
  e.queue.sort((a,b)=>(a.readyAt??Infinity)-(b.readyAt??Infinity)||a.sequence-b.sequence);
  if((e.queue[0]?.readyAt??Infinity)>now)return;
  const c=e.queue.shift();
  if(c)traceInitiative(e,"execute",{actor:c.actor,skill:c.skill,cost:c.initiativeCost,cycle:c.initiativeCycle,readyAt:c.readyAt,at:now});
  return c;
}
export function nextInitiativeAt(e:Engine,now:number):number {
  return e.queue.length?Math.min(...e.queue.map(c=>c.readyAt??now)):now+100;
}
export function initiativeWait(e:Engine,actorId:number,now:number):number {
  const c=e.queue.find(c=>c.actor===actorId);
  return c?.readyAt===undefined?0:Math.max(0,Math.ceil(c.readyAt-now));
}
/** Only this actor resets. Its next charge begins after its animation ends. */
export function spendInitiative(e:Engine,actorId:number,now:number,animationMs:number):void {
  if(!e.initiative)return;
  advanceInitiative(e,now);
  const a=e.actors.find(a=>a.id===actorId);if(!a)return;
  const s=charge(e,a);
  s.value=0;s.updatedAt=now;s.resumeAt=now+Math.max(0,animationMs);s.cycle++;
}
export function pauseInitiative(e:Engine,now:number):void {
  if(!e.initiative||e.initiative.pausedAt!==undefined)return;
  advanceInitiative(e,now);e.initiative.pausedAt=e.initiative.lastAt;
}
export function resumeInitiative(e:Engine,now:number):number {
  if(e.initiative?.pausedAt===undefined)return 0;
  const shift=Math.max(0,now-e.initiative.pausedAt);
  for(const a of e.actors){const s=charge(e,a);s.updatedAt+=shift;s.resumeAt+=shift;}
  for(const c of e.queue){if(c.readyAt!==undefined)c.readyAt+=shift;if(c.selectedAt!==undefined)c.selectedAt+=shift;}
  if(e.pressure&&shift>0)e.pressure.resync=true;
  e.initiative.lastAt+=shift;delete e.initiative.pausedAt;return shift;
}
