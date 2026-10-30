import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { emptyCity } from "../src/city-state.js";
import { AttributeCalculator, calculateAttributes, type AttributeState } from "../src/attributes.js";
import { CosmosFeature } from "../src/features/cosmos/feature.js";
import { initialCosmos } from "../src/features/cosmos/state.js";
import { templates, curve } from "../src/features/cosmos/content.js";
import { cosmosVisible } from "../src/features/cosmos/availability.js";
import { cosmosAttributeSource } from "../src/features/cosmos/attributes.js";
import { absorbXP, transferableXP } from "../src/features/cosmos/progression.js";
import { CurrencyLedger, CURRENCY_SCHEMA, currencyBalance, setCurrencyBalance } from "../src/features/currencies/index.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { protoInt } from "../src/protocol.js";
import { AssetCache } from "../src/assets.js";
import { Store } from "../src/store.js";
import { loadConfig, projectRoot } from "../src/config.js";
import { cosmosIconResource } from "../src/features/cosmos/resources.js";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

function fixture(level=80) {
  const db=new DatabaseSync(":memory:");
  db.exec(CURRENCY_SCHEMA);db.exec("CREATE TABLE gold_transactions(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,operation_id TEXT,at TEXT,reason TEXT,delta INTEGER,balance_before INTEGER,balance_after INTEGER,UNIQUE(user_id,operation_id))");
  const state=emptyCity();state.player={grades:level,point:1000,gift_token:1000};state.economy.gold_total_count=10000000;
  const saved:{cosmos?:ReturnType<typeof initialCosmos>;attributes:AttributeState;vip?:{level:number;expiresAt:number}}={attributes:{version:1,calculationVersion:2,sources:{}}};
  const feature=new CosmosFeature({state,saved,userId:19,ledger:new CurrencyLedger(db),now:()=>1000,persist(){},atomic(action){const before=structuredClone({state,saved});db.exec("SAVEPOINT t");try{const r=action();db.exec("RELEASE t");return r;}catch(e){db.exec("ROLLBACK TO t;RELEASE t");Object.assign(state,before.state);Object.assign(saved,before.saved);throw e;}}},()=>0.1);
  const call=(op:number,name:string,data:any)=>feature.handle(op,encodeMessage(typeName("star."+name),data));
  return {db,state,saved,feature,call};
}

test("cosmos: refinação acompanha cada slot comum, persiste e modifica a central",()=>{
  const f=fixture(20);try{
    const refine=(pos:number,type=1)=>f.call(8772,"AdditionInfoMsg",{pos,type});
    const first=f.feature.grant(205);
    f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:first.pos,end_star_type:2,end_pos:0});
    const response=refine(0)!;assert.deepEqual(f.feature.save.slots[0],{grade:1,xp:0});assert.equal(f.state.economy.gold_total_count,9000000);
    assert.equal(calculateAttributes(f.saved.attributes).total_phy_attack,654);
    const update=decodeMessage(typeName("star.StarAdditionMsg"),Buffer.from(response.find(p=>p.opcode===4677)!.body!,"base64"));assert.equal(update.additions[0].grade,1);
    refine(1);assert.throws(()=>refine(2),/slots comuns/);assert.throws(()=>refine(8),/slots comuns/);assert.throws(()=>refine(9),/slots comuns/);
    f.state.player.grades=80;
    for(let pos=0;pos<8;pos++) {
      f.state.player.grades=(pos+1)*10-1;
      if(pos>0)assert.throws(()=>refine(pos),/slots comuns/);
      f.state.player.grades=Math.max(18,(pos+1)*10);f.state.economy.gold_total_count=1000000000;
      while(f.feature.save.slots[pos]!.grade<10)refine(pos,10);
      assert.deepEqual(f.feature.save.slots[pos],{grade:10,xp:0});
      const gold=f.state.economy.gold_total_count;assert.throws(()=>refine(pos),/máximo/);assert.equal(f.state.economy.gold_total_count,gold);
    }
    assert.equal(calculateAttributes(f.saved.attributes).total_phy_attack,712);
    f.feature.save.slots[0]={grade:9,xp:1990};f.state.economy.gold_total_count=10000000;refine(0,10);assert.equal(f.state.economy.gold_total_count,9000000,"não cobrar tentativas restantes depois do máximo");
    f.feature.save.slots[0]={grade:0,xp:0};f.state.economy.gold_total_count=999999;assert.throws(()=>refine(0),/insuficiente/);assert.deepEqual(f.feature.save.slots[0],{grade:0,xp:0});
    const locked=structuredClone(f.feature.save.slots);f.saved.cosmos=JSON.parse(JSON.stringify(f.feature.save));assert.deepEqual(f.feature.save.slots,locked);
  }finally{f.db.close();}
});

