import { concentrationAttackPercent } from "../src/features/skills/passive-balance.js";
import { runeDescription, runeSkillDescription, runeBufferDescription } from "../src/features/runes/descriptions.js";
import { isBlockHealingBuffer } from "../src/features/skills/healing-balance.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { projectRoot } from "../src/config.js";
import { frame } from "../src/protocol.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { createSkills, syncSkills, learnSkill, resetSkillPage, setSkillKeys, switchSkillPage, syncSkillAttributes, skillBudget, SkillError, basicSkills } from "../src/features/skills/index.js";
import { localSkillTables, skillDescription } from "../src/features/skills/descriptions.js";
import { calculateAttributes } from "../src/attributes.js";
import { emptyCity } from "../src/city-state.js";

for (const job of [1, 2, 3]) test(`profissão ${job}: pontos, requisitos, níveis, atalhos e passiva permanentes`, () => {
  const state = emptyCity(); state.player.grades = 10;
  const saved = createSkills({}, job, 10); syncSkills(saved, state);
  assert.equal(state.hero.skill_point, 3);
  assert.equal(state.hero.skill_script, `${job * 10000 + 711},${job * 10000 + 811},`);
  learnSkill(saved, state, job * 10000 + 111);
  assert.equal(state.hero.skill_point, 2);
  assert.equal(saved.pages[0]!.keys.split(",")[2], "-1", "passivas não ocupam a barra");
  assert.throws(() => learnSkill(saved, state, job * 10000 + 111), SkillError);
  assert.throws(() => learnSkill(saved, state, job * 10000 + 831), SkillError);
  assert.throws(() => learnSkill(saved, state, (job % 3 + 1) * 10000 + 111), SkillError);
  state.player.grades = 14; syncSkills(saved, state);
  learnSkill(saved, state, job * 10000 + 211);
  const attributes = { version: 1 as const, sources: { natural: {kind: "natural" as const, evidence: "local-balance" as const, values: {base_phy_attack:100, total_phy_attack:200, base_magic_attack:100, total_magic_attack:200}} } };
  syncSkillAttributes(saved, attributes);
  const result = calculateAttributes(attributes);
  assert.equal(result[job === 3 ? "total_magic_attack" : "total_phy_attack"], job === 2 ? 220 : 210);
  assert.equal(result[job === 3 ? "total_phy_attack" : "total_magic_attack"], 200);
  learnSkill(saved, state, job * 10000 + 711 + 10);
  assert.ok(!saved.pages[0]!.learned.includes(job * 10000 + 711));
  assert.ok(saved.pages[0]!.learned.includes(job * 10000 + 721));
  assert.throws(() => learnSkill(saved, state, job * 10000 + 711), SkillError);
});

test("saldo determinístico até 80, níveis múltiplos e reconexão sem concessão duplicada", () => {
  const state = emptyCity(); state.player.grades = 10;
  const save = createSkills({}, 3, 10);
  for (const [level, total] of [[10,5],[11,5],[12,6],[79,39],[80,40],[81,40]]) {
    state.player.grades = level; syncSkills(save, state);
    assert.equal(state.hero.skill_point, total! - 2); syncSkills(save, state); assert.equal(state.hero.skill_point, total! - 2);
    assert.equal(skillBudget(level!), total);
  }
});

test("Concentração aplica 10%, 20% e 25% sem duplicar o bônus ao recalcular",()=>{
  const state=emptyCity();state.player.grades=80;const save=createSkills({},2,80);
  const attributes:any={version:1,sources:{natural:{kind:"natural",evidence:"local-balance",values:{base_phy_attack:100,total_phy_attack:200}}}};
  for(const [prerequisite,id,expected]of [[20111,20211,220],[20121,20221,240],[0,20231,250]]) {
    if(prerequisite)learnSkill(save,state,prerequisite);learnSkill(save,state,id!);
    syncSkillAttributes(save,attributes);assert.equal(calculateAttributes(attributes).total_phy_attack,expected);
    syncSkillAttributes(save,attributes);assert.equal(calculateAttributes(attributes).total_phy_attack,expected);
  }
});

