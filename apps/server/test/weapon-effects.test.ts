import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inflateSync} from "node:zlib";
import {AttributeCalculator,type AttributeSource} from "../src/attributes.js";
import {equipmentRecipes,equipmentSource} from "../src/features/equipment/content.js";
import {itemTemplate} from "../src/inventory.js";
import {weaponCombatModifiers,weaponFury} from "../src/features/equipment/weapon-effects.js";
import {synchronizeInitialEquipment} from "../src/features/attributes/initial-equipment.js";
import {applyEffect,createEngine,execute,makeActor,selectTargets,type Policy} from "../src/features/battle/engine.js";
import {buffers,skills} from "../src/features/battle/content.js";
import {createAdventure} from "../src/features/battle/adventure.js";
import {localEquipmentTables} from "../src/features/equipment/client-tables.js";
import {decodeMessage,encodeMessage,type Message,typeName} from "../src/messages.js";
const weapon=(template_id=1991101):Message=>({id:987654,template_id,bag_type:4,object_id:1810,pos:0,count:1,exist:1,strengthen_grade:0,mould_grade:0});
function setup(equipped=true,templateId=1991101){
 const hero=makeActor({living_id:1,temp_id:1,side:1,pos:6,hp:100000,max_hp:100000,sp:30,grade:80,skillId:[10000,10811,20811,21011,31211]}, {attack:1000,magicAttack:1000,defence:1000,magicDefence:1000},10000);
 const enemy=makeActor({living_id:2,temp_id:1011,side:2,pos:2,hp:100000,max_hp:100000,sp:0,grade:80,skillId:[10000]}, {attack:1000,defence:1000},10000);
 if(equipped)hero.permanentModifiers=AttributeCalculator.combat({version:1,sources:{weapon:equipmentSource(weapon(templateId))!}});
 const engine=createEngine([hero,enemy],1,5);
 return {hero,enemy,engine,action:(skill=10000,policy:Policy={})=>execute(engine,{actor:hero.id,skill,targets:selectTargets(engine,hero,skill),sequence:1,automatic:false},0,policy)};
}
test("all eighteen weapons across three classes use 10/15/20 fury for their effective tier",()=>{
 let count=0;
 for(const r of equipmentRecipes.values()){
  const id=Number(r.NewMaterial),t=itemTemplate(id)!,effects=weaponCombatModifiers(weapon(id)),eligible=Number(t.SonType)===101;
  assert.equal(effects.length,eligible?1:0,String(id));
  if(eligible){count++;const level=Number(t.NeedGrades);assert.equal(effects[0]!.value,level<=30?10:level<=60?15:20);assert.equal(effects[0]!.origin.bufferId,1094);assert.equal(effects[0]!.refinement,0);}
 }
 assert.equal(count,18);assert.equal(weaponFury(1011003),0);assert.deepEqual(weaponCombatModifiers(weapon(1170010)),[]);
});
test("only the equipped weapon contributes; refinement never amplifies fury and reload does not duplicate it",()=>{
 const gear=weapon(),items:Record<string,Message>={"4:1810:0":gear},sources:Record<string,AttributeSource>={};
 synchronizeInitialEquipment(sources,items,1810,80,100);let combat=AttributeCalculator.combat({version:1,sources});assert.equal(combat.length,1);assert.equal(combat[0]!.magnitude,15);
 synchronizeInitialEquipment(sources,JSON.parse(JSON.stringify(items)),1810,80,100);assert.deepEqual(AttributeCalculator.combat({version:1,sources}),combat);
 gear.bag_type=1;synchronizeInitialEquipment(sources,items,1810,80,100);assert.deepEqual(AttributeCalculator.combat({version:1,sources}),[]);
});
test("each tier grants its exact fury once for basic, multi-hit, area and healing actions",()=>{
 for(const templateId of [1991091,1891091,1991101,1998101,2018101,2019101])for(const skill of [10000,20811,21011,31211]){
  const gain=weaponFury(templateId),plain=setup(false),equipped=setup(true,templateId);plain.hero.fury=equipped.hero.fury=skill===21011?100:60;
  if(skill===21011)for(const s of [plain,equipped])s.engine.actors.push({...structuredClone(s.enemy),id:3,pos:3});
  if(skill===31211)plain.hero.hp=equipped.hero.hp=1000;
  const before=plain.action(skill,{hits:3}),after=equipped.action(skill,{hits:3});assert.equal(after.canceled,false,String(skill));
  assert.deepEqual(after.damages,before.damages);assert.equal(equipped.hero.fury,Math.min(100,plain.hero.fury+gain));
  const events=after.buffers.filter(b=>b.template_id===1094);assert.equal(events.length,1);assert.equal(events[0]!.damage[0].damage_type,9);assert.equal(events[0]!.damage[0].damage_value,gain);
  const decoded=decodeMessage(typeName("battle.BufferMsg"),encodeMessage(typeName("battle.BufferMsg"),events[0]!));assert.equal(decoded.damage[0].left_value,equipped.hero.fury);
 }
});
test("fury caps at 100, cannot fund an unaffordable action and never triggers on a cancelled/dead/scripted action",()=>{
 const capped=setup();capped.hero.fury=99;capped.action();assert.equal(capped.hero.fury,100);
 const poor=setup();poor.hero.fury=0;const rejected=poor.action(21011);assert.equal(rejected.canceled,true);assert.equal(poor.hero.fury,0);assert.ok(!rejected.buffers.some(b=>b.template_id===1094));
 const dead=setup();dead.hero.hp=0;assert.equal(dead.action().canceled,true);assert.equal(dead.hero.fury,30);
 const stunned=setup();applyEffect(stunned.engine,stunned.enemy,stunned.hero,{...buffers.get(10131)!,AttackType:"38",ValidCount:"1"},[],"disabled");const canceled=stunned.action();assert.equal(canceled.canceled,true);assert.equal(stunned.hero.fury,30);
 const scripted=setup();const original=setup(false);scripted.action(10000,{suppressTriggers:true});original.action(10000,{suppressTriggers:true});assert.equal(scripted.hero.fury,original.hero.fury);
});
test("battle preparation snapshots the central effect for the hero, never for troops, and persists it",()=>{
 const scenario=JSON.parse(readFileSync("data/city/scenario.json","utf8")),snapshot=AttributeCalculator.combat({version:1,sources:{weapon:equipmentSource(weapon())!}});
 const battle=createAdventure(scenario.battles[0],0,scenario.initial,undefined,snapshot),hero=battle.engine!.actors.find(a=>a.id===battle.hero)!;
 assert.deepEqual(hero.permanentModifiers,snapshot);assert.ok(battle.engine!.actors.filter(a=>a.id!==hero.id).every(a=>!a.permanentModifiers?.length));
 assert.deepEqual(JSON.parse(JSON.stringify(battle)).engine.actors.find((a:any)=>a.id===hero.id).permanentModifiers,snapshot);
});
test("the local tooltip describes positive fury without changing the original effect operands",()=>{
 const raw=readFileSync("reference/quests/tempinfos.original.bin"),body=inflateSync(localEquipmentTables(raw).subarray(4));let pos=4,found=0;
 while(pos<body.length){const n=body[pos++]!,name=body.subarray(pos,pos+n).toString();pos+=n;const length=body.readUInt32BE(pos);pos+=4;const xml=body.subarray(pos,pos+length).toString();pos+=length;
  if(name==="ItemTempInfos")for(const templateId of [1991091,1891091,1991101,1998101,2018101,2019101]){const row=new RegExp(`<ItemTempInfo\\s+[^>]*\\bTemplateId="${templateId}"[^>]*\\/>`).exec(xml)![0];assert.ok(row.includes(`ganha ${weaponFury(templateId)} pontos de fúria por ação.`));}
  if(name==="SkillTempInfos"){assert.match(xml,/<SkillTempInfo\s+[^>]*TemplateId="1094"[^>]*TemplateName="Ganha fúria por ação conforme o nível da arma\."/);found++;}
  if(name==="SkillBufferTempInfos"){const row=/<SkillBufferTempInfo\s+[^>]*\bId="1094"[^>]*\/>/.exec(xml)![0];assert.match(row,/AttackValue="10"/);assert.match(row,/AttackData="1"/);assert.match(row,/AttackType="6"/);found++;}
 }
 assert.equal(found,2);
});
