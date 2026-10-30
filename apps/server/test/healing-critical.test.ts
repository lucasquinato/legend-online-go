import { criticalReference } from "../src/features/battle/special-attributes.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEffect, createEngine, execute, makeActor, type Engine } from "../src/features/battle/engine.js";
import { buffers, skills } from "../src/features/battle/content.js";
import { decodeMessage, encodeMessage, typeName } from "../src/messages.js";
import { readFileSync } from "node:fs";
import { runeBattleContract } from "../src/features/runes/index.js";
import { criticalHealingAllowed } from "../src/features/skills/healing-balance.js";
import { skillDescription, localSkillTables } from "../src/features/skills/descriptions.js";
import { inflateSync } from "node:zlib";

function setup(critical = criticalReference(10), seed = 1) {
  const actor = (id: number, side: number) => makeActor({ living_id:id,temp_id:1,side,pos:id,hp:10000,max_hp:10000,grade:10,sp:100,skillId:[31211,20311,10000] },{ attack:1000,magicAttack:1000,defence:1000,magicDefence:1000 },10000);
  const a=actor(1,1),ally=actor(2,1),enemy=actor(3,2);a.stats.critical=critical;
  return {a,ally,enemy,e:createEngine([a,ally,enemy],1,seed)};
}
const run = (e: Engine, skill=31211, targets=[2]) => execute(e,{actor:1,skill,targets,sequence:1,automatic:false},100000);
const healing = (r: ReturnType<typeof execute>) => [...r.damages,...r.buffers.flatMap(b=>b.damage??[])].filter(d=>d.damage_value<0);

test("cura crítica usa o conjurador, mostra o valor inteiro e limita o HP",()=>{
  for(const life of [9999,10000]) {
    const {a,ally,e}=setup();ally.hp=life;
    const result=run(e),heal=result.damages[0]!;
    assert.equal(heal.damage_value,-750);assert.equal(heal.extra_data,1);assert.equal(heal.parry,false);
    assert.equal(ally.hp,10000);assert.equal(heal.left_value,10000);
    const wire=decodeMessage(typeName("battle.AttackOrderMsg"),encodeMessage(typeName("battle.AttackOrderMsg"),{damages:result.damages}));
    assert.equal(wire.damages[0].extra_data,1);
    assert.equal(a.hp,10000);
  }
  const {ally,e}=setup(0);ally.stats.critical=1e12;
  assert.equal(run(e).damages[0]!.extra_data,0);
});

test("chance de cura usa a nova resistência natural, com sorteios independentes",()=>{
  const {e}=setup(937.5,987654321);let crits=0;
  for(let i=0;i<6000;i++) {
    const healer=e.actors[0]!;healer.cooldowns={};healer.fury=100;
    crits+=Number(run(e).damages[0]!.extra_data);
  }
  assert.ok(crits>2800&&crits<3200,String(crits));
  const original=setup(937.5,12345).e,copy=JSON.parse(JSON.stringify(original));
  assert.deepEqual(run(original),run(copy));assert.equal(original.rng,copy.rng);
});

test("cura periódica não tem crítico, inclusive após morte da fonte com crítico alto",()=>{
  const {a,ally,e}=setup();ally.hp=100;
  applyEffect(e,a,ally,{...buffers.get(31311)!,ValuePercent:"20"},[],"healAction");
  a.hp=0;
  const result=execute(e,{actor:ally.id,skill:10000,targets:[3],sequence:1,automatic:false},100000);
  const heal=healing(result)[0]!;
  assert.equal(heal.damage_value,-2000);assert.equal(heal.extra_data,0);assert.equal(ally.hp,2100);
});