for (const job of [1,2,3]) test(`profissão ${job}: reset livre devolve todos os pontos e permite reaprender as iniciais`, () => {
  const state=emptyCity(); state.player.grades=10; const save=createSkills({},job,10);
  resetSkillPage(save); syncSkills(save,state);
  assert.equal(state.hero.skill_point,5); assert.equal(state.hero.skill_script,"");
  assert.equal(state.hero.fast_key,"-1,-1,-1,-1,-1,");
  const restored=JSON.parse(JSON.stringify(save)); syncSkills(restored,state);
  assert.equal(state.hero.skill_script,"", "sincronização não reaprende o tutorial");
  assert.throws(()=>learnSkill(restored,state,job*10000+811),SkillError);
  learnSkill(restored,state,job*10000+711);
  assert.equal(state.hero.skill_point,4); assert.equal(state.hero.fast_key,`${job*100+7},-1,-1,-1,-1,`);
  learnSkill(restored,state,job*10000+811);
  assert.equal(state.hero.skill_point,3); assert.equal(state.hero.fast_key,`${job*100+7},${job*100+8},-1,-1,-1,`);
  resetSkillPage(restored); syncSkills(restored,state); assert.equal(state.hero.skill_point,5);
  learnSkill(restored,state,job*10000+111);
  assert.equal(state.hero.skill_point,4); assert.equal(state.hero.fast_key,"-1,-1,-1,-1,-1,");
});

for (const job of [1,2,3]) test(`profissão ${job}: percentual usa equipamentos e primários, substitui rank e página`,()=>{
  const state=emptyCity();state.player.grades=80;const save=createSkills({},job,80);
  for(const suffix of [111,211,121,221,231])learnSkill(save,state,job*10000+suffix);
  const attributes: any={version:1,sources:{natural:{kind:"natural",evidence:"local-balance",values:{base_phy_attack:100,total_phy_attack:100,base_magic_attack:100,total_magic_attack:100}},equipment:{kind:"equipment",evidence:"recovered-table",values:{total_phy_attack:200,total_magic_attack:200}}}};
  syncSkillAttributes(save,attributes);
  const stat=job===3?"total_magic_attack":"total_phy_attack",other=job===3?"total_phy_attack":"total_magic_attack";
  assert.equal(calculateAttributes(attributes)[stat],job===2?375:345);assert.equal(calculateAttributes(attributes)[other],300);
  save.unlocked=true;switchSkillPage(save,1);syncSkillAttributes(save,attributes);
  assert.equal(calculateAttributes(attributes)[stat],300);
  switchSkillPage(save,0);syncSkillAttributes(save,attributes);assert.equal(calculateAttributes(attributes)[stat],job===2?375:345);
  resetSkillPage(save);syncSkillAttributes(save,attributes);assert.equal(calculateAttributes(attributes)[stat],300);
});

test("duas páginas, reset e validação de barra", () => {
  const state=emptyCity(); state.player.grades=40; const save=createSkills({},2,40);
  assert.throws(()=>switchSkillPage(save,1)); save.unlocked=true;
  learnSkill(save,state,20111); assert.throws(()=>learnSkill(save,state,20311),SkillError);
  switchSkillPage(save,1); syncSkills(save,state); assert.equal(state.hero.skill_point,20);
  switchSkillPage(save,0); syncSkills(save,state); assert.equal(state.hero.skill_point,17);
  resetSkillPage(save); syncSkills(save,state); assert.equal(state.hero.skill_point,20);
  assert.throws(()=>setSkillKeys(save,"207,207,-1,-1,-1,"));
});

