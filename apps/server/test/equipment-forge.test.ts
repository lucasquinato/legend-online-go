import {test} from "node:test";import assert from "node:assert/strict";
import {Inventory,itemTemplate} from "../src/inventory.js";
import {equipmentRecipes} from "../src/features/equipment/content.js";
import {decomposeGems,convertGems} from "../src/features/equipment/gem-operations.js";
import {rollEquipment,equipmentSkills,equipmentSource} from "../src/features/equipment/content.js";
import {purifyEquipment,applyPurification,type PurificationSave} from "../src/features/equipment/purification.js";
import {castEquipment,castingCap,castingChance} from "../src/features/equipment/casting.js";
import type {Message} from "../src/messages.js";
import {mkdtempSync,mkdirSync,copyFileSync,rmSync,readFileSync} from "node:fs";import {join} from "node:path";
import {projectRoot} from "../src/config.js";import {Store} from "../src/store.js";import {CityWorld} from "../src/city-world.js";import {frame} from "../src/protocol.js";import {encodeMessage,decodeMessage} from "../src/messages.js";
import {localEquipmentTables} from "../src/features/equipment/client-tables.js";import {inflateSync} from "node:zlib";
const item=(id:number,count=1):Message=>({id:900001,template_id:id,count,bag_type:0,object_id:0,pos:0,exist:1,bind:1,user_id:1964});
test("six equipment tiers use character level without later professions",()=>{
 assert.equal(equipmentRecipes.size,144);
 for(const [id,level]of [[1991091,10],[1891091,30],[1991101,50],[1998101,60],[2018101,70],[2019101,80]]){assert.equal(Number(itemTemplate(id!)!.NeedGrades),level);assert.equal(itemTemplate(id!)!.NeedChangeJob,"0");}
});
test("double gems decompose into both exact components at 1000 gold per unit; other items cannot be consumed",()=>{
 const items:Record<string,Message>={"0:0:0":item(2281511,2)};let gold=0;decomposeGems(new Inventory(items,{nextId:1000000}),1964,n=>gold+=n);
 assert.equal(gold,2000);assert.equal(Object.values(items).find(i=>i.template_id===2050111)?.count,2);assert.equal(Object.values(items).find(i=>i.template_id===2050511)?.count,2);assert.ok(Object.values(items).every(i=>i.bind===1));
 const bad={"0:0:0":item(1991091)};assert.throws(()=>decomposeGems(new Inventory(bad,{nextId:1000000}),1964,()=>assert.fail()),/somente/);assert.equal(bad["0:0:0"].count,1);
});
test("conversion uses same-level table cost, preserves remaining input and binding, rejects combined gems",()=>{
 const items:Record<string,Message>={"0:0:0":item(2050101,3)};let cost=0;
 convertGems(new Inventory(items,{nextId:1000000}),{src_itemid:2050101,des_itemid:2050201,count:2},1964,n=>cost+=n);
 assert.equal(cost,20000);assert.equal(items["0:0:0"]!.count,1);assert.equal(Object.values(items).find(i=>i.template_id===2050201)!.count,2);
 for(const dst of [2050202,2281511])assert.throws(()=>convertGems(new Inventory(items,{nextId:1000000}),{src_itemid:2050101,des_itemid:dst,count:1},1964,()=>assert.fail()),/simples/);
});
test("purification across all tiers preserves locked affixes, never lowers stars, charges real stacks before buying, and applies once",()=>{
 for(const recipe of equipmentRecipes.values()){
  const gear=item(Number(recipe.NewMaterial));rollEquipment(gear,n=>n-1);const items:Record<string,Message>={"0:0:0":gear},inventory=new Inventory(items,{nextId:1000000}),save:PurificationSave={};
  const material=Number(itemTemplate(gear.template_id)!.Refresh);items["1:0:0"]={...item(material,3),id:900002,bag_type:1};items["1:0:1"]={...item(208027,2),id:900003,bag_type:1,pos:1};
  const before=Array.from({length:5},(_,n)=>gear[`random_skill_${n+1}`]),purchases:number[][]=[];
  const proposal=purifyEquipment(inventory,save,{lock:[true,false,false,false,false],bind_type:0},(id,count)=>{purchases.push([id,count]);return true;},()=>0);
  assert.equal(proposal.skills[0],before[0]);assert.deepEqual(Array.from({length:5},(_,n)=>inventory.items["0:0:0"]![`random_skill_${n+1}`]),before);
  for(let n=0;n<5;n++)assert.ok(Number(equipmentSkills.get(proposal.skills[n]!)!.Grades)>=Number(equipmentSkills.get(before[n]!)!.Grades));
  assert.equal(inventory.items["1:0:0"],undefined);assert.equal(inventory.items["1:0:1"]!.count,1);assert.ok(purchases.some(([id])=>id===material));
  const reloaded=JSON.parse(JSON.stringify(save));applyPurification(inventory,reloaded);assert.deepEqual(Array.from({length:5},(_,n)=>inventory.items["0:0:0"]![`random_skill_${n+1}`]),proposal.skills);assert.throws(()=>applyPurification(inventory,reloaded),/proposta/);
 }
});
test("casting uses basic/advanced materials, charges each attempt, limits each equipment tier and affects only its base attributes",()=>{
 const gear={...item(1991101),mould_grade:0},items:Record<string,Message>={"0:0:0":gear},inventory=new Inventory(items,{nextId:1000000});let gold=0;const bought:number[][]=[];
 const buy=(id:number,count:number)=>{bought.push([id,count]);return true;};
 assert.equal(castingCap(1991091),0);assert.equal(castingCap(1991101),80);assert.equal(castingCap(2018101),160);
 const before=equipmentSource(gear)!.values.total_phy_attack!;
 const result=castEquipment(inventory,50,{},n=>gold+=n,buy,()=>0);assert.equal(result.streng_result,1);assert.equal(gold,364500);assert.deepEqual(bought,[[2120100,5],[2120101,15]]);assert.ok(equipmentSource(items["0:0:0"]!)!.values.total_phy_attack!>before);
 items["0:0:0"]={...item(2018101),mould_grade:80};bought.length=0;castEquipment(inventory,70,{},()=>{},buy,()=>9999);assert.deepEqual(bought,[[2120102,5],[2120103,15]]);assert.equal(items["0:0:0"]!.mould_grade,80);assert.equal(items["0:0:0"]!.bless_value,5);
 items["0:0:0"]!.bless_value=100;castEquipment(inventory,70,{},()=>{},buy,()=>9999);assert.equal(items["0:0:0"]!.mould_grade,81);assert.equal(items["0:0:0"]!.bless_value,0);
 items["0:0:0"]!.mould_grade=160;assert.throws(()=>castEquipment(inventory,80,{},()=>assert.fail(),buy),/limite/);
});
test("basic and advanced casting add blessing as percentage points at the exact chance boundary",()=>{
 for(const offset of [0,80])for(let star=0;star<10;star++){
  const base=[50,40,30,20,10,5,5,5,5,5][star]!;
  assert.equal(castingChance(offset+star,0),base);assert.equal(castingChance(offset+star,5),base+5);assert.equal(castingChance(offset+star,95),100);
 }
 for(const [template,grade]of [[1991101,5],[2018101,85]])for(const [roll,success]of [[999,true],[1000,false]] as const){
  const items:Record<string,Message>={"0:0:0":{...item(template!),mould_grade:grade,bless_value:5}};
  const result=castEquipment(new Inventory(items,{nextId:1000000}),80,{},()=>{},()=>false,()=>roll);
  assert.equal(Boolean(result.streng_result),success);assert.equal(items["0:0:0"]!.mould_grade,grade!+(success?1:0));assert.equal(items["0:0:0"]!.bless_value,success?0:10);
 }
});
test("both casting stages reach guaranteed success from accumulated blessing before the bar is full, then reset",()=>{
 for(const [template,grade,failures]of [[1991101,0,10],[1991101,5,19],[2018101,80,10],[2018101,85,19]]){
  const items:Record<string,Message>={"0:0:0":{...item(template!),mould_grade:grade,bless_value:0}},inventory=new Inventory(items,{nextId:1000000});let charges=0,draws=0;
  for(let attempt=0;attempt<failures!;attempt++){
   const result=castEquipment(inventory,80,{},()=>charges++,()=>false,()=>{draws++;return 9999;});
   assert.equal(result.streng_result,0);assert.equal(items["0:0:0"]!.mould_grade,grade);assert.equal(items["0:0:0"]!.bless_value,(attempt+1)*5);
  }
  assert.ok(items["0:0:0"]!.bless_value<100);assert.equal(castingChance(grade!,items["0:0:0"]!.bless_value),100);
  const result=castEquipment(inventory,80,{},()=>charges++,()=>false,()=>{assert.fail("Guaranteed success must not draw again");});
  assert.equal(result.streng_result,1);assert.equal(items["0:0:0"]!.mould_grade,grade!+1);assert.equal(items["0:0:0"]!.bless_value,0);assert.equal(draws,failures);assert.equal(charges,failures!+1);
 }
});
test("client table overlay changes only local requirements and adds purchase offers with valid record lengths",()=>{
 const source=JSON.parse(readFileSync(join(projectRoot,"reference/item-templates.json"),"utf8")).source;
 const raw=readFileSync(join(projectRoot,`data/assets/objects/${source.sha256}.bin`)),changed=localEquipmentTables(raw),data=inflateSync(changed.subarray(4));let pos=4,gear=false,recipe=false,shop=false;
 while(pos<data.length){const n=data[pos++]!,name=data.subarray(pos,pos+n).toString();pos+=n;const length=data.readUInt32BE(pos);pos+=4;const body=data.subarray(pos,pos+length).toString();pos+=length;
  if(/itemtempinfos/i.test(name)){const row=body.match(/<ItemTempInfo TemplateId="2018101"[^>]*>/)![0];assert.match(row,/NeedGrades="70"/);assert.match(row,/NeedChangeJob="0"/);gear=true;}
  if(/^composetempinfos$/i.test(name)){assert.match(body,/<ComposeTempInfo Id="10205"[^>]*NeedMinLevel="70"/);recipe=true;}
  if(/^shoptempinfos$/i.test(name)){assert.match(body,/<ShopTempInfo[^>]*ItemId="208027"[^>]*GiftToken="10"/);shop=true;}
 }assert.equal(pos,data.length);assert.ok(gear&&recipe&&shop);
});
test("real forge protocol persists proposals, rolls back failed purchases, restores equipped origin and credits gem destinations",async()=>{
 const dir=mkdtempSync(join(projectRoot,".test-data/forge-protocol-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));const store=new Store(dir);
 try{
  await store.createUser("forge_protocol","local-test-password",1964);store.initTutorialProfile(1964);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Forja',process=25000 WHERE user_id=1964").run();
  let city=new CityWorld(store,1964,()=>1900000000000);city.state.player.grades=80;city.state.economy.gold_total_count=100000000;city.state.player.point=10000;city.state.player.gift_token=0;delete city.saved.battle;
  const send=(op:number,r:Message={})=>city.handle(frame(op,1964,city.scenario.outgoing[op]?encodeMessage(city.scenario.outgoing[op]!,r):undefined));
  const errors=(packets:{frame:string}[])=>packets.filter(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===83);
  const gear={...item(1993101),bag_type:4,object_id:city.state.hero.hero_id};rollEquipment(gear,()=>0);city.state.items[`4:${gear.object_id}:0`]=gear;city.persist();
  assert.equal(errors(send(5005,{begin_bag_type:4,begin_obj_id:gear.object_id,begin_pos:0,end_bag_type:0,end_obj_id:0,end_pos:0,count:1})).length,0);
  const current=city.state.items["0:0:0"]!,original=current.random_skill_1,points=city.state.player.point;
  assert.equal(errors(send(8336,{lock:[true,false,false,false,false],bind_type:0,$4:{wire:0,value:"1"}})).length,0);assert.equal(city.state.player.point,points-46);assert.equal(city.state.items["0:0:0"].random_skill_1,original);
  city=new CityWorld(store,1964,()=>1900000000000);const query=send(8464,{item_id:current.id}),response=query.find(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===4368)!;
  assert.equal(decodeMessage(city.scenario.incoming[4368]!,Buffer.from(response.frame,"base64").subarray(20)).result,1);
  assert.equal(errors(send(8339)).length,0);assert.equal(city.saved.purification![current.id],undefined);
  assert.equal(errors(send(8644,{pay_type:1})).length,0);assert.ok(city.state.player.point<points-46);
  city.state.player.point=0;city.state.player.gift_token=0;city.persist();const before=structuredClone(city.saved);send(8336,{lock:[false,false,false,false,false],bind_type:0,$4:{wire:0,value:"1"}});assert.deepEqual(city.saved,before);
  assert.equal(errors(send(5005,{begin_bag_type:0,begin_obj_id:0,begin_pos:0,end_bag_type:1,end_obj_id:0,end_pos:30,count:1})).length,0);assert.equal(city.state.items[`4:${gear.object_id}:0`].id,current.id);
  city.state.items["0:0:0"]={...item(2281511),id:900009};
  for(let pos=0;pos<42;pos++)city.state.items[`1:0:${pos}`]={...item(2030102,9999),id:910000+pos,bag_type:1,pos};
  city.persist();const full=structuredClone(city.saved);assert.ok(errors(send(8340)).length);assert.deepEqual(city.saved,full);
  city.state.player.$125={wire:0,value:"245"};city.persist();assert.equal(errors(send(8340)).length,0);assert.ok(Object.values(city.state.items).some(i=>i.bag_type===34&&i.template_id===2050111));
  const gem=Object.values(city.state.items).find(i=>i.bag_type===34&&i.template_id===2050111)!;
  assert.equal(errors(send(5005,{begin_bag_type:34,begin_obj_id:0,begin_pos:gem.pos,end_bag_type:0,end_obj_id:0,end_pos:0,count:1})).length,0);
  assert.equal(errors(send(5005,{begin_bag_type:0,begin_obj_id:0,begin_pos:0,end_bag_type:1,end_obj_id:0,end_pos:0,count:1})).length,0);assert.equal(city.state.items["1:0:0"].template_id,2030102);assert.ok(Object.values(city.state.items).some(i=>i.bag_type===34&&i.template_id===2050111));
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