test("roubo de vida e curas de cosmos não recebem crítico mesmo com crítico alto",()=>{
  const {a,e}=setup();a.hp=1000;
  a.permanentModifiers=["lifeSteal","healOnAttack"].map(kind=>({kind:kind as "lifeSteal"|"healOnAttack",magnitude:100,chance:100,source:"cosmos",origin:{instanceId:1,templateId:1015,bufferId:80702,slot:0},level:10,refinement:0,value:0,percent:10}));
  const result=run(e,20311,[3]),damage=result.damages.reduce((n,d)=>n+d.damage_value,0),heals=healing(result);
  assert.deepEqual(heals.map(d=>d.damage_value),[-Math.round(damage*.6),-damage,-100]);
  assert.ok(heals.every(d=>d.extra_data===0));
  assert.equal(e.effects.filter(b=>b.template===20511).length,0);
});

test("tutorial ensaiado mantém curas sem crítico",()=>{
  const {e}=setup();
  const result=execute(e,{actor:1,skill:31211,targets:[2],sequence:1,automatic:false},0,{scriptedDamage:()=>1,suppressTriggers:true});
  assert.equal(result.damages[0]!.damage_value,-500);assert.equal(result.damages[0]!.extra_data,0);
});

test("Restauração rúnica e cura passiva por bloqueio não recebem crítico",()=>{
  const {a,e}=setup();
  const state=JSON.parse(readFileSync("data/city/scenario.json","utf8")).initial;
  state.player.grades=80;state.hero.rune={runeKey:"901",runeinfo:[{rune_id:901,rune_gp:0,swallowCount:0}]};
  a.runes=runeBattleContract(state);a.learned.push(9901);
  const rune=healing(run(e,9901,[1]))[0]!;
  assert.equal(rune.damage_value,-1000);assert.equal(rune.extra_data,0);assert.equal(a.hp,10000);
  let procs=0;
  for(let seed=1;seed<=30;seed++) {
    const {a,enemy,e}=setup(1e12,seed);a.learned.push(10511);a.stats.block=1e12;
    const result=execute(e,{actor:enemy.id,skill:10000,targets:[a.id],sequence:1,automatic:false},0);
    for(const heal of healing(result)) {assert.equal(heal.extra_data,0);assert.equal(heal.damage_value,-500);procs++;}
  }
  assert.ok(procs>0);
});

test("Luz da Graça Divina sorteia por receptor e soma o bônus de dano crítico da fonte",()=>{
  const {a,ally,e}=setup(937.5,987654321);
  a.learned.push(20511);a.permanentModifiers=[{kind:"criticalDamageBonusPercent",magnitude:100,source:"cosmos",origin:{instanceId:1,templateId:1405,bufferId:0,slot:0},level:10,refinement:0,value:0,percent:10}];
  ally.stats.block=1e12;
  const pairs=new Set<string>();
  for(let i=0;i<100;i++) {
    a.cooldowns={};a.fury=100;
    const result=run(e,31411,[1,2]);
    pairs.add(result.damages.map(d=>d.extra_data).join(","));
    const normal=Math.round(a.stats.magicAttack*Math.abs(Number(skills.get(31411)!.Parameter1))/100);
    assert.ok(result.damages.every(d=>d.damage_value===(d.extra_data?-Math.round(normal*2.5):-normal)&&!d.parry));
    assert.ok(!e.effects.some(b=>b.template===20511));
  }
  assert.equal(pairs.size,4);
});

test("bônus de dano crítico soma nas curas permitidas e não habilita crítico periódico",()=>{
  for(const bonuses of [[50],[50,25]]) {
    const {a,ally,e}=setup();
    a.permanentModifiers=bonuses.map(magnitude=>({kind:"criticalDamageBonusPercent",magnitude,source:"cosmos",origin:{instanceId:1,templateId:1405,bufferId:0,slot:0},level:10,refinement:0,value:0,percent:magnitude}));
    ally.permanentModifiers=[{...a.permanentModifiers[0]!,magnitude:999}];
    const scale=1.5+bonuses.reduce((n,b)=>n+b,0)/100;
    assert.equal(run(e).damages[0]!.damage_value,-Math.round(500*scale));
    applyEffect(e,a,ally,{...buffers.get(31311)!,ValuePercent:"20"},[],"healAction");
    a.hp=0;
    const result=execute(e,{actor:ally.id,skill:10000,targets:[3],sequence:1,automatic:false},100000);
    assert.equal(healing(result)[0]!.damage_value,-2000);assert.equal(healing(result)[0]!.extra_data,0);
  }
});