test("descrições corrigidas por nível; tabelas de profissão avançada e original intactas", () => {
  const raw=readFileSync(join(projectRoot,"reference/quests/tempinfos.original.bin")), before=Buffer.from(raw);
  const local=localSkillTables(raw), a=inflateSync(raw.subarray(4)), b=inflateSync(local.subarray(4));
  const tables=(bytes:Buffer)=>{const result:Record<string,string>={};let p=4;while(p<bytes.length){const n=bytes[p++]!,name=bytes.subarray(p,p+n).toString();p+=n;const len=bytes.readUInt32BE(p);p+=4;result[name]=bytes.subarray(p,p+len).toString();p+=len;}return result;};
  const x=tables(a),y=tables(b);
  for(const name of Object.keys(x))if(!["SkillTempInfos","ConfigInfos","RuneTempInfos","SkillBufferTempInfos","SkillPropertyTempInfos"].includes(name))assert.equal(y[name],x[name]);
  const normalizeProperties=(text:string)=>text.replace(/<SkillPropertyTempInfo\s+[^>]*\/>/g,element=>concentrationAttackPercent(Number(element.match(/TemplateId="(\d+)"/)?.[1]))===undefined?element:element.replace(/Attack="[^"]*"/,''));
  assert.equal(normalizeProperties(x.SkillPropertyTempInfos!),normalizeProperties(y.SkillPropertyTempInfos!));
  for(const [id,percent]of [[20211,10],[20221,20],[20231,25]]) {
    assert.match(skillDescription(id!),new RegExp(`ataque físico em ${percent}%`));
    assert.match(y.SkillPropertyTempInfos!,new RegExp(`TemplateId="${id}"[^>]*Attack="${percent}"`));
  }
  const rows=(text:string)=>[...text.matchAll(/<SkillTempInfo\s+[^>]*\/>/g)].map(r=>r[0]);
  const old=rows(x.SkillTempInfos!), next=rows(y.SkillTempInfos!);
  assert.equal(old.length,next.length);
  for(let i=0;i<old.length;i++){const id=Number(old[i]!.match(/TemplateId="(\d+)"/)?.[1]);if(!basicSkills.has(id)&&!runeSkillDescription(id))assert.equal(next[i],old[i]);else assert.equal(next[i]!.replace(/Description="[^"]*"/,''),old[i]!.replace(/Description="[^"]*"/,''));}
  for(const name of ["RuneTempInfos","SkillBufferTempInfos"]) {
    const normalize=(text:string)=>text.replace(/<\w+\s+[^>]*\/>/g,element=>{
      const id=Number(element.match(name==="RuneTempInfos"?/TemplateId="(\d+)"/:/\bId="(\d+)"/)?.[1]);
      if(name==="RuneTempInfos")return runeDescription(id)?element.replace(/Description="[^"]*"/,''):element;
      if(isBlockHealingBuffer(id))return element.replace(/BufferName="[^"]*"/,'').replace(/ValuePercent="[^"]*"/,'');
      return runeBufferDescription(id)?element.replace(/BufferName="[^"]*"/,''):element;
    });
    assert.equal(normalize(y[name]!),normalize(x[name]!));
  }
  assert.match(skillDescription(30811),/\{Parameter1\}/); assert.doesNotMatch(skillDescription(30811),/85%/);
  assert.doesNotMatch(skillDescription(31211),/135%/); assert.ok(raw.equals(before));
});

async function setup(icon:number) {
  mkdirSync(join(projectRoot,".test-data"),{recursive:true}); const dir=mkdtempSync(join(projectRoot,".test-data","skills-")); mkdirSync(join(dir,"city"));
  copyFileSync(join(projectRoot,"data/city/scenario.json"),join(dir,"city/scenario.json"));
  const store=new Store(dir); await store.createUser("skills_test","password-123456",1981); store.initTutorialProfile(1981);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,nickname='Skills',sex=0,process=25000 WHERE user_id=1981").run(icon);
  const city=new CityWorld(store,1981); city.state.player.grades=10; delete city.saved.battle; city.persist();
  const send=(op:number,r:any={})=>city.handle(frame(op,1981,encodeMessage(city.scenario.outgoing[op]!,r)));
  return {city,store,send,close(){store.close();rmSync(dir,{recursive:true,force:true});}};
}
test("protocolo real: aprender, autoatalho, moeda, compra idempotente, troca, reset e relogar", async()=>{
  const s=await setup(2); try{
    assert.equal(s.city.state.hero.skill_point,3);
    s.send(5185,{skill_temp_id:20111,type:0}); assert.equal(s.city.state.hero.skill_point,2);
    s.city.state.player.grades=12;s.city.persist();
    const reply=s.send(5185,{skill_temp_id:21311,type:0});
    assert.ok(reply.some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===60));
    assert.equal(s.city.state.hero.fast_key,"207,208,213,-1,-1,");
    s.send(5167,{fast_key:"207,208,201,-1,-1,"}); assert.equal(s.city.state.hero.fast_key,"207,208,213,-1,-1,");
    s.city.state.player.grades=38; s.city.state.player.gift_token=500;s.city.state.player.point=300;s.city.persist();
    s.send(8479,{pay_type:0});assert.equal(s.city.state.player.gift_token,0);assert.equal(s.city.state.player.point,200);
    s.send(8479,{pay_type:0});assert.equal(s.city.state.player.point,200);
    s.send(8480,{index:1});assert.equal(s.city.state.hero.skill_point,19);assert.equal(s.city.state.hero.fast_key,"-1,-1,-1,-1,-1,");
    s.send(8480,{index:0});assert.ok(s.city.state.hero.skill_script.includes("21311"));
    s.send(5184,{pay_type:1,type:0});assert.equal(s.city.state.player.point,100);assert.equal(s.city.state.hero.skill_point,19);
    const reloaded=new CityWorld(s.store,1981);assert.equal(reloaded.state.hero.skill_index,0);assert.equal(reloaded.state.hero.is_activeSecond,true);assert.equal(reloaded.state.hero.skill_script,"");
    const relearn=reloaded.handle(frame(5185,1981,encodeMessage(reloaded.scenario.outgoing[5185]!,{skill_temp_id:20711,type:0})));
    assert.ok(relearn.some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===60));
    assert.equal(reloaded.state.hero.skill_point,18); assert.equal(reloaded.state.hero.fast_key,"207,-1,-1,-1,-1,");
    const again=new CityWorld(s.store,1981); assert.equal(again.state.hero.skill_script,"20711,"); assert.equal(again.state.hero.skill_point,18);
  }finally{s.close();}
});
