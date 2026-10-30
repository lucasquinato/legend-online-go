import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEffect, canUse, choose, createEngine, execute, initializeRuneCooldowns, makeActor, selectTargets } from "../src/features/battle/engine.js";
import { runeBattleContract, runeRows } from "../src/features/runes/index.js";
import { buffers, skills } from "../src/features/battle/content.js";
import { createAdventure, readyAdventure, adventureSkill, advanceAdventure } from "../src/features/battle/adventure.js";
import { runeDescription, runeSkillDescription, runeBufferDescription } from "../src/features/runes/descriptions.js";
import { localSkillTables } from "../src/features/skills/descriptions.js";
import { inflateSync } from "node:zlib";
import { decodeMessage, encodeMessage, typeName } from "../src/messages.js";
import { bleedingRunePercent, bleedingRuneDamageCap, bleedingRuneDamage, formatRunePercent } from "../src/features/runes/balance.js";

function state(ids: number[]) {
  const s=structuredClone(JSON.parse(readFileSync("data/city/scenario.json","utf8")).initial);
  s.player.grades=80;s.hero.rune={runeKey:ids.join(","),runeinfo:ids.map(id=>({rune_id:id,rune_gp:0,swallowCount:0}))};return s;
}
function fixture(ids: number[]) {
  const runes=runeBattleContract(state(ids));
  const make=(id:number,side:number)=>makeActor({living_id:id,temp_id:3,side,pos:side===1?6:2,hp:100000,init_hp:100000,sp:50,grade:80,skillId:[10000,10711,11311,31211,31411,20311]},
    {attack:1000,magicAttack:2000,defence:1000,magicDefence:1000},30000);
  const a=make(1,1),b=make(2,2),e=createEngine([a,b],1,2);
  a.runes=runes;a.learned.push(...runes.map(r=>r.skillId));initializeRuneCooldowns(e,0);
  const cast=(skill:number,now=0)=>{const c=choose(e,a.id,skill,now);assert.ok(c,`cannot select ${skill}`);e.queue=[];return execute(e,c,now);};
  return {a,b,e,make,cast,runes};
}
test("runas: maior ataque define dano físico/mágico sem somar as duas bases",()=>{
  for(const [physical,magic,def,expected]of [[1000,2000,1000000,514],[2000,1000,1000,514]]){
    const {a,b,cast}=fixture([601]);a.stats.attack=physical!;a.stats.magicAttack=magic!;b.stats.defence=def!;b.stats.magicDefence=1000;
    const r=cast(9601);assert.equal(r.damages.reduce((n,d)=>n+d.damage_value,0),expected);
  }
});
test("runas: uso real consome ação, limite por batalha, cooldown próprio e comum",()=>{
  const {a,cast}=fixture([101,901]);const r=cast(9101);assert.equal(a.fury,80);assert.equal(a.actionCount,1);assert.equal(r.canceled,false);
  assert.equal(a.uses[9101],1);assert.equal(canUse(createEngine([a],1),a,9101,1000000),false);
  assert.equal(a.cooldowns[9901],20000);assert.equal(a.cooldowns[9101],75000);
  assert.equal(canUse(createEngine([a],1),a,9901,19999),false);assert.equal(canUse(createEngine([a],1),a,9901,20000),true);
  assert.ok(!canUse(createEngine([a],1),a,9201,1000000));
});
test("runas: recarga inicial é idempotente; stun cancela sem consumo de uso ou recarga",()=>{
  const {a,b,e}=fixture([101]);a.runeStartedAt=undefined;a.cooldowns={};a.runes![0]!.openingCooldownMs=1000;
  initializeRuneCooldowns(e,100);initializeRuneCooldowns(e,200);
  assert.equal(canUse(e,a,9101,1099),false);assert.equal(canUse(e,a,9101,1100),true);
  const selected=choose(e,a.id,9101,1100)!;applyEffect(e,b,a,{...buffers.get(40014)!,ValidCount:"1"},[],"disabled");
  const before={...a.cooldowns},r=execute(e,selected,1100);
  assert.equal(r.canceled,true);assert.equal(a.uses[9101],undefined);assert.equal(a.fury,50);assert.deepEqual(a.cooldowns,before);
});
test("runa Fúria fornece percentual mais parcela fixa, protegida de dispersão",()=>{
  const {a,b,e,cast}=fixture([201]);cast(9201);
  const buff=e.effects.find(b=>b.kind==="outgoing")!;assert.equal(buff.value,200);assert.equal(buff.removable,false);
  assert.equal(cast(10000,1000).damages.reduce((n,d)=>n+d.damage_value,0),372);
  assert.equal(a.hp,100000);assert.equal(b.hp,99628);
});
test("runas Proteção, Dispersão e Purificação reaproveitam os efeitos genéricos",()=>{
  const protection=fixture([301]);protection.cast(9301);assert.equal(protection.e.effects.find(b=>b.kind==="incoming")!.percent,-10);
  const dispersal=fixture([401]);applyEffect(dispersal.e,dispersal.b,dispersal.b,buffers.get(11311)!,[],"shield");dispersal.cast(9401);assert.ok(!dispersal.e.effects.some(b=>b.kind==="shield"));
  const cleanse=fixture([501]);applyEffect(cleanse.e,cleanse.b,cleanse.a,buffers.get(11211)!,[],"dot",0);cleanse.cast(9501);assert.ok(!cleanse.e.effects.some(b=>b.kind==="dot"));
});
test("sangramento rúnico respeita o teto normal, antes da ação e após morte do aplicador",()=>{
  const {a,b,e,cast,make}=fixture([801]);b.hp=b.maxHp=1000000;cast(9801);a.hp=0;e.actors.push(make(3,1));
  const effect=e.effects.find(b=>b.kind==="dot")!;assert.equal(effect.healthPercent,true);
  for(let i=0;i<3;i++)execute(e,{actor:b.id,skill:10000,targets:[1],sequence:i,automatic:true},1000+i);
  assert.equal(b.hp,976000);assert.ok(!e.effects.includes(effect));
});
test("Restauração recupera HP imediatamente e mostra cura inteira com vida cheia",()=>{
  for(const hp of [99999,100000]){const {a,cast}=fixture([901]);a.hp=hp;const r=cast(9901);
    assert.equal(a.hp,100000);assert.ok(r.buffers.flatMap(b=>b.damage??[]).some(d=>d.damage_value===-10000&&d.left_value===100000));}
});
test("confusão redireciona ataques e runas para aliados sem autoataque; sem aliados ataca inimigos",()=>{
  const {a,b,e,make,cast}=fixture([601]);const friend=make(3,1);e.actors.push(friend);
  applyEffect(e,b,a,buffers.get(9610)!,[],"confusion");
  assert.deepEqual(selectTargets(e,a,10711),[3]);assert.deepEqual(selectTargets(e,a,9601),[3]);
  const r=cast(9601);assert.ok(r.damages.every(d=>d.living_id===3));assert.equal(b.hp,b.maxHp);
  friend.hp=0;assert.deepEqual(selectTargets(e,a,10711),[2]);assert.ok(!selectTargets(e,a,20811).includes(1));
});
test("confusão redireciona curas, buffs e Raiva aos inimigos, inclusive sozinho",()=>{
  const {a,b,e,cast}=fixture([901,101]);b.hp=90000;
  applyEffect(e,b,a,buffers.get(9610)!,[],"confusion");
  assert.deepEqual(selectTargets(e,a,31211),[2]);assert.deepEqual(selectTargets(e,a,11311),[2]);
  cast(9901);assert.equal(b.hp,100000);assert.equal(a.hp,100000);
  cast(9101,20000);assert.equal(a.fury,50);assert.equal(b.fury,80);
  cast(11311,21000);assert.ok(e.effects.some(b=>b.kind==="shield"&&b.target===2));
});
test("confusão aplicada depois da seleção refaz alvos; expira e não altera passivas permanentes",()=>{
  const {a,b,e,make}=fixture([]);e.actors.push(make(3,1));const selected=choose(e,1,10711,0)!;
  applyEffect(e,b,a,{...buffers.get(9601)!,ValidCount:"1"},[],"confusion");
  const r=execute(e,selected,0);assert.ok(r.damages.every(d=>d.living_id===3));
  assert.ok(!e.effects.some(b=>b.kind==="confusion"));assert.deepEqual(selectTargets(e,a,10711),[2]);
});
test("Oblívio bloqueia habilidades ativas e runas sorteadas, sem bloquear ataque básico ou criar cooldown",()=>{
  const {a,b,e,cast}=fixture([710]);b.runes=runeBattleContract(state([101]));b.learned.push(9101);
  cast(9710);const effect=e.effects.find(b=>b.kind==="silence")!;
  assert.equal(effect.skillIds!.length,5);assert.equal(new Set(effect.skillIds).size,5);
  for(const id of effect.skillIds!)assert.equal(canUse(e,b,id,100000),false);
  assert.equal(canUse(e,b,b.defaultSkill,0),true);assert.deepEqual(b.cooldowns,{});
  for(let i=0;i<3;i++)execute(e,{actor:2,skill:30000,targets:[1],sequence:2+i,automatic:true},i*1000);
  assert.ok(!e.effects.includes(effect));for(const id of effect.skillIds!)assert.equal(canUse(e,b,id,100000),true);
  assert.equal(a.hp>0,true);
});
test("chefes respeitam RejectType; Desaceleração aplica ícone/duração sem efeito sobre a fila",()=>{
  for(const id of [610,710]){const {b,e,cast,runes}=fixture([id]);b.rejects=[38,39];cast(runes[0]!.skillId);assert.ok(!e.effects.some(b=>b.kind==="confusion"||b.kind==="silence"));}
  const {a,b,e,cast}=fixture([1010]);cast(9920);const slow=e.effects.find(b=>b.kind==="slow")!;
  assert.ok(slow);assert.equal(slow.remaining,3);assert.equal(slow.harmful,true);
  for(let i=0;i<3;i++){const r=execute(e,{actor:2,skill:30000,targets:[1],sequence:i,automatic:true},1000+i);assert.equal(r.canceled,false);}
  assert.ok(a.hp<100000);assert.ok(!e.effects.includes(slow));
});
test("preparo nativo inclui item, contador, recargas e resposta 158 após executar; reconexão preserva",()=>{
  const scenario=JSON.parse(readFileSync("data/city/scenario.json","utf8")),s=state([101]);s.hero.total_live=100000;
  const b=createAdventure(scenario.battles[0],0,s);readyAdventure(b,0);assert.ok(adventureSkill(b,9101,0));
  assert.deepEqual(advanceAdventure(b,scenario.battles[0],399),[]);
  const events=advanceAdventure(b,scenario.battles[0],400);assert.ok(events.some(p=>p.opcode===158&&p.message!.count===0&&p.message!.result===0));
  const hero=b.prepare.heros.find((h:any)=>h.living_id===b.hero);assert.equal(hero.item[0].count,0);
  const wire=decodeMessage(typeName("battle.BattlePrepareMsg"),encodeMessage(typeName("battle.BattlePrepareMsg"),b.prepare));
  assert.equal(wire.heros.find((h:any)=>h.living_id===b.hero).item[0].skillTempId,9101);
  const saved=JSON.parse(JSON.stringify(b));assert.equal(saved.engine.actors.find((a:any)=>a.id===b.hero).uses[9101],1);
});
test("descrições locais informam o teto por categoria sem modificar a tabela preservada",()=>{
  for(const r of runeRows.values())if(Number(r.RuneType)===8){
    const cap=Number(r.Level)===0?"8.000":"20.000";
    for(const text of [runeDescription(Number(r.TemplateId))!,runeSkillDescription(Number(r.SkillTemplateId))!,runeBufferDescription(Number(r.SkillTemplateId))!]){assert.ok(text.includes(`limitado a ${cap} pontos de dano por ação`));assert.doesNotMatch(text,/sem limite/);}
  }
  const raw=readFileSync("reference/quests/tempinfos.original.bin");const patched=localSkillTables(raw);
  const text=inflateSync(patched.subarray(4)).toString();assert.match(text,/perde 2,16% da vida máxima por ação/);
  assert.ok(!raw.equals(patched));
});

