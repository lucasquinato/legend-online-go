import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AttributeCalculator, calculateAttributes, applyAttributes, naturalAttributeSource, combatCapacity, replaceAttributeContribution, type AttributeState } from "../src/attributes.js";
import { initialEquipmentSource, rollInitialEquipment, randomFamilies, synchronizeInitialEquipment } from "../src/features/attributes/initial-equipment.js";
import { fashionAttributeSources } from "../src/features/attributes/fashion.js";
import { startingFury, finishedFury } from "../src/features/attributes/fury.js";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { encodeMessage } from "../src/messages.js";
import { frame } from "../src/protocol.js";
import { Inventory } from "../src/inventory.js";

const empty = (): AttributeState => ({ version: 1, calculationVersion: 2, sources: {} });
test("central soma primários, converte uma vez, soma fixos e aplica percentuais aditivos sobre tudo", () => {
  const s = empty();
  s.sources.a = { kind: "natural", evidence: "local-balance", values: { total_intellect: 100, total_magic_attack: 100 }, percentages: { total_magic_attack: 10 } };
  s.sources.b = { kind: "permanent", evidence: "recovered-table", values: { total_intellect: 300, total_magic_attack: 200 }, percentages: { total_magic_attack: 15 } };
  const result = calculateAttributes(s);
  assert.equal(result.total_intellect, 400); assert.equal(result.total_magic_attack, 2375); assert.equal(result.total_magic_defence, 400);
  assert.equal(result.fighting_capacity, combatCapacity(result));
  assert.deepEqual(result, calculateAttributes({ ...s, sources: { b: s.sources.b!, a: s.sources.a! } }));
  s.sources.newSystem = { kind: "other", evidence: "local-balance", values: { total_magic_attack: 1000 } };
  assert.equal(calculateAttributes(s).total_magic_attack, 3625);
});
test("central recusa fontes negativas, resíduos e poder fornecido por um sistema", () => {
  for (const source of [
    { kind: "equipment", values: { total_phy_attack: -33 } },
    { kind: "unresolved", values: { total_phy_attack: 1 } },
    { kind: "equipment", values: { fighting_capacity: 10 } },
    { kind: "equipment", values: {}, percentages: { total_live: -10 } },
    { kind: "equipment", values: {}, scaling: [{ values: { total_live: 10 }, percent: -1 }] },
  ]) assert.throws(() => calculateAttributes({ ...empty(), sources: { invalid: { evidence: "local-balance", ...source } as any } }));
  assert.throws(() => replaceAttributeContribution(empty(), "bad", { kind: "equipment", evidence: "local-balance", values: { total_phy_attack: -1 } }));
});
test("bases das três classes são brutas e não acumulam conversões ou curam o personagem", () => {
  for (const [job, attack, defence, magic, live] of [[1,127,110,20,790],[2,167,88,20,590],[3,20,65,147,490]]) {
    const s = empty(); s.sources.natural = naturalAttributeSource(job!, 27);
    assert.equal(s.sources.natural.values.base_phy_attack, job === 3 ? 0 : 7 * 17);
    const r = calculateAttributes(s);
    assert.equal(r.total_phy_attack, attack! * 17); assert.equal(r.total_phy_defence, defence! * 17); assert.equal(r.total_magic_attack, magic! * 17); assert.equal(r.total_live, live! * 17);
    const hero = { hp: 50, total_live: 1, total_magic_attack: 999999, total_stunAttr: 99 };
    applyAttributes(s, hero); assert.equal(hero.hp, 50); assert.equal(hero.total_stunAttr, 0);
    const once = structuredClone(hero); applyAttributes(s, hero); assert.deepEqual(hero, once);
  }
});
test("moda nível 200 entrega 10% para fontes novas, fúria 110 e refinação entrega mais 20", () => {
  const progress = Object.fromEntries([109,110,111,112].map(t => [t, { level:100, xp:0 }]));
  const s = empty(); s.sources = fashionAttributeSources(200, {}, progress);
  s.sources.other = { kind:"other", evidence:"local-balance", values:{total_phy_attack:1000} };
  const r = AttributeCalculator.calculate(s);
  assert.equal(r.total_phy_attack, Math.floor((4200 + 84000 + 1000) * 1.1));
  assert.equal(r.total_initial_fury, 130); assert.equal(startingFury(r.total_initial_fury, "maze", {key:"maze",value:10}),100);
  assert.equal(calculateAttributes(s).total_initial_fury, undefined);
  const hero: any = {}; applyAttributes(s,hero); assert.equal(hero.total_initial_fury,undefined);
});
test("refinação de avaliação fornece primários antes da conversão e porcentagens finais", () => {
  const progress = Object.fromEntries([109,110,111,112].map(t => [t, {level:100,xp:0}]));
  const s = empty(); s.sources = fashionAttributeSources(200, {1110801:{temp_id:1110801,appraisal_skill:5204}},progress);
  const raw = AttributeCalculator.sourceValues(s.sources["fashion:refinement"]!);
  assert.equal(raw.total_power,100);
  assert.equal(calculateAttributes(s).total_power,200);
  assert.equal(calculateAttributes(s).total_phy_attack,Math.floor((4200+84000+200*4)*1.1));
});
test("seis templates iniciais reproduzem fixos e bônus do exemplar sem deltas negativos", () => {
  for (const [weapon,armor,attack,magic,defence,resistance] of [[1011003,1041003,52,0,39,25],[1012003,1042003,52,0,28,35],[1013003,1043003,19,33,18,46]]) {
    const a={template_id:weapon,random_skill_1:70102,random_skill_2:70904,random_skill_3:70402};
    const b={template_id:armor,random_skill_1:70605,random_skill_2:71106,random_skill_3:70502};
    const s=empty();s.sources={weapon:initialEquipmentSource(a)!,armor:initialEquipmentSource(b)!};
    const r=calculateAttributes(s); assert.equal(r.total_phy_attack,attack); assert.equal(r.total_magic_attack??0,magic); assert.equal(r.total_phy_defence,defence); assert.equal(r.total_magic_defence,resistance); assert.equal(r.total_live,58); assert.equal(r.total_conat_army,2);
    assert.equal(initialEquipmentSource({template_id:1011004}),undefined);
  }
});
test("sorteio dá igual acesso às 12 famílias, sem repetição, e permite força junto de ataque", () => {
  const families=[...randomFamilies.keys()];
  for(let i=0;i<families.length;i++){
    let n=0; const item:any={template_id:1011003}; const sizes:number[]=[];
    rollInitialEquipment(item,size=>{sizes.push(size);return n++===0?i:0;});
    const ids=[item.random_skill_1,item.random_skill_2,item.random_skill_3], selected=ids.map(id=>[...randomFamilies].find(([,v])=>v.includes(id))![0]);
    assert.equal(selected[0],families[i]);assert.equal(new Set(selected).size,3);assert.equal(sizes[0],12);assert.equal(sizes[2],11);assert.equal(sizes[4],10);
    assert.ok(initialEquipmentSource(item));
  }
  const item:any={template_id:1011003};let n=0; const choices=[0,0,4,0,0,0];rollInitialEquipment(item,()=>choices[n++]!);
  const values=initialEquipmentSource(item)!.values;assert.equal(values.total_power,2);assert.equal(values.total_phy_attack,42);
  assert.throws(()=>initialEquipmentSource({template_id:1011003,random_skill_1:70102,random_skill_2:70103}),/repetido/);
});
test("geração aleatória ocorre por exemplar e movimentos não sorteiam novamente", () => {
  const state:any={}, ids={nextId:1};let draws=0;
  const inv=new Inventory(state,ids,42,{created:item=>{draws++;rollInitialEquipment(item,()=>0);}});
  inv.add({template_id:1011003,bag_type:1,pos:0,object_id:0},2);assert.equal(draws,2);
  const source=structuredClone(state["1:0:0"]);inv.move({begin_bag_type:1,begin_obj_id:0,begin_pos:0,end_bag_type:4,end_obj_id:1810,end_pos:0,count:1});
  assert.equal(draws,2);assert.equal(state["4:1810:0"].random_skill_1,source.random_skill_1);
  const s=empty();synchronizeInitialEquipment(s.sources,state,1810);assert.equal(Object.keys(s.sources).length,1);
  inv.move({begin_bag_type:4,begin_obj_id:1810,begin_pos:0,end_bag_type:1,end_obj_id:0,end_pos:2,count:1});synchronizeInitialEquipment(s.sources,state,1810);assert.equal(Object.keys(s.sources).length,0);
});
test("fúria usa máximo entre inicial e cache da mesma instância, com limite 100", () => {
  assert.equal(startingFury(130,"maze",finishedFury("maze",10)),100);
  assert.equal(startingFury(16,"maze",finishedFury("maze",36)),36);
  assert.equal(startingFury(16,"maze",finishedFury("other",36)),16);
  assert.equal(startingFury(16,undefined,finishedFury("maze",36)),16);
  assert.equal(startingFury(16,"maze",finishedFury("maze",0)),16);
  assert.equal(startingFury(16,"maze",finishedFury("maze",999)),100);
});

