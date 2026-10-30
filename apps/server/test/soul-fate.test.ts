import {test} from "node:test";import assert from "node:assert/strict";import {DatabaseSync} from "node:sqlite";
import {emptyCity} from "../src/city-state.js";import {Inventory} from "../src/inventory.js";
import {synchronizeAdvancedSoul,upgradeAdvancedSoul,remainingAdvancedSoul,advancedSoulPercent} from "../src/features/soul-seal/index.js";
import {upgradeSoul,soulPercent,soulLevels} from "../src/features/equipment/gems.js";
import {FateFeature,fateTotalXP,fateLevel,fateBonuses,type FateSave} from "../src/features/fate/index.js";
import {CurrencyLedger,CURRENCY_SCHEMA} from "../src/features/currencies/index.js";
import {encodeMessage,decodeMessage,typeName} from "../src/messages.js";import {AttributeCalculator,type AttributeState} from "../src/attributes.js";
import {createEngine,makeActor,execute,type Actor,type Engine} from "../src/features/battle/engine.js";
import type {CalculatedCombatModifier} from "../src/features/attributes/combat-modifiers.js";
function fixture(level=80){const db=new DatabaseSync(":memory:");db.exec(CURRENCY_SCHEMA);const state=emptyCity();state.player={grades:level,point:1000000,gift_token:1000000};const ids={nextId:100};let now=1900000000000;
  const saved:{fate?:FateSave;attributes:AttributeState}={attributes:{version:1,sources:{}}};
  const inv=()=>new Inventory(state.items,ids,100,{usable:i=>!i.is_locked});
  const feature=new FateFeature({state,saved,userId:12,ledger:new CurrencyLedger(db),inventory:inv,now:()=>now,persist(){feature.synchronize();},atomic(action){const snapshot=structuredClone({state,saved,ids});db.exec("SAVEPOINT fate");try{const r=action();db.exec("RELEASE fate");return r;}catch(e){db.exec("ROLLBACK TO fate; RELEASE fate");Object.assign(state,snapshot.state);delete saved.fate;Object.assign(saved,snapshot.saved);Object.assign(ids,snapshot.ids);throw e;}}},()=>0);
  const call=(op:number,r={})=>feature.handle(op,encodeMessage(typeName("fate.FateEditMsg"),r))!;
  const add=(template:number,count:number)=>inv().add({template_id:template,bag_type:1,object_id:0,pos:0,exist:1},count);
  return{db,state,saved,inv,feature,call,add,advanceDay(){now+=86400000;}};
}
test("selo avançado: mantém curva comum, libera 80/80 e evolui 20 níveis por 14400 itens",()=>{
 const f=fixture();try{const p=f.state.player;p.storeGrade=79;p.storeGp=0;synchronizeAdvancedSoul(p);assert.equal(p.seniorStoreGrade,undefined);f.add(208031,14410);
 assert.throws(()=>upgradeAdvancedSoul(f.inv(),p,{templateId:208031,count:720}),/comum nível 80/);
 p.storeGrade=80;p.grades=79;assert.throws(()=>upgradeAdvancedSoul(f.inv(),p,{templateId:208031,count:720}),/personagem nível 80/);p.grades=80;synchronizeAdvancedSoul(p);assert.equal(p.seniorStoreGrade,80);assert.equal(remainingAdvancedSoul(p),14400);
 for(let level=81;level<=100;level++){upgradeAdvancedSoul(f.inv(),p,{templateId:208031,count:720});assert.equal(p.seniorStoreGrade,level);assert.equal(advancedSoulPercent(level),400+5*(level-80));assert.equal(p.storeGrade,80);}
 assert.equal(f.inv().countTemplate(208031),10);assert.equal(remainingAdvancedSoul(p),0);assert.throws(()=>upgradeAdvancedSoul(f.inv(),p,{templateId:208031,count:1}),/100/);
 assert.equal(soulPercent(50),200);assert.equal(soulPercent(70),320);assert.equal(soulPercent(80),400);assert.equal(soulLevels.get(80),5500);
 assert.throws(()=>upgradeSoul(f.inv(),p,{templateId:208031,count:1}),/inválidos/);
 }finally{f.db.close();}
});
test("selo avançado: parcial, múltiplas pilhas, máximo sem excesso e proteção de materiais",()=>{
 const f=fixture();try{const p=f.state.player;Object.assign(p,{storeGrade:80,storeGp:17});synchronizeAdvancedSoul(p);f.add(208031,3);f.state.items["1:0:1"]={...f.state.items["1:0:0"],id:101,pos:1,count:20000};
 upgradeAdvancedSoul(f.inv(),p,{templateId:208031,count:719});assert.equal(p.seniorStoreGrade,80);assert.equal(p.seniorStoreGp,719);assert.equal(f.state.items["1:0:0"],undefined);
 const used=upgradeAdvancedSoul(f.inv(),p,{templateId:208031,count:20000});assert.equal(used,13681);assert.equal(p.seniorStoreGrade,100);assert.equal(p.seniorStoreGp,0);assert.equal(p.storeGp,17);
 }finally{f.db.close();}
});
test("destino: máximo das três linhas, valores finais, persistência e atributos inertes",()=>{
 const f=fixture();try{assert.equal(fateTotalXP,26735);for(const[type,item]of [[2000,208024],[2200,211001],[2100,3300101]]){f.add(item!,26735);f.call(8626,{skill_sonType:type,use_itemCount:26735});assert.equal(fateLevel(f.feature.save.lines.find(l=>l.type===type)!.xp),30);}
 const result=AttributeCalculator.calculate(f.saved.attributes);assert.equal(result.total_phy_attack,14000);assert.equal(result.total_magic_attack,14000);assert.equal(result.total_live,140000);assert.equal(result.total_strength,14000);assert.equal(result.total_tenacity,14000);assert.equal(result.total_stunAttr,30000);
 const mods=AttributeCalculator.combat(f.saved.attributes);assert.equal(mods.length,3);assert.ok(mods.every(m=>m.chance===20&&m.magnitude===30));
 const before=structuredClone(f.state);assert.throws(()=>f.call(8626,{skill_sonType:2000,use_itemCount:1}),/máximo/);assert.deepEqual(f.state,before);
 f.saved.fate=JSON.parse(JSON.stringify(f.feature.save));const packet=f.call(8628)[0]!;const body=decodeMessage(typeName("fate.FateListMsg"),Buffer.from(packet.body!,"base64"));assert.equal(body.fateInfo.length,3);assert.ok(body.fateInfo.every((r:any)=>r.grades===30&&Number(r.total_gp)===26735));
 assert.equal(fateBonuses(2200,20).total_strength,8400);assert.equal(fateBonuses(2200,21).total_strength,8960);
 }finally{f.db.close();}
});
test("destino: gratuito por dia/linha, custos progressivos, vinculados e exclusão dos prêmios",()=>{
 const f=fixture();try{const spin=(index=1,extra={})=>f.call(8627,{index,turn_num:1,pay_type:2,...extra});spin();assert.equal(f.state.player.gift_token,1000000);spin();assert.equal(f.state.player.gift_token,999990);spin(1,{is_disable:true});assert.equal(f.state.player.gift_token,999850);assert.equal(f.inv().countTemplate(208024),10);
 spin(2);assert.equal(f.state.player.gift_token,999850);f.advanceDay();spin();assert.equal(f.feature.save.lines[0]!.turns,1);
 f.state.player.point=0;f.state.player.gift_token=0;const before=structuredClone({state:f.state,saved:f.saved});assert.throws(()=>spin(),/insuficiente/);assert.deepEqual({state:f.state,saved:f.saved},before);
 assert.throws(()=>f.call(8626,{skill_sonType:2222,use_itemCount:3}),/inválida/);assert.throws(()=>f.call(8627,{index:1,turn_num:100,pay_type:2}),/inválido/);
 }finally{f.db.close();}
});
test("destino: nível 55, débito de pilhas e rollback da compra com mochila cheia",()=>{
 const f=fixture(54);try{assert.throws(()=>f.call(8626,{skill_sonType:2000,use_itemCount:1}),/55/);f.state.player.grades=55;for(let i=0;i<100;i++)f.state.items[`1:0:${i}`]={id:100+i,template_id:208031,bag_type:1,object_id:0,pos:i,count:9999};
 const before=structuredClone({state:f.state,saved:f.saved});assert.throws(()=>f.call(8627,{index:1,turn_num:10,pay_type:1}),/espaço|cheia|livre/i);assert.deepEqual({state:f.state,saved:f.saved},before);
 }finally{f.db.close();}
});
const modifier=(kind:CalculatedCombatModifier["kind"]):CalculatedCombatModifier=>({kind,source:"fate",origin:{instanceId:1,templateId:2000,bufferId:2030,slot:0},level:1,refinement:0,value:0,percent:30,chance:100,magnitude:30});
function battle(kind:CalculatedCombatModifier["kind"],pvp=true){const actor=(id:number,side:number):Actor=>makeActor({living_id:id,temp_id:1,side,pos:1,init_hp:1000000,skillId:[10000]},{attack:1000,magicAttack:1000,defence:500,magicDefence:500,level:80});const a=actor(3,1),b=actor(6,2);(kind==="fateIgnoreDefence"?a:b).permanentModifiers=[modifier(kind)];return createEngine([a,b],3,7,pvp?[3,6]:[3]);}
const attack=(e:Engine)=>execute(e,{actor:3,skill:10000,targets:[6],sequence:1,automatic:false},1900000000000);
test("destino PVP: debuff após o ataque, um ataque posterior, sem modificar PVE",()=>{
 const e=battle("fateIgnoreDefence"),base=battle("fateIgnoreDefence");base.actors[0]!.permanentModifiers=[];
 const first=attack(e),normal=attack(base);assert.deepEqual(first.damages,normal.damages);assert.equal(e.effects.filter(b=>b.fate).length,2);assert.ok(first.buffers.some(b=>b.see_type===0&&b.target_id===6));
 e.actors[0]!.permanentModifiers=[];const second=attack(e);assert.ok(second.damages[0]!.damage_value>normal.damages[0]!.damage_value);assert.equal(e.effects.filter(b=>b.fate).length,0);
 const pve=battle("fateIgnoreDefence",false);attack(pve);assert.equal(pve.effects.length,0);
});
test("destino PVP: redução e reflexão só atuam no próximo ataque, sem recursão",()=>{
 for(const kind of ["fateReduction","fateReflect"] as const){const e=battle(kind),base=battle(kind);base.actors[1]!.permanentModifiers=[];const first=attack(e),normal=attack(base);assert.deepEqual(first.damages,normal.damages);assert.equal(e.actors[0]!.hp,1000000);assert.equal(e.effects.length,1);e.actors[1]!.permanentModifiers=[];const next=attack(e);if(kind==="fateReduction")assert.ok(next.damages[0]!.damage_value<normal.damages[0]!.damage_value);else assert.ok(e.actors[0]!.hp<1000000);assert.equal(e.effects.length,0);}
});
