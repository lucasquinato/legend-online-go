import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEngine, makeActor, choose, populateAutomatic, execute, applyEffect } from "../src/features/battle/engine.js";
import { INITIATIVE, initiativeCost, startInitiative, advanceInitiative, takeInitiativeChoice, spendInitiative, pauseInitiative, resumeInitiative, initiativeWait } from "../src/features/battle/initiative.js";
import { skills, buffers, actionFrames } from "../src/features/battle/content.js";
import { createAdventure, readyAdventure, advanceAdventure, adventureSkill, setAdventurePaused, adventureSelection } from "../src/features/battle/adventure.js";
import { runeBattleContract } from "../src/features/runes/index.js";
import { setBattleAutomatic } from "../src/features/battle/automatic.js";
import { decodeMessage, encodeMessage, typeName } from "../src/messages.js";

const make=(id:number,side:number)=>makeActor({living_id:id,temp_id:3,side,pos:side===1?6:2,hp:100000,max_hp:100000,grade:80,sp:100,skillId:[10000,10711,11011,30711,31211,11311]},
  {attack:1000,magicAttack:1000,defence:1000,magicDefence:1000},10000);
function fixture(players=[1,2]) {
  const e=createEngine([make(1,1),make(2,2)],1,42,players);startInitiative(e,0);return e;
}
function runes(e:ReturnType<typeof fixture>,actor=1) {
  const state=JSON.parse(readFileSync("data/city/scenario.json","utf8")).initial;
  state.player.grades=80;state.hero.rune={runeKey:"818",runeinfo:[{rune_id:818,rune_gp:0,swallowCount:0}]};
  const a=e.actors.find(a=>a.id===actor)!;a.runes=runeBattleContract(state);a.learned.push(9818);
}
function adventure() {
  const scenario=JSON.parse(readFileSync("data/city/scenario.json","utf8")),ref=scenario.battles[0];
  const b=createAdventure(ref,0,structuredClone(scenario.initial));
  b.engine!.actors.find(a=>a.id===b.hero)!.learned.push(10711,11011);
  return {b,ref};
}

test("iniciativa: custos únicos por categoria para todos os níveis e classes",()=>{
  assert.deepEqual(INITIATIVE,{maximum:3000,perSecond:1000,rune:400,normal:2300,special:3000});
  for(const [id,row]of skills) {
    const family=Number(row.SonType),expected=family>=9001&&family<=9010?400:Number(row.Priority)===3?3000:2300;
    assert.equal(initiativeCost(id),expected,String(id));
  }
  for(const id of [10000,20000,30000,10711,30711,31211,11311])assert.equal(initiativeCost(id),2300);
  for(const id of [11011,11121,21011,21111,31011,31111])assert.equal(initiativeCost(id),3000);
  assert.equal(initiativeCost(9818),400);
});

test("iniciativa: reserva normal permanece intacta até 2300 e não gasta recursos ao selecionar",()=>{
  const e=fixture(),a=e.actors[0]!;populateAutomatic(e,0);
  const c=choose(e,a.id,10711,100)!;
  assert.equal(c.readyAt,2300);assert.equal(c.initiativeCost,2300);assert.equal(a.fury,100);
  assert.deepEqual(a.cooldowns,{});assert.deepEqual(a.uses,{});
  assert.equal(takeInitiativeChoice(e,2299),undefined);
  const ready=takeInitiativeChoice(e,2300)!;
  // The opponent's fallback had an earlier reservation at the same readiness time.
  assert.equal(ready.actor,2);assert.equal(takeInitiativeChoice(e,2300)!.skill,10711);
});

test("iniciativa: fallback vence somente sem escolha válida dentro do prazo",()=>{
  const e=fixture();populateAutomatic(e,0);
  assert.equal(takeInitiativeChoice(e,2299),undefined);
  assert.equal(choose(e,1,10711,2300),undefined);
  assert.equal(takeInitiativeChoice(e,2300)!.skill,10000);
});

test("iniciativa: runa usa carga acumulada sem ultrapassar outra ação que já estava pronta",()=>{
  const e=fixture();runes(e,1);runes(e,2);populateAutomatic(e,0);
  const first=choose(e,2,9818,0)!;assert.equal(first.readyAt,400);
  const later=choose(e,1,9818,1000)!;assert.equal(later.readyAt,1000);
  assert.equal(takeInitiativeChoice(e,1000)!.actor,2);
  assert.equal(takeInitiativeChoice(e,1000)!.actor,1);
});

test("iniciativa: especial demora 3000, sem aumentar o tempo ao aprender outro nível",()=>{
  const e=fixture();const c=choose(e,1,11011,0)!;
  assert.equal(c.readyAt,3000);assert.equal(takeInitiativeChoice(e,2999),undefined);
  assert.equal(takeInitiativeChoice(e,3000)!.skill,11011);
  assert.equal(initiativeCost(11031),initiativeCost(11011));
});

test("iniciativa: 3x3 conserva as outras cinco barras e suas ações prontas",()=>{
  const actors=Array.from({length:6},(_,i)=>make(i+1,i<3?1:2)),e=createEngine(actors,1,42,[1,2,3,4,5,6]);
  startInitiative(e,0);populateAutomatic(e,0);
  assert.equal(takeInitiativeChoice(e,2300)!.actor,1);
  spendInitiative(e,1,2300,1000);
  assert.equal(actors[0]!.initiative!.value,0);
  assert.ok(actors.slice(1).every(a=>a.initiative!.value===2300));
  advanceInitiative(e,3300);
  assert.equal(actors[0]!.initiative!.value,0);
  assert.ok(actors.slice(1).every(a=>a.initiative!.value===3000));
  assert.equal(takeInitiativeChoice(e,3300)!.actor,2);
  advanceInitiative(e,4000);assert.equal(actors[0]!.initiative!.value,700);
});

