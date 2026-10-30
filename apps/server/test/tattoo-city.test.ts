import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {inflateSync} from "node:zlib";
import {Store} from "../src/store.js";
import {CityWorld} from "../src/city-world.js";
import {projectRoot} from "../src/config.js";
import {frame} from "../src/protocol.js";
import {encodeMessage,decodeMessage,typeName} from "../src/messages.js";
import {tattooSchemas} from "../src/features/tattoo/index.js";
import {localTattooTables} from "../src/features/tattoo/client-tables.js";

test("tattoo: correio, TCP real, save, reconexão e rollback preservam classe, modas e missões",async()=>{
  mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/tattoo-city-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
  const store=new Store(dir),uid=1978;
  try{
    await store.createUser("tattoo_test","test-only-password",uid);store.initTutorialProfile(uid);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Tattoo',process=19500 WHERE user_id=?").run(uid);
    let city=new CityWorld(store,uid);city.state.player.grades=80;city.state.player.point=100000;city.persist();city=new CityWorld(store,uid);
    const call=(op:number,data:any)=>city.handle(frame(op,uid,encodeMessage(city.scenario.outgoing[op]!,data)));
    call(9568,{opType:1}); // Let the existing account-wide quest reconciler run first.
    const before=structuredClone({fashion:city.saved.fashion,fashions:city.state.fashions,refinement:city.saved.refinement,quests:city.state.quests,icon:city.state.hero.tempate_id,vocation:city.state.player.vocationGrades});
    const mail=store.sendLocalItems(uid,"Tatuagens",[{template:208102,count:9999},{template:208056,count:9999}]);city.persist();call(5022,{mailsIdArray:[mail],position:[0]});
    assert.equal(Object.values(city.state.items).find(i=>i.template_id===208102)?.count,9999);
    const response=call(9568,{opType:2,param1:2,param2:1});assert.ok(response.some(r=>Buffer.from(r.frame,"base64").readUInt16BE(6)===274));
    assert.ok(city.saved.tattoo!.holes[0]!.proposal);assert.equal(city.saved.tattoo!.holes[0]!.applied,undefined);
    city=new CityWorld(store,uid);const proposal=structuredClone(city.saved.tattoo!.holes[0]!.proposal);call(9568,{opType:3,param2:1});assert.deepEqual(city.saved.tattoo!.holes[0]!.applied,proposal);
    call(9603,{holeId:1,wish:true});assert.equal(city.saved.tattoo!.engravings[0]!.level,1);assert.equal(city.state.player.point,99500);
    const initial=new CityWorld(store,uid).bootstrap().map(r=>Buffer.from(r.frame,"base64"));assert.equal(initial.filter(p=>p.readUInt16BE(6)===274).length,1);assert.equal(initial.filter(p=>p.readUInt16BE(6)===346).length,1);
    const holes=decodeMessage(tattooSchemas[274],initial.find(p=>p.readUInt16BE(6)===274)!.subarray(20));assert.equal(holes.holeInfo.length,8);assert.equal(holes.holeInfo[0].oldAddingValue,proposal!.plus);
    assert.deepEqual({fashion:city.saved.fashion,fashions:city.state.fashions,refinement:city.saved.refinement,quests:city.state.quests,icon:city.state.hero.tempate_id,vocation:city.state.player.vocationGrades},before);
    const snapshot=structuredClone(city.saved);store.db.exec("CREATE TRIGGER tattoo_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'tattoo fail'); END");
    assert.throws(()=>call(9568,{opType:2,param1:2,param2:1,refresh_lock_add:true,lock_pay_type:1}),/tattoo fail/);assert.deepEqual(city.saved,snapshot);store.db.exec("DROP TRIGGER tattoo_fail");
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("tattoo: cotação automática preserva todas as outras tabelas e ofertas",()=>{
  const original=readFileSync(join(projectRoot,"reference/quests/tempinfos.original.bin")),current=localTattooTables(original);assert.equal(current.readUInt32BE(0),current.length-4);
  function tables(bytes:Buffer){const data=inflateSync(bytes.subarray(4)),result=new Map<string,Buffer>();let p=4;while(p<data.length){const n=data[p++]!,name=data.subarray(p,p+n).toString();p+=n;const size=data.readUInt32BE(p);p+=4;result.set(name,data.subarray(p,p+size));p+=size;}return result;}
  const old=tables(original),now=tables(current);assert.equal(old.size,now.size);let changed=0;
  for(const [name,body]of old){if(!/^shoptempinfos$/i.test(name))assert.deepEqual(now.get(name),body);else{changed++;const text=now.get(name)!.toString();assert.match(text,/ItemId="208101"[^>]*GiftToken="1"/);assert.match(text,/ItemId="208102"[^>]*GiftToken="3"/);assert.equal(text.replace(/<ShopTempInfo Id="98710[12]"[^>]*\/>/g,""),body.toString());}}
  assert.equal(changed,1);
});
