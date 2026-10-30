import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot, loadConfig } from "../src/config.js";
import { Store, ReplayAuth } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame } from "../src/protocol.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { AttributeCalculator } from "../src/attributes.js";
import { buildHttp } from "../src/http.js";
import { inflateSync } from "node:zlib";
import { currencyBalance } from "../src/features/currencies/index.js";

test("cosmos integra TCP, persistência, central, isolamento e rollback sem alterar modas ou classe",async()=>{
  const base=join(projectRoot,".test-data");mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,"cosmos-city-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
  const store=new Store(dir);
  const start=(uid:number,icon:number)=>{store.initTutorialProfile(uid);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,sex=0,nickname=?,process=19500 WHERE user_id=?").run(icon,"Cosmo"+uid,uid);const city=new CityWorld(store,uid);city.state.player.grades=40;city.state.economy.gold_total_count=1000000;city.persist();return city;};
  let app:ReturnType<typeof buildHttp>|undefined;
  try{
    let city=start(1951,3);const other=start(1952,2);
    const preserved=structuredClone({fashions:city.state.fashions,fashion:city.saved.fashion,refinement:city.saved.refinement,icon:city.state.hero.tempate_id});
    const call=(op:number,name:string,body:any)=>city.handle(frame(op,1951,encodeMessage(typeName("star."+name),body)));
    const raw=(op:number)=>call(op,"StarShopMsg",{good_id:205});
    city.saved.cosmos!.points=30000;city.persist();
    const bought=raw(8341);assert.ok(bought.some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===4178));
    const weapon=Object.values(city.saved.cosmos!.instances)[0]!;
    const before=city.state.hero.total_phy_attack;
    call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:weapon.pos,end_star_type:2,end_pos:0});
    assert.equal(city.state.hero.total_phy_attack,before+648);
    city.persist();assert.equal(city.state.hero.total_phy_attack,before+648);
    raw(8341); // Same family may be owned, but cannot be equipped twice.
    const rejected=call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:0,end_star_type:2,end_pos:1});
    assert.ok(rejected.some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===83));
    call(8341,"StarShopMsg",{good_id:1605});
    call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:1,end_star_type:2,end_pos:1});
    const central=AttributeCalculator.combat(city.saved.attributes!);assert.equal(central.length,1);assert.equal(central[0]!.magnitude,5);
    const reload=new CityWorld(store,1951);assert.equal(reload.state.hero.total_phy_attack,before+648);assert.equal(AttributeCalculator.combat(reload.saved.attributes!)[0]!.magnitude,5);
    // Enter through the real city adapter, not just a direct engine fixture.
    const battlePackets=reload.startBattle(0);
    assert.ok(battlePackets.some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===157));
    const combatHero=reload.saved.battle!.engine!.actors.find(a=>a.id===reload.saved.battle!.hero)!;
    assert.deepEqual(combatHero.permanentModifiers,AttributeCalculator.combat(reload.saved.attributes!));
    assert.equal(combatHero.stats.attack,reload.state.hero.total_phy_attack);
    const resumed=new CityWorld(store,1951);
    assert.deepEqual(resumed.saved.battle!.engine!.actors.find(a=>a.id===resumed.saved.battle!.hero)!.permanentModifiers,combatHero.permanentModifiers);
    assert.deepEqual({fashions:reload.state.fashions,fashion:reload.saved.fashion,refinement:reload.saved.refinement,icon:reload.state.hero.tempate_id},preserved);
    assert.equal(Object.keys(other.saved.cosmos!.instances).length,0);assert.equal(other.state.hero.tempate_id,2);
    const initial=reload.bootstrap().map(p=>({op:Buffer.from(p.frame,"base64").readUInt16BE(6),body:Buffer.from(p.frame,"base64").subarray(20)}));
    const own=initial.filter(p=>p.op===4178).flatMap(p=>decodeMessage(typeName("star.StarMoveRspMsg"),p.body).move??[]);
    assert.equal(own.length,3);assert.ok(own.every((r:any)=>r.star_Info.user_id===1951));
    const beforeFail=structuredClone(city.saved);
    store.db.exec("CREATE TRIGGER fail_cosmos BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail cosmos'); END");
    assert.throws(()=>call(8267,"StarMoveReqMsg",{begin_star_type:2,begin_pos:0,end_star_type:1,end_pos:2}),/fail cosmos/);assert.deepEqual(city.saved,beforeFail);
    store.db.exec("DROP TRIGGER fail_cosmos");
    call(8267,"StarMoveReqMsg",{begin_star_type:2,begin_pos:0,end_star_type:1,end_pos:2});assert.equal(city.state.hero.total_phy_attack,before);
    const auth={validate:(proof:string,uid:number)=>proof==="test-proof"&&uid===1951} as ReplayAuth,config={...loadConfig(),mode:"tutorial" as const,dataDir:dir};
    app=buildHttp(config,store,auth,{world:(uid:number)=>({city:()=>uid===1951?city:other}),server:{listening:true}} as any);
    const forbidden=await app.inject({method:"POST",url:"/starlist",payload:"userId=1951&key=bad"});assert.equal(forbidden.statusCode,403);
    const key="test-proof";
    const response=await app.inject({method:"POST",url:"/starlist",payload:new URLSearchParams({userId:"1951",key,starId:String(weapon.id)}).toString()});
    assert.equal(response.statusCode,200);const xml=inflateSync(response.rawPayload).toString();assert.match(xml,/tempId="205"/);assert.match(xml,/userId="1951"/);
    city.state.player.grades=60;city.state.quests[1802]={template_id:1802,is_accept:1,is_complete:0,condition_1:999};city.persist();
    call(8269,"StarRandReqMsg",{site:0});assert.equal(city.state.quests[1802]!.is_complete,1);
    city.handle(frame(5014,1951,encodeMessage(city.scenario.outgoing[5014]!,{template_id:1802,reward_item_id:0})));
    assert.equal(city.state.quests[1802]!.is_accept,0);
    city.saved.cosmos!.points=100000;city.persist();call(8341,"StarShopMsg",{good_id:1705});
    const compound=Object.values(city.saved.cosmos!.instances).find(row=>row.templateId===1705)!;
    call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:compound.pos,end_star_type:2,end_pos:8});assert.equal(city.saved.cosmos!.instances[compound.id]!.bag,2);
  }finally{await app?.close();store.close();rmSync(dir,{recursive:true,force:true});}
});

