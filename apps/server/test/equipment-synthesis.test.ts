import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { itemTemplate } from "../src/inventory.js";
import { equipmentRecipes, equipmentSource, rollEquipment, normalEquipment,equipmentSkills } from "../src/features/equipment/content.js";
import { decodeMessage, encodeMessage } from "../src/messages.js";
import { frame } from "../src/protocol.js";

async function setup(icon = 3) {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const dir = mkdtempSync(join(projectRoot, ".test-data/forge-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); await store.createUser("forge_test", "local-test-pass", 1960); store.initTutorialProfile(1960);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,nickname='Forge',sex=0,process=25000 WHERE user_id=1960").run(icon);
  let city = new CityWorld(store, 1960, () => 1900000000000); city.state.player.grades = 80; delete city.saved.battle; city.persist();
  return { store, get city() { return city; }, reload: () => city = new CityWorld(store, 1960, () => 1900000000000),
    send: (op: number, message: Record<string, any>) => city.handle(frame(op, 1960, encodeMessage(city.scenario.outgoing[op]!, message))),
    close: () => { store.close(); rmSync(dir, {recursive:true,force:true}); } };
}
const op = (p: { frame: string }) => Buffer.from(p.frame, "base64").readUInt16BE(6);

test("all 96 ordinary recipes across three classes and six families create real affixes and debit exact gold", async () => {
  const coverage = new Set<string>();
  for (const job of [1,2,3]) {
    const s = await setup(job);
    try {
      for (const recipe of equipmentRecipes.values()) {
        const t = itemTemplate(Number(recipe.NewMaterial))!; if (![0,job].includes(Number(t.Job))) continue;
        for (const [key,item] of Object.entries(s.city.state.items)) if (item.bag_type === 1) delete s.city.state.items[key];
        let pos = 0;
        for (let n=1;n<=4;n++) if (Number(recipe[`Material${n}`]) && Number(recipe[`Count${n}`])) {
          const template_id=Number(recipe[`Material${n}`]);
          for(let stack=0;stack<(normalEquipment(template_id)?2:1);stack++) {
            const item={ id:1000000+Number(recipe.Id)*100+pos,bag_type:1,object_id:0,pos,template_id,count:normalEquipment(template_id)?1:Number(recipe[`Count${n}`])*2,exist:1,bind:1 };
            if(normalEquipment(template_id))rollEquipment(item);
            s.city.state.items[`1:0:${pos}`]=item;pos++;
          }
        }
        s.city.state.economy.gold_total_count = 100000000;
        const result = s.send(5153, {compose_id:Number(recipe.Id),compose_num:2,auto_buy:0,operate:0});
        const ack = result.find(p=>op(p)===89)!;
        assert.equal(decodeMessage(s.city.scenario.incoming[89]!,Buffer.from(ack.frame,"base64").subarray(20)).compose_result,1,`recipe ${recipe.Id}`);
        assert.equal(s.city.state.economy.gold_total_count,100000000-Number(recipe.NeedGold)*2);
        const produced = Object.values(s.city.state.items).filter(i=>i.bag_type===1&&i.template_id===Number(recipe.NewMaterial));
        assert.equal(produced.length,2); assert.notEqual(produced[0].id,produced[1].id);
        for (const item of produced) {
          assert.equal([1,2,3,4,5].filter(n=>item[`random_skill_${n}`]>0).length,Number(t.RandomSkillCount));
          assert.ok(equipmentSource(item)); assert.ok(!s.city.saved.attributes!.sources[`equipment:initial:${item.id}`]);
        }
        const slot = ({101:0,103:1,104:2,106:3,107:4,108:6} as Record<number,number>)[Number(t.SonType)]!;
        const item = produced[0];
        s.send(5005,{begin_bag_type:1,begin_obj_id:0,begin_pos:item.pos,end_bag_type:4,end_obj_id:s.city.state.hero.hero_id,end_pos:slot,count:1});
        assert.ok(s.city.saved.attributes!.sources[`equipment:initial:${item.id}`],`equip recipe ${recipe.Id}`);
        coverage.add(`${job}:${t.SonType}`);
      }
      s.reload(); assert.ok(s.city.state.hero.total_live>0);
    } finally { s.close(); }
  }
  assert.equal(coverage.size,18);
});

test("bad recipe, missing materials, insufficient gold, full bag and failed persist roll back synthesis", async () => {
  const s = await setup();
  try {
    const recipe = [...equipmentRecipes.values()].find(r=>Number(itemTemplate(Number(r.NewMaterial))!.Job)===3&&Number(r.Types)===1)!;
    const reject = (request: Record<string, any>) => { const before=structuredClone(s.city.saved); s.send(5153,request); assert.deepEqual(s.city.saved,before); };
    reject({compose_id:605,compose_num:1}); reject({compose_id:Number(recipe.Id),compose_num:1});
    s.city.state.items["1:0:30"]={id:900000,template_id:Number(recipe.Material1),count:9999,exist:1,bag_type:1,object_id:0,pos:30,bind:1};
    s.city.state.economy.gold_total_count=0; reject({compose_id:Number(recipe.Id),compose_num:1});
    s.city.state.economy.gold_total_count=10000000;
    for(let pos=0;pos<42;pos++)if(!s.city.state.items[`1:0:${pos}`])s.city.state.items[`1:0:${pos}`]={id:800000+pos,template_id:2129006,count:9999,exist:1,bag_type:1,object_id:0,pos,bind:1};
    reject({compose_id:Number(recipe.Id),compose_num:1});
    delete s.city.state.items["1:0:31"];
    const persist=s.city.persist,before=structuredClone(s.city.saved);s.city.persist=()=>{throw new Error("forced forge save");};
    assert.throws(()=>s.send(5153,{compose_id:Number(recipe.Id),compose_num:1}),/forced forge save/);assert.deepEqual(s.city.saved,before);s.city.persist=persist;
  } finally {s.close();}
});

test("legendary evolution preserves equipped instance, slots and all five original affixes even with full backpack", async () => {
 const s=await setup(2);
 try{
  const hero=s.city.state.hero.hero_id;
  const item={id:2370245,template_id:1992091,pos:0,exist:1,object_id:hero,bag_type:4,bind:1,used:0,count:1,strengthen_grade:0,join_1:0,join_2:0,join_3:-1,join_4:-1,random_skill_1:70708,random_skill_2:70304,random_skill_3:70607,random_skill_4:70105,random_skill_5:70504,user_id:1960};
  s.city.state.items[`4:${hero}:0`]=structuredClone(item);
  for(let pos=0;pos<42;pos++)s.city.state.items[`1:0:${pos}`]={id:800000+pos,template_id:2129700,count:9999,exist:1,bag_type:1,object_id:0,pos,bind:1};
  s.city.state.economy.gold_total_count=10000000;s.city.persist();
  const result=s.send(5153,{compose_id:211,compose_num:1,pay_type:1,operate:0});
  const ack=result.find(p=>op(p)===89)!;assert.equal(decodeMessage(s.city.scenario.incoming[89]!,Buffer.from(ack.frame,"base64").subarray(20)).compose_result,1);
  const upgraded=s.city.state.items[`4:${hero}:0`]!;
  for(let slot=1;slot<=5;slot++){
    const before=equipmentSkills.get(Number((item as Record<string,any>)[`random_skill_${slot}`]))!,after=equipmentSkills.get(upgraded[`random_skill_${slot}`])!;
    assert.equal(after.SonType,before.SonType);assert.equal(after.Grades,before.Grades);
  }
  const fields=(value:Record<string,any>)=>Object.fromEntries(Object.entries(value).filter(([key])=>!key.startsWith("random_skill_")));
  assert.deepEqual(fields(upgraded),fields({...item,template_id:1892091}));
  assert.deepEqual(s.city.saved.attributes!.sources[`equipment:initial:${item.id}`],equipmentSource({...item,template_id:1892091}));
  const expected=structuredClone(upgraded);s.reload();assert.deepEqual(s.city.state.items[`4:${hero}:0`],expected);
 }finally{s.close();}
});

test("mail bulk extraction marks read, skips already collected annexes and deletion preserves attached mail across reload", async () => {
  const s=await setup();
  try {
    const first=s.store.sendLocalItems(1960,"Extract",[{template:2129006,count:12}]);
    const protectedId=s.store.sendLocalItems(1960,"Keep",[{template:2129006,count:9}]);
    s.city.mailXml();
    const captured=Object.values(s.city.state.mails).find(m=>m.id<1000000&&m.isExist!==0);
    if(captured)for(let n=1;n<=5;n++)captured[`isAnnex${n}`]=1;
    const ids=[first,...(captured?[captured.id]:[])];
    const res=s.send(5022,{mailsIdArray:ids,position:ids.map(()=>0)});assert.ok(res.some(p=>op(p)===114));
    assert.equal(s.city.state.mails[first].isAnnex1,1);assert.ok(!s.city.state.mails[first].readDate.startsWith("2999"));
    const count=Object.values(s.city.state.items).filter(i=>i.template_id===2129006).reduce((n,i)=>n+i.count,0);
    s.send(5022,{mailsIdArray:[first],position:[0]});assert.equal(Object.values(s.city.state.items).filter(i=>i.template_id===2129006).reduce((n,i)=>n+i.count,0),count);
    const removed=s.send(8206,{delList:[...ids,protectedId]});
    const ack=removed.find(p=>op(p)===4132)!;assert.deepEqual(decodeMessage(s.city.scenario.incoming[4132]!,Buffer.from(ack.frame,"base64").subarray(20)).delList,ids);
    assert.equal(s.city.state.mails[protectedId].isExist,1);s.reload();
    assert.ok(!s.city.mailXml().includes(`Id="${first}"`));assert.ok(s.city.mailXml().includes(`Id="${protectedId}"`));
  }finally{s.close();}
});