test("somente as duas famílias permitidas recebem crítico, em todos os níveis",()=>{
  let allowed=0,excluded=0;
  for(const row of skills.values())if(Number(row.MasterType)===3&&Number(row.CountWay)===7) {
    const {a,e}=setup();const id=Number(row.TemplateId);a.learned.push(id);
    a.permanentModifiers=[{kind:"criticalDamageBonusPercent",magnitude:900,source:"cosmos",origin:{instanceId:1,templateId:1405,bufferId:0,slot:0},level:10,refinement:0,value:0,percent:10}];
    const result=run(e,id),direct=result.damages.filter(d=>d.damage_value<0);
    if(criticalHealingAllowed(row)) {
      const normal=Math.round(1000*Math.abs(Number(row.Parameter1))/100);
      assert.ok(direct.length>0);assert.ok(direct.every(d=>d.extra_data===1&&d.damage_value===-Math.round(normal*10.5)),String(id));allowed++;
      assert.match(skillDescription(id),/150%/);
    } else {assert.ok(direct.every(d=>d.extra_data===0),String(id));excluded++;}
  }
  assert.ok(allowed>=2);assert.ok(excluded>=2);
});

test("as duas curas críticas usam excedente, penetração e bônus externos completos",()=>{
  for(const skill of [31211,31411]) {
    const {a,ally,e}=setup(550000);a.learned.push(skill);a.stats.level=ally.stats.level=80;a.stats.penetration=180000;
    a.permanentModifiers=[{kind:"criticalDamageBonusPercent",magnitude:50,source:"cosmos",origin:{instanceId:1,templateId:1405,bufferId:0,slot:0},level:10,refinement:0,value:0,percent:5}];
    const normal=Math.round(1000*Math.abs(Number(skills.get(skill)!.Parameter1))/100);
    const result=run(e,skill),heal=result.damages[0]!;
    assert.equal(heal.extra_data,1);assert.equal(heal.damage_value,-Math.round(normal*2.5021428571428572));
  }
});

test("Fortalecer Bloqueio cura 5% em ambos os níveis, com chances de 7% e 14% após bloqueio",()=>{
  for(const [id,chance]of [[10511,.07],[10521,.14]]) {
    const {a,enemy,e}=setup(1e12,987654321);a.learned=[id!];a.stats.block=1e12;
    let count=0,blocked=0;
    for(let i=0;i<8000;i++) {
      a.hp=a.maxHp;
      const result=execute(e,{actor:enemy.id,skill:10000,targets:[a.id],sequence:i,automatic:false},i*1000);
      if(result.damages.some(d=>d.parry))blocked++;
      for(const heal of healing(result)) {assert.equal(heal.damage_value,-500);assert.equal(heal.extra_data,0);count++;}
    }
    assert.ok(Math.abs(count/blocked-chance!)<.015,`${id}: ${count}/${blocked}`);
    assert.match(skillDescription(id!),new RegExp(`${Math.round(chance!*100)}% de chance de recuperar 5%`));
    assert.equal(Number(buffers.get(id!)!.ValuePercent),5);
    a.stats.block=0;
    for(let i=0;i<30;i++) {
      a.hp=a.maxHp;
      assert.equal(healing(execute(e,{actor:enemy.id,skill:10000,targets:[a.id],sequence:i,automatic:false},i*1000)).length,0);
    }
  }
  const text=inflateSync(localSkillTables(readFileSync("reference/quests/tempinfos.original.bin")).subarray(4)).toString();
  const rank2=text.match(/<SkillBufferTempInfo\s+[^>]*\bId="10521"[^>]*\/>/)?.[0];
  assert.ok(rank2);assert.match(rank2,/ValuePercent="5"/);assert.match(rank2,/14% de chance de recuperar 5%/);
});
