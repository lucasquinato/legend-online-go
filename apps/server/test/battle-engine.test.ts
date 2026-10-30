import { criticalReference, blockReference } from "../src/features/battle/special-attributes.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine, makeActor, choose, execute, applyEffect, selectTargets, actorBuffers, populateAutomatic, type Actor, type Engine } from "../src/features/battle/engine.js";
import { buffers, actions, skills, actionFrames } from "../src/features/battle/content.js";
import { baseDamage, blockChance, criticalChance, offensiveDamage, resolveDamage } from "../src/features/battle/mechanics.js";
import { createAdventure, advanceAdventure, adventureSkill, readyAdventure } from "../src/adventure-combat.js";
import { closingDelay, OPENING_WAIT_MS } from "../src/features/battle/timing.js";
import { readFileSync } from "node:fs";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";

function actor(id = 1, side = 1, learned = [10711], hp = 100000): Actor {
  return makeActor({ living_id: id, temp_id: side === 1 ? 1 : 1011, side, pos: side === 1 ? 6 : 2, hp, max_hp: hp, skillId: learned, sp: 100, grade: 50 },
    { attack: 1000, magicAttack: 1000, defence: 1000, magicDefence: 1000 }, 10000);
}
function attack(e: Engine, a: Actor, skill = 10000, now = 100000) {
  return execute(e, { actor: a.id, skill, targets: selectTargets(e, a, skill), sequence: ++e.sequence, automatic: false }, now);
}

