import {test} from "node:test";import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,copyFileSync,rmSync} from "node:fs";import {join} from "node:path";
import {projectRoot} from "../src/config.js";import {Store} from "../src/store.js";import {CityWorld} from "../src/city-world.js";
import {Inventory,itemTemplate} from "../src/inventory.js";import {frame} from "../src/protocol.js";import {encodeMessage,decodeMessage,type Message} from "../src/messages.js";
import {ensureEquipmentSockets,gemRecipes,synthesizeGem,insertGem,gemContribution,soulPercent,remainingSoulCrystals,upgradeSoul,SOUL_MAX,SOUL_CRYSTAL} from "../src/features/equipment/gems.js";
import {equipmentRecipes,synthesizeEquipment} from "../src/features/equipment/content.js";

const item=(template_id:number,pos=0,count=1,bag_type=1):Message=>({id:900000+pos,template_id,pos,count,bag_type,object_id:0,exist:1,bind:1,used:0,user_id:1962,strengthen_grade:0,join_1:-1,join_2:-1,join_3:-1,join_4:-1});
async function setup(){mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/gems-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));const store=new Store(dir);await store.createUser("gems_test","local-test-password",1962);store.initTutorialProfile(1962);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Gems',process=25000 WHERE user_id=1962").run();let city=new CityWorld(store,1962,()=>1900000000000);city.state.player.grades=80;city.state.economy.gold_total_count=100000000;city.state.player.point=10000;city.state.player.gift_token=10000;delete city.saved.battle;city.persist();return{store,get city(){return city;},reload:()=>city=new CityWorld(store,1962,()=>1900000000000),send:(op:number,r:Message)=>city.handle(frame(op,1962,encodeMessage(city.scenario.outgoing[op]!,r))),close:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};}
const opcode=(p:{frame:string})=>Buffer.from(p.frame,"base64").readUInt16BE(6);
const move=(s:Awaited<ReturnType<typeof setup>>,from:number,to:number,pos=0,end=0)=>s.send(5005,{begin_bag_type:from,begin_obj_id:from===4?s.city.state.hero.hero_id:0,begin_pos:pos,end_bag_type:to,end_obj_id:to===4?s.city.state.hero.hero_id:0,end_pos:end,count:1});

