import { criticalReference, blockReference } from "../src/features/battle/special-attributes.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AttributeCalculator } from "../src/attributes.js";
import { cosmosAttributeSource } from "../src/features/cosmos/attributes.js";
import { initialCosmos } from "../src/features/cosmos/state.js";
import { createAdventure } from "../src/features/battle/adventure.js";
import { applyEffect, createEngine, execute, makeActor } from "../src/features/battle/engine.js";
import { buffers } from "../src/features/battle/content.js";
import type { CalculatedCombatModifier, CombatModifierKind } from "../src/features/attributes/combat-modifiers.js";
import { modifierAmount, permanentDamage } from "../src/features/battle/permanent-modifiers.js";
import { decodeMessage, encodeMessage, typeName } from "../src/messages.js";

function setup() {
  const actor = (id: number, side: number) => makeActor({ living_id: id, temp_id: side === 1 ? 1 : 1011, side, pos: side === 1 ? 6 : 2, hp: 10000, init_hp: 10000, grade: 50, skillId: [10000, 20911, 20811, 10711], sp: 100 }, { attack: 1000, defence: 1000, magicAttack: 1000, magicDefence: 1000 }, 10000);
  const a = actor(1, 1), b = actor(2, 2), e = createEngine([a,b], 1, 1);
  const attack = (skill = 10000, targets = [2], hits = 1) => execute(e, { actor: 1, skill, targets, sequence: 1, automatic: false }, 0, { hits });
  return { a,b,e,attack };
}
function modifier(kind: CombatModifierKind, magnitude: number, chance = 100): CalculatedCombatModifier {
  return { kind, magnitude, chance, source: "cosmos", origin: { instanceId: 1, templateId: 1015, bufferId: kind === "reflect" ? 80902 : 80702, slot: 0 }, level: 10, refinement: 0, value: 0, percent: magnitude / 10 };
}
const changes = (r: ReturnType<typeof execute>) => r.buffers.flatMap(b => b.damage ?? []);