test("os dois jogadores usam ataque básico automático e podem substituí-lo por escolha manual", () => {
  const a = actor(1, 1, [10000, 10711]), b = actor(2, 2, [20000, 20711]); b.template = 2; b.defaultSkill = 20000;
  const e = createEngine([a, b], 1, 1, [1, 2]); populateAutomatic(e, 0);
  assert.deepEqual(e.queue.map(c => [c.actor, c.skill]), [[1, 10000], [2, 20000]]);
  assert.equal(choose(e, 2, 20711, 0)?.automatic, false);
  assert.equal(e.queue.find(c => c.actor === 2)!.skill, 20711);
});
test("fórmulas e parcela fixa seguem o contrato; penetração não reduz defesa", () => {
  assert.ok(Math.abs(baseDamage(1000, 1000) - 1000000 / (1000 + (5 + 2e9 / (1e9 + 1500000 ** 3)) * 1000)) < 1e-10);
  assert.equal(baseDamage(0, 0), 0);
  const raw = offensiveDamage(1000, 1000, 1.4, 100);
  assert.deepEqual([resolveDamage(raw, false, false), resolveDamage(raw, true, false), resolveDamage(raw, false, true), resolveDamage(raw, true, true)], [333, 500, 200, 300]);
  assert.ok(Math.abs(criticalChance(1000,50,15)-(150*1000/(1000+9375)+15)/100)<1e-12);
  assert.ok(blockChance(1000,1000,50)>0);
  assert.ok(Math.abs(blockChance(1000, 600, 50) - (75*1000/(1000+4687.5)-10*(600/120000)**.7)/100) < 1e-12);
});
test("defesa alta e bloqueio nunca arredondam ataques para menos de um por impacto", () => {
  const raw = offensiveDamage(1, 1000000000, 1);
  assert.equal(resolveDamage(raw, false, false), 1);
  assert.equal(resolveDamage(raw, true, true, -100, -100), 1);
  for (const magical of [false, true]) {
    const a = actor(1, 1, [10711, 30711]), target = actor(2, 2), e = createEngine([a, target], 1);
    a.stats.attack = a.stats.magicAttack = 1;
    target.stats.defence = target.stats.magicDefence = 1000000000;
    const result = execute(e, { actor: a.id, skill: magical ? 30711 : 10711, targets: [target.id], sequence: 1, automatic: false }, 0, { hits: 3 });
    assert.equal(result.damages.length, 3);
    assert.ok(result.damages.every(d => d.damage_value === 1));
    assert.equal(target.hp, target.maxHp - 3);
  }
});
test("tropas mágicas usam magia contra resistência; físicas usam ataque contra defesa", () => {
  for (const skill of [95, 96, 10, 11]) {
    const magical = [95, 96].includes(skill), a = actor(1, 1, [skill]), target = actor(2, 2), e = createEngine([a, target], 1);
    a.stats.attack = magical ? 0 : 5769;
    a.stats.magicAttack = magical ? 5769 : 0;
    target.stats.defence = 1000000;
    target.stats.magicDefence = 100;
    const raw = offensiveDamage(5769, magical ? 100 : 1000000, Number(skills.get(skill)!.Parameter1) / 100);
    const result = attack(e, a, skill, 0);
    assert.equal(result.damages.reduce((n, d) => n + d.damage_value, 0), resolveDamage(raw, false, false));
    assert.ok(target.hp < target.maxHp - 1);
  }
});
test("alvos reservados, fila e custo: selecionar não debita nem substitui ordem manual", () => {
  const a = actor(), e = createEngine([a, actor(2, 2)], 1);
  const first = choose(e, 1, 10711, 0)!;
  assert.equal(a.fury, 100);
  assert.deepEqual(first.targets, [2]);
  assert.equal(choose(e, 1, 10711, 0), undefined);
  assert.equal(choose(e, 2, 10711, 0, true)?.sequence, 2);
  assert.deepEqual(e.queue.map(c => c.actor), [1, 2]);
});
test("Rajada Dupla pode repetir alvo e não redireciona a segunda rajada após matar", () => {
  const a = actor(1, 1, [20811]), dead = actor(2, 2, [], 100), other = actor(3, 2, [], 10000), e = createEngine([a, dead, other], 1);
  const result = execute(e, { actor: 1, skill: 20811, targets: [2, 2], sequence: 1, automatic: false }, 0);
  assert.equal(dead.hp, 0); assert.equal(other.hp, 10000);
  assert.equal(result.damages.length, 1); assert.equal(a.fury, 90);
  const only = createEngine([actor(1, 1, [20811]), actor(2, 2)], 1);
  assert.deepEqual(selectTargets(only, only.actors[0]!, 20811), [2, 2]);
  const both=attack(only,only.actors[0]!,20811,0);
  assert.deepEqual(both.damages.map(d=>d.order),[0,1]);
  assert.ok(both.damages.every(d=>!('hp_limit' in d)));
});
test("alvo reservado morto antes da ativação é substituído pela mesma regra", () => {
  const a = actor(), first = actor(2, 2), replacement = actor(3, 2), e = createEngine([a, first, replacement], 1);
  first.hp = 0;
  const result = execute(e, { actor: 1, skill: 10711, targets: [2], sequence: 1, automatic: false }, 0);
  assert.equal(result.damages[0]!.living_id, 3); assert.ok(replacement.hp < replacement.maxHp);
});
test("sangramento mata antes da ação sem debitar fúria ou iniciar cooldown", () => {
  const a = actor(1, 1, [10811], 10), enemy = actor(2, 2), e = createEngine([a, enemy], 1);
  applyEffect(e, enemy, a, buffers.get(11211)!, [], "dot", 50);
  const result = attack(e, a, 10811, 0);
  assert.equal(a.hp, 0); assert.equal(result.canceled, true);
  assert.equal(a.fury, 100); assert.equal(a.cooldowns[10811], undefined);
  assert.equal(result.damages.length, 0); assert.equal(enemy.hp, enemy.maxHp);
});
test("buff aplicado na ação dura três ações futuras; reaplicação renova e acumula", () => {
  const a = actor(), e = createEngine([a, actor(2, 2)], 1);
  a.actionCount = 1;
  const row = { ...buffers.get(20511)!, ValidCount: "3", ValuePercent: "10" };
  const b = applyEffect(e, a, a, row, [], "outgoing");
  const encoded=encodeMessage(typeName('battle.BufferMsg'),actorBuffers(e,a.id)[0]!);
  assert.equal(decodeMessage(typeName('battle.BufferMsg'),encoded).$15.value,'18446744073709551615');
  for (let i = 1; i <= 2; i++) { attack(e, a, 10000, i * 10000); assert.equal(b.remaining, 3 - i); }
  applyEffect(e, a, a, row, [], "outgoing");
  assert.equal(b.remaining, 3); assert.equal(b.stacks, 2);
  for (let i = 3; i <= 5; i++) attack(e, a, 10000, i * 10000);
  assert.equal(e.effects.some(v => v.id === b.id), false);
});
test("aumentos de dano somam; vulnerabilidade beneficia tropas e outras fontes", () => {
  const a = actor(), enemy = actor(2, 2), e = createEngine([a, enemy], 1);
  applyEffect(e, a, a, { ...buffers.get(20511)!, Id: "90501", ValuePercent: "20" }, [], "outgoing");
  applyEffect(e, a, a, { ...buffers.get(20511)!, Id: "90601", ValuePercent: "10" }, [], "outgoing");
  const raw = offensiveDamage(1000, 1000, Number(skills.get(10000)!.Parameter1) / 100);
  const first = attack(e, a, 10000, 0);
  assert.equal(first.damages.reduce((n, d) => n + d.damage_value, 0), Math.round(raw * 1.3));
  applyEffect(e, a, enemy, { ...buffers.get(21411)!, ValuePercent: "20" }, [], "incoming");
  e.effects = e.effects.filter(b => b.target !== a.id);
  const troop = actor(3, 1); e.actors.push(troop);
  assert.equal(attack(e, troop, 10000, 10000).damages.reduce((n, d) => n + d.damage_value, 0), Math.round(raw * 1.2));
});
test("escudo usa HP máximo e cura usa magia do conjurador sem defesa do alvo", () => {
  const a = actor(1, 1, [11311, 31211]), enemy = actor(2, 2), e = createEngine([a, enemy], 1);
  a.hp = 1; a.maxHp = 1000000;
  attack(e, a, 11311, 0);
  assert.equal(a.hp, 1); assert.equal(e.effects.find(b => b.kind === "shield")!.shield, 200000);
  a.stats.magicAttack = 10; a.stats.magicDefence = 1000000;
  const heal = attack(e, a, 31211, 100000);
  assert.equal(heal.damages[0]!.living_id, a.id); assert.equal(heal.damages[0]!.damage_value, -5);
});
test("reflexão/roubo de vida das skills usam dano final após crítico e bloqueio", () => {
  const a = actor(1, 1, [20311]), target = actor(2, 2), e = createEngine([a, target], 1);
  a.hp = 1000; a.stats.critical = criticalReference(a.stats.level);
  applyEffect(e, target, target, { ...buffers.get(10611)!, ValuePercent: "20" }, [], "reflect");
  const result = attack(e, a, 20311, 0);
  const final = result.damages.reduce((n, d) => n + d.damage_value, 0);
  const hpEvents = result.buffers.flatMap(b => b.damage ?? []).filter(d => d.living_id === a.id);
  assert.ok(hpEvents.some(d => d.damage_value === Math.round(final * 0.2)));
  assert.ok(hpEvents.some(d => d.damage_value === -Math.round(final * 0.6)));
});
test("Meteorito calcula o proc com magia e resistência, independente do ataque físico", () => {
  for (const physical of [0, 999999]) {
    const a=actor(1,1,[31511]),target=actor(2,2),e=createEngine([a,target],1,2);
    a.stats.attack=physical;a.stats.magicAttack=1000;target.stats.defence=1000000;target.stats.magicDefence=1000;
    const result=attack(e,a,31511,0);
    const extra=result.buffers.flatMap(b=>b.damage??[]).find(d=>d.living_id===2);
    assert.ok(extra);assert.equal(extra.damage_value,83);
  }
});
test("skills: reflexão e cura usam o dano absoluto, por impacto, mesmo com escudo", () => {
  for(const critical of [false,true])for(const blocked of [false,true]){
    const a=actor(1,1,[20311]),target=actor(2,2),e=createEngine([a,target],1);
    a.hp=1000;a.stats.critical=critical?criticalReference(a.stats.level):0;target.stats.block=blocked?blockReference(target.stats.level):0;
    applyEffect(e,target,target,{...buffers.get(10611)!,ValuePercent:"20"},[],"reflect");
    applyEffect(e,target,target,{...buffers.get(11311)!,ValuePercent:"100"},[],"shield");
    const result=execute(e,{actor:1,skill:20311,targets:[2],sequence:1,automatic:false},0,{hits:2});
    const total=resolveDamage(offensiveDamage(1000,1000,1.2),critical,blocked),half=total/2;
    assert.deepEqual(result.damages.map(d=>d.damage_value),[0,0]);
    const events=result.buffers.flatMap(b=>b.damage??[]).filter(d=>d.living_id===1);
    assert.deepEqual(events.map(d=>d.damage_value),[Math.round(half*.2),Math.round(half*.2),-Math.round(half*.6),-Math.round(half*.6)]);
    assert.equal(target.hp,target.maxHp);
  }
});
test("skills: mortos não refletem; Disparo Sanguinário cura sobre o excesso de dano", () => {
  const a=actor(1,1,[20311]),target=actor(2,2),e=createEngine([a,target],1);a.hp=1000;target.hp=1;
  applyEffect(e,target,target,{...buffers.get(10611)!,ValuePercent:"100"},[],"reflect");
  const result=execute(e,{actor:1,skill:20311,targets:[2],sequence:1,automatic:false},0,{hits:1});
  assert.equal(target.hp,0);
  const events=result.buffers.flatMap(b=>b.damage??[]).filter(d=>d.living_id===1);
  assert.deepEqual(events.map(d=>d.damage_value),[-120]);assert.equal(a.hp,1120);
});
test("skills e cosmos: todas as reflexões vêm antes das curas e nunca disparam outra reflexão", () => {
  const a=actor(1,1,[20311]),target=actor(2,2),e=createEngine([a,target],1);a.hp=30; // Keep reflection fatal after the base-damage reduction.
  applyEffect(e,target,target,{...buffers.get(10611)!,ValuePercent:"20"},[],"reflect");
  applyEffect(e,a,a,{...buffers.get(10611)!,ValuePercent:"100"},[],"reflect");
  a.permanentModifiers=[{kind:"lifeSteal",source:"cosmos",origin:{instanceId:1,templateId:1015,bufferId:80702,slot:0},magnitude:100,percent:10,value:0,level:10,refinement:0,chance:100}];
  const result=execute(e,{actor:1,skill:20311,targets:[2],sequence:1,automatic:false},0,{hits:1});
  assert.equal(a.hp,0);assert.equal(target.hp,99800);
  assert.deepEqual(result.buffers.flatMap(b=>b.damage??[]).map(d=>d.damage_value),[40]);
});
test("críticos em área disparam passiva por impacto e respeitam cinco camadas", () => {
  const a = actor(1, 1, [20911, 20511]), enemies = Array.from({ length: 10 }, (_, i) => actor(i + 2, 2)), e = createEngine([a, ...enemies], 1);
  a.stats.critical = criticalReference(a.stats.level);
  const result = attack(e, a, 20911, 0);
  assert.ok(result.damages.every(d => d.extra_data === 1));
  assert.equal(e.effects.find(b => b.template === 20511 && b.target === 1)!.stacks, 5);
  // The proc is not allowed to amplify later targets of the action applying it.
  const perTarget=enemies.map(enemy=>result.damages.filter(d=>d.living_id===enemy.id).reduce((n,d)=>n+d.damage_value,0));
  assert.equal(new Set(perTarget).size,1);
});
test("controle de uma ação expira mesmo quando impede a habilidade, sem prender a fila", () => {
  const a=actor(),enemy=actor(2,2),e=createEngine([a,enemy],1);
  applyEffect(e,enemy,a,buffers.get(40014)!,[],"disabled");
  const first=attack(e,a,10711,0);
  assert.equal(first.canceled,true);assert.equal(a.fury,100);
  assert.deepEqual(a.cooldowns,{});assert.deepEqual(a.uses,{});assert.equal(first.damages.length,0);
  assert.equal(e.effects.length,0);
  assert.equal(attack(e,a,10711,10000).canceled,false);
});
test("turno reservado que recebe stun envia ação vazia e limpa seleção sem habilidade ou cooldown", () => {
  const scenario=JSON.parse(readFileSync('data/city/scenario.json','utf8')),ref=scenario.battles[0];
  const b=createAdventure(ref,0,structuredClone(scenario.initial));readyAdventure(b,0);
  assert.ok(adventureSkill(b,10711,0));
  const e=b.engine!,a=e.actors.find(a=>a.id===b.hero)!,enemy=e.actors.find(a=>a.side===2)!;
  applyEffect(e,enemy,a,buffers.get(40014)!,[],"disabled");
  const oldSp=b.sp;let at=2300,result=advanceAdventure(b,ref,at);
  for(let i=0;i<20&&!result.some(p=>p.opcode===153&&p.message.living_id===b.hero);i++){at=b.nextAt;result=advanceAdventure(b,ref,at);}
  const wire=result.find(p=>p.opcode===153&&p.message.living_id===b.hero)!.message;
  const decoded=decodeMessage(typeName('battle.AttackOrderMsg'),encodeMessage(typeName('battle.AttackOrderMsg'),wire));
  assert.equal(decoded.order_id,0);assert.equal(decoded.frame_num,1);assert.equal(decoded.damages,undefined);
  assert.equal(b.sp,oldSp);assert.deepEqual(b.cooldowns,{});assert.deepEqual(a.uses,{});
  assert.equal(result.find(p=>p.opcode===75)!.message.result,1);
  assert.ok(wire.buffers.some((v:any)=>v.template_id===40014&&v.see_type===2));
  assert.ok(!e.effects.some(v=>v.kind==='disabled'));assert.equal(b.nextAt,at+40);
  assert.ok(adventureSkill(b,10711,at+40));
});
test("cura exibe o valor completo com HP quase cheio ou cheio, inclusive cura por efeito", () => {
  for(const life of [999,1000]){
    const a=actor(1,1,[31211],1000),enemy=actor(2,2),e=createEngine([a,enemy],1);
    a.hp=life;a.stats.magicAttack=400;
    const heal=attack(e,a,31211,0);
    assert.equal(heal.damages[0]!.damage_value,-200);assert.equal(heal.damages[0]!.left_value,1000);assert.equal(a.hp,1000);
    applyEffect(e,a,a,{...buffers.get(31311)!,ValuePercent:'20'},[],"healAction");
    const turn=attack(e,a,10000,10000);
    const effect=turn.buffers.flatMap(b=>b.damage??[]).find(d=>d.damage_value===-200);
    assert.ok(effect);assert.equal(effect.left_value,1000);assert.equal(a.hp,1000);
  }
});
test("reflexão limita dez ativações; Destruição Estrelar seleciona quantidade e alvos distintos", () => {
  const a = actor(1, 1, [10611]), e = createEngine([a, actor(2, 2)], 1);
  for (let i = 0; i < 10; i++) { a.fury = 100; assert.ok(choose(e, 1, 10611, i * 100000)); e.queue=[]; attack(e, a, 10611, i * 100000); }
  a.fury=100; assert.equal(choose(e, 1, 10611, 2000000), undefined);
  assert.deepEqual(e.effects.find(b=>b.kind==='limit')!.skillIds,[10611]);
  assert.equal(attack(e,a,10000,2000000).canceled,false);
  for (const n of [1, 2, 5, 10]) {
    const sample=createEngine([actor(1,1,[21111]), ...Array.from({length:n},(_,i)=>actor(i+2,2))],1);
    for(let i=0;i<30;i++){const targets=selectTargets(sample,sample.actors[0]!,21111);assert.equal(new Set(targets).size,targets.length);assert.ok(targets.length>=Math.min(2,n)&&targets.length<=Math.min(6,n));}
  }
});
test("executor interpreta as 45 famílias iniciais sem usar dados de dano capturados", () => {
  const data=JSON.parse(readFileSync('reference/skills/basic.json','utf8'));
  for(const row of data.skills.filter((s:any)=>s.Grades==='1'&&s.UseWay==='1')){
    const id=Number(row.TemplateId),a=actor(1,1,[id]),e=createEngine([a,actor(2,2),actor(3,1)],1);
    const result=attack(e,a,id,0);
    assert.equal(result.canceled,false,`skill ${id}`);
    assert.doesNotThrow(()=>encodeMessage(typeName('battle.AttackOrderMsg'),{battle_id:'test',order_id:id,living_id:1,damages:result.damages,buffers:result.buffers}));
  }
});
test("agenda resolve uma ação por animação, guarda os efeitos na reconexão e termina após último impacto", () => {
  const scenario=JSON.parse(readFileSync('data/city/scenario.json','utf8')),state=structuredClone(scenario.initial),ref=scenario.battles[0];
  const b=createAdventure(ref,0,state);b.ready=true;
  assert.ok(adventureSkill(b,10711,0));
  assert.deepEqual(advanceAdventure(b,ref,0),[]);
  const out=advanceAdventure(b,ref,2300), action=out.find(p=>p.opcode===153)!;
  assert.equal(out.filter(p=>p.opcode===153).length,1);assert.equal(action.message.living_id,b.hero);
  assert.equal(b.nextAt,2300+actionFrames(10711)*40);
  assert.deepEqual(advanceAdventure(b,ref,b.nextAt-1),[]);
  const decoded=decodeMessage(typeName('battle.AttackOrderMsg'),encodeMessage(typeName('battle.AttackOrderMsg'),action.message));assert.equal(decoded.order_id,10711);
  const restored=JSON.parse(JSON.stringify(b));assert.deepEqual(restored.engine.effects,b.engine!.effects);
});

