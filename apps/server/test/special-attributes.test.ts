import { test } from "node:test";
import assert from "node:assert/strict";
import { criticalReference,blockReference,criticalPotential,naturalCriticalFactor,criticalBaseChance,criticalChance,reduceCriticalChance,intrinsicCriticalMultiplier,baseBlockChance,blockChance,blockReductionPercent,blockMultiplier,penetrationFactor,penetrationBlockReductionPoints,penetrationCriticalBonusPoints,specialCriticalMultiplier } from "../src/features/battle/special-attributes.js";
import { applyEffect,createEngine,execute,initializePassives,makeActor } from "../src/features/battle/engine.js";
import { buffers } from "../src/features/battle/content.js";
import { baseDamage,offensiveDamage } from "../src/features/battle/mechanics.js";
import { criticalMultiplier,type PermanentModifiers } from "../src/features/battle/permanent-modifiers.js";
import { decodeMessage,encodeMessage,typeName } from "../src/messages.js";
const near=(actual:number,expected:number,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const mod=(kind:PermanentModifiers[number]["kind"],magnitude:number):PermanentModifiers[number]=>({kind,magnitude,source:"cosmos",origin:{instanceId:1,templateId:1405,bufferId:80101,slot:0},level:10,refinement:0,value:0,percent:magnitude});
function combat(seed=123456789) {
  const actor=(id:number,side:number)=>makeActor({living_id:id,temp_id:1,side,pos:side===1?6:1,hp:1e7,max_hp:1e7,grade:80,sp:100,skillId:[10000,20911]},
    {attack:1000,magicAttack:1000,defence:1000,magicDefence:1000},10000);
  const a=actor(1,1),b=actor(2,2);a.stats.critical=550000;a.stats.penetration=180000;b.stats.block=400000;
  b.permanentModifiers=[mod("criticalAvoidancePoints",60)];
  return {a,b,e:createEngine([a,b],1,seed)};
}

test("referências e chances críticas obrigatórias, resistência por nível e bônus antes da redução",()=>{
  for(const [level,rc,rb]of [[10,3750,1875],[20,7500,3750],[40,15000,7500],[60,22500,11250],[80,30000,15000]]) {
    assert.equal(criticalReference(level!),rc);assert.equal(blockReference(level!),rb);near(naturalCriticalFactor(level!,level!),2/3);
  }
  for(const [level,c,chance]of [[10,1500,2/3],[10,3750,1],[20,7500,1],[40,7500,.75],[40,15000,1],[60,22500,1],[80,10000,.6],[80,20000,6/7],[80,30000,1]])near(criticalChance(c!,level!,level!),chance!);
  near(naturalCriticalFactor(10,20),.5);near(naturalCriticalFactor(10,5),.8);
  assert.ok(criticalChance(1500,10,20)<criticalChance(1500,10,10));
  near(criticalBaseChance(0,80,80,15),.15);near(criticalChance(30000,80,80,20,.6),10/13);
  for(const percent of [0,10,20,30,40,50,60])near(reduceCriticalChance(1,percent/100),1/(1+.5*percent/100));
  near(reduceCriticalChance(1,-.6),10/13);
});
test("excedente crítico, força de bloqueio e tabelas obrigatórias no nível 80",()=>{
  for(const [c,expected]of [[10000,1.5],[30000,1.5],[50000,1.5161],[100000,1.5522],[200000,1.6104],[400000,1.6907],[550000,1.7321],[800000,1.7810]])near(intrinsicCriticalMultiplier(c!,80),expected!,.00005);
  for(const [b,chance,reduction]of [[7500,.375,40],[15000,.5,40],[50000,.5,42.0896],[100000,.5,44.4156],[200000,.5,47.6289],[400000,.5,51.2409],[550000,.5,52.8144],[800000,.5,54.4700]]) {
    near(baseBlockChance(b!,80),chance!);near(blockReductionPercent(b!,80),reduction!,.00005);
    near(blockMultiplier(b!,80),1-blockReductionPercent(b!,80)/100);
  }
  near(intrinsicCriticalMultiplier(1e18,80),2,1e-10);near(blockReductionPercent(1e18,80),60,1e-10);
  near(baseBlockChance(0,80,100),.5);near(baseBlockChance(0,80,-100),0);
});
test("penetração tem curva própria, duas saídas independentes e crescimento linear sem teto crítico",()=>{
  for(const [p,reduction,bonus]of [[0,0,0],[10000,1.7562,3.5124],[25000,3.3353,6.6705],[50000,5.4182,10.8363],[70000,6.8571,13.7142],[120000,10,20],[180000,13.5,27],[240000,17,34],[300000,20,41],[400000,20,52.6667]]) {
    near(penetrationBlockReductionPoints(p!),reduction!,.00005);near(penetrationCriticalBonusPoints(p!),bonus!,.00005);
    near(blockChance(15000,p!,80),.5-penetrationBlockReductionPoints(p!)/100);
  }
  assert.equal(penetrationFactor(120000),1);near(penetrationFactor(120000-.001),penetrationFactor(120000+.001),2e-8);
  const blockForChance=(chancePercent:number)=>7500*chancePercent/(75-chancePercent);
  near(blockChance(blockForChance(20),300000,80),0);near(blockChance(blockForChance(10),300000,80),0);
  near(penetrationBlockReductionPoints(291428.5714285714),20);
  near(penetrationCriticalBonusPoints(360000)-penetrationCriticalBonusPoints(240000),14);
  assert.ok(specialCriticalMultiplier({critical:550000,level:80,penetration:180000})>2);
  near(criticalMultiplier([mod("criticalDamageBonusPercent",50)],{critical:550000,level:80,penetration:180000}),2.5021428571428572);
});
test("segurança numérica e monotonicidade sem limitar os pontos acumuláveis",()=>{
  for(const value of [NaN,Infinity,-Infinity,-1,0,1e-9,1,1000,30000,120000,1e12,1e100,Number.MAX_VALUE]) {
    for(const level of [NaN,Infinity,-1,0,1,10,80,Number.MAX_SAFE_INTEGER]) {
      const result=[criticalReference(level),blockReference(level),criticalPotential(value,level),criticalChance(value,level,level),intrinsicCriticalMultiplier(value,level),blockChance(value,value,level),blockReductionPercent(value,level),penetrationFactor(value),penetrationCriticalBonusPoints(value),specialCriticalMultiplier({critical:value,level,penetration:value})];
      assert.ok(result.every(Number.isFinite));assert.ok(criticalChance(value,level,level)>=0&&criticalChance(value,level,level)<=1);
      assert.ok(blockChance(value,value,level)>=0&&blockChance(value,value,level)<=.5);
    }
  }
  const functions=[(p:number)=>criticalChance(p,80,80),(p:number)=>intrinsicCriticalMultiplier(p,80),(p:number)=>baseBlockChance(p,80),(p:number)=>blockReductionPercent(p,80),penetrationFactor,penetrationBlockReductionPoints,penetrationCriticalBonusPoints];
  for(const fn of functions) {let previous=0;for(const p of [0,1,100,10000,15000,30000,120000,180000,300000,1e6,1e12]) {const n=fn(p);assert.ok(n>=previous);previous=n;}}
});
test("caso integrado do anexo: sorteios independentes, dano, reflexão/cura e protocolo preservados",()=>{
  const {a,b,e}=combat();const snapshot=JSON.stringify([a.stats,b.stats,b.permanentModifiers]);
  near(criticalBaseChance(a.stats.critical,80,80),1);near(criticalChance(a.stats.critical,80,80,0,.6),10/13);
  near(intrinsicCriticalMultiplier(a.stats.critical,80),1.7321428571428572);
  near(penetrationCriticalBonusPoints(a.stats.penetration),27);near(blockChance(b.stats.block,a.stats.penetration,80),.365);
  near(blockReductionPercent(b.stats.block,80),51.24087591240876);
  const counts=[0,0,0,0];
  for(let i=0;i<6000;i++) {
    a.hp=a.maxHp;b.hp=b.maxHp;
    const result=execute(e,{actor:a.id,skill:10000,targets:[b.id],sequence:i,automatic:false},i*1000),damage=result.damages[0]!;
    const critical=Number(damage.extra_data)===1,blocked=Boolean(damage.parry);counts[(critical?2:0)+(blocked?1:0)]!++;
    const expected=Math.round((1000000/(1000+(5+2e9/(1e9+1500000**3))*1000))*(critical?2.0021428571428572:1)*(blocked?1-51.24087591240876/100:1));
    assert.equal(damage.damage_value,expected);
    if(i===0) {
      const wire=decodeMessage(typeName("battle.AttackOrderMsg"),encodeMessage(typeName("battle.AttackOrderMsg"),{battle_id:"special",living_id:1,order_id:10000,damages:result.damages,buffers:result.buffers}));
      assert.equal(wire.damages[0].damage_value,expected);assert.equal(Boolean(wire.damages[0].parry),blocked);
    }
  }
  near((counts[2]!+counts[3]!)/6000,10/13,.025);near((counts[1]!+counts[3]!)/6000,.365,.025);
  near(counts[3]!/6000,(10/13)*.365,.025);assert.ok(counts.every(n=>n>0));
  assert.equal(JSON.stringify([a.stats,b.stats,b.permanentModifiers]),snapshot);
  a.permanentModifiers=[{...mod("lifeSteal",50),chance:100}];
  b.permanentModifiers!.push({...mod("reflect",20),chance:100});a.hp=50000;b.hp=b.maxHp;
  const proc=execute(e,{actor:1,skill:10000,targets:[2],sequence:1,automatic:false},1e8),finalDamage=proc.damages[0]!.damage_value;
  assert.deepEqual(proc.buffers.flatMap(b=>b.damage??[]).map(d=>d.damage_value),[Math.round(finalDamage*.2),-Math.round(finalDamage*.5)]);

  const rawBase=1000000/(1000+(5+2e9/(1e9+1500000**3))*1000);
  near(baseDamage(1000,1000),rawBase);near(offensiveDamage(1000,1000,1.4,100),rawBase*1.4+100);
});
test("cosmos e Tenacidade agregam redução uma vez; expiração afeta a ação seguinte",()=>{
  const {a,b,e}=combat(1);a.stats.penetration=0;b.stats.block=0;
  b.learned=[11511];initializePassives(e);
  // 60% cosmos + 10% Tenacidade => 100/(1+.5*.7), not 100-70.
  const clone=structuredClone(e),actor=clone.actors[1]!;
  const temporary=applyEffect(clone,actor,actor,{...buffers.get(11512)!,Id:"999912",ValidCount:"1",AttackValue:"-20",Dispel:"0"},[],"critResistance");
  assert.ok(temporary.removable);
  const run=(engine:typeof e)=>{let count=0;const start=engine.serial*1000+100000000;for(let i=0;i<4000;i++){for(const actor of engine.actors)actor.hp=actor.maxHp;const r=execute(engine,{actor:1,skill:10000,targets:[2],sequence:i,automatic:false},start+i*1000);count+=Number(r.damages[0]!.extra_data);}return count/4000;};
  near(run(clone),1/1.45,.03);
  execute(clone,{actor:2,skill:10000,targets:[1],sequence:1,automatic:false},1e8);
  assert.ok(!clone.effects.some(v=>v.id===temporary.id));
  near(run(e),1/1.35,.03);near(run(clone),1/1.35,.03);
});

test("bônus de chance da ativa fica restrito à habilidade e precede a redução percentual",()=>{
  const {a,b,e}=combat(987654321);a.stats.critical=0;a.stats.penetration=0;b.stats.block=0;
  let criticals=0;
  for(let i=0;i<4000;i++) {
    b.hp=b.maxHp;a.fury=100;
    const r=execute(e,{actor:1,skill:20911,targets:[2],sequence:i,automatic:false},i*100000);
    criticals+=Number(r.damages[0]!.extra_data);
  }
  near(criticals/4000,.15/1.3,.02);
  for(let i=0;i<100;i++) {
    b.hp=b.maxHp;
    const r=execute(e,{actor:1,skill:10000,targets:[2],sequence:i,automatic:false},i*100000);
    assert.equal(r.damages[0]!.extra_data,0);
  }
});

test("combate entre níveis diferentes usa nível do dono do crítico e do bloqueio",()=>{
  const {a,b,e}=combat(987654321);a.stats.level=10;a.stats.critical=3750;a.stats.penetration=0;
  b.stats.level=80;b.stats.block=15000;b.permanentModifiers=[];
  let criticals=0,blocks=0;
  for(let i=0;i<4000;i++) {
    a.hp=a.maxHp;b.hp=b.maxHp;
    const r=execute(e,{actor:1,skill:10000,targets:[2],sequence:i,automatic:false},i*100000);
    criticals+=Number(r.damages[0]!.extra_data);blocks+=Number(Boolean(r.damages[0]!.parry));
  }
  near(criticals/4000,.3,.025);near(blocks/4000,.5,.025);
  const saved=JSON.parse(JSON.stringify(e));
  for(const engine of [e,saved]) {
    for(const actor of engine.actors)actor.hp=actor.maxHp;
  }
  const choice={actor:1,skill:10000,targets:[2],sequence:1,automatic:false};
  assert.deepEqual(execute(e,choice,1e9),execute(saved,choice,1e9));assert.equal(e.rng,saved.rng);
});