test("cosmos: catálogo percentual inteiro chega ao snapshot de batalha sem herança das tropas e persiste", () => {
  for (const id of [1014,1015,1104,1105,1204,1205,1304,1305,1404,1405,1604,1605]) {
    const save = initialCosmos(); save.instances[1] = { id:1,templateId:id,bag:2,pos:0,level:10,xp:0,locked:false };
    const source = cosmosAttributeSource(save, () => true), central = AttributeCalculator.snapshot({ version:1,sources:{cosmos:source} });
    const scenario = JSON.parse(readFileSync("data/city/scenario.json", "utf8"));
    const battle = createAdventure(scenario.battles[0], 0, scenario.initial, undefined, central.combatModifiers);
    assert.deepEqual(battle.engine!.actors.find(a => a.id === battle.hero)!.permanentModifiers, central.combatModifiers);
    assert.ok(battle.engine!.actors.filter(a => a.id !== battle.hero).every(a => !a.permanentModifiers?.length));
    assert.deepEqual(JSON.parse(JSON.stringify(battle)).engine.actors.find((a: any) => a.id === battle.hero).permanentModifiers, central.combatModifiers);
    central.combatModifiers[0]!.magnitude = 9999;
    assert.notEqual(battle.engine!.actors.find(a => a.id === battle.hero)!.permanentModifiers![0]!.magnitude, 9999);
  }
});
test("cosmos: crítico soma 50 pontos ao multiplicador; buffs opostos somam na camada posterior", () => {
  const {a,b,e,attack} = setup(); a.stats.critical = criticalReference(a.stats.level);
  a.permanentModifiers = [modifier("criticalDamageBonusPercent",50)];
  applyEffect(e,a,a,{...buffers.get(20511)!,ValuePercent:"20"},[],"outgoing");
  applyEffect(e,a,b,{...buffers.get(21411)!,ValuePercent:"20"},[],"incoming");
  assert.equal(attack().damages[0]!.damage_value, 467); // raw approximately (1000/6) * 2 * 1.4
});
test("cosmos: redução permanente, bloqueio, esquiva crítica, redução fixa e não-crítico", () => {
  const {a,b,attack} = setup(); a.stats.critical = criticalReference(a.stats.level); b.stats.block = blockReference(b.stats.level);
  b.permanentModifiers = [modifier("criticalAvoidancePoints",100),modifier("damageReductionPercent",30)];
  const hit = attack().damages[0]!;
  assert.equal(hit.extra_data,1); assert.equal(hit.parry,true); assert.equal(hit.damage_value,105);
  a.permanentModifiers = [{...modifier("outgoingDamagePercent",50),cannotCritical:true}]; b.permanentModifiers = [modifier("flatDamageReduction",50)]; b.stats.block = 0;
  const next = attack().damages[0]!; assert.equal(next.extra_data,0); assert.equal(next.damage_value,200);
  assert.equal(permanentDamage(100,false,false,[modifier("damageVariancePercent",20)],[],()=>0),80);
  assert.equal(permanentDamage(100,false,false,[modifier("damageVariancePercent",20)],[],()=>1),120);
});
test("cosmos: imunidade mantém dano 1 e permite os debuffs da habilidade", () => {
  const {a,b,attack} = setup(); b.permanentModifiers = [modifier("damageImmunityChance",100)];
  const hit = attack(10711).damages; assert.ok(hit.every(d=>d.damage_value===1));
  const second = setup(); second.b.permanentModifiers = [modifier("damageImmunityChance",100)];
  const r = second.attack(21411); assert.equal(r.damages[0]!.damage_value,1);
  assert.ok(second.e.effects.some(b=>b.target===2&&b.kind==="incoming"));
  assert.equal(a.hp,10000);
});
test("cosmos: cada impacto sorteia efeitos; reflexão precede cura e usa dano absoluto mesmo sob escudo", () => {
  const {a,b,e,attack} = setup(); a.hp=5000;
  a.permanentModifiers=[modifier("lifeSteal",50)]; b.permanentModifiers=[modifier("reflect",50)];
  applyEffect(e,b,b,{...buffers.get(11311)!,ValuePercent:"100"},[],"shield");
  const r=attack(10000,[2],2), events=changes(r).filter(d=>d.living_id===1);
  assert.equal(b.hp,10000); assert.deepEqual(r.damages.map(d=>d.damage_value),[0,0]);
  assert.deepEqual(events.map(d=>d.damage_value),[42,42,-42,-42]); assert.equal(a.hp,5000);
});
test("cosmos: alvo morto não reflete, excesso de dano conta para cura, morto não se cura", () => {
  const first=setup(); first.a.hp=1000; first.b.hp=10;
  first.a.permanentModifiers=[modifier("lifeSteal",50)]; first.b.permanentModifiers=[modifier("reflect",50)];
  const r=first.attack(); assert.equal(first.b.hp,0); assert.deepEqual(changes(r).map(d=>d.damage_value),[-84]); assert.equal(first.a.hp,1084);
  const second=setup(); second.a.hp=10; second.b.permanentModifiers=[modifier("reflect",100)]; second.a.permanentModifiers=[modifier("lifeSteal",100),modifier("reflect",100)];
  const death=second.attack(); assert.equal(second.a.hp,0); assert.equal(second.b.hp,9833); assert.deepEqual(changes(death).map(d=>d.damage_value),[167]);
});
test("cosmos: área usa o dano individual e não o total; cap é opcional e cura fixa tem suporte", () => {
  const {a,b,e,attack}=setup(); a.hp=1000; a.permanentModifiers=[modifier("lifeSteal",50),modifier("healOnAttack",25)];
  const other=structuredClone(b); other.id=3; e.actors.push(other);
  const r=attack(20911,[2,3]); const damage=r.damages.map(d=>d.damage_value);
  assert.deepEqual(changes(r).map(d=>d.damage_value),damage.flatMap(d=>[-Math.round(d*0.5),-25]));
  assert.equal(modifierAmount({...modifier("lifeSteal",50),cap:100},10000),100);
  assert.equal(modifierAmount(modifier("lifeSteal",50),10000),5000);
});
test("cosmos: chances reais são sorteadas por impacto e não viram ativação garantida", () => {
  const {a,b,e,attack}=setup(); a.permanentModifiers=[modifier("lifeSteal",50,10)]; a.hp=1000;
  let activations=0;
  for(let i=0;i<1000;i++){b.hp=b.maxHp;const r=attack();activations+=changes(r).length;}
  assert.ok(activations>60&&activations<140,String(activations)); assert.ok(e.serial===1000);
});
test("cosmos: eventos de reflexão e cura atravessam o protocolo nativo sem perder a ordem ou o HP final", () => {
  const {a,b,attack}=setup(); a.hp=9999; a.permanentModifiers=[modifier("lifeSteal",100)]; b.permanentModifiers=[modifier("reflect",50)];
  const result=attack();
  const wire=decodeMessage(typeName("battle.AttackOrderMsg"),encodeMessage(typeName("battle.AttackOrderMsg"),{battle_id:"cosmos",living_id:1,order_id:10000,damages:result.damages,buffers:result.buffers}));
  assert.deepEqual(wire.buffers.map((b:any)=>b.template_id),[80902,80702]);
  assert.deepEqual(wire.buffers.map((b:any)=>b.damage[0].damage_value),[84,-167]);
  assert.deepEqual(wire.buffers.map((b:any)=>b.damage[0].left_value),[9915,10000]);
  assert.equal(a.hp,10000);
});
test("sangramento permanece após morte do aplicador e tutorial ignora procs permanentes", () => {
  const {a,b,e}=setup(); applyEffect(e,a,b,{...buffers.get(11211)!,Id:"99901",ValidCount:"3",ValuePercent:"10"},[],"dot",100); a.hp=0;
  execute(e,{actor:2,skill:10000,targets:[1],sequence:1,automatic:true},0); assert.equal(b.hp,9900);
  const scripted=setup(); scripted.a.permanentModifiers=[modifier("lifeSteal",100)]; scripted.b.permanentModifiers=[modifier("reflect",100),modifier("damageImmunityChance",100)];
  const r=execute(scripted.e,{actor:1,skill:10000,targets:[2],sequence:1,automatic:false},0,{scriptedDamage:()=>20,suppressTriggers:true});
  assert.equal(r.damages[0]!.damage_value,20);assert.equal(changes(r).length,0);
});