test("cosmos avançados: email, Pó em lote, moeda central, elevação, refinação e reconexão",async()=>{
  const base=join(projectRoot,".test-data");mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,"cosmos-advanced-city-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
  const store=new Store(dir),uid=1953;
  try{
    await store.createUser("cosmos_advanced","test-only-password",uid);store.initTutorialProfile(uid);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='CosmosAvancado',process=19500 WHERE user_id=?").run(uid);
    let city=new CityWorld(store,uid);city.state.player.grades=80;city.state.economy.gold_total_count=20000000;city.persist();
    const call=(op:number,name:string,data:any)=>city.handle(frame(op,uid,encodeMessage(typeName("star."+name),data)));
    const generic=(op:number,data:any)=>city.handle(frame(op,uid,encodeMessage(city.scenario.outgoing[op]!,data)));
    const mail=store.sendLocalItems(uid,"Pó para teste",[{template:208061,count:1000}]);city.persist();
    generic(5022,{mailsIdArray:[mail],position:[0]});
    const dust=Object.values(city.state.items).find(row=>row.template_id===208061)!;assert.ok(dust);assert.equal(dust.count,1000);
    const before=currencyBalance(city.state,"illusionDust");
    const response=generic(5006,{bag_type:1,pos:dust.pos,count:1000});assert.equal(currencyBalance(city.state,"illusionDust"),before+10000);
    assert.ok(response.some(row=>Buffer.from(row.frame,"base64").readUInt16BE(6)===4725));assert.ok(!Object.values(city.state.items).some(row=>row.template_id===208061));
    const star=city.cosmos.grant(407);star.level=10;city.persist();
    call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:star.pos,end_star_type:3,end_pos:0});
    call(5182,"StarGrowOpMsg",{op_type:0});call(5182,"StarGrowOpMsg",{op_type:1,item_count:5000});
    assert.equal(city.cosmos.at(3,0)?.templateId,408);assert.equal(city.cosmos.at(3,0)?.level,2);
    call(8267,"StarMoveReqMsg",{begin_star_type:3,begin_pos:0,end_star_type:1,end_pos:0});
    call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:0,end_star_type:2,end_pos:0});call(8772,"AdditionInfoMsg",{pos:0,type:1});
    assert.equal(city.saved.attributes!.sources.cosmos!.factors![0]!.percent,1);
    const preserved=structuredClone({cosmos:city.saved.cosmos,attributes:city.saved.attributes!.sources.cosmos,dust:currencyBalance(city.state,"illusionDust"),icon:city.state.hero.tempate_id,fashion:city.saved.fashion});
    city=new CityWorld(store,uid);assert.deepEqual(city.saved.cosmos,preserved.cosmos);assert.deepEqual(city.saved.attributes!.sources.cosmos,preserved.attributes);assert.equal(currencyBalance(city.state,"illusionDust"),preserved.dust);assert.equal(city.state.hero.tempate_id,preserved.icon);assert.deepEqual(city.saved.fashion,preserved.fashion);
    const packets=city.bootstrap().map(row=>{const bytes=Buffer.from(row.frame,"base64");return{op:bytes.readUInt16BE(6),body:bytes.subarray(20)};});
    const slots=packets.filter(row=>row.op===4677).flatMap(row=>decodeMessage(typeName("star.StarAdditionMsg"),row.body).additions??[]);assert.equal(slots[0].grade,1);
    assert.ok(store.db.prepare("SELECT 1 FROM currency_transactions WHERE user_id=? AND currency='illusionDust' AND reason='cosmos:sacred-growth'").get(uid));
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
