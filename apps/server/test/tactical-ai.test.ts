import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEffect, canUse, choose, createEngine, execute, makeActor, populateAutomatic, type Engine } from "../src/features/battle/engine.js";
import { evaluateBattleActions, equippedBattleSkills } from "../src/features/battle/tactical-ai.js";
import { setBattleAutomatic } from "../src/features/battle/automatic.js";
import { buffers } from "../src/features/battle/content.js";
import { createBattle, advanceBattle, readyTutorialBattle, combatReference } from "../src/combat.js";
import { readFileSync } from "node:fs";
import { runeBattleContract } from "../src/features/runes/index.js";

function fixture(job=3, learned=[30711,30811,31211], count=1) {
  const make=(id:number,side:number,template=1)=>makeActor({living_id:id,temp_id:template,side,pos:side===1?6:1+(id-2)*3,hp:10000,max_hp:10000,grade:30,sp:100,skillId:learned},
    {attack:template===3?100:1000,magicAttack:template===3?4000:100,defence:300,magicDefence:300},template*10000);
  const a=make(1,1,job), enemies=Array.from({length:count},(_,i)=>make(i+2,2));
  const e=createEngine([a,...enemies],1,12345);return {a,enemies,e};
}
test("IA cura por necessidade, evita cura desperdiçada e escolhe área contra múltiplos inimigos",()=>{
  const {a,e}=fixture();a.hp=100;
  assert.equal(evaluateBattleActions(e,a,0).skill,31211);
  a.hp=a.maxHp;assert.notEqual(evaluateBattleActions(e,a,0).skill,31211);
  const area=fixture(3,[30711,30811],4);assert.equal(evaluateBattleActions(area.e,area.a,0).skill,30811);
});
test("IA usa proteção sob risco e não renova um escudo cheio sem benefício",()=>{
  const {a,e}=fixture(1,[10711,11311]);a.hp=1000;
  // Preserve the original threat/damage scenario; this test isolates the AI policy.
  for(const actor of e.actors) actor.stats.defence=actor.stats.magicDefence=60;
  assert.equal(evaluateBattleActions(e,a,0).skill,11311);
  applyEffect(e,a,a,buffers.get(11311)!,[],"shield");
  assert.notEqual(evaluateBattleActions(e,a,0).skill,11311);
});
test("IA remove efeitos elegíveis e não desperdiça purificação sem debuff",()=>{
  const {a,e,enemies}=fixture(3,[30611,30711]);
  assert.notEqual(evaluateBattleActions(e,a,0).skill,30611);
  applyEffect(e,enemies[0]!,a,{...buffers.get(11211)!,ValidCount:"3"},[],"dot",5000);
  // The DoT ticks before an action: purification cannot cheat fatal pre-action damage.
  a.hp=10000;assert.equal(evaluateBattleActions(e,a,0).skill,30611);
  a.hp=100;const selected=evaluateBattleActions(e,a,0);
  const result=execute(e,{actor:1,skill:selected.skill,targets:[1],sequence:1,automatic:true},0);
  assert.equal(result.canceled,true);assert.equal(a.hp,0);assert.deepEqual(a.uses,{});
});
test("IA respeita barra equipada, fúria, cooldown e Oblívio sem escolher passivas",()=>{
  const {a,e}=fixture(3,[30711,30811,31211,30111]);
  a.equippedSkills=equippedBattleSkills(a.learned,"307,312,-1,-1,-1,");
  assert.deepEqual(a.equippedSkills,[30711,31211]);
  a.hp=100;a.fury=0;assert.equal(evaluateBattleActions(e,a,0).skill,30711);
  a.cooldowns[30711]=1000;assert.equal(evaluateBattleActions(e,a,0).skill,30000);
  a.fury=100;applyEffect(e,a,a,{...buffers.get(11111)!,ValidCount:"3"},[],"silence").skillIds=[31211];
  assert.equal(evaluateBattleActions(e,a,0).skill,30000);
});
test("avaliação é isolada e não conhece o RNG real, reservas ou sorteios futuros",()=>{
  const {a,e}=fixture();const snapshot=structuredClone(e),decision=evaluateBattleActions(e,a,0);
  assert.deepEqual(e,snapshot);
  const other:Engine=structuredClone(e);other.rng=999999;other.queue=[{actor:2,skill:10000,targets:[1],sequence:1,automatic:true}];
  assert.deepEqual(evaluateBattleActions(other,other.actors[0]!,0),decision);
  assert.ok(decision.reason.length>0);assert.ok(decision.alternatives.length>1);
});
test("cada jogador tem automático independente e escolha manual retoma o controle",()=>{
  const {a,enemies,e}=fixture();e.players=[1,2];enemies[0]!.learned=[10711];enemies[0]!.equippedSkills=[10711];
  assert.equal(setBattleAutomatic(e,1,true),true);populateAutomatic(e,0);
  assert.notEqual(e.queue.find(c=>c.actor===1)!.skill,30000);
  assert.equal(e.queue.find(c=>c.actor===2)!.skill,10000);
  assert.equal(choose(e,1,30711,0)?.automatic,false);assert.equal(a.autoBattle,false);
  populateAutomatic(e,0);assert.equal(e.queue.find(c=>c.actor===1)!.skill,30711);
  assert.equal(setBattleAutomatic(e,999,true),false);
  setBattleAutomatic(e,2,true);assert.equal(a.autoBattle,false);assert.equal(enemies[0]!.autoBattle,true);
  const saved:Engine=JSON.parse(JSON.stringify(e));assert.equal(saved.actors[1]!.autoBattle,true);
});
test("confusão conserva seu redirecionamento; a IA não cura inimigos com vida cheia",()=>{
  const {a,e,enemies}=fixture();a.hp=100;
  applyEffect(e,enemies[0]!,a,buffers.get(9610)!,[],"confusion");
  assert.notEqual(evaluateBattleActions(e,a,0).skill,31211);
});
test("automático completa as três batalhas ensaiadas das seis classes sem retirar suas proteções",()=>{
  for(let icon=1;icon<=6;icon++)for(let encounter=0;encounter<3;encounter++) {
    const b=createBattle(combatReference.encounters[encounter]!.prepare,encounter,icon,900,"AutoTutorial");
    b.autoBattle=true;readyTutorialBattle(b,0);
    for(let n=0;n<500&&!b.finished;n++)advanceBattle(b,Math.max(3000,b.nextTurnAt));
    assert.equal(b.won,true,`class ${icon}, encounter ${encounter}`);
  }
});

