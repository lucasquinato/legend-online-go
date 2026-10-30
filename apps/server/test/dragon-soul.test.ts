import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {DragonSoulFeature,dragonSource,dragonRow,remainingDragonMaterials,type DragonSoulSave} from "../src/features/dragon-soul/index.js";
import {Inventory} from "../src/inventory.js";
import {AttributeCalculator,type AttributeState} from "../src/attributes.js";
import {emptyCity} from "../src/city-state.js";
import {encodeMessage,decodeMessage,typeName} from "../src/messages.js";
import {Store} from "../src/store.js";
import {CityWorld} from "../src/city-world.js";
import {projectRoot} from "../src/config.js";
import {frame} from "../src/protocol.js";

test("dragão: 1 XP, limite por nível sem desperdício, duas pilhas, coração e curva sagrada inteira",()=>{
 const state=emptyCity(),saved:{dragonSoul?:DragonSoulSave;attributes:AttributeState}={attributes:{version:1,sources:{}}};state.player.grades=39;
 const inv=new Inventory(state.items,{nextId:1},()=>200);const feature=new DragonSoulFeature({state,saved,inventory:()=>inv,persist:()=>feature.synchronize(),atomic:fn=>fn()});
 const use=(mode=1)=>feature.handle(8641,encodeMessage(typeName("fate.FateEditMsg"),{use_itemCount:mode}));
 assert.throws(()=>use(),/nível 40/);state.player.grades=40;
 inv.add({template_id:208032,bag_type:1,object_id:0,pos:0,exist:1},3);inv.add({template_id:208032,bag_type:1,object_id:0,pos:0,exist:1,bind:1},8190);
 use();assert.equal(feature.save.xp,1);assert.equal(inv.countTemplate(208032),8192);use(2);assert.equal(feature.save.grade,1);assert.equal(feature.save.xp,0);
 const initial=inv.countTemplate(208032);assert.throws(()=>use(2),/nível 50/);assert.equal(inv.countTemplate(208032),initial);
 for(const level of [50,60,70,80]){state.player.grades=level;use(2);}
 assert.deepEqual(feature.save,{version:1,type:102,grade:1,xp:0});assert.equal(saved.attributes.sources.dragonSoul!.percentages!.total_live,3);
 for(let i=2;i<=8;i++)use(2);assert.equal(inv.countTemplate(208032),0);assert.equal(feature.save.grade,8);assert.throws(()=>use(),/máximo/);
 assert.equal(dragonSource(feature.save).percentages!.total_phy_attack,4);
 feature.handle(9689,Buffer.alloc(0));assert.deepEqual(feature.save,{version:1,type:153,grade:0,xp:0});
 assert.deepEqual(remainingDragonMaterials(feature.save),{common:0,holy:67200});assert.throws(()=>use(),/insuficiente/);assert.equal(feature.save.grade,0);
 inv.add({template_id:208550,bag_type:1,object_id:0,pos:0,exist:1},67200);
 for(let g=1;g<=600;g++){const before=inv.countTemplate(208550);use();assert.equal(before-inv.countTemplate(208550),Number(dragonRow(153,g)!.Data));assert.equal(feature.save.grade,g);}
 assert.equal(inv.countTemplate(208550),0);assert.throws(()=>use(),/máximo/);assert.throws(()=>feature.handle(9689,Buffer.alloc(0)),/Coração/);
 const source=dragonSource(feature.save);assert.equal(source.values.total_phy_attack,51000);assert.equal(source.values.total_live,255000);assert.equal(source.percentages!.total_live,4);
 assert.equal(source.elementalReductions!.wind,10);assert.equal(source.elementalReductions!.light_dark,10);
 assert.equal(source.values.windResi,undefined);assert.equal(source.combatModifiers,undefined);assert.deepEqual(AttributeCalculator.combat({version:1,sources:{dragonSoul:source}}),[]);
 assert.equal(AttributeCalculator.calculate({version:1,sources:{base:{kind:"natural",evidence:"local-balance",values:{total_phy_attack:100}},dragonSoul:source}}).total_phy_attack,53144);
 assert.deepEqual(remainingDragonMaterials(feature.save),{common:0,holy:0});
});

