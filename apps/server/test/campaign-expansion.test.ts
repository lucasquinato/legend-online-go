import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoString } from "../src/protocol.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import { campaignDefinitions, campaignBattleIndices, campaignRules, isCampaignBattle } from "../src/features/campaign/index.js";
import { labyrinthFloors } from "../src/features/labyrinth/content.js";
import { itemTemplate } from "../src/inventory.js";

const expanded = JSON.parse(readFileSync(join(projectRoot, "reference/campaign/expanded-content.json"), "utf8"));
async function setup(icon: number, level: number) {
  mkdirSync(join(projectRoot, ".test-data"), {recursive:true});
  const dir = mkdtempSync(join(projectRoot, ".test-data/campaign-expansion-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  await store.createUser("campaign_expansion", "test-password-123", 1959);
  store.initTutorialProfile(1959);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,nickname='Local',sex=?,process=25000 WHERE user_id=1959").run(icon, icon>3?1:0);
  let now = 1900000000000;
  let city = new CityWorld(store, 1959, () => now);
  city.state.player.grades = level;
  city.state.player.weary = 200;
  city.persist();
  const send = (op: number, request: any = {}) => city.handle(frame(op,1959,encodeMessage(city.scenario.outgoing[op]!, request)));
  const opcode = (packet: any) => Buffer.from(packet.frame, "base64").readUInt16BE(6);
  const msg = (packets: any[], op: number) => {
    const p = packets.find(p=>opcode(p)===op);
    assert.ok(p, `Missing ${op}`);
    return decodeMessage(city.scenario.incoming[op]!, Buffer.from(p.frame,"base64").subarray(20));
  };
  return {store, get city(){return city;}, send, opcode, msg,
    advance(){now+=10000;},
    reload(){city=new CityWorld(store,1959,()=>now);},
    cleanup(){store.close();rmSync(dir,{recursive:true,force:true});}};
}

test("catálogo cobre as 83 fases originais e preserva referências anteriores do labirinto", async () => {
  assert.equal(campaignDefinitions.size,83);
  for (const r of campaignRules.campaigns) assert.ok(campaignDefinitions.has(Number(r.CampaignId)));
  for (const c of expanded.campaigns) {
    assert.equal(c.completionXp, Number(c.definition.BaseGp));
    assert.ok(c.cardPool.length > 0);
  }
  const old = ["content.json","hero-content.json"].flatMap(f=>JSON.parse(readFileSync(join(projectRoot,"reference/campaign",f),"utf8")).campaigns);
  let index=3;
  for (const c of old) {
    if (c.legacy) continue;
    const indices=c.stages.map((_:any,i:number)=>index+i);
    assert.deepEqual(campaignBattleIndices(c.id),indices);
    index+=c.stages.length;
  }
  const s=await setup(3,70);
  try {
    assert.equal(s.city.scenario.battles[index]!.prepare.map_temp_id,8002);
    assert.equal(s.city.scenario.battles[2]!.prepare.map_temp_id,8001);
    for(let i=index;i<index+labyrinthFloors.size-1;i++)assert.equal(isCampaignBattle(i),false);
    const used=new Set<number>();
    for(const c of campaignDefinitions.values()) for(const i of campaignBattleIndices(c.id)) {
      assert.ok(!used.has(i));used.add(i);
      assert.ok(s.city.scenario.battles[i]);
      assert.equal(isCampaignBattle(i),true);
    }
  } finally {s.cleanup();}
});

test("refresh durante batalha heroica restaura cena, mago e combate sem cobrar nova entrada", async () => {
  const d=campaignDefinitions.get(11202)!;
  const s=await setup(3,32);
  try {
    s.city.saved.completedCampaigns=campaignRules.campaigns.filter(c=>c.DifficultyGrade==="1").map(c=>Number(c.CampaignId));
    s.city.persist();
    s.send(5039,{para_int1:1,para_int2:d.id});
    s.send(5038,{para_int1:d.map});
    s.city.handle(frame(8666,1959));
    const battleId=s.city.saved.battle!.id;
    s.reload();
    const restored=s.city.bootstrap();
    assert.equal(s.msg(restored,125).room.campaignId,d.map);
    assert.equal(s.msg(restored,21).player.find((p:any)=>p.player_id===1959).template_id,3);
    assert.equal(s.msg(restored,157).heros.find((h:any)=>h.side===1&&h.type===1).temp_id,3);
    assert.ok(restored.find(p=>s.opcode(p)===125)!.delayMs < restored.find(p=>s.opcode(p)===157)!.delayMs);
    s.send(5038,{para_int1:d.map});
    assert.equal(s.city.saved.battle!.id,battleId);
    assert.equal(s.city.state.player.weary,180);
    assert.equal(s.city.state.player.grades,32);
  } finally {s.cleanup();}
});

for (const [number, imported] of expanded.campaigns.entries()) {
  test(`fase ${imported.id}: encontros, reconexão, recompensa, cartas únicas e saída`, async () => {
    const d=campaignDefinitions.get(imported.id)!;
    const icon=number%6+1;
    const s=await setup(icon,Number(d.definition.MinLevel));
    try {
      s.city.saved.completedCampaigns=campaignRules.campaigns.filter(c=>c.DifficultyGrade==="1"&&Number(c.CampaignId)!==d.id).map(c=>Number(c.CampaignId));
      s.city.persist();
      assert.equal(s.msg(s.send(5039,{para_int1:1,para_int2:d.id}),125).room.campaignId,d.map);
      // Restart can happen after entering the room but before its first load.
      s.reload();
      const entering=s.city.bootstrap();
      assert.equal(s.msg(entering,125).room.campaignId,d.map);
      assert.ok(entering.find(p=>s.opcode(p)===125)!.delayMs <= entering.find(p=>s.opcode(p)===21)!.delayMs);
      assert.equal(s.city.state.player.weary,200);
      s.send(5038,{para_int1:d.map});
      assert.equal(s.city.state.player.weary,180);
      s.send(5038,{para_int1:d.map});
      assert.equal(s.city.state.player.weary,180);
      const indices=campaignBattleIndices(d.id);
      for (const [n,index] of indices.entries()) {
        const prepare=s.msg(s.city.handle(frame(8666,1959)),157);
        assert.equal(prepare.heros.find((h:any)=>h.side===1&&h.type===1).temp_id,icon);
        assert.deepEqual([...prepare.heros,...(prepare.soldiers??[])].filter(h=>h.side===2).map(h=>h.temp_id),
          [...d.stages![n]!.reference.prepare.heros,...(d.stages![n]!.reference.prepare.soldiers??[])].filter(h=>h.side===2).map(h=>h.temp_id));
        const b=s.city.saved.battle!;
        const stage=d.stages![n]!;
        const beforeDrops=new Map((stage.drops??[]).map(drop=>[drop.model.template_id,
          Object.values(s.city.state.items).filter((item:any)=>item.template_id===drop.model.template_id).reduce((sum:number,item:any)=>sum+Number(item.count??0),0)]));
        assert.equal(b.reference,index);
        s.city.handle(frame(10007,1959,protoString(2,b.id)));
        // Exercise transitions and persistence independently of player balance.
        for(const f of b.fighters)f.hp=f.side===2?1:1000000000;
        let packets:any[]=[];
        for(let turns=0;turns<100&&!b.finished;turns++){s.advance();packets.push(...s.city.tick());}
        assert.equal(b.won,true);
        assert.equal(s.msg(packets,4103).battle_result,1);
        if (stage.xp > 0) {
          const xpMessage = s.msg(packets,83);
          assert.equal(xpMessage.channel,3);
          assert.equal(Number(xpMessage.is_centerTip),0);
          assert.equal(xpMessage.encode_msg,`Você recebeu ${stage.xp} de XP pela batalha.`);
          assert.ok(!s.city.tick().some(p=>s.opcode(p)===83));
        }
        for(const drop of stage.drops??[])assert.equal(
          Object.values(s.city.state.items).filter((item:any)=>item.template_id===drop.model.template_id).reduce((sum:number,item:any)=>sum+Number(item.count??0),0),
          beforeDrops.get(drop.model.template_id)!+drop.count);
        s.reload();
        const reconnect=s.city.bootstrap();
        assert.equal(s.msg(reconnect,125).room.campaignId,d.map);
        assert.equal(s.msg(reconnect,21).player.find((p:any)=>p.player_id===1959).template_id,icon);
        assert.equal(s.city.state.player.weary,180);
        assert.equal(s.city.saved.campaignRun!.won.includes(index),true);
        const loaded=s.send(5038,{para_int1:d.map});
        if(n<indices.length-1) {
          assert.ok(!loaded.some(p=>[135,137].includes(s.opcode(p))));
          assert.equal(s.msg(loaded,4282).param1,d.stages![n+1]!.nodeIndex);
          assert.equal(s.msg(loaded,21).player.find((p:any)=>p.player_id===1959).template_id,icon);
        } else {
          assert.ok(loaded.some(p=>s.opcode(p)===137));
          assert.equal(s.msg(loaded,83).encode_msg,`Você recebeu ${d.completionXp} de XP pela conclusão da campanha.`);
          assert.ok(!s.send(5038,{para_int1:d.map}).some(p=>s.opcode(p)===83));
          const cards=loaded.find(p=>s.opcode(p)===135)!;
          const report=loaded.find(p=>s.opcode(p)===137)!;
          assert.equal(cards.delayMs-report.delayMs,5500);
        }
      }
      assert.ok(s.city.saved.completedCampaigns!.includes(d.id));
      assert.equal(s.city.saved.map,d.map);
      const before=Object.values(s.city.state.items).reduce((n:number,i:any)=>n+Number(i.count??0),0);
      const drop=s.city.saved.campaignRun!.cards!.deck[0]!;
      const chosen=s.send(5122,{para_int1:1959,para_int2:0});
      assert.equal(s.msg(chosen,83).encode_msg,`Você recebeu [${itemTemplate(drop.templateId)!.TemplateName}] x${drop.count} pela carta da campanha.`);
      assert.equal(Number(s.msg(chosen,83).is_centerTip),0);
      const after=Object.values(s.city.state.items).reduce((n:number,i:any)=>n+Number(i.count??0),0);
      assert.ok(after>before);
      assert.ok(!s.send(5122,{para_int1:1959,para_int2:0}).some(p=>s.opcode(p)===83));
      s.reload();
      assert.ok(!s.send(5122,{para_int1:1959,para_int2:0}).some(p=>s.opcode(p)===83));
      assert.equal(Object.values(s.city.state.items).reduce((n:number,i:any)=>n+Number(i.count??0),0),after);
      s.send(5180,{para_int1:d.map});
      assert.equal(s.city.saved.map,1);
      assert.equal(s.city.state.hero.tempate_id,icon);
    } finally {s.cleanup();}
  });
}

for(const id of [1101,11102])test(`entrada ${id} fornece o personagem antes do callback, sem cobrar ou reiniciar a sala`,async()=>{
 const d=campaignDefinitions.get(id)!,s=await setup(3,40);try{
  s.city.saved.completedCampaigns=campaignRules.campaigns.filter(c=>c.DifficultyGrade==="1").map(c=>Number(c.CampaignId));s.city.state.army.map_id=5601;s.city.state.army.cur_pos_x=25;s.city.state.army.cur_pos_y=36;s.city.persist();
  const entry=s.send(5039,{para_int1:1,para_int2:id});assert.equal(s.msg(entry,125).room.campaignId,d.map);assert.equal(s.msg(entry,4165).army_id,1959);
  const player=s.msg(entry,21).player.find((p:any)=>p.player_id===1959);assert.ok(player);assert.equal(player.template_id,3);assert.equal(player.campaign_id,d.map);assert.ok(entry.every(p=>(p.delayMs??0)===0));assert.equal(s.city.state.player.weary,200);
  const loaded=s.send(5038,{para_int1:d.map});assert.equal(loaded.filter(p=>s.opcode(p)===125).length,0);assert.equal(s.city.state.player.weary,180);s.send(5038,{para_int1:d.map});assert.equal(s.city.state.player.weary,180);
 }finally{s.cleanup();}
});