test("preparação genérica completa campos nativos ausentes e preserva campos já fornecidos", () => {
  const scenario = JSON.parse(readFileSync('data/city/scenario.json', 'utf8')), ref = structuredClone(scenario.battles[0]);
  const hero = ref.prepare.heros.find((h: any) => h.type === 1)!;
  delete hero.hp2; delete hero.init_hp2; delete hero.res; delete hero.cloak_path;
  const empty = createAdventure(ref, 0, structuredClone(scenario.initial)).prepare.heros.find((h: any) => h.type === 1)!;
  assert.equal(empty.hp2, 0); assert.equal(empty.init_hp2, 0); assert.equal(empty.res, ""); assert.equal(empty.cloak_path, "");
  assert.equal(hero.hp2, undefined, "A referência não é modificada");
  Object.assign(hero, { hp2: 123, init_hp2: 456, res: "custom-effect", cloak_path: "custom-cloak" });
  const retained = createAdventure(ref, 0, structuredClone(scenario.initial)).prepare.heros.find((h: any) => h.type === 1)!;
  assert.equal(retained.hp2, 123); assert.equal(retained.init_hp2, 456); assert.equal(retained.res, "custom-effect"); assert.equal(retained.cloak_path, "custom-cloak");
});
test("abertura usa iniciativa: padrão aos 2300 e seleção manual não ignora preparação", () => {
  const scenario=JSON.parse(readFileSync('data/city/scenario.json','utf8')),ref=scenario.battles[0];
  const b=createAdventure(ref,0,structuredClone(scenario.initial));readyAdventure(b,1000);
  const before=b.fighters.map(f=>f.hp);
  assert.deepEqual(advanceAdventure(b,ref,1000),[]);
  assert.deepEqual(advanceAdventure(b,ref,3299),[]);
  assert.deepEqual(b.fighters.map(f=>f.hp),before);
  assert.equal(b.engine!.queue.find(c=>c.actor===b.hero)!.readyAt,3300);
  assert.equal(advanceAdventure(b,ref,3300).filter(p=>p.opcode===153).length,1);
  const early=createAdventure(ref,0,structuredClone(scenario.initial));readyAdventure(early,1000);
  assert.deepEqual(advanceAdventure(early,ref,1000),[]);
  assert.ok(adventureSkill(early,10711,1200));
  assert.deepEqual(advanceAdventure(early,ref,1200),[]);
  assert.deepEqual(advanceAdventure(early,ref,3299),[]);
  const first=advanceAdventure(early,ref,3300).find(p=>p.opcode===153)!;assert.ok(first);
  assert.ok(first.message.order_id===10711||early.engine!.queue.some(c=>c.actor===early.hero&&c.skill===10711));
  assert.ok(early.openingComplete);
});
test("dois jogadores reservam ações independentes sem ignorar o custo de iniciativa", () => {
  const scenario=JSON.parse(readFileSync('data/city/scenario.json','utf8')),ref=scenario.battles[0];
  const b=createAdventure(ref,0,structuredClone(scenario.initial)),e=b.engine!,opponent=e.actors.find(a=>a.side===2)!;
  e.players=[b.hero,opponent.id];opponent.learned=[10711];readyAdventure(b,0);
  assert.ok(choose(e,opponent.id,10711,0,true));
  assert.deepEqual(advanceAdventure(b,ref,0),[]);
  assert.ok(adventureSkill(b,10711,500));
  assert.deepEqual(advanceAdventure(b,ref,500),[]);
  assert.ok(choose(e,opponent.id,10711,600,false));
  assert.deepEqual(advanceAdventure(b,ref,600),[]);
  assert.equal(advanceAdventure(b,ref,2300).filter(p=>p.opcode===153).length,1);
  assert.equal(b.openingComplete,true);
});
test("iniciativa persiste sem renovar no callback duplicado; retorno respeita 20 frames", () => {
  const scenario=JSON.parse(readFileSync('data/city/scenario.json','utf8')),ref=scenario.battles[0];
  const b=createAdventure(ref,0,structuredClone(scenario.initial));readyAdventure(b,0);readyAdventure(b,1000);
  assert.equal(b.engine!.queue.find(c=>c.actor===b.hero)!.readyAt,2300);
  const restored=JSON.parse(JSON.stringify(b));
  assert.deepEqual(advanceAdventure(restored,ref,2299),[]);
  assert.equal(advanceAdventure(restored,ref,2300).filter(p=>p.opcode===153).length,1);
  assert.equal(closingDelay(),1000);assert.equal(closingDelay(200),1200);
});