test("socket defaults and all equipment evolutions preserve perforations and embedded gems",()=>{
 for(const r of equipmentRecipes.values()){
  const target=item(Number(r.NewMaterial));ensureEquipmentSockets(target);assert.equal(target.join_1,0);assert.equal(target.join_2,Number(itemTemplate(target.template_id)!.SonType)===101?0:-1);
  if(Number(itemTemplate(Number(r.Material1))?.MasterType)!==1)continue;
  const source={...item(Number(r.Material1)),join_1:2050101,join_2:2281511,join_3:0,join_4:2050601};const items:Record<string,Message>={"1:0:0":source};
  for(let n=2;n<=4;n++)if(Number(r[`Material${n}`]))items[`1:0:${n}`]=item(Number(r[`Material${n}`]),n,Number(r[`Count${n}`]));
  synthesizeEquipment(new Inventory(items,{nextId:1000000}),{compose_id:Number(r.Id),compose_num:1},80,Number(itemTemplate(Number(r.NewMaterial))!.Job)||1,1962,1810,()=>{});
  assert.equal(items["1:0:0"]!.join_1,2050101);assert.equal(items["1:0:0"]!.join_2,2281511);assert.equal(items["1:0:0"]!.join_3,0);assert.equal(items["1:0:0"]!.join_4,2050601);
 }
});
test("every gem recipe creates exact results and ordered material consumption",()=>{
 assert.equal(gemRecipes.size,124);
 for(const r of gemRecipes.values()){
  const items:Record<string,Message>={};for(let n=1;n<=4;n++)if(Number(r[`Material${n}`]))items[`1:0:${n}`]=item(Number(r[`Material${n}`]),n,Number(r[`Count${n}`])*2);
  let paid=0;synthesizeGem(new Inventory(items,{nextId:1000000}),{compose_id:Number(r.Id),compose_num:2},80,1962,gold=>{paid+=gold;});
  assert.equal(paid,Number(r.NeedGold)*2);assert.equal(Object.values(items).find(i=>i.template_id===Number(r.NewMaterial))!.count,Number(r.Counts)*2);
 }
});
test("simple and combined families follow the pinned client: duplicate family denied, shared attributes accepted",()=>{
 const gear={...item(1993091,0,1,0),join_1:2050101,join_2:0,join_3:0,join_4:0};const items:Record<string,Message>={"0:0:0":gear,"1:0:1":item(2050102,1,2),"1:0:2":item(2281511,2,2),"1:0:3":item(2050501,3,2),"1:0:4":item(2281507,4,2)};
 const inventory=new Inventory(items,{nextId:1000000});assert.throws(()=>insertGem(inventory,{mount_pos:2,bag_type:1,bag_pos:1},1962,()=>{}),/mesma família/);
 insertGem(inventory,{mount_pos:2,bag_type:1,bag_pos:2},1962,()=>{});insertGem(inventory,{mount_pos:3,bag_type:1,bag_pos:3},1962,()=>{});
 assert.throws(()=>insertGem(inventory,{mount_pos:4,bag_type:1,bag_pos:4},1962,()=>{}),/mesma família/);assert.equal(items["0:0:0"]!.join_2,2281511);
});
test("soul costs and amplification reach precisely level 80, preserve excess crystals and never amplify the equipment base",()=>{
 const player={storeGrade:0,storeGp:0},required=remainingSoulCrystals(player);assert.equal(required,236661);assert.equal(SOUL_MAX,80);
 assert.equal(soulPercent(50),200);assert.equal(soulPercent(51),206);assert.equal(soulPercent(70),320);assert.equal(soulPercent(71),328);assert.equal(soulPercent(80),400);
 const items:Record<string,Message>={"1:0:0":item(SOUL_CRYSTAL,0,required+20)};const used=upgradeSoul(new Inventory(items,{nextId:1000000}),player,{templateId:SOUL_CRYSTAL,count:required+20});assert.equal(used,required);assert.deepEqual(player,{storeGrade:80,storeGp:0});assert.equal(items["1:0:0"]!.count,20);
 const gear={...item(1993091),join_1:2050101,join_2:2050601};assert.equal(gemContribution(gear,0)!.values.total_phy_attack,96);assert.equal(gemContribution(gear,80)!.values.total_phy_attack,480);assert.equal(gemContribution({...gear,join_1:0,join_2:0},80),undefined);
 assert.throws(()=>upgradeSoul(new Inventory(items,{nextId:1000000}),player,{templateId:SOUL_CRYSTAL,count:1}),/máximo/);
});
test("forge remembers equipped origins, returns on the ordinary close command and survives relogin",async()=>{
 const s=await setup();try{
  const hero=s.city.state.hero.hero_id,original=structuredClone(s.city.state.items[`4:${hero}:0`]);const result=move(s,4,0);assert.ok(!result.some(p=>opcode(p)===83));assert.equal(s.city.saved.forgeOrigins![original.id]!.pos,0);assert.equal(s.city.state.items[`4:${hero}:0`],undefined);
  const state=structuredClone(s.city.saved);const cleanup=move(s,0,1,1);assert.ok(!cleanup.some(p=>opcode(p)===83));assert.deepEqual(s.city.saved,state);
  s.reload();move(s,0,1);assert.equal(s.city.state.items[`4:${hero}:0`].id,original.id);assert.equal(s.city.state.items["0:0:0"],undefined);assert.equal(s.city.saved.forgeOrigins![original.id],undefined);
  move(s,4,1,0,30);move(s,1,0,30);move(s,0,1);assert.equal(s.city.state.items[`4:${hero}:0`],undefined);assert.ok(Object.values(s.city.state.items).some(i=>i.id===original.id&&i.bag_type===1));
 }finally{s.close();}
});
test("forge selection and close move whole lucky/gem stacks; choosing another stack returns the previous one without loss",async()=>{
 const s=await setup();try{
  s.city.state.items["1:0:30"]=item(2040109,30,9999);const selected=s.city.state.items["1:0:30"]!.id;
  assert.ok(!move(s,1,0,30,1).some(p=>opcode(p)===83));assert.equal(s.city.state.items["0:0:1"].count,9999);assert.equal(s.city.state.items["0:0:1"].id,selected);assert.equal(s.city.state.items["1:0:30"],undefined);
  s.city.state.items["1:0:31"]=item(2040108,31,123);assert.ok(!move(s,1,0,31,1).some(p=>opcode(p)===83));assert.equal(s.city.state.items["0:0:1"].count,123);assert.equal(s.city.state.items["0:0:1"].template_id,2040108);assert.equal(Object.values(s.city.state.items).find(i=>i.id===selected)!.count,9999);
  assert.ok(!move(s,0,1,1,31).some(p=>opcode(p)===83));assert.equal(s.city.state.items["0:0:1"],undefined);assert.equal(Object.values(s.city.state.items).filter(i=>i.template_id===2040108).reduce((sum,i)=>sum+i.count,0),123);
  s.city.state.items["1:0:32"]=item(2050101,32,27);assert.ok(!move(s,1,0,32).some(p=>opcode(p)===83));assert.equal(s.city.state.items["0:0:0"].count,27);
  s.city.state.items["1:0:33"]=item(2050201,33,17);assert.ok(!move(s,1,0,33).some(p=>opcode(p)===83));assert.equal(s.city.state.items["0:0:0"].count,17);assert.equal(s.city.state.items["0:0:0"].template_id,2050201);assert.equal(Object.values(s.city.state.items).filter(i=>i.template_id===2050101).reduce((sum,i)=>sum+i.count,0),27);
  assert.ok(!move(s,0,1,0,33).some(p=>opcode(p)===83));assert.equal(s.city.state.items["0:0:0"],undefined);s.reload();assert.equal(Object.values(s.city.state.items).filter(i=>i.template_id===2050201).reduce((sum,i)=>sum+i.count,0),17);
 }finally{s.close();}
});
test("selecting equipment automatically restores the previous equipped origin and a full backpack can exchange both instances",async()=>{
 const s=await setup();try{
  const hero=s.city.state.hero.hero_id,original=structuredClone(s.city.state.items[`4:${hero}:0`]);move(s,4,0);
  const next={...item(1993101,30),join_1:2050111,strengthen_grade:3};s.city.state.items["1:0:30"]=next;
  assert.ok(!move(s,1,0,30).some(p=>opcode(p)===83));assert.equal(s.city.state.items[`4:${hero}:0`].id,original.id);assert.equal(s.city.saved.forgeOrigins![original.id],undefined);assert.equal(s.city.state.items["0:0:0"].id,next.id);assert.equal(s.city.state.items["0:0:0"].join_1,2050111);
  const selected=structuredClone(s.city.state.items["0:0:0"]);
  for(let pos=0;pos<42;pos++)s.city.state.items[`1:0:${pos}`]={...item(2030102,pos,9999),id:950000+pos};
  const replacement={...item(1993104,30),id:960000,join_1:2050611};s.city.state.items["1:0:30"]=replacement;s.city.persist();
  assert.ok(!move(s,1,0,30).some(p=>opcode(p)===83));assert.equal(s.city.state.items["0:0:0"].id,replacement.id);assert.equal(s.city.state.items["0:0:0"].join_1,2050611);
  assert.equal(s.city.state.items["1:0:30"].id,selected.id);assert.equal(s.city.state.items["1:0:30"].strengthen_grade,3);assert.equal(s.city.state.items["1:0:30"].join_1,2050111);assert.equal(Object.values(s.city.state.items).filter(i=>i.bag_type===1).length,42);
  s.reload();assert.equal(s.city.state.items["0:0:0"].id,replacement.id);assert.equal(s.city.state.items["1:0:30"].id,selected.id);
 }finally{s.close();}
});
test("automatic forge replacement rolls back unavailable returns and failed persistence without losing origins or attributes",async()=>{
 const s=await setup();try{
  const hero=s.city.state.hero.hero_id;s.city.state.items["1:0:30"]=item(1993101,30);move(s,1,0,30);
  for(let pos=0;pos<42;pos++)s.city.state.items[`1:0:${pos}`]={...item(2030102,pos,9999),id:970000+pos};
  s.city.state.items[`4:${hero}:1`]={...item(1993103,1,1,4),id:980000,object_id:hero};s.city.persist();
  const full=structuredClone(s.city.saved);assert.ok(move(s,4,0,1).some(p=>opcode(p)===83));assert.deepEqual(s.city.saved,full);
  s.city.state.items["1:0:30"]={...item(1993104,30),id:990000};s.city.persist();const before=structuredClone(s.city.saved),persist=s.city.persist;
  s.city.persist=()=>{throw new Error("forced replacement save");};assert.throws(()=>move(s,1,0,30),/forced replacement save/);assert.deepEqual(s.city.saved,before);s.city.persist=persist;
 }finally{s.close();}
});
test("perforation, insertion, removal, central gem/soul bonuses, diamond purchase and rollback use real protocol",async()=>{
 const s=await setup();try{
  const hero=s.city.state.hero.hero_id;move(s,4,0);assert.equal(s.city.state.items["0:0:0"].join_2,0);
  s.city.state.items["1:0:30"]=item(2050101,30,3);s.send(5151,{mount_pos:1,bag_type:1,bag_pos:30});assert.equal(s.city.state.items["0:0:0"].join_1,2050101);
  const diamonds=s.city.state.player.point;s.send(5152,{hole_pos:3,operate:1,pay_type:1});assert.equal(s.city.state.player.point,diamonds-45);assert.equal(s.city.state.items["0:0:0"].join_3,0);
  move(s,0,1);assert.equal(s.city.state.items[`4:${hero}:0`].join_1,2050101);assert.equal(s.city.saved.attributes!.sources[`equipment:gems:${s.city.state.items[`4:${hero}:0`].id}`]!.values.total_phy_attack,96);
  s.city.state.items["1:0:31"]=item(SOUL_CRYSTAL,31,10);s.send(8484,{count:10,templateId:SOUL_CRYSTAL});assert.equal(s.city.state.player.storeGrade,1);assert.equal(s.city.saved.attributes!.sources[`equipment:gems:${s.city.state.items[`4:${hero}:0`].id}`]!.values.total_phy_attack,99);
  s.reload();move(s,4,0);const gold=s.city.state.economy.gold_total_count;s.send(5152,{hole_pos:1,operate:0});assert.equal(s.city.state.items["0:0:0"].join_1,0);assert.equal(s.city.state.economy.gold_total_count,gold-200);move(s,0,1);assert.equal(s.city.saved.attributes!.sources[`equipment:gems:${s.city.state.items[`4:${hero}:0`].id}`],undefined);
  const points=s.city.state.player.point;s.send(5154,{buyInfo:{good_id:838,count:2},pay_type:1});assert.equal(s.city.state.player.point,points-90);assert.ok(Object.values(s.city.state.items).some(i=>i.template_id===208004&&i.count===2));
  move(s,4,0);const before=structuredClone(s.city.saved),persist=s.city.persist;s.city.persist=()=>{throw new Error("forced gem save");};assert.throws(()=>s.send(5151,{mount_pos:1,bag_type:1,bag_pos:30}),/forced gem save/);assert.deepEqual(s.city.saved,before);s.city.persist=persist;
 }finally{s.close();}
});

