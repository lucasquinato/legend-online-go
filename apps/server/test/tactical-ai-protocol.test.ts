import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,copyFileSync,rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoString } from "../src/protocol.js";
import { decodeMessage,encodeMessage,typeName } from "../src/messages.js";
import { readyAdventure } from "../src/features/battle/adventure.js";

test("10020/77 PvE: identidade, persistência, execução automática e retorno manual",()=>{
  mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/tactical-ai-wire-"));
  mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));const store=new Store(dir);let now=1900000000000;
  try {
    store.initTutorialProfile(2982);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='AutoWire',process=25000 WHERE user_id=2982").run();
    let city=new CityWorld(store,2982,()=>now);city.startBattle(0);
    const b=city.saved.battle!;readyAdventure(b,now);city.persist();
    const op=(p:any)=>Buffer.from(p.frame,"base64").readUInt16BE(6);
    const send=(mode:number,extra={})=>city.handle(frame(10020,2982,encodeMessage(typeName("battle.AttackModeMsg"),{battle_id:b.id,mode,...extra})));
    assert.deepEqual(send(1,{battle_id:"old-battle"}),[]);assert.deepEqual(send(1,{userId:9999}),[]);assert.deepEqual(send(3),[]);
    const enabled=send(1).find(p=>op(p)===77)!;
    const response=decodeMessage(typeName("battle.AttackModeMsg"),Buffer.from(enabled.frame,"base64").subarray(20));
    assert.equal(response.userId,2982);assert.equal(response.mode,1);
    assert.equal(city.saved.battle!.engine!.actors.find(a=>a.id===b.hero)!.autoBattle,true);
    city=new CityWorld(store,2982,()=>now);const current=city.saved.battle!;
    assert.equal(current.engine!.actors.find(a=>a.id===b.hero)!.autoBattle,true);
    city.handle(frame(10007,2982,protoString(2,b.id)));
    assert.equal(city.tick().some(p=>op(p)===153),false,"automático não ignora a preparação por iniciativa");
    now+=2300;const events=city.tick();
    for(let i=0;i<30&&!events.some(p=>op(p)===75);i++){now+=500;events.push(...city.tick());}
    const actor=current.engine!.actors.find(a=>a.id===b.hero)!;
    assert.ok(actor.lastAiDecision);assert.ok(events.some(p=>op(p)===75));assert.ok(events.some(p=>op(p)===153));
    assert.equal(send(2).some(p=>op(p)===77),true);assert.equal(actor.autoBattle,false);
    assert.equal(current.prepare.attack_model,2);
    send(1);
    actor.cooldowns={};current.cooldowns={};actor.fury=current.sp=100;
    const skill=actor.learned.find(id=>id===30711)!;
    const manual=city.handle(frame(10008,2982,encodeMessage(typeName("battle.HeroOrderMsg"),{battle_id:b.id,hero_index_id:b.hero,skill_id:skill})));
    assert.ok(manual.some(p=>op(p)===75));assert.equal(actor.autoBattle,false);assert.equal(current.prepare.attack_model,2);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