function cityFixture(icon=3) {
  const base=join(projectRoot,".test-data");mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,"attributes-v2-"));mkdirSync(join(dir,"city"));copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
  const store=new Store(dir);store.db.prepare("INSERT INTO users(id,username,salt,hash) VALUES(?,?,?,?)").run(1971,"attributes_test","fixture","fixture");store.initTutorialProfile(1971);store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,nickname='AttributeTester',process=26000 WHERE user_id=1971").run(icon);
  let time=1900000000000;const city=new CityWorld(store,1971,()=>time);
  return {store,city,now:()=>time,advance:()=>time+=10000,close:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};
}
test("migração arquiva painel/negativos e recompõe fontes; relogar não acumula nem recria bônus", () => {
  for(const icon of [1,2,3,4,5,6]){
    const s=cityFixture(icon);try {
      const save=structuredClone(s.city.saved), items=structuredClone(save.state.items);
      save.attributes={version:1,sources:{natural:{kind:"natural",evidence:"captured-base",values:{total_phy_attack:99999}},"equipment:starter-class":{kind:"equipment",evidence:"observed-delta",values:{total_phy_attack:-33}}}};
      save.state.hero.total_phy_attack=99999;s.store.db.prepare("UPDATE city_worlds SET state=? WHERE user_id=?").run(JSON.stringify(save),1971);
      const migrated=new CityWorld(s.store,1971,s.now);
      assert.equal(migrated.saved.attributes!.calculationVersion,2);assert.equal(migrated.saved.attributeMigration!.panel.total_phy_attack,99999);assert.ok(migrated.saved.attributeMigration!.legacy!.sources["equipment:starter-class"]);
      assert.equal(migrated.saved.attributes!.sources.unresolved,undefined);assert.ok(migrated.state.hero.total_phy_attack<99999);assert.deepEqual(migrated.state.items,items);
      const panel=structuredClone(migrated.state.hero);assert.deepEqual(new CityWorld(s.store,1971,s.now).state.hero,panel);
      assert.ok(!Object.values(migrated.saved.attributes!.sources).some(source=>Object.values(source.values).some(v=>v<0)));
    }finally{s.close();}
  }
});
test("cache do labirinto sobrevive à vitória, portal, reconexão e derrota; sair limpa o cache", () => {
  const s=cityFixture();try {
    const c=s.city;c.saved.fashion={level:0,xp:0,baselineLevel:0,fields:{}};
    c.saved.attributes!.sources["test:fury"]={kind:"other",evidence:"local-balance",values:{total_initial_fury:16}};c.persist();c.labyrinth.enter();c.persist();
    const finish=(win:boolean,sp:number)=>{
      const b=c.saved.battle!;b.ready=true;b.started=true;b.openingComplete=true;b.nextAt=s.now();b.sp=sp;
      for(const f of b.fighters)if(win?f.side===2:f.living_id===b.hero)f.hp=0;
      for(const a of b.engine!.actors){if(win?a.side===2:a.id===b.hero)a.hp=0;if(a.id===b.hero)a.fury=sp;}
      b.finishing=true;b.won=win;
      for(let i=0;i<3&&!b.finished;i++){s.advance();c.tick();}
      assert.equal(b.finished,true);
    };
    c.startBattle(c.labyrinth.battleIndex());assert.equal(c.saved.battle!.sp,16);finish(true,36);assert.equal(c.saved.instanceFury!.value,36);
    c.labyrinth.usePortal();c.persist();assert.equal(c.saved.instanceFury!.value,36);
    const reloaded=new CityWorld(s.store,1971,s.now);assert.equal(reloaded.saved.instanceFury!.value,36);
    c.startBattle(c.labyrinth.battleIndex());assert.equal(c.saved.battle!.sp,36);finish(false,48);
    c.startBattle(c.labyrinth.battleIndex());assert.equal(c.saved.battle!.sp,48);
    c.handle(frame(5180,1971,encodeMessage(c.scenario.outgoing[5180]!,{})));assert.equal(c.saved.map,1);assert.equal(c.saved.instanceFury,undefined);
    c.labyrinth.enter();c.persist();c.startBattle(c.labyrinth.battleIndex());assert.equal(c.saved.battle!.sp,16);
  }finally{s.close();}
});
test("campanha conserva fúria entre encontros e uma nova entrada reaplica somente a inicial", () => {
  const s=cityFixture();try {
    const c=s.city;c.saved.fashion={level:0,xp:0,baselineLevel:0,fields:{}};
    c.saved.attributes!.sources["test:fury"]={kind:"other",evidence:"local-balance",values:{total_initial_fury:16}};
    c.saved.map=1021;c.saved.campaignRun={id:"fury-run-1",campaignId:1001,paid:true,rewarded:false,won:[],completed:false};c.persist();
    c.startBattle(0);const b=c.saved.battle!;assert.equal(b.sp,16);
    b.ready=true;b.started=true;b.openingComplete=true;b.nextAt=s.now();b.finishing=true;b.won=true;b.sp=36;
    for(const f of b.fighters)if(f.side===2)f.hp=0;
    for(const a of b.engine!.actors){if(a.side===2)a.hp=0;if(a.id===b.hero)a.fury=36;}
    s.advance();c.tick();assert.equal(b.finished,true);assert.equal(c.saved.instanceFury!.value,36);
    c.startBattle(1);assert.equal(c.saved.battle!.sp,36);
    c.handle(frame(5025,1971,encodeMessage(c.scenario.outgoing[5025]!,{msg:""})));assert.equal(c.saved.instanceFury,undefined);
    c.saved.map=1021;c.saved.campaignRun={id:"fury-run-2",campaignId:1001,paid:true,rewarded:false,won:[],completed:false};c.persist();c.startBattle(0);assert.equal(c.saved.battle!.sp,16);
  }finally{s.close();}
});