test("cosmos: refinação adiciona percentuais na central, sem refinar slots especiais",()=>{
  const f=fixture(80);try{
    const effect=f.feature.grant(1605);effect.bag=2;effect.pos=0;effect.level=10;
    f.feature.save.slots[0]={grade:10,xp:0};f.feature.synchronize();
    assert.equal(AttributeCalculator.combat(f.saved.attributes)[0]!.magnitude,60);
    const compound=f.feature.grant(1907);compound.bag=2;compound.pos=9;f.feature.save.slots[9]={grade:10,xp:0};f.feature.synchronize();
    assert.equal(calculateAttributes(f.saved.attributes).total_penetrate,648);
  }finally{f.db.close();}
});

test("cosmos: dez receitas elevam e evoluem Sagrados no nível 80, sem profissão",()=>{
  for(const sourceId of [207,307,407,507,607,707,1507,1707,1807,1907]){
    const f=fixture(80);try{
      const star=f.feature.grant(sourceId);star.level=10;star.locked=true;
      const call=(op_type:number,item_count=0)=>f.call(5182,"StarGrowOpMsg",{op_type,item_count});
      f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:star.pos,end_star_type:3,end_pos:0});
      assert.equal(f.feature.at(3,0)?.previousBag,1);
      call(0);assert.equal(f.feature.at(3,0)?.templateId,sourceId+1);assert.equal(f.feature.at(3,0)?.level,1);assert.equal(f.feature.at(3,0)?.locked,true);
      setCurrencyBalance(f.state,"illusionDust",1000000);call(1,5000);assert.equal(f.feature.at(3,0)?.level,2);assert.equal(currencyBalance(f.state,"illusionDust"),995000);
      call(1,1000000);assert.equal(f.feature.at(3,0)?.level,10);assert.equal(currencyBalance(f.state,"illusionDust"),707000);assert.equal(f.feature.at(3,0)?.xp,0);
      const dust=currencyBalance(f.state,"illusionDust");assert.throws(()=>call(1,1),/máximo/);assert.equal(currencyBalance(f.state,"illusionDust"),dust);
      f.call(8267,"StarMoveReqMsg",{begin_star_type:3,begin_pos:0,end_star_type:1,end_pos:0});
      const slot=sourceId>=1707?9:0;
      f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:0,end_star_type:2,end_pos:slot});
      const row=templates.get(sourceId+1)!;
      if(Number(row.MagicAttack))assert.equal(calculateAttributes(f.saved.attributes).total_magic_attack,Number(row.MagicAttack)*10);
      if(Number(row.Penetrate))assert.equal(calculateAttributes(f.saved.attributes).total_penetrate,Number(row.Penetrate)*10);
    }finally{f.db.close();}
  }
});

test("cosmos: elevação recusa nível, receita inválida e saldo insuficiente sem perdas",()=>{
  const f=fixture(79);try{
    const star=f.feature.grant(207);star.level=10;
    const move=()=>f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:star.pos,end_star_type:3,end_pos:0});
    assert.throws(move,/nível 80/);f.state.player.grades=80;move();
    f.call(5182,"StarGrowOpMsg",{op_type:0});
    const before=structuredClone(f.feature.save);assert.throws(()=>f.call(5182,"StarGrowOpMsg",{op_type:1,item_count:5000}),/insuficiente/);assert.deepEqual(f.feature.save,before);
    assert.throws(()=>f.call(5182,"StarGrowOpMsg",{op_type:1,item_count:-1}),/quantidade válida/);
    assert.throws(()=>f.call(5182,"StarGrowOpMsg",{op_type:0}),/elevação exige/);
    f.call(8267,"StarMoveReqMsg",{begin_star_type:3,begin_pos:0,end_star_type:1,end_pos:0});
    const invalid=f.feature.grant(107);invalid.level=10;
    assert.throws(()=>f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:invalid.pos,end_star_type:3,end_pos:0}),/elegível/);
  }finally{f.db.close();}
});

