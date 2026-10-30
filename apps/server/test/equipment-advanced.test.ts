import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {projectRoot} from "../src/config.js";
import {Store} from "../src/store.js";
import {CityWorld} from "../src/city-world.js";
import {Inventory,itemTemplate} from "../src/inventory.js";
import {frame} from "../src/protocol.js";
import {decodeMessage,encodeMessage,type Message} from "../src/messages.js";
import {halidomIds,halidomRecipes,refinementLevels} from "../src/features/equipment/advanced-content.js";
import {equipmentSource,rollEquipment,synthesizeEquipment} from "../src/features/equipment/content.js";
import {remainingRefinementXP,upgradeRefinement,refinementBonus} from "../src/features/equipment/refinement.js";
import {synchronizeInitialEquipment} from "../src/features/attributes/initial-equipment.js";
import {gemContribution} from "../src/features/equipment/gems.js";
import {castEquipment,castingCap} from "../src/features/equipment/casting.js";
import {purifyEquipment,applyPurification} from "../src/features/equipment/purification.js";
const item=(id:number,pos=0,count=1):Message=>({id:900000+pos,template_id:id,count,bag_type:1,object_id:0,pos,exist:1,bind:1,user_id:1968,strengthen_grade:0,mould_grade:0,join_1:0,join_2:-1,join_3:-1,join_4:-1});
async function setup(){
 mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/advanced-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
 const store=new Store(dir);await store.createUser("advanced_test","test-only-password",1968);store.initTutorialProfile(1968);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='Advanced',sex=0,process=25000 WHERE user_id=1968").run();
 let city=new CityWorld(store,1968,()=>1900000000000);delete city.saved.battle;city.state.player.grades=80;city.persist();
 return {store,get city(){return city;},send:(op:number,r:Message)=>city.handle(frame(op,1968,encodeMessage(city.scenario.outgoing[op]!,r))),reload:()=>city=new CityWorld(store,1968,()=>1900000000000),close:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};
}
test("all sixteen halidom recipes require 80, preserve instance investments and produce supported affixes",()=>{
 assert.equal(halidomIds.size,16);assert.equal(halidomRecipes.size,16);
 for(const r of halidomRecipes.values()){
  const id=Number(r.NewMaterial),t=itemTemplate(id)!;assert.equal(t.NeedGrades,"80");assert.equal(t.NeedChangeJob,"0");
  const items:Record<string,Message>={},inv=new Inventory(items,{nextId:1000000},100);let pos=0,base:Message|undefined;
  for(let n=1;n<=4;n++){const tid=Number(r[`Material${n}`]),count=Number(r[`Count${n}`]);if(!tid||!count)continue;
   const value=item(tid,pos,count);if(halidomIds.has(tid)){rollEquipment(value,()=>0);value.strengthen_grade=5;value.join_1=2050101;base=structuredClone(value);}items[`1:0:${pos++}`]=value;
  }
  const before=structuredClone(items);assert.throws(()=>synthesizeEquipment(inv,{compose_id:Number(r.Id),compose_num:1},79,3,1968,1810,()=>assert.fail()),/Nível/);assert.deepEqual(items,before);
  let gold=0;synthesizeEquipment(inv,{compose_id:Number(r.Id),compose_num:1},80,3,1968,1810,n=>gold+=n);assert.equal(gold,Number(r.NeedGold));
  const result=Object.values(items).find(i=>i.template_id===id)!;assert.ok(equipmentSource(result));
  if(base){assert.equal(result.id,base.id);assert.equal(result.strengthen_grade,5);assert.equal(result.join_1,2050101);for(let n=1;n<=5;n++)assert.equal(result[`random_skill_${n}`],base[`random_skill_${n}`]);}
  else assert.equal([1,2,3,4,5].filter(n=>result[`random_skill_${n}`]>0).length,Number(t.RandomSkillCount));
 }
});
test("refinement advances deterministically in batches, caps at 100 and leaves excess stones",()=>{
 assert.equal(refinementLevels.size,101);assert.equal(remainingRefinementXP({}),343825);
 const items={"1:0:0":item(208055,0,9999)},inv=new Inventory(items,{nextId:1000000}),hero:Message={};
 assert.throws(()=>upgradeRefinement(inv,hero,79,{templateId:208055,count:5}),/80/);assert.equal(items["1:0:0"].count,9999);
 assert.throws(()=>upgradeRefinement(inv,hero,80,{templateId:208055,count:-1}),/inválid/);
 upgradeRefinement(inv,hero,80,{templateId:208055,count:15});assert.equal(hero.equipment_refining_grade,2);assert.equal(hero.equipment_refining_gp,0);
 let pos=1;for(let left=remainingRefinementXP(hero)+10000;left>0;left-=9999){items[`1:0:${pos}` as keyof typeof items]=item(208055,pos,Math.min(9999,left));pos++;}
 const available=inv.countTemplate(208055),remaining=remainingRefinementXP(hero);upgradeRefinement(inv,hero,80,{templateId:208055,count:1000000});assert.equal(hero.equipment_refining_grade,100);assert.equal(hero.equipment_refining_gp,0);assert.equal(inv.countTemplate(208055),available-remaining);
 assert.throws(()=>upgradeRefinement(inv,hero,80,{templateId:208055,count:1}),/máximo/);
});
test("refinement follows tooltip component rounding and applies only equipped gear, including gems after soul",()=>{
 const gear={...item(1170003),bag_type:4,object_id:1810,pos:12,strengthen_grade:1,join_1:2050101};
 const base=equipmentSource(gear)!,refined=equipmentSource(gear,1)!;
 assert.equal(base.values.total_phy_defence,445);assert.equal(refined.values.total_phy_defence,448); // base 400 is unchanged; ceil(45 * .05)=3
 const gems=gemContribution(gear,80)!,refinedGems=gemContribution(gear,80,1)!;
 const gem=Number(itemTemplate(2050101)!.Attack);assert.equal(gems.values.total_phy_attack,gem*5);assert.equal(refinedGems.values.total_phy_attack,gem*5+refinementBonus(gem*5,1));
 const sources:Record<string,any>={other:{kind:"permanent",evidence:"recovered-table",values:{total_phy_attack:100}}};
 const items:Record<string,Message>={"4:1810:12":gear};synchronizeInitialEquipment(sources,items,1810,80,1);assert.equal(sources[`equipment:refinement:${gear.id}`].values.total_phy_defence,3);
 const snapshot=structuredClone(sources);synchronizeInitialEquipment(sources,items,1810,80,1);assert.deepEqual(sources,snapshot);
 gear.bag_type=1;synchronizeInitialEquipment(sources,items,1810,80,1);assert.deepEqual(Object.keys(sources),["other"]);
});
test("special equipment purification and mould use original pools and special material counts",()=>{
 for(const id of [1170005,1170007,1180005,1180010]){
  const gear={...item(id),bag_type:0};rollEquipment(gear,()=>0);const items:Record<string,Message>={"0:0:0":gear},inv=new Inventory(items,{nextId:1000000}),proposals={},purchases:number[][]=[];
  const proposal=purifyEquipment(inv,proposals,{},(id,n)=>{purchases.push([id,n]);return true;},n=>n-1);applyPurification(inv,proposals);assert.equal(items["0:0:0"].random_skill_1,proposal.skills[0]);
  assert.ok(purchases.some(([tid])=>tid===Number(itemTemplate(id)!.Refresh)));
  purchases.length=0;castEquipment(inv,80,{},()=>{},(id,n)=>{purchases.push([id,n]);return true;},()=>0);assert.deepEqual(purchases,[[2120100,10],[2120101,30]]);
  if(id%10000>=7){items["0:0:0"].mould_grade=80;purchases.length=0;castEquipment(inv,80,{},()=>{},(id,n)=>{purchases.push([id,n]);return true;},()=>0);assert.deepEqual(purchases,[[2120102,15],[2120103,45]]);}
  assert.equal(castingCap(id),id%10000>=7?160:80);
 }
});
test("real opcode 9592 persists level/XP, sends current PlayerMsg fields and rolls back failed saves",async()=>{
 const s=await setup();try{
  s.city.state.items["1:0:20"]=item(208055,20,30);s.city.persist();const beforeGold=s.city.state.economy.gold_total_count;
  const result=s.send(9592,{templateId:208055,count:5});assert.equal(s.city.state.player.equipment_refining_grade,1);assert.equal(s.city.state.items["1:0:20"].count,25);assert.equal(s.city.state.economy.gold_total_count,beforeGold);
  const packet=result.find(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===3)!;const msg=decodeMessage(s.city.scenario.incoming[3]!,Buffer.from(packet.frame,"base64").subarray(20));assert.deepEqual(msg.$135,{wire:0,value:"1"});assert.deepEqual(msg.$136,{wire:0,value:"0"});
  s.reload();assert.equal(s.city.state.player.equipment_refining_grade,1);
  const saved=structuredClone(s.city.saved),persist=s.city.persist;s.city.persist=()=>{throw new Error("forced refinement persistence failure");};assert.throws(()=>s.send(9592,{templateId:208055,count:10}),/forced refinement/);assert.deepEqual(s.city.saved,saved);s.city.persist=persist;
 }finally{s.close();}
});
test("both real equipment slots update central sources, survive reload and reject entry before 80",async()=>{
 const s=await setup();try{
  const heroId=Number(s.city.state.hero.hero_id);
  for(const [id,pos,slot]of [[1170010,20,12],[1180010,21,13]]){
   const gear=item(id!,pos!);rollEquipment(gear,()=>0);s.city.state.items[`1:0:${pos}`]=gear;s.city.persist();
   const move={begin_bag_type:1,begin_obj_id:0,begin_pos:pos,end_bag_type:4,end_obj_id:heroId,end_pos:slot,count:1};
   s.city.state.player.grades=79;s.city.persist();s.send(5005,move);assert.ok(s.city.state.items[`1:0:${pos}`]);
   s.city.state.player.grades=80;s.city.persist();s.send(5005,move);assert.equal(s.city.state.items[`4:${heroId}:${slot}`].id,gear.id);assert.ok(s.city.saved.attributes!.sources[`equipment:initial:${gear.id}`]);
  }
  s.city.state.player.equipment_refining_grade=10;s.city.state.player.equipment_refining_gp=0;s.city.persist();
  const ids=["equipment:refinement:900020","equipment:refinement:900021"];for(const id of ids)assert.ok(s.city.saved.attributes!.sources[id]);
  const attributes=structuredClone(s.city.saved.attributes);s.reload();assert.deepEqual(s.city.saved.attributes,attributes);
  s.send(5005,{begin_bag_type:4,begin_obj_id:heroId,begin_pos:12,end_bag_type:1,end_obj_id:0,end_pos:20,count:1});assert.ok(!s.city.saved.attributes!.sources[ids[0]!]);assert.ok(!s.city.saved.attributes!.sources[`equipment:initial:900020`]);
 }finally{s.close();}
});