test("todos os 18 níveis preservam percentuais, duração, usos e recarga e limitam o dano por categoria",()=>{
  const original=JSON.parse(readFileSync("reference/runes/content.json","utf8"));
  let levels=0;
  for(const row of original.runes.filter((r:any)=>Number(r.RuneType)===8)) {
    const sourceSkill=original.skills.find((s:any)=>s.TemplateId===row.SkillTemplateId);
    const sourceBuffer=original.buffers.find((b:any)=>b.Id===sourceSkill.BufferIds);
    const percent=Math.round(Number(sourceBuffer.ValuePercent)*72)/100;
    const turns=Number(sourceBuffer.ValidCount),{a,b,e,cast,runes}=fixture([Number(row.TemplateId)]);
    b.hp=b.maxHp=1000000;
    const contract=runes[0]!;assert.equal(contract.maxUses,Number(row.UseCount));
    assert.equal(contract.cooldownMs,Number(sourceSkill.CoolDown));assert.equal(contract.openingCooldownMs,Number(sourceSkill.AppearCD));
    assert.equal(Number(contract.buffers[0]!.ValuePercent),percent);
    assert.equal(Number(buffers.get(Number(sourceBuffer.Id))!.ValuePercent),percent);
    assert.ok(runeDescription(Number(row.TemplateId))!.includes(`${formatRunePercent(percent)}%`));
    assert.ok(runeSkillDescription(Number(row.SkillTemplateId))!.includes(`${formatRunePercent(percent)}%`));
    assert.ok(runeBufferDescription(Number(sourceBuffer.Id))!.includes(`${formatRunePercent(percent)}%`));
    cast(Number(row.SkillTemplateId));assert.equal(e.effects.find(b=>b.healthPercent)!.remaining,turns);
    for(let i=0;i<turns;i++)execute(e,{actor:b.id,skill:10000,targets:[a.id],sequence:i,automatic:true},1000+i*1000);
    assert.equal(b.hp,1000000-Math.min(Math.round(1000000*Math.abs(percent)/100),Number(row.Level)===0?8000:20000)*turns,String(row.TemplateId));
    assert.ok(!e.effects.some(b=>b.healthPercent));levels++;
  }
  assert.equal(levels,18);
  assert.equal(Math.abs(bleedingRunePercent(9818)!)*10,72);
  assert.equal(bleedingRunePercent(11211),undefined);assert.equal(bleedingRunePercent(9901),undefined);
});

