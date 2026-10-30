import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEngine, makeActor, execute, applyEffect, type Engine } from "../src/features/battle/engine.js";
import { startInitiative, advanceInitiative, pauseInitiative, resumeInitiative } from "../src/features/battle/initiative.js";
import { enableBattlePressure, battlePressureDamage, battlePressureNotice, battlePressureRemaining, syncBattlePressure } from "../src/features/battle/pressure.js";
import { buffers } from "../src/features/battle/content.js";
import { createAdventure, readyAdventure, advanceAdventure } from "../src/features/battle/adventure.js";
import { decodeMessage, encodeMessage, typeName } from "../src/messages.js";
import { skyWire } from "../src/features/sky-realm/protocol.js";

function setup(at=0) {
  const actors=[1,2].map(id=>makeActor({living_id:id,temp_id:id===1?1:1011,side:id,pos:id,hp:1000000,max_hp:1000000,grade:50,sp:100,skillId:[10000,20311,31211,31511]},
    {attack:1000,magicAttack:1000,defence:1000,magicDefence:1000},10000));
  const e=createEngine(actors,1,2);startInitiative(e,0);enableBattlePressure(e);advanceInitiative(e,at);
  return {e,a:actors[0]!,b:actors[1]!};
}
const cast=(e:Engine,at:number,skill=10000,actor=1,targets=[2],scripted=false)=>execute(e,{actor,skill,targets,sequence:1,automatic:false},at,scripted?{scriptedDamage:()=>100,suppressTriggers:true,hits:1}:{hits:1});
const secondary=(r:ReturnType<typeof execute>)=>r.buffers.flatMap(b=>b.damage??[]);

test("pressão: intervalos exatos, soma linear ilimitada e contagem em milissegundos",()=>{
  const {e}=setup();
  for(const [at,mult,remaining] of [[59999,1,1],[60000,1.5,60000],[119999,1.5,1],[120000,2,60000],[180000,2.5,60000],[60000000,501,60000]]){
    advanceInitiative(e,at!);assert.equal(battlePressureDamage(e,100),100*mult!);assert.equal(battlePressureRemaining(e),remaining);
  }
  assert.equal(battlePressureDamage(e,-100),-100);assert.equal(battlePressureDamage(e,0),0);
});

test("pressão: pausa, relógio regressivo e save não fabricam tempo offline",()=>{
  const {e}=setup(30000);pauseInitiative(e,30000);
  const saved=JSON.parse(JSON.stringify(e)) as Engine;
  advanceInitiative(saved,1000000);assert.equal(saved.pressure!.elapsedMs,30000);
  resumeInitiative(saved,1000000);advanceInitiative(saved,999999);assert.equal(saved.pressure!.elapsedMs,30000);
  advanceInitiative(saved,1030000);assert.equal(saved.pressure!.elapsedMs,60000);
  assert.equal(battlePressureDamage(saved,100),150);
});

test("pressão: aviso nativo envia somente incrementos, repõe contador e serializa em PvE/PvP",()=>{
  const {e}=setup(60000),name=typeName("battle.BattleNoticeMsg");
  const notice=battlePressureNotice(e,"battle")!;
  assert.deepEqual(notice,{battle_id:"battle",count_down:60000,damage_improve:50});
  assert.deepEqual(decodeMessage(name,encodeMessage(name,notice)),notice);
  assert.equal(battlePressureNotice(e,"battle"),undefined);
  advanceInitiative(e,180500);assert.deepEqual(battlePressureNotice(e,"battle"),{battle_id:"battle",count_down:59500,damage_improve:100});
  const p:any={};syncBattlePressure(e,p);assert.deepEqual(p,{count_down:59500,damage_improve:150});
  const wire=skyWire(Object.assign({opcode:4361,message:notice},{duelId:"battle"}),1);
  assert.equal(wire.battleId,"battle");assert.deepEqual(decodeMessage(name,Buffer.from(wire.frame,"base64").subarray(20)),notice);
  pauseInitiative(e,180500);resumeInitiative(e,200500);
  assert.deepEqual(battlePressureNotice(e,"battle"),{battle_id:"battle",count_down:59500,damage_improve:0});
});

