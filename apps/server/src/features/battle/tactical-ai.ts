import { bleedingRuneDamage } from "../runes/balance.js";
import type { Actor, Effect, Engine } from "./engine.js";
import { canUse, execute, selectTargets } from "./engine.js";
import { skills } from "./content.js";
import { offensiveDamage } from "./mechanics.js";
import { initiativeCost, INITIATIVE } from "./initiative.js";

export interface AiDecision { skill: number; at: number; reason: string; score: number; alternatives: { skill: number; score: number }[]; }
const SAMPLES = 12;
const job = (a: Actor) => (a.template - 1) % 3 + 1;
const ratio = (a: Actor) => a.hp / Math.max(1, a.maxHp);
const duration = (b: Effect) => Math.min(3, Math.max(0, b.remaining));
function basicDamage(a: Actor, target: Actor): number {
  const magical = a.stats.magicAttack > a.stats.attack;
  return offensiveDamage(magical ? a.stats.magicAttack : a.stats.attack, magical ? target.stats.magicDefence : target.stats.defence, 1);
}
function threat(e: Engine, target: Actor): number {
  return e.actors.filter(a => a.side !== target.side && a.hp > 0).reduce((n, a) => n + basicDamage(a, target), 0);
}
function power(e: Engine, a: Actor): number {
  const enemies=e.actors.filter(t=>t.side!==a.side&&t.hp>0);
  return enemies.length ? enemies.reduce((n,t)=>n+basicDamage(a,t),0)/enemies.length : 0;
}
// Value effects in units of useful HP/damage. Execution, targeting, procs and
// stacking are supplied by the real executor, never duplicated in this policy.
function effectValue(e: Engine, b: Effect): number {
  const target=e.actors.find(a=>a.id===b.target);
  if (!target || target.hp<=0 || !duration(b)) return 0;
  const turns=duration(b),incoming=threat(e,target),outgoing=power(e,target);
  switch(b.kind) {
    case "shield": return Math.min(b.shield??0,incoming*turns)*(1+(1-ratio(target)));
    case "dot": return -Math.min(target.hp,(b.healthPercent?bleedingRuneDamage(b.template,target.maxHp,b.percent,b.stacks):(b.raw??0)*b.stacks)*turns);
    case "healAction": return Math.min(target.maxHp-target.hp+incoming*.5,target.maxHp*b.percent*b.stacks/100*turns);
    case "outgoing": return (outgoing*b.percent/100+b.value)*b.stacks*turns;
    case "incoming": return -incoming*b.percent*b.stacks/100*turns;
    case "reflect": return incoming*b.percent*b.stacks/100*turns*.7;
    case "disabled": return -outgoing*turns*1.4;
    case "confusion": return -(incoming+outgoing)*turns*.65;
    case "silence": return -outgoing*turns*.5*Math.min(1,(b.skillIds?.length??0)/Math.max(1,target.learned.length));
    case "discount": return outgoing*Math.max(0,b.value)/100;
    case "critResistance": return incoming*Math.abs(b.value)/100*turns;
    // Slow/leadership are intentionally presentation-only in the battle engine.
    default: return 0;
  }
}
interface Benefit { damage: number; healing: number; effects: number; fury: number; kills: number; risk: number; }
function benefit(before: Engine, after: Engine, actor: Actor): Benefit {
  const out: Benefit={damage:0,healing:0,effects:0,fury:0,kills:0,risk:0};
  const unit=Math.max(1,power(before,actor));
  for(const old of before.actors) {
    const next=after.actors.find(a=>a.id===old.id)!;
    const allied=old.side===actor.side,delta=next.hp-old.hp;
    if(delta>0) out.healing+=delta*(allied?1:-1)*(1+2*(1-ratio(old))**2)*(job(actor)===3?1.1:1);
    if(delta<0) out.damage-=delta*(allied?-1.3:job(actor)===2?1.1:1);
    if(old.hp>0&&next.hp<=0) {
      if(allied) out.risk-=old.id===actor.id?actor.maxHp*10:unit*2;
      else out.kills+=unit*.8;
    }
    out.fury+=(next.fury-old.fury)*(allied?1:-1)*unit/100*.6;
  }
  const value=(e:Engine)=>e.effects.reduce((n,b)=>n+effectValue(e,b)*(e.actors.find(a=>a.id===b.target)?.side===actor.side?1:-1),0);
  out.effects=(value(after)-value(before))*(job(actor)===1?1.15:1);
  return out;
}

/** Counterfactual samples have independent seeds: never inspect/advance live RNG. */
export function evaluateBattleActions(e: Engine, actor: Actor, now: number): AiDecision {
  const candidates=[...new Set([actor.defaultSkill,...(actor.equippedSkills??actor.learned),...(actor.runes??[]).map(r=>r.skillId)])]
    .filter(id=>(id===actor.defaultSkill||actor.learned.includes(id))&&canUse(e,actor,id,now));
  const evaluated=candidates.map(skill=>{
    const total:Benefit={damage:0,healing:0,effects:0,fury:0,kills:0,risk:0};
    for(let sample=0;sample<SAMPLES;sample++) {
      const copy:Engine=structuredClone(e);copy.queue=[];
      for(const a of copy.actors) delete a.lastAiDecision;
      copy.rng=(Math.imul(sample+1,0x9e3779b9)^Math.imul(e.serial+1,0x85ebca6b)^actor.id)>>>0;
      const source=copy.actors.find(a=>a.id===actor.id)!;
      execute(copy,{actor:actor.id,skill,targets:selectTargets(copy,source,skill),sequence:copy.sequence+1,automatic:true},now);
      const values=benefit(e,copy,actor);
      for(const key of Object.keys(total) as (keyof Benefit)[])total[key]+=values[key]/SAMPLES;
    }
    const rune=actor.runes?.find(r=>r.skillId===skill);
    const reserve=rune?Math.max(1,power(e,actor))*.15/Math.max(1,rune.maxUses-(actor.uses[skill]??0)):0;
    const preparation=e.initiative?INITIATIVE.normal/initiativeCost(skill):1;
    return {skill,score:(Object.values(total).reduce((n,v)=>n+v,0)-reserve)*preparation,values:total};
  }).sort((a,b)=>b.score-a.score||a.skill-b.skill);
  const best=evaluated[0];
  const reasons=best?Object.entries(best.values).filter(([,v])=>Math.abs(v)>.01).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).map(([key,v])=>`${key}=${Math.round(v)}`).join(", "):"ação indisponível; aguardando fim do impedimento";
  return {skill:best?.skill??actor.defaultSkill,at:now,score:Math.round(best?.score??0),reason:reasons||"ataque básico disponível",alternatives:evaluated.slice(0,4).map(v=>({skill:v.skill,score:Math.round(v.score)}))};
}

export function equippedBattleSkills(learned: number[], fastKey: unknown): number[] {
  if(fastKey===undefined||fastKey===null) return learned.filter(id=>Number(skills.get(id)?.UseWay)===1);
  const families=String(fastKey).split(",").map(Number).filter(n=>n>0);
  return learned.filter(id=>Number(skills.get(id)?.UseWay)===1&&families.includes(Number(skills.get(id)?.SonType)));
}