test("sangramento ativo salvo migra sem reiniciar duração nem reduzir o dano novamente",()=>{
  const {a,b,e,cast}=fixture([818]);b.hp=b.maxHp=1000000;cast(9818);
  e.effects.find(b=>b.healthPercent)!.percent=-10;
  const saved=JSON.parse(JSON.stringify(e));
  for(let i=0;i<2;i++) {
    execute(saved,{actor:b.id,skill:10000,targets:[a.id],sequence:i,automatic:true},1000+i*1000);
    assert.equal(saved.actors.find((x:any)=>x.id===b.id).hp,1000000-20000*(i+1));
    assert.equal(saved.effects.find((x:any)=>x.healthPercent).percent,-7.2);
    assert.equal(saved.effects.find((x:any)=>x.healthPercent).remaining,9-i);
  }
});
test("tetos abrangem os 10 níveis normais e os 8 avançados sem aumentar danos menores",()=>{
  const counts=[0,0];
  for(const row of runeRows.values())if(Number(row.RuneType)===8){
    const advanced=Number(row.Level)===1,cap=advanced?20000:8000,id=Number(row.SkillTemplateId);
    assert.equal(bleedingRuneDamageCap(id),cap);counts[advanced?1:0]!++;
    for(const maxHp of [10000,100000,1000000]){
      const {a,b,e,cast}=fixture([Number(row.TemplateId)]);b.hp=b.maxHp=maxHp;cast(id);
      const effect=e.effects.find(b=>b.healthPercent)!;
      const percent=bleedingRunePercent(effect.template)!;
      const requested=Math.min(Math.round(maxHp*Math.abs(percent)/100),cap);
      const result=execute(e,{actor:b.id,skill:10000,targets:[a.id],sequence:2,automatic:true},1000);
      const tick=result.buffers.flatMap(b=>b.damage??[]).find(d=>d.living_id===b.id)!;
      assert.equal(tick.damage_value,requested);assert.equal(tick.left_value,maxHp-requested);
      assert.equal(bleedingRuneDamage(effect.template,maxHp,-999),requested);
    }
  }
  assert.deepEqual(counts,[10,8]);
  assert.equal(bleedingRuneDamageCap(11211),undefined);
  assert.equal(bleedingRuneDamage(11211,1000000,-10),100000);
});