test("pressão: ambos os lados e tropas usam dano final; cura e roteiro permanecem iguais",()=>{
  for(const actor of [1,2]){
    const normal=setup(),boosted=setup(60000),targets=[actor===1?2:1];
    const base=cast(normal.e,0,10000,actor,targets).damages[0]!.damage_value;
    assert.equal(cast(boosted.e,60000,10000,actor,targets).damages[0]!.damage_value,Math.round(base*1.5));
  }
  const n=setup(),b=setup(60000);
  assert.equal(cast(n.e,0,31211,1,[1]).damages[0]!.damage_value,cast(b.e,60000,31211,1,[1]).damages[0]!.damage_value);
  assert.equal(cast(b.e,60000,10000,1,[2],true).damages[0]!.damage_value,100);
});

test("pressão: amplifica antes do escudo, mantém imunidade em 1 e não multiplica reflexão duas vezes",()=>{
  const {e,a,b}=setup(60000);
  applyEffect(e,b,b,{...buffers.get(10611)!,ValuePercent:"20"},[],"reflect");
  const shield=applyEffect(e,b,b,{...buffers.get(10711)!,ValuePercent:"0"},[],"shield");shield.shield=100;
  const baseline=cast(setup().e,0).damages[0]!.damage_value,final=Math.round(baseline*1.5),r=cast(e,60000);
  assert.equal(r.damages[0]!.damage_value,final-100);
  assert.equal(secondary(r).find(d=>d.living_id===a.id&&d.damage_value>0)!.damage_value,Math.round(final*.2));
  const immune=setup(60000);
  immune.b.permanentModifiers=[{kind:"damageImmunityChance",magnitude:100,chance:100,source:"cosmos",origin:{instanceId:1,templateId:1,bufferId:80902,slot:0},level:1,refinement:0,value:0,percent:100}];
  assert.equal(cast(immune.e,60000).damages[0]!.damage_value,1);
});

test("pressão: sangramento comum, teto base da runa e proc de Meteorito também aumentam",()=>{
  const {e,a,b}=setup(60000);
  applyEffect(e,a,b,{...buffers.get(10611)!,Id:"999991",ValidCount:"3",ValuePercent:"0"},[],"dot",500);
  assert.ok(secondary(cast(e,60000,10000,2,[1])).some(d=>d.living_id===2&&d.damage_value===750));
  const rune=setup(60000),effect=applyEffect(rune.e,rune.a,rune.b,{...buffers.get(10611)!,Id:"980101",ValidCount:"3",ValuePercent:"-10"},[],"dot");
  // Canonical bleeding buffer id from the recovered rune contract.
  effect.template=9801;effect.percent=-100;effect.healthPercent=true;
  assert.ok(secondary(cast(rune.e,60000,10000,2,[1])).some(d=>d.living_id===2&&d.damage_value===12000));
  const base=setup(),boosted=setup(60000);
  const extra=secondary(cast(base.e,0,31511)).find(d=>d.living_id===2)!;
  assert.equal(secondary(cast(boosted.e,60000,31511)).find(d=>d.living_id===2)!.damage_value,Math.round(extra.damage_value*1.5));
});

test("pressão: adaptador avisa durante animação, restaura total ao reconectar e para no fim",()=>{
  const s=JSON.parse(readFileSync("data/city/scenario.json","utf8")),b=createAdventure(s.battles[0],0,s.initial);
  readyAdventure(b,0);b.actionUntil=200000;
  assert.deepEqual(advanceAdventure(b,s.battles[0],59999),[]);
  const first=advanceAdventure(b,s.battles[0],60000);assert.equal(first[0]!.opcode,4361);assert.equal(first[0]!.message!.damage_improve,50);
  assert.deepEqual(advanceAdventure(b,s.battles[0],60000),[]);
  const saved=JSON.parse(JSON.stringify(b));saved.ready=false;readyAdventure(saved,1000000);
  assert.equal(saved.prepare.damage_improve,50);assert.equal(saved.prepare.count_down,60000);
  assert.deepEqual(advanceAdventure(saved,s.battles[0],1000000),[]);
  b.finishing=true;assert.deepEqual(advanceAdventure(b,s.battles[0],120000),[]);
});