test("IA usa Restauração apenas quando útil e respeita uso máximo e abertura das runas",()=>{
  const {a,e}=fixture();a.hp=100;a.stats.magicAttack=100;
  const state=JSON.parse(readFileSync("data/city/scenario.json","utf8")).initial;
  state.player.grades=80;state.hero.rune={runeKey:"901",runeinfo:[{rune_id:901,rune_gp:0,swallowCount:0}]};
  a.runes=runeBattleContract(state);a.learned.push(9901);a.runeStartedAt=0;
  assert.equal(evaluateBattleActions(e,a,100000).skill,9901);
  a.uses[9901]=a.runes[0]!.maxUses;assert.notEqual(evaluateBattleActions(e,a,100000).skill,9901);
  a.uses={};a.runes[0]!.openingCooldownMs=200000;assert.notEqual(evaluateBattleActions(e,a,100000).skill,9901);
});

test("IA considera o teto do sangramento contra inimigos com vida muito alta",()=>{
  const {a,enemies,e}=fixture(3,[30711]);
  a.stats.magicAttack=1000000;enemies[0]!.hp=enemies[0]!.maxHp=1000000000;
  const state=JSON.parse(readFileSync("data/city/scenario.json","utf8")).initial;
  state.player.grades=80;state.hero.rune={runeKey:"818",runeinfo:[{rune_id:818,rune_gp:0,swallowCount:0}]};
  a.runes=runeBattleContract(state);a.learned.push(9818);a.runeStartedAt=0;
  assert.notEqual(evaluateBattleActions(e,a,1000000).skill,9818);
});

test("nove confrontos livres ofensivos entre as três classes usam o motor real, podendo vencer qualquer lado",()=>{
  const loadouts=[[10711,10811,11211],[20711,20811,20911],[30711,30811,30911]];
  const winners=new Set<number>();
  for(let left=1;left<=3;left++)for(let right=1;right<=3;right++) {
    const a=fixture(left,loadouts[left-1]!).a,b=fixture(right,loadouts[right-1]!).a;
    b.id=2;b.side=2;b.pos=1;
    const e=createEngine([a,b],1,42,[1,2]);setBattleAutomatic(e,1,true);setBattleAutomatic(e,2,true);
    for(let n=0;n<100&&a.hp>0&&b.hp>0;n++) {
      const now=n*10000;populateAutomatic(e,now);const c=e.queue.shift();assert.ok(c);
      assert.ok(canUse(e,e.actors.find(a=>a.id===c.actor)!,c.skill,now));execute(e,c,now);
    }
    assert.ok(a.hp===0||b.hp===0,`${left} x ${right} não terminou`);winners.add(a.hp>0?1:2);
  }
  assert.deepEqual([...winners].sort(),[1,2]);
});