test("sangramento salvo respeita teto por ação com camadas e morte cancela antes dos custos",()=>{
  for(const [runeId,cap]of [[810,8000],[818,20000]]){
    const {a,b,e,cast}=fixture([runeId!]);b.hp=b.maxHp=1000000;cast(Number(runeRows.get(runeId!)!.SkillTemplateId));
    e.effects.find(b=>b.healthPercent)!.stacks=5;
    const saved=JSON.parse(JSON.stringify(e));
    const result=execute(saved,{actor:b.id,skill:10000,targets:[a.id],sequence:2,automatic:true},1000);
    const tick=result.buffers.flatMap(b=>b.damage??[]).find(d=>d.living_id===b.id)!;
    assert.equal(tick.damage_value,cap);assert.equal(saved.actors[1].hp,1000000-cap!);
    saved.actors[1].hp=cap!-1;
    const before=structuredClone({fury:saved.actors[1].fury,cooldowns:saved.actors[1].cooldowns,uses:saved.actors[1].uses});
    const fatal=execute(saved,{actor:b.id,skill:10711,targets:[a.id],sequence:3,automatic:false},2000);
    assert.equal(fatal.canceled,true);assert.equal(saved.actors[1].hp,0);
    assert.deepEqual({fury:saved.actors[1].fury,cooldowns:saved.actors[1].cooldowns,uses:saved.actors[1].uses},before);
  }
});

test("todos os 132 registros de runa executam sem valores inválidos e usam seu contrato real",()=>{
  assert.equal(runeRows.size,132);
  for(const row of runeRows.values()){
    const {a,b,e,runes,cast}=fixture([Number(row.TemplateId)]);assert.equal(runes.length,1,String(row.TemplateId));
    a.hp=50000;const r=cast(Number(row.SkillTemplateId),Number(runes[0]!.openingCooldownMs));
    assert.equal(r.canceled,false,String(row.TemplateId));assert.equal(a.uses[row.SkillTemplateId],1);
    for(const d of [...r.damages,...r.buffers.flatMap(b=>b.damage??[])])assert.ok(Number.isFinite(d.damage_value)&&Number.isFinite(d.left_value),String(row.TemplateId));
    assert.ok(a.hp<=a.maxHp&&a.hp>=0);assert.ok(b.hp<=b.maxHp&&b.hp>=0);assert.ok(e.effects.every(b=>Number.isFinite(b.remaining)));
  }
});