test("dragão: passivas só aparecem nos marcos corretos, como metadados inertes",()=>{
 for(const [grade,key]of [[61,"wind"],[121,"water"],[181,"fire"],[241,"elect"],[301,"light"],[361,"dark"]] as const){
  assert.equal(dragonSource({version:1,type:153,grade:grade-1,xp:0}).elementalReductions![key]??0,0);
  assert.equal(dragonSource({version:1,type:153,grade,xp:0}).elementalReductions![key],10);
 }
 assert.deepEqual(remainingDragonMaterials({version:1,type:101,grade:0,xp:0}),{common:8193,holy:67200});
});

test("dragão: rotas reais, correio, atributos, reconexão, personagem preservado e rollback",async()=>{
 mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/dragon-soul-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));const store=new Store(dir),uid=1991;
 try{
  await store.createUser("dragon_test","test-only-password",uid);store.initTutorialProfile(uid);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Dragão',process=19500 WHERE user_id=?").run(uid);
  let city=new CityWorld(store,uid);city.state.player.grades=80;city.persist();
  const call=(op:number,m:any={})=>city.handle(frame(op,uid,[8642,8643].includes(op)?Buffer.alloc(0):encodeMessage(city.scenario.outgoing[op]!,m)));
  const protectedBefore=structuredClone({fashion:city.saved.fashion,refinement:city.saved.refinement,fashions:city.state.fashions,skills:city.saved.skills,icon:city.state.hero.tempate_id,profession:city.state.army.transfer_grade});
  const mail=store.sendLocalItems(uid,"Teste do Dragão",[{template:208032,count:8193},{template:208550,count:67200}]);city.persist();call(5022,{mailsIdArray:[mail],position:[0]});
  for(let i=0;i<12;i++)call(8641,{use_itemCount:2});assert.deepEqual(city.saved.dragonSoul,{version:1,type:102,grade:8,xp:0});
  call(9689);assert.equal(city.saved.dragonSoul!.type,153);call(8641,{use_itemCount:1});assert.equal(city.saved.dragonSoul!.grade,1);
  const snapshot=structuredClone(city.saved);store.db.exec("CREATE TRIGGER dragon_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'dragon fail'); END");assert.throws(()=>call(8641,{use_itemCount:1}),/dragon fail/);assert.deepEqual(city.saved,snapshot);store.db.exec("DROP TRIGGER dragon_fail");
  city.saved.dragonSoul={version:1,type:153,grade:599,xp:0};city.persist();call(8641,{use_itemCount:1});assert.equal(AttributeCalculator.snapshot(city.saved.attributes!).elementalReductions.dark,10);
  city=new CityWorld(store,uid);assert.equal(city.saved.dragonSoul!.grade,600);assert.equal(city.saved.dragonSoul!.type,153);
  const result=city.bootstrap().map(p=>Buffer.from(p.frame,"base64"));assert.equal(result.filter(p=>p.readUInt16BE(6)===4555).length,1);assert.ok(!result.some(p=>[4556,4557].includes(p.readUInt16BE(6))));
  const list=decodeMessage(typeName("fate.FateListMsg"),result.find(p=>p.readUInt16BE(6)===4555)!.subarray(20));assert.equal(list.fateInfo[0].grades,600);assert.equal(list.fateInfo[0].fate_types,153);
  const stale=city.packet({opcode:4555,message:{fateInfo:[{fate_types:101,grades:0,total_gp:0}]}});assert.equal(decodeMessage(typeName("fate.FateListMsg"),Buffer.from(stale.frame,"base64").subarray(20)).fateInfo[0].grades,600);
  assert.deepEqual({fashion:city.saved.fashion,refinement:city.saved.refinement,fashions:city.state.fashions,skills:city.saved.skills,icon:city.state.hero.tempate_id,profession:city.state.army.transfer_grade},protectedBefore);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
