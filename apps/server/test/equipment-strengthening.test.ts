import {test} from "node:test";
import assert from "node:assert/strict";
import {copyFileSync,mkdirSync,mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {projectRoot} from "../src/config.js";
import {Store} from "../src/store.js";
import {CityWorld} from "../src/city-world.js";
import {Inventory,itemTemplate} from "../src/inventory.js";
import {equipmentSource,synthesizeEquipment,equipmentRecipes} from "../src/features/equipment/content.js";
import {strengthenedTemplate,strengtheningCost,strengtheningChance} from "../src/features/equipment/strengthening.js";
import {strengthenEquipment,luckyStoneRecipes,synthesizeLuckyStone} from "../src/features/equipment/forge.js";
import {initialEquipmentSource} from "../src/features/attributes/initial-equipment.js";
import {encodeMessage,decodeMessage,type Message} from "../src/messages.js";
import {frame} from "../src/protocol.js";

const model=(template_id:number,pos=0,count=1,bag_type=0):Message=>({id:900000+pos,template_id,pos,count,bag_type,object_id:0,exist:1,bind:1,strengthen_grade:0,join_1:-1,join_2:-1,join_3:-1,join_4:-1});
const opcode=(p:{frame:string})=>Buffer.from(p.frame,"base64").readUInt16BE(6);
async function setup(){
 mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/strengthen-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
 const store=new Store(dir);await store.createUser("strengthen_test","local-test-password",1961);store.initTutorialProfile(1961);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Forge',process=25000 WHERE user_id=1961").run();
 let city=new CityWorld(store,1961,()=>1900000000000);city.state.player.grades=80;city.state.economy.gold_total_count=100000000;delete city.saved.battle;city.persist();
 return {store,get city(){return city;},reload:()=>city=new CityWorld(store,1961,()=>1900000000000),send:(op:number,r:Message)=>city.handle(frame(op,1961,encodeMessage(city.scenario.outgoing[op]!,r))),close:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};
}

test("ordinary strengthening matches recovered costs, caps and base-only bonuses for all recipe outputs",()=>{
 assert.equal(strengtheningCost({...model(1011003),strengthen_grade:0}),530);
 assert.equal(strengtheningCost({...model(1011003),strengthen_grade:1}),637);
 const fields:Record<string,string>={Attack:"phy_attack",MagicAttack:"magic_attack",Defence:"phy_defence",MagicDefence:"magic_defence",Live:"live",Power:"power",Agility:"agility",Intellect:"intellect",Physique:"physique",Captain:"captain",Parry:"parry",ForceHit:"force_hit"};
 for(const recipe of equipmentRecipes.values()){
  const item=model(Number(recipe.NewMaterial)),t=itemTemplate(item.template_id)!,max=Number(t.StrengthenMax);
  for(const grade of [0,1,Math.min(9,max),max]){
   item.strengthen_grade=grade;const source=equipmentSource(item)!,boosted=strengthenedTemplate(item);
   for(const [field,name] of Object.entries(fields)){const base=Number(t[field]??0),expected=base?base+Math.trunc(base*grade*0.1)+grade*5:0;assert.equal(Number(boosted[field]??0),expected);assert.equal(source.values[`total_${name}`]??0,expected);}
   assert.equal(strengtheningChance(item),Math.max(10,100-grade*10));assert.ok(strengtheningCost(item)>0);
  }
 }
 const starter={...model(1013003),strengthen_grade:2,random_skill_1:70102};
 assert.equal(initialEquipmentSource(starter)!.values.total_power,2); // Purification is not multiplied.
 assert.equal(initialEquipmentSource(starter)!.values.total_magic_attack,Number(itemTemplate(1013003)!.MagicAttack)+Math.trunc(Number(itemTemplate(1013003)!.MagicAttack)*.2)+10);
});

test("chance boundaries, optional helper, success and failure consume exact gold and one helper without losing grades",()=>{
 for(const [grade,stone,roll,success] of [[0,0,9999,true],[1,0,8999,true],[1,0,9000,false],[8,2040102,3999,true],[8,2040102,4000,false],[9,2040109,9999,true]] as const){
  const target={...model(1993091),strengthen_grade:grade},items:Record<string,Message>={"0:0:0":target};
  if(stone)items["0:0:1"]=model(stone,1,3);
  const inventory=new Inventory(items,{nextId:1000000});let paid=0;
  const result=strengthenEquipment(inventory,{},1810,cost=>{paid+=cost;},()=>roll);
  assert.equal(result.streng_result,success?1:0);assert.equal(result.strengthenGrade,grade+(success?1:0));assert.equal(paid,strengtheningCost(target));
  assert.equal(items["0:0:0"]!.id,target.id);assert.equal(items["0:0:0"]!.strengthen_grade,grade+(success?1:0));
  if(stone)assert.equal(items["0:0:1"]!.count,2);
 }
});

test("lucky stone synthesis uses the eight original recipes, consumes ordered stacks and respects unlock levels",()=>{
 assert.equal(luckyStoneRecipes.size,8);
 for(const recipe of luckyStoneRecipes.values()){
  const items:Record<string,Message>={"1:0:2":model(Number(recipe.Material1),2,1,1),"1:0:3":model(Number(recipe.Material1),3,3,1)};
  let paid=0;const inventory=new Inventory(items,{nextId:1000000});
  assert.throws(()=>synthesizeLuckyStone(inventory,{compose_id:Number(recipe.Id),compose_num:2},Number(recipe.NeedMinLevel)-1,1961,()=>{}));
  synthesizeLuckyStone(inventory,{compose_id:Number(recipe.Id),compose_num:2},80,1961,cost=>{paid+=cost;});
  assert.equal(paid,Number(recipe.NeedGold)*2);assert.equal(Object.values(items).filter(i=>i.template_id===Number(recipe.Material1)).length,0);
  assert.equal(Object.values(items).find(i=>i.template_id===Number(recipe.NewMaterial))!.count,2);
 }
});

test("every gear-to-gear recipe evolves equipped instances with identity, affixes and strengthening intact",()=>{
 let checked=0;
 for(const recipe of equipmentRecipes.values()){
  if(Number(itemTemplate(Number(recipe.Material1))?.MasterType)!==1)continue;
  const template=itemTemplate(Number(recipe.Material1))!,slot=({101:0,103:1,104:2,106:3,107:4,108:6} as Record<number,number>)[Number(template.SonType)]!;
  const source={...model(Number(recipe.Material1),slot,1,4),object_id:1810,strengthen_grade:5,random_skill_1:70102};const key=`4:1810:${slot}`,items:Record<string,Message>={[key]:source};
  for(let n=2;n<=4;n++)if(Number(recipe[`Material${n}`]))items[`1:0:${n}`]=model(Number(recipe[`Material${n}`]),n,Number(recipe[`Count${n}`]),1);
  const inventory=new Inventory(items,{nextId:1000000});synthesizeEquipment(inventory,{compose_id:Number(recipe.Id),compose_num:1},80,Number(itemTemplate(Number(recipe.NewMaterial))!.Job)||1,1961,1810,()=>{});
  assert.deepEqual(items[key],{...source,count:1,template_id:Number(recipe.NewMaterial)});checked++;
 }
 assert.ok(checked>48);
});

test("real forge movements, temporary persistence, successful callbacks, re-equipping and central stats",async()=>{
 const s=await setup();try{
  const hero=s.city.state.hero.hero_id,item=structuredClone(s.city.state.items[`4:${hero}:0`]),base=s.city.state.hero.total_magic_attack;
  s.send(5005,{begin_bag_type:4,begin_obj_id:hero,begin_pos:0,end_bag_type:0,end_obj_id:0,end_pos:0,count:1});assert.equal(s.city.state.items["0:0:0"].id,item.id);assert.ok(!s.city.saved.attributes!.sources[`equipment:initial:${item.id}`]);
  s.city.state.items["1:0:30"]=model(2040109,30,5,1);
  s.send(5005,{begin_bag_type:1,begin_obj_id:0,begin_pos:30,end_bag_type:0,end_obj_id:0,end_pos:1,count:1});assert.equal(s.city.state.items["0:0:1"].count,5);
  s.reload();assert.equal(s.city.state.items["0:0:0"].id,item.id);
  const cost=strengtheningCost(s.city.state.items["0:0:0"]),gold=s.city.state.economy.gold_total_count,result=s.send(5150,{src_itemid:0});
  const ack=result.find(p=>opcode(p)===86)!;assert.equal(decodeMessage(s.city.scenario.incoming[86]!,Buffer.from(ack.frame,"base64").subarray(20)).streng_result,1);
  assert.equal(s.city.state.economy.gold_total_count,gold-cost);assert.equal(s.city.state.items["0:0:1"].count,4);
  s.send(5005,{begin_bag_type:0,begin_obj_id:0,begin_pos:0,end_bag_type:4,end_obj_id:hero,end_pos:0,count:1});assert.equal(s.city.state.items[`4:${hero}:0`].strengthen_grade,1);assert.ok(s.city.state.hero.total_magic_attack>base);
  s.reload();assert.equal(s.city.state.items[`4:${hero}:0`].id,item.id);assert.ok(s.city.state.hero.total_magic_attack>base);
 }finally{s.close();}
});

test("maximum, insufficient gold, protected items and failed saves never consume resources or destroy gear",async()=>{
 const s=await setup();try{
  s.city.state.items["0:0:0"]=model(1993091);s.city.state.items["0:0:1"]=model(2040109,1,4);s.city.persist();
  const reject=()=>{const saved=structuredClone(s.city.saved),ledger=s.store.db.prepare("SELECT COUNT(*) n FROM gold_transactions WHERE reason='equipment-strengthening'").get()!.n;s.send(5150,{src_itemid:0});assert.deepEqual(s.city.saved,saved);assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM gold_transactions WHERE reason='equipment-strengthening'").get()!.n,ledger);};
  s.city.state.items["0:0:0"].strengthen_grade=21;reject();s.city.state.items["0:0:0"].strengthen_grade=0;
  s.city.state.economy.gold_total_count=0;reject();s.city.state.economy.gold_total_count=10000000;
  s.city.state.items["0:0:1"].is_locked=1;reject();s.city.state.items["0:0:1"].is_locked=0;
  const saved=structuredClone(s.city.saved),persist=s.city.persist;s.city.persist=()=>{throw new Error("forced strengthening save");};
  assert.throws(()=>s.send(5150,{src_itemid:0}),/forced strengthening save/);assert.deepEqual(s.city.saved,saved);s.city.persist=persist;
 }finally{s.close();}
});

test("stone synthesis through protocol commits gold/items once and rolls back a full-backpack result",async()=>{
 const s=await setup();try{
  for(const [key,item] of Object.entries(s.city.state.items))if(item.bag_type===1)delete s.city.state.items[key];
  for(let pos=0;pos<42;pos++)s.city.state.items[`1:0:${pos}`]=model(pos===30?2040101:2129006,pos,9999,1);
  s.city.persist();const before=structuredClone(s.city.saved),rows=s.store.db.prepare("SELECT COUNT(*) n FROM gold_transactions WHERE reason='lucky-stone-synthesis'").get()!.n;
  s.send(5153,{compose_id:25,compose_num:2});assert.deepEqual(s.city.saved,before);assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM gold_transactions WHERE reason='lucky-stone-synthesis'").get()!.n,rows);
  delete s.city.state.items["1:0:31"];const gold=s.city.state.economy.gold_total_count;
  const result=s.send(5153,{compose_id:25,compose_num:2});const ack=result.find(p=>opcode(p)===89)!;assert.equal(decodeMessage(s.city.scenario.incoming[89]!,Buffer.from(ack.frame,"base64").subarray(20)).compose_result,1);
  assert.equal(s.city.state.items["1:0:30"].count,9995);assert.equal(s.city.state.items["1:0:31"].template_id,2040102);assert.equal(s.city.state.items["1:0:31"].count,2);assert.equal(s.city.state.economy.gold_total_count,gold-400);
  s.reload();assert.equal(s.city.state.items["1:0:31"].count,2);
 }finally{s.close();}
});
