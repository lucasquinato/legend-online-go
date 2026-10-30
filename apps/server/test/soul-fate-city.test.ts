import {test} from "node:test";import assert from "node:assert/strict";import {mkdtempSync,mkdirSync,copyFileSync,rmSync,readFileSync} from "node:fs";import {join} from "node:path";import {inflateSync} from "node:zlib";
import {Store} from "../src/store.js";import {CityWorld} from "../src/city-world.js";import {projectRoot} from "../src/config.js";import {frame} from "../src/protocol.js";import {encodeMessage,decodeMessage,typeName} from "../src/messages.js";
import {localSoulFateTables} from "../src/features/fate/client-tables.js";import {AttributeCalculator} from "../src/attributes.js";
test("selo e destino: correio, rotas reais, reconexão, central de atributos e rollback",async()=>{
 mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/soul-fate-city-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));const store=new Store(dir),uid=1980;
 try{await store.createUser("soul_fate_test","test-only-password",uid);store.initTutorialProfile(uid);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Destino',process=19500 WHERE user_id=?").run(uid);
 let city=new CityWorld(store,uid);Object.assign(city.state.player,{grades:80,storeGrade:80,storeGp:0,point:100000});city.persist();city=new CityWorld(store,uid);
 const call=(op:number,data:any={})=>city.handle(frame(op,uid,op===8628?Buffer.alloc(0):encodeMessage(city.scenario.outgoing[op]!,data)));
 const before=structuredClone({fashions:city.state.fashions,fashion:city.saved.fashion,refinement:city.saved.refinement,tattoo:city.saved.tattoo,quests:city.state.quests,icon:city.state.hero.tempate_id});
 const invalid=call(8627,{index:0,turn_num:1,pay_type:1}).map(p=>Buffer.from(p.frame,"base64"));const failure=invalid.find(p=>p.readUInt16BE(6)===4545);assert.ok(failure,"falha deve desbloquear os controles nativos do giro");assert.equal(Boolean(decodeMessage(typeName("fate.FateEditMsg"),failure.subarray(20)).is_success),false);
 assert.equal(city.state.player.seniorStoreGrade,80);const mail=store.sendLocalItems(uid,"Materiais",[{template:208031,count:14400},{template:208024,count:26735},{template:211001,count:26735},{template:3300101,count:26735}]);city.persist();call(5022,{mailsIdArray:[mail],position:[0]});
 assert.equal(Object.values(city.state.items).filter(i=>i.template_id===208031).reduce((s,i)=>s+i.count,0),14400);
 call(8484,{templateId:208031,count:14400});assert.equal(city.state.player.seniorStoreGrade,100);assert.equal(city.state.player.storeGrade,80);
 for(const type of [2000,2200,2100])call(8626,{skill_sonType:type,use_itemCount:26735});
 const own=AttributeCalculator.sourceValues(city.saved.attributes!.sources.fate!);assert.equal(own.total_phy_attack,14000);assert.equal(own.total_strength,14000);assert.equal(own.total_stunAttr,30000);assert.equal(city.state.hero.total_stunAttr,30000);
 city=new CityWorld(store,uid);assert.equal(city.state.player.seniorStoreGrade,100);assert.equal(city.saved.fate!.lines[0]!.xp,26735);
 const boot=city.bootstrap().map(p=>Buffer.from(p.frame,"base64"));assert.equal(boot.filter(p=>p.readUInt16BE(6)===4544).length,1);const list=decodeMessage(typeName("fate.FateListMsg"),boot.find(p=>p.readUInt16BE(6)===4544)!.subarray(20));assert.equal(list.fateInfo.length,3);assert.ok(list.fateInfo.every((r:any)=>r.grades===30));
 assert.deepEqual({fashions:city.state.fashions,fashion:city.saved.fashion,refinement:city.saved.refinement,tattoo:city.saved.tattoo,quests:city.state.quests,icon:city.state.hero.tempate_id},before);
 const snapshot=structuredClone(city.saved);store.db.exec("CREATE TRIGGER fate_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fate fail'); END");assert.throws(()=>call(8627,{index:1,turn_num:10,pay_type:1}),/fate fail/);assert.deepEqual(city.saved,snapshot);store.db.exec("DROP TRIGGER fate_fail");
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test("tabelas: comum intacto, curva avançada 81–100 e descrições dos bônus corretas",()=>{
 const source=readFileSync(join(projectRoot,"reference/quests/tempinfos.original.bin")),next=localSoulFateTables(source);assert.equal(next.readUInt32BE(0),next.length-4);
 function tables(raw:Buffer){const b=inflateSync(raw.subarray(4)),map=new Map<string,string>();let p=4;while(p<b.length){const n=b[p++]!,name=b.subarray(p,p+n).toString();p+=n;const l=b.readUInt32BE(p);p+=4;map.set(name,b.subarray(p,p+l).toString());p+=l;}return map;}
 const old=tables(source),now=tables(next);const original=old.get("UpGradeTempInfos")!.match(/<UpGradeTempInfo\b[^>]*\bTypes="15"[^>]*\/>/g);assert.deepEqual(now.get("UpGradeTempInfos")!.match(/<UpGradeTempInfo\b[^>]*\bTypes="15"[^>]*\/>/g),original);assert.match(now.get("UpGradeTempInfos")!,/Types="104"[^>]*Grades="100" Data="720"/);assert.doesNotMatch(now.get("UpGradeTempInfos")!,/Types="104"[^>]*Grades="101"/);
 for(const[name,text]of old)if(!["UpGradeTempInfos","SkillTempInfos","SkillPropertyTempInfos","SkillBufferTempInfos"].includes(name))assert.equal(now.get(name),text,name);
 assert.match(now.get("SkillTempInfos")!,/ATQ \+14000/);assert.match(now.get("SkillTempInfos")!,/Determinação \+30000/);
});