test("drill cart uses counts, permits normal diamonds or bound-first payment and rolls back insufficient balances",async()=>{
 const s=await setup();try{
  const before=s.city.state.player.point;s.send(8970,{carItemInfo:[{shopId:838,counts:2,payType:1}]});assert.equal(s.city.state.player.point,before-90);
  s.city.state.player.gift_token=10;const points=s.city.state.player.point;s.send(8970,{carItemInfo:[{shopId:838,counts:1,payType:2}]});assert.equal(s.city.state.player.gift_token,0);assert.equal(s.city.state.player.point,points-35);
  s.city.state.player.point=0;const state=structuredClone(s.city.saved);s.send(8970,{carItemInfo:[{shopId:838,counts:1,payType:1}]});assert.deepEqual(s.city.saved,state);
 }finally{s.close();}
});
test("removal never loses a gem with full bags; enabled treasure storage receives it directly",async()=>{
 const s=await setup();try{
  move(s,4,0);s.city.state.items["0:0:0"].join_1=2050101;
  for(let pos=0;pos<42;pos++)s.city.state.items[`1:0:${pos}`]=item(2129006,pos,9999);
  s.city.persist();const before=structuredClone(s.city.saved);s.send(5152,{hole_pos:1,operate:0});assert.deepEqual(s.city.saved,before);
  s.city.state.player.$125={wire:0,value:"245"};s.send(5152,{hole_pos:1,operate:0});assert.equal(s.city.state.items["0:0:0"].join_1,0);assert.ok(Object.values(s.city.state.items).some(i=>i.bag_type===34&&i.template_id===2050101));
 }finally{s.close();}
});
