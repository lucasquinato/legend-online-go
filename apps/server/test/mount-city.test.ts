import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoInt } from "../src/protocol.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import { cards, mounts } from "../src/features/mounts/content.js";
import { calculateAttributes } from "../src/attributes.js";
import { currencyBalance } from "../src/features/currencies/index.js";

test("montarias integram conta, mochila, atributos, reconexão e rollback preservando modas/classe", () => {
 const base=join(projectRoot,".test-data");mkdirSync(base,{recursive:true});
 const dir=mkdtempSync(join(base,"mount-city-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
 const store=new Store(dir);store.initTutorialProfile(1901);
 store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='MountLocal',process=19500 WHERE user_id=1901").run();
 try {
  let city=new CityWorld(store,1901);city.state.player.grades=80;city.persist();
  const original=structuredClone({fashions:city.state.fashions,fashion:city.saved.fashion,refinement:city.saved.refinement,icon:city.state.hero.tempate_id});
  const card=[...cards.values()].find(p=>Number(p.NeedGrades)<=80 && Number(p.Property3 ?? 0)<=1 && p.Property2==="-1" && p.Refresh!=="-1")!;
  city.state.items["1:0:0"]={id:998877,template_id:Number(card.TemplateId),count:1,bag_type:1,object_id:0,pos:0,exist:1};city.persist();
  const beforeActivation=structuredClone({hero:city.state.hero,unresolved:city.saved.attributes!.sources.unresolved});
  const use=frame(5006,1901,encodeMessage(city.scenario.outgoing[5006]!,{bag_type:1,pos:0,count:1}));
  const response=city.handle(use);assert.ok(response.some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===4427));
  assert.equal(city.state.items["1:0:0"],undefined);assert.ok(city.saved.mounts!.owned[card.Property1]);
  const moved=response.find(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===115)!;
  const updates=decodeMessage(city.scenario.incoming[115]!,Buffer.from(moved.frame,"base64").subarray(20)).moved;
  assert.ok(updates.some((row:any)=>row.change_type===1&&row.change_pos===0&&!row.item),"activation sends the empty consumed slot, not a snapshot");
  const definition=mounts.get(Number(card.Property1))!;
  assert.equal(city.state.hero.total_power-beforeActivation.hero.total_power,Number(definition.Power));
  assert.equal(city.state.hero.total_intellect-beforeActivation.hero.total_intellect,Number(definition.Intellect));
  assert.equal(city.state.hero.total_physique-beforeActivation.hero.total_physique,Number(definition.Physique));
  assert.equal(city.state.hero.total_agility-beforeActivation.hero.total_agility,Number(definition.Agility));
  for(const key of ["total_phy_attack","total_magic_attack","total_phy_defence","total_magic_defence","total_live","fighting_capacity"])
    assert.ok(city.state.hero[key]>=beforeActivation.hero[key],key+" cannot decrease on permanent activation");
  assert.deepEqual(city.saved.attributes!.sources.unresolved,beforeActivation.unresolved,"mount activation must not create a negative residual");
  const activatedHero=structuredClone(city.state.hero);
  for(let pass=0;pass<3;pass++){city.persist();assert.deepEqual(city.state.hero,activatedHero);}
  city.state.items["1:0:0"]={id:998880,template_id:Number(card.TemplateId),count:1,bag_type:1,object_id:0,pos:0,exist:1};city.persist();
  const duplicateResponse=city.handle(use);
  const duplicateMove=duplicateResponse.find(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===115)!;
  assert.ok(decodeMessage(city.scenario.incoming[115]!,Buffer.from(duplicateMove.frame,"base64").subarray(20)).moved.some((row:any)=>row.change_pos===0&&!row.item));
  assert.deepEqual(city.state.hero,activatedHero);assert.deepEqual(city.saved.attributes!.sources.unresolved,beforeActivation.unresolved);
  assert.deepEqual(Object.keys(city.saved.attributes!.sources.mounts!.values).sort(),["total_agility","total_intellect","total_physique","total_power"]);
  for(const [key,value] of Object.entries(calculateAttributes(city.saved.attributes!)))assert.equal(city.state.hero[key],value);
  city.state.player.point=50;city.state.player.gift_token=10;city.persist();
  const purchase=frame(5154,1901,encodeMessage(city.scenario.outgoing[5154]!,{buyInfo:{good_id:413,count:3,receive_id:1901},pay_type:2}));
  const bought=city.handle(purchase);assert.ok(bought.some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===90));
  assert.equal(currencyBalance(city.state,"diamonds"),30);assert.equal(currencyBalance(city.state,"boundDiamonds"),0);
  assert.equal(Object.values(city.state.items).filter(item=>item.template_id===208035).reduce((sum,item)=>sum+Number(item.count),0),3);
  const train=frame(8529,1901,Buffer.concat([protoInt(1,2),protoInt(2,1),protoInt(3,1),protoInt(5,1)]));
  city.state.items["1:0:0"]={id:998878,template_id:208017,count:10,bag_type:1,object_id:0,pos:0,exist:1};city.persist();city.handle(train);
  const xp=city.saved.mounts!.xp.intellect;assert.ok(xp>=10);
  const reload=new CityWorld(store,1901);assert.equal(reload.saved.mounts!.xp.intellect,xp);assert.equal(reload.state.items["1:0:0"]!.count,9);
  assert.deepEqual({fashions:reload.state.fashions,fashion:reload.saved.fashion,refinement:reload.saved.refinement,icon:reload.state.hero.tempate_id},original);
  city=reload;const before=structuredClone({mounts:city.saved.mounts,items:city.state.items});
  store.db.exec("CREATE TRIGGER fail_mount_save BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail mount save'); END");
  assert.throws(()=>city.handle(train),/fail mount save/);assert.deepEqual({mounts:city.saved.mounts,items:city.state.items},before);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