test('wedding ring healing targets spouses only, caps uses and does not work against spouse',()=>{const a=actor(1,1,[9991]),b=actor(2,1),c=actor(3,1),enemy=actor(4,2);const e=createEngine([a,b,c,enemy],1);a.marriage={partner:2,active:[9991],passive:[]};a.hp=b.hp=c.hp=50000;assert.deepEqual(selectTargets(e,a,9991),[1,2]);const result=attack(e,a,9991,0);assert.equal(result.canceled,false);assert.equal(a.hp,60000);assert.equal(b.hp,60000);assert.equal(c.hp,50000);assert.equal(choose(e,1,9991,100000),undefined);a.uses={};b.side=2;assert.equal(choose(e,1,9991,200000),undefined);});
test('wedding ring resurrection restores table HP and fury once with native waitRevives',()=>{const a=actor(1,1),b=actor(2,1),enemy=actor(3,2,[10000]);const e=createEngine([a,b,enemy],1);a.marriage={partner:2,active:[],passive:[9989]};b.hp=1;b.fury=10;enemy.stats.attack=1000000;const result=execute(e,{actor:3,skill:10000,targets:[2],sequence:1,automatic:false},0);assert.equal(b.hp,80000);assert.equal(b.fury,60);assert.equal(result.revives?.[0]?.living_id,2);const wire=encodeMessage(typeName('battle.AttackOrderMsg'),{waitRevives:result.revives!.map(r=>({...r,battle_id:'ring-test'}))});assert.equal(decodeMessage(typeName('battle.AttackOrderMsg'),wire).waitRevives[0].hp,80000);b.hp=1;const second=execute(e,{actor:3,skill:10000,targets:[2],sequence:2,automatic:false},10000);assert.equal(b.hp,0);assert.equal(second.revives,undefined);});
