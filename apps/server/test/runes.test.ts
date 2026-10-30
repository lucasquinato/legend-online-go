import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { emptyCity } from "../src/city-state.js";
import { Inventory, InventoryError } from "../src/inventory.js";
import { projectRoot } from "../src/config.js";
import { createRunes, operateRune, syncRunes, runeRows, runeBattleContract, materialXp, RuneError, moveRuneMaterial } from "../src/features/runes/index.js";
import { CityWorld } from "../src/city-world.js";
import { Store } from "../src/store.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import { frame } from "../src/protocol.js";
import { createAdventure } from "../src/features/battle/adventure.js";
const now = Date.UTC(2026, 9, 16, 12);
function context(job=1, level=80) {
  const state=emptyCity();state.player.grades=level;state.army.job=job;
  const save=createRunes(now), inventory=new Inventory(state.items,{nextId:900000});
  const seed=(template:number,pos:number,count=1,bag=1)=> { const item={id:900000+pos,exist:1,template_id:template,bag_type:bag,object_id:0,pos,count,bind:1,used:0,strengthen_grade:0,join_1:-1,join_2:-1,join_3:-1,join_4:-1}; state.items[`${bag}:0:${pos}`]=item;return item; };
  const op=(request:any)=>operateRune(save,state,inventory,request,now);
  return {state,save,inventory,seed,op};
}
for(const job of [1,2,3])test(`runas classe ${job}: dez famílias, aprendizado, dois slots, desequipar e snapshot`,()=>{
  const c=context(job);
  for(const [index,type] of [1,2,3,4,5,6,7,8,9,10].entries()){
    const row=[...runeRows.values()].find(r=>Number(r.RuneType)===type&&Number(r.Level)===0&&Number(r.RuneGrade)===1)!;
    const template=type===10?3020013:3020000+type;c.seed(template,index);
    c.op({opType:1,runeId:Number(row.TemplateId),learn_runePos:index});
    assert.equal(c.save.learned[type]!.id,Number(row.TemplateId));
    assert.throws(()=>c.op({opType:1,runeId:Number(row.TemplateId),learn_runePos:index}),RuneError);
  }
  c.op({opType:3,runeKey:"101,201"});syncRunes(c.save,c.state,now);
  const battle=runeBattleContract(c.state);assert.equal(battle.length,2);assert.equal(battle[0]!.skillId,9101);assert.equal(battle[0]!.maxUses,1);assert.equal(battle[0]!.commonCooldownMs,20000);assert.ok(battle[1]!.buffers.length);
  battle[1]!.skill.Description="changed";assert.notEqual(runeBattleContract(c.state)[1]!.skill.Description,"changed");
  c.op({opType:3,runeKey:"-1,201"});syncRunes(c.save,c.state,now);assert.equal(runeBattleContract(c.state).length,1);
  assert.throws(()=>c.op({opType:3,runeKey:"201,201"}),RuneError);
  assert.throws(()=>c.op({opType:3,runeKey:"102,-1"}),RuneError);
});
test("níveis 35/40, item correto e identidade da runa",()=>{
 const c=context(3,34);c.seed(3020001,0);
 assert.throws(()=>c.op({opType:1,runeId:101,learn_runePos:0}),RuneError);assert.equal(c.state.items['1:0:0']!.count,1);
 c.state.player.grades=35;c.op({opType:1,runeId:101,learn_runePos:0});
 assert.throws(()=>c.op({opType:3,runeKey:"-1,101"}),RuneError);
 c.op({opType:3,runeKey:"101,-1"});c.seed(3020001,1);
 assert.throws(()=>c.op({opType:1,runeId:201,learn_runePos:1}),RuneError);
});
test("absorção usa slots temporários, XP por tipo, avança níveis e preserva excedentes no máximo",()=>{
 const c=context();c.seed(3020002,0);c.op({opType:1,runeId:201,learn_runePos:0});
 const matching=c.seed(3020002,1,999999),other=c.seed(3020003,2),universal=c.seed(3021001,3);
 assert.equal(materialXp(matching,runeRows.get(201)!),20);assert.equal(materialXp(other,runeRows.get(201)!),40);assert.equal(materialXp(universal,runeRows.get(201)!),50);
 moveRuneMaterial(c.state,c.inventory,{begin_bag_type:1,begin_obj_id:0,begin_pos:1,end_bag_type:0,end_obj_id:0,end_pos:0,count:0});
 c.op({opType:2,runeId:201});assert.equal(c.save.learned[2]!.id,210);assert.ok(c.state.items['0:0:0']!.count>0);
 assert.throws(()=>c.op({opType:2,runeId:210}),RuneError);
 moveRuneMaterial(c.state,c.inventory,{begin_bag_type:0,begin_obj_id:0,begin_pos:0,end_bag_type:1,end_obj_id:0,end_pos:4,count:0});assert.ok(c.state.items['1:0:4']);
});
test("slots rúnicos recebem e devolvem a pilha inteira quando o cliente envia count=1",()=>{
 for (const template of [3020010,3021001]) {
  const c=context();const item=c.seed(template,3,9999);
  const incoming={begin_bag_type:1,begin_obj_id:0,begin_pos:3,end_bag_type:0,end_obj_id:0,end_pos:2,count:1};
  moveRuneMaterial(c.state,c.inventory,incoming);
  assert.ok(!c.state.items['1:0:3']);assert.equal(c.state.items['0:0:2']!.count,9999);assert.equal(c.state.items['0:0:2']!.id,item.id);
  moveRuneMaterial(c.state,c.inventory,{begin_bag_type:0,begin_obj_id:0,begin_pos:2,end_bag_type:1,end_obj_id:0,end_pos:-1,count:1});
  assert.ok(!c.state.items['0:0:2']);assert.equal(Object.values(c.state.items).find(i=>i.template_id===template)!.count,9999);
  const before=JSON.stringify(c.state.items);assert.throws(()=>moveRuneMaterial(c.state,c.inventory,{...incoming,begin_pos:0,count:10000}),InventoryError);assert.equal(JSON.stringify(c.state.items),before);
 }
});
test("limite por nível armazena barra cheia; reconexão e novo nível permitem seguir sem novo consumo",()=>{
 const c=context(1,35);c.seed(3020001,0);c.op({opType:1,runeId:101,learn_runePos:0});c.seed(3020010,0,999999,0);
 c.op({opType:2,runeId:101});const id=c.save.learned[1]!.id;const progress=c.save.learned[1]!;
 const next=runeRows.get(Number(runeRows.get(id)!.NextRuneId))!;assert.equal(progress.xp,Number(next.NeedGp));assert.ok(Number(next.NeedGrade)>35);
 const count=c.state.items['0:0:0']!.count;delete c.state.items['0:0:0'];c.state.player.grades=Number(next.NeedGrade);c.op({opType:2,runeId:id});assert.equal(progress.id,Number(next.TemplateId));assert.ok(count>0);
 progress.swallowed=99;syncRunes(c.save,c.state,now+86400000);assert.equal(progress.swallowed,0);
});
test("promoção libera no 80, consome dez pedras e permite evoluir sem profissão avançada",()=>{
 const c=context(1,79);c.save.learned[2]={id:210,xp:0,swallowed:0};c.save.keys=[2,-1];c.seed(3021001,0,10);
 c.state.player.vocation_grades=100;assert.throws(()=>c.op({opType:4,runeId:210}),RuneError);c.state.player.grades=80;c.state.player.vocation_grades=0;
 c.op({opType:4,runeId:210});syncRunes(c.save,c.state,now);assert.equal(c.save.learned[2]!.id,211);assert.equal(c.state.hero.rune.runeKey,'211,-1');assert.ok(!c.state.items['1:0:0']);
 c.seed(3021001,0,99999,0);c.op({opType:2,runeId:211});assert.equal(c.save.learned[2]!.id,218);assert.ok(c.state.items['0:0:0']!.count>0);
 c.save.learned[4]={id:410,xp:0,swallowed:0};assert.throws(()=>c.op({opType:4,runeId:410}),RuneError);
});
test("CityWorld: protocolo real, delta de mochila, persistência, rollback, fraude e batalha",async()=>{
 mkdirSync(join(projectRoot,'.test-data'),{recursive:true});const dir=mkdtempSync(join(projectRoot,'.test-data','runes-'));mkdirSync(join(dir,'city'));copyFileSync(join(projectRoot,'data/city/scenario.json'),join(dir,'city/scenario.json'));
 const store=new Store(dir);try{
 await store.createUser('runes_test','fixture-password',1991);store.initTutorialProfile(1991);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='Runes',process=25000 WHERE user_id=1991").run();
 const city=new CityWorld(store,1991,()=>now);city.state.player.grades=40;delete city.saved.battle;
 const seed=(pos:number,count=1)=>city.state.items[`1:0:${pos}`]={id:999000+pos,exist:1,template_id:3020001,bag_type:1,object_id:0,pos,count,bind:1,used:0,strengthen_grade:0};seed(70);city.persist();
 const send=(r:any)=>city.handle(frame(8605,1991,encodeMessage(city.scenario.outgoing[8605]!,{user_id:1991,...r})));
 const response=send({opType:1,runeId:101,learn_runePos:70});const callback=response.map(p=>Buffer.from(p.frame,'base64')).find(p=>p.readUInt16BE(6)===4495)!;
 assert.equal(decodeMessage(city.scenario.incoming[4495]!,callback.subarray(20)).opResult,1);assert.ok(!city.state.items['1:0:70']);
 send({opType:3,runeKey:'101,-1'});const reloaded=new CityWorld(store,1991,()=>now);assert.equal(reloaded.state.hero.rune.runeKey,'101,-1');
  const battle=createAdventure(city.scenario.battles[0]!,0,city.state);
  assert.equal(battle.runes![0]!.maxUses,1);assert.equal(battle.engine!.actors.find(a=>a.id===battle.hero)!.runes![0]!.skillId,9101);
  assert.ok(battle.prepare.heros.find((h:any)=>h.living_id===battle.hero).skillId.includes(9101));
 city.state.items['1:0:72']={id:999072,exist:1,template_id:3020010,bag_type:1,object_id:0,pos:72,count:9999,bind:1};city.persist();
 const move=(request:any)=>city.handle(frame(5005,1991,encodeMessage(city.scenario.outgoing[5005]!,request)));
 const moved=move({begin_bag_type:1,begin_obj_id:0,begin_pos:72,end_bag_type:0,end_obj_id:0,end_pos:2,count:1});
 assert.ok(!city.state.items['1:0:72']);assert.equal(city.state.items['0:0:2']!.count,9999);
 const delta=Buffer.from(moved[0]!.frame,'base64');assert.equal(delta.readUInt16BE(6),115);
 assert.equal(decodeMessage(city.scenario.incoming[115]!,delta.subarray(20)).moved.find((m:any)=>m.change_type===0).item.count,9999);
 assert.equal(new CityWorld(store,1991,()=>now).state.items['0:0:2']!.count,9999);
 move({begin_bag_type:0,begin_obj_id:0,begin_pos:2,end_bag_type:1,end_obj_id:0,end_pos:-1,count:1});
 assert.ok(!city.state.items['0:0:2']);assert.equal(Object.values(city.state.items).find(i=>i.template_id===3020010)!.count,9999);
 seed(71);city.persist();const before=JSON.stringify(city.saved.runes);send({opType:1,runeId:201,learn_runePos:71});assert.equal(JSON.stringify(city.saved.runes),before);assert.ok(city.state.items['1:0:71']);
 send({user_id:1992,opType:3,runeKey:'-1,-1'});assert.equal(city.state.hero.rune.runeKey,'101,-1');
 city.saved.battle={finished:false} as any;send({opType:3,runeKey:'-1,-1'});assert.equal(city.state.hero.rune.runeKey,'101,-1');delete city.saved.battle;
 // Fail a real SQLite save after an otherwise valid mutation: no item/XP may be lost.
 city.state.items['0:0:0']={...city.state.items['1:0:71'],bag_type:0,pos:0};delete city.state.items['1:0:71'];city.persist();
 store.db.exec("CREATE TRIGGER fail_runes BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(FAIL,'rune save failed'); END");
 assert.throws(()=>send({opType:2,runeId:101}),/rune save failed/);assert.equal(city.state.items['0:0:0']!.count,1);assert.equal(city.saved.runes!.learned[1]!.xp,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