test("cosmos: elevação preserva o slot de origem ao retornar, inclusive penetração",()=>{
  for(const [id,slot]of [[407,3],[1907,9]]){
    const f=fixture(80);try{
      const star=f.feature.grant(id!);star.level=10;
      f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:star.pos,end_star_type:2,end_pos:slot});
      f.call(8267,"StarMoveReqMsg",{begin_star_type:2,begin_pos:slot,end_star_type:3,end_pos:0});
      assert.equal(f.feature.at(3,0)?.previousPos,slot);assert.match(f.feature.xml(),/oldBagType="2"/);
      f.call(5182,"StarGrowOpMsg",{op_type:0});f.saved.cosmos=JSON.parse(JSON.stringify(f.feature.save));
      f.call(8267,"StarMoveReqMsg",{begin_star_type:3,begin_pos:0,end_star_type:2,end_pos:0});
      assert.equal(f.feature.at(2,slot!)?.templateId,id!+1);assert.equal(f.feature.at(2,slot!)?.previousBag,undefined);
    }finally{f.db.close();}
  }
});
test("cosmos: somente equipados fornecem atributos centrais; todas as qualidades comuns e níveis",()=>{
  const save=initialCosmos();
  for(const row of templates.values()){
    const profile=Number(row.Profile);if([1,6,8].includes(profile)||!cosmosVisible(row))continue;
    for(const level of [1,5,10]){
      save.instances={1:{id:1,templateId:Number(row.TemplateId),bag:1,pos:0,level,xp:0,locked:false}};
      assert.deepEqual(AttributeCalculator.sourceValues(cosmosAttributeSource(save,()=>true)),{});
      save.instances[1]!.bag=2;
      const source=cosmosAttributeSource(save,()=>true), ledger:AttributeState={version:1,sources:{cosmos:source}};
      const panel=calculateAttributes(ledger), effects=AttributeCalculator.combat(ledger);
      if(Number(row.Attack))assert.equal(panel.total_phy_attack,Number(row.Attack)*level);
      if(Number(row.Captain))assert.equal(panel.total_conat_army,Number(row.Captain)*level);
      if(row.DefaultSkill)assert.equal(effects.length,1,row.TemplateName);
      assert.deepEqual(AttributeCalculator.sourceValues(cosmosAttributeSource(save,()=>false)),{});
    }
  }
});
test("cosmos: percentuais e efeitos condicionais chegam à central sem teto de cura/reflexão ou atributos falsos",()=>{
  const expected:Record<number,[string,number,number?]>={1014:["lifeSteal",20],1015:["lifeSteal",50],1104:["reflect",20],1105:["reflect",50],1205:["damageImmunityChance",20],1305:["damageReductionPercent",30],1405:["criticalAvoidancePoints",50],1605:["criticalDamageBonusPercent",50]};
  for(const [id,[kind,magnitude,cap]]of Object.entries(expected)){
    const s=initialCosmos();s.instances[1]={id:1,templateId:Number(id),bag:2,pos:0,level:10,xp:0,locked:false};
    const ledger:AttributeState={version:1,sources:{cosmos:cosmosAttributeSource(s,()=>true)}};
    const m=AttributeCalculator.combat(ledger)[0]!;
    assert.equal(m.kind,kind);assert.equal(m.magnitude,magnitude);assert.equal(m.cap,cap);
    assert.deepEqual(calculateAttributes(ledger),{fighting_capacity:0});
    if([1014,1015,1104,1105].includes(Number(id))){assert.equal(m.chance,10);assert.equal("cap" in m,false);assert.equal(m.trigger,kind==="lifeSteal"?"onAttack":"onDamageReceived");assert.equal(m.basis,kind==="lifeSteal"?"damageDealt":"damageReceived");}
    if(Number(id)===1205){assert.equal(m.chance,20);assert.equal(m.trigger,"onDamageReceived");}
  }
});
test("cosmos: absorção recupera todo investimento, segue curvas e protege cadeados",()=>{
  const f=fixture();try{
    for(const profile of [2,3,4,5,7]){
      const row=[...templates.values()].find(row=>Number(row.Profile)===profile)!;
      const star={id:1,templateId:Number(row.TemplateId),bag:1 as const,pos:0,level:1,xp:0,locked:false};
      const xp=curve(profile).reduce((sum,row)=>sum+Number(row.Data),0);
      absorbXP(star,xp+15);assert.equal(star.level,10);assert.equal(star.xp,15);assert.equal(transferableXP(star),xp+15+Number(row.SellGp));
    }
    const target=f.feature.grant(205),victim=f.feature.grant(5);victim.locked=true;
    const move={begin_star_type:1,begin_pos:victim.pos,end_star_type:1,end_pos:target.pos,eat:1,count:1};
    assert.throws(()=>f.call(8267,"StarMoveReqMsg",move),/Absorção inválida/);
    f.feature.save.instances[victim.id]!.locked=false;
    f.call(8267,"StarMoveReqMsg",move);assert.equal(f.feature.save.instances[victim.id],undefined);assert.ok(f.feature.save.instances[target.id]!.level>1);
  }finally{f.db.close();}
});
test("cosmos: equipamento valida família, nível, material e nono slot",()=>{
  const f=fixture(60);try{
    const first=f.feature.grant(205),second=f.feature.grant(207),material=f.feature.grant(5),compound=f.feature.grant(1705);
    const equip=(pos:number,slot:number)=>f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:pos,end_star_type:2,end_pos:slot,count:1});
    equip(first.pos,0);assert.equal(calculateAttributes(f.saved.attributes).total_phy_attack,648);
    assert.throws(()=>equip(second.pos,1),/família/);assert.throws(()=>equip(material.pos,1),/não pode/);assert.throws(()=>equip(compound.pos,1),/composto/);assert.throws(()=>equip(compound.pos,8),/bloqueado/);
    f.state.quests[1802]={is_complete:1,is_accept:0};equip(compound.pos,8);
    assert.equal(calculateAttributes(f.saved.attributes).total_penetrate,432);
    assert.throws(()=>equip(second.pos,9),/nível 80/);assert.throws(()=>f.feature.grant(208),/Sagrado/);
    assert.throws(()=>f.feature.handle(8772,protoInt(1,9)),/slots comuns/);assert.throws(()=>f.feature.handle(5182,protoInt(1,0)),/nível 80/);
  }finally{f.db.close();}
});