test("iniciativa: nova reserva durante a própria animação pertence ao próximo ciclo",()=>{
  const e=fixture();choose(e,1,10711,0);takeInitiativeChoice(e,2300);spendInitiative(e,1,2300,1000);
  const c=choose(e,1,30711,2500)!;
  assert.equal(c.initiativeCycle,1);assert.equal(c.readyAt,5600);
  assert.equal(takeInitiativeChoice(e,5599),undefined);assert.equal(takeInitiativeChoice(e,5600)!.skill,30711);
});

test("iniciativa: stun consome oportunidade como ação nula sem fúria ou cooldown",()=>{
  const e=fixture();choose(e,1,10711,0);
  applyEffect(e,e.actors[1]!,e.actors[0]!,{...buffers.get(40014)!,ValidCount:"1"},[],"disabled");
  const c=takeInitiativeChoice(e,2300)!,r=execute(e,c,2300);
  assert.equal(r.canceled,true);assert.equal(e.actors[0]!.fury,100);assert.deepEqual(e.actors[0]!.cooldowns,{});
  spendInitiative(e,1,2300,40);assert.equal(e.actors[0]!.initiative!.value,0);
  assert.ok(!e.effects.some(b=>b.kind==="disabled"));
});

test("iniciativa: pause e JSON preservam carga, reserva e duração sem ganho offline",()=>{
  const e=fixture();choose(e,1,10711,0);pauseInitiative(e,1000);
  const saved=JSON.parse(JSON.stringify(e));resumeInitiative(saved,100000);
  assert.equal(saved.actors[0].initiative.value,1000);
  assert.equal(saved.queue[0].readyAt,101300);
  assert.equal(takeInitiativeChoice(saved,101299),undefined);
  assert.equal(takeInitiativeChoice(saved,101300)!.skill,10711);
});

test("iniciativa: automático não descarta reserva manual nem fallback já pronto",()=>{
  const e=fixture();populateAutomatic(e,0);choose(e,1,10711,100);
  setBattleAutomatic(e,1,true,200);assert.equal(e.queue.find(c=>c.actor===1)!.skill,10711);
  setBattleAutomatic(e,2,true,2400);assert.equal(e.queue.find(c=>c.actor===2)!.readyAt,2300);
});

test("iniciativa: aventura espera prontidão, preserva animação e informa espera no protocolo",()=>{
  const {b,ref}=adventure();readyAdventure(b,0);assert.ok(adventureSkill(b,10711,100));
  const ack=adventureSelection(b,b.hero,10711,true,100);
  assert.equal(ack.cast_time,2200);
  const wire=decodeMessage(typeName("battle.HeroOrderMsg"),encodeMessage(typeName("battle.HeroOrderMsg"),ack));assert.equal(wire.cast_time,2200);
  assert.deepEqual(advanceAdventure(b,ref,2299),[]);
  const first=advanceAdventure(b,ref,2300).find(p=>p.opcode===153)!;assert.ok(first);
  assert.equal(b.nextAt,2300+first.message.frame_num*40);
  assert.deepEqual(advanceAdventure(b,ref,b.nextAt-1),[]);
});

test("iniciativa: callback duplicado não reinicia barras nem encurta a animação",()=>{
  const {b,ref}=adventure();readyAdventure(b,0);readyAdventure(b,1000);
  assert.equal(b.engine!.initiative!.lastAt,0);
  const action=advanceAdventure(b,ref,2300).find(p=>p.opcode===153)!;assert.ok(action);
  const until=b.actionUntil;readyAdventure(b,2400);assert.equal(b.actionUntil,until);
  assert.deepEqual(advanceAdventure(b,ref,2400),[]);
});

test("iniciativa: pausa da aventura suspende relógios e trava visual",()=>{
  const {b,ref}=adventure();readyAdventure(b,0);setAdventurePaused(b,true,1000);
  assert.deepEqual(advanceAdventure(b,ref,50000),[]);setAdventurePaused(b,false,100000);
  const resumed=advanceAdventure(b,ref,101299);
  assert.equal(resumed.some(p=>p.opcode===153),false);
  assert.deepEqual(resumed.map(p=>p.opcode),[4361]);assert.equal(resumed[0]!.message!.damage_improve,0);
  assert.ok(advanceAdventure(b,ref,101300).some(p=>p.opcode===153));
});

test("iniciativa: reserva antiga de runa migra de 700 para 400 sem perder a escolha",()=>{
  const e=fixture();runes(e);const c=choose(e,1,9818,0)!;
  c.initiativeCost=700;c.readyAt=700;
  advanceInitiative(e,100);assert.equal(c.initiativeCost,400);assert.equal(c.readyAt,400);
  assert.equal(takeInitiativeChoice(e,399),undefined);assert.equal(takeInitiativeChoice(e,400)!.skill,9818);
});

test("iniciativa: reserva e carga sobrevivem ao carregamento de reconexão",()=>{
  const {b,ref}=adventure();readyAdventure(b,0);adventureSkill(b,10711,1000);
  const saved=JSON.parse(JSON.stringify(b));saved.ready=false;
  readyAdventure(saved,100000);
  assert.equal(saved.engine.actors.find((a:any)=>a.id===saved.hero).initiative.value,1000);
  assert.equal(initiativeWait(saved.engine,saved.hero,100000),1300);
  assert.deepEqual(advanceAdventure(saved,ref,101299),[]);
  assert.ok(advanceAdventure(saved,ref,101300).some(p=>p.opcode===153));
});
