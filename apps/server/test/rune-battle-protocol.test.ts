import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,copyFileSync,rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { createRunes } from "../src/features/runes/index.js";
import { frame } from "../src/protocol.js";
import { decodeMessage,encodeMessage,typeName } from "../src/messages.js";
import { readyAdventure } from "../src/features/battle/adventure.js";

test("10499/158: seleção nativa, execução, usos, recarga comum, fraude e relog",()=>{
  mkdirSync(join(projectRoot,".test-data"),{recursive:true});const dir=mkdtempSync(join(projectRoot,".test-data/rune-combat-wire-"));
  mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));const store=new Store(dir);let now=1900000000000;
  try{
    store.initTutorialProfile(2981);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='RuneWire',process=25000 WHERE user_id=2981").run();
    let city=new CityWorld(store,2981,()=>now);city.state.player.grades=40;city.saved.runes=createRunes(now);
    city.saved.runes.learned={1:{id:101,xp:0,swallowed:0},9:{id:901,xp:0,swallowed:0}};city.saved.runes.keys=[1,9];city.persist();
    city.startBattle(0);const battle=city.saved.battle!;readyAdventure(battle,now);city.persist();
    const send=(body:any)=>city.handle(frame(10499,2981,encodeMessage(typeName("battle.BattleItemMsg"),body)));
    const response=(packets:any[])=>decodeMessage(typeName("battle.ItemUseResultMsg"),Buffer.from(packets.find(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===158).frame,"base64").subarray(20));
    const body={battleId:battle.id,userId:battle.hero,skillTempId:9101};
    assert.equal(response(send({...body,userId:9999})).result,1);assert.equal(response(send({...body,battleId:"wrong"})).result,1);
    assert.equal(response(send({...body,skillTempId:9201})).result,1);assert.equal(battle.engine!.actors.find(a=>a.id===battle.hero)!.uses[9101],undefined);
    assert.equal(response(send(body)).result,0);assert.equal(battle.engine!.actors.find(a=>a.id===battle.hero)!.uses[9101],undefined);
    assert.equal(city.tick().some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===153),false);
    now+=400;const executed=city.tick();assert.equal(response(executed).count,0);assert.equal(response(executed).result,0);assert.equal(response(executed).temp_id,9101);
    assert.equal(response(send(body)).result,1);assert.equal(response(send({...body,skillTempId:9901})).result,1);
    city=new CityWorld(store,2981,()=>now);const actor=city.saved.battle!.engine!.actors.find(a=>a.id===battle.hero)!;
    assert.equal(actor.uses[9101],1);assert.equal(actor.cooldowns[9901],now+20000);
    now+=20000;readyAdventure(city.saved.battle!,now);assert.equal(response(send({...body,skillTempId:9901})).result,0);
    city.saved.battle!.actionUntil=now+180000;now+=60000;
    const timed=city.tick().find(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===4361)!;assert.ok(timed);
    assert.equal(timed.battleId,battle.id);
    const notice=decodeMessage(typeName("battle.BattleNoticeMsg"),Buffer.from(timed.frame,"base64").subarray(20));
    assert.equal(notice.battle_id,battle.id);assert.equal(notice.damage_improve,50);assert.equal(notice.count_down,59600);
    assert.equal(city.tick().some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===4361),false);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