test("cosmos: décimo slot abre somente no nível 80, sem profissão ou missão do nono",()=>{
  const f=fixture(79);try{
    const star=f.feature.grant(1705);
    const equip=()=>f.call(8267,"StarMoveReqMsg",{begin_star_type:1,begin_pos:star.pos,end_star_type:2,end_pos:9,count:1});
    assert.equal(f.feature.slotOpen(8),false);assert.equal(f.feature.slotOpen(9),false);
    assert.throws(equip,/nível 80/);assert.equal(f.feature.at(1,star.pos)?.id,star.id);
    f.state.player.grades=80;assert.equal(f.feature.slotOpen(8),false);assert.equal(f.feature.slotOpen(9),true);
    equip();assert.equal(f.feature.at(2,9)?.id,star.id);
    assert.ok(calculateAttributes(f.saved.attributes).total_penetrate!>0);
    const saved=JSON.stringify(f.feature.save);f.saved.cosmos=JSON.parse(saved);f.feature.synchronize();
    assert.equal(f.feature.at(2,9)?.id,star.id);assert.ok(calculateAttributes(f.saved.attributes).total_penetrate!>0);
    f.state.player.grades=79;f.feature.synchronize();assert.equal(calculateAttributes(f.saved.attributes).total_penetrate??0,0);
    assert.equal(f.feature.slotOpen(-1),false);assert.equal(f.feature.slotOpen(10),false);
  }finally{f.db.close();}
});

test("cosmos: penetração adicional não conflita entre compostos diferentes nem com Cosmos simples",()=>{
  for(const pair of [[1707,1807],[1707,1907],[1807,1907]]) {
    const f=fixture(80);try{
      f.state.quests[1802]={is_complete:1,is_accept:0};
      const equip=(star:ReturnType<CosmosFeature["grant"]>,slot:number)=>{const current=f.feature.save.instances[star.id]!;return f.call(8267,"StarMoveReqMsg",{begin_star_type:current.bag,begin_pos:current.pos,end_star_type:2,end_pos:slot,count:1});};
      for(const [slot,id] of [207,407,607].entries())equip(f.feature.grant(id),slot);
      const first=f.feature.grant(pair[0]!),second=f.feature.grant(pair[1]!);
      assert.throws(()=>equip(first,3),/slot avançado/);
      equip(first,8);equip(second,9);
      assert.equal(f.feature.at(2,8)?.templateId,pair[0]);assert.equal(f.feature.at(2,9)?.templateId,pair[1]);
      assert.equal(calculateAttributes(f.saved.attributes).total_penetrate,1296);
      const duplicate=f.feature.grant(pair[0]!-2);
      assert.throws(()=>equip(duplicate,9),/família/);
      assert.equal(f.feature.at(2,9)?.id,second.id);
      equip(first,9);assert.equal(f.feature.at(2,8)?.id,second.id);assert.equal(f.feature.at(2,9)?.id,first.id);
    }finally{f.db.close();}
  }
});
test("cosmos: recolher/vender, ouro central, expansão, loja e sorteio em protocolo real",()=>{
  const f=fixture();try{
    const before=f.state.economy.gold_total_count;
    f.call(8269,"StarRandReqMsg",{site:0});assert.equal(f.state.economy.gold_total_count,before);assert.equal(f.feature.save.free,0);assert.equal(f.feature.save.points,1);
    const first=f.feature.all.find(row=>row.bag===0)!;
    f.call(8268,"StarPickReqMsg",{dropsite:first.pos,way:2});assert.equal(f.feature.all.length,0);
    const result=f.call(8269,"StarRandReqMsg",{site:0})!;
    assert.equal(f.state.economy.gold_total_count,before+Number(templates.get(first.templateId)!.SellGold)-4000);
    const decoded=decodeMessage(typeName("star.StarRandRspMsg"),Buffer.from(result.find(p=>p.opcode===4180)!.body!,"base64"));assert.ok(decoded.starRand.length);assert.equal(decoded.site.length,5);
    assert.ok(f.db.prepare("SELECT * FROM currency_transactions WHERE reason='cosmos:astrology'").get());
    f.feature.save.points=10000;f.call(8341,"StarShopMsg",{good_id:205});assert.ok(f.feature.all.some(row=>row.bag===1&&row.templateId===205));assert.equal(f.feature.save.points,3000);
    f.feature.handle(8270,encodeMessage(typeName("player.PayTypeMsg"),{pay_type:0}));assert.equal(f.feature.save.bagExtra,6);assert.equal(f.state.player.gift_token,900);
    assert.throws(()=>f.feature.handle(8270,Buffer.alloc(0)),/Limite/);
  }finally{f.db.close();}
});
test("cosmos: automático respeita orçamento, slots, filtros e requisitos da interface atual",()=>{
  const f=fixture(40);try{
    assert.throws(()=>f.call(8876,"StarVipEventMsg",{golden:100000,sell_max_quality:1,compose_max_quality:5}),/VIP 2/);
    assert.throws(()=>f.call(8269,"StarRandReqMsg",{site:-1}),/VIP 1/);
    f.saved.vip={level:2,expiresAt:2000};
    f.call(8876,"StarVipEventMsg",{golden:100000,sell_max_quality:1,compose_max_quality:5});
    const debited=f.db.prepare("SELECT SUM(-delta) AS amount FROM currency_transactions WHERE reason='cosmos:astrology'").get()!;
    assert.ok(Number(debited.amount)>0&&Number(debited.amount)<=100000);
    assert.ok(f.feature.all.filter(row=>row.bag===0).length<=18);assert.ok(f.feature.save.points>0);
    assert.throws(()=>f.call(8876,"StarVipEventMsg",{golden:1,sell_max_quality:1,compose_max_quality:5}),/Configuração/);
    delete f.saved.vip;f.state.player.grades=80;
    f.call(8269,"StarRandReqMsg",{site:-1});
    assert.ok(f.feature.all.length>0);
  }finally{f.db.close();}
});
test("cosmos: astrologia e cadeado atualizam objetivos ativos sem conceder conclusão antecipada",()=>{
  const f=fixture(60);try{
    f.state.quests[3]={is_accept:1,is_complete:0,condition_1:0};f.state.quests[1802]={is_accept:1,is_complete:0,condition_1:998};
    f.state.quests[623]={is_accept:1,is_complete:0,condition_1:0};
    f.call(8269,"StarRandReqMsg",{site:0});assert.equal(f.state.quests[3]!.is_complete,1);assert.equal(f.state.quests[1802]!.condition_1,999);assert.equal(f.feature.slotOpen(8),false);
    f.call(8269,"StarRandReqMsg",{site:0});assert.equal(f.state.quests[1802]!.is_complete,1);assert.equal(f.feature.slotOpen(8),false,"precisa resgatar a missão, não apenas cumprir a condição");
    const star=f.feature.grant(205);f.call(8330,"StarLockReqMsg",{star_type:1,pos:star.pos});assert.equal(f.state.quests[623]!.is_complete,1);assert.equal(f.feature.save.instances[star.id]!.locked,true);
  }finally{f.db.close();}
});
test("cosmos: ocultos são arquivados sem perder XP e não podem ser obtidos pela loja ou sorteios",()=>{
  const f=fixture(80);try{
    const hidden={id:200,templateId:1005,bag:2 as const,pos:0,level:7,xp:9234,locked:true};
    f.feature.save.instances[200]=structuredClone(hidden);f.feature.synchronize();
    assert.deepEqual(f.feature.save.suspended?.[200],hidden);assert.equal(f.feature.save.instances[200],undefined);assert.equal(f.feature.xml().includes('tempId="1005"'),false);
    assert.throws(()=>f.feature.grant(1005),/indisponível/);assert.throws(()=>f.feature.grant(805),/indisponível/);
    f.feature.save.points=100000;assert.throws(()=>f.call(8341,"StarShopMsg",{good_id:1005}),/indisponível/);
    const again=structuredClone(f.feature.save);f.feature.synchronize();assert.deepEqual(f.feature.save,again);
    f.call(8876,"StarVipEventMsg",{golden:100000,sell_max_quality:1,compose_max_quality:5});
    assert.ok(f.feature.all.length>0);assert.ok(f.feature.all.every(row=>cosmosVisible(templates.get(row.templateId))));assert.deepEqual(f.feature.save.suspended?.[200],hidden);
  }finally{f.db.close();}
});
test("cosmos: ícones locais resolvem barras duplicadas e sufixos de versão com SHA válido",async()=>{
  const base=join(projectRoot,".test-data");mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,"cosmos-icons-"));const store=new Store(dir);
  try{
    const cache=new AssetCache({...loadConfig(),dataDir:dir,resourceMode:"offline"},store),bytes=Buffer.from("FWS-icon-test"),hash=createHash("sha256").update(bytes).digest("hex");
    mkdirSync(join(dir,"assets/objects"),{recursive:true});writeFileSync(join(dir,"assets/objects",hash+".bin"),bytes);
    store.db.prepare("INSERT INTO assets VALUES(?,?,?,?,?,?)").run("cosmo-icon","/cdn/icon/star/205.swf",bytes.length,hash,"application/octet-stream",new Date().toISOString());
    assert.equal((await cosmosIconResource(cache,"/cdn/icon//star/205_12345678.swf"))?.sha256,hash);
    assert.equal(await cosmosIconResource(cache,"/cdn/5_12345678.png"),undefined);
    writeFileSync(join(dir,"assets/objects",hash+".bin"),"corrupted");assert.equal(await cosmosIconResource(cache,"/cdn/icon//star/205.swf"),undefined);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
