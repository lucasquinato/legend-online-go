import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {emptyCity} from "../src/city-state.js";
import {Inventory} from "../src/inventory.js";
import {TattooFeature,tattooSchemas,type TattooSave} from "../src/features/tattoo/index.js";
import {unlockedSlots} from "../src/features/tattoo/content.js";
import {AttributeCalculator,calculateAttributes,type AttributeState} from "../src/attributes.js";
import {CurrencyLedger,CURRENCY_SCHEMA,currencyBalance} from "../src/features/currencies/index.js";
import {encodeMessage,decodeMessage} from "../src/messages.js";

function fixture(level=80,roll=(max:number)=>0){
  const db=new DatabaseSync(":memory:");db.exec(CURRENCY_SCHEMA);
  const state=emptyCity();state.player={grades:level,point:1000000,gift_token:1000000};
  const saved:{tattoo?:TattooSave;attributes:AttributeState;battle?:{finished:boolean}}={attributes:{version:1,sources:{natural:{kind:"natural",evidence:"local-balance",values:{total_power:1000,total_intellect:1000,total_agility:1000,total_captain:1000,total_physique:1000}}}}};
  const ids={nextId:100};let fail=false;
  const context={state,saved,userId:5,ledger:new CurrencyLedger(db),inventory:()=>new Inventory(state.items,ids,100,{usable:i=>!i.is_locked}),persist(){if(fail)throw Error("save rejected");feature.synchronize();},atomic<T>(action:()=>T):T{const snapshot=structuredClone({state,saved,ids});db.exec("SAVEPOINT tattoo");try{const result=action();db.exec("RELEASE tattoo");return result;}catch(error){db.exec("ROLLBACK TO tattoo; RELEASE tattoo");Object.assign(state,snapshot.state);delete saved.tattoo;Object.assign(saved,snapshot.saved);Object.assign(ids,snapshot.ids);throw error;}}};
  const feature=new TattooFeature(context,roll);
  const call=(op:number,r:any)=>feature.handle(op,encodeMessage(tattooSchemas[op as 9568|9603],r))!;
  const wash=(hole=1,type=2,extra={})=>call(9568,{opType:2,param1:type,param2:hole,...extra});
  const apply=(hole=1)=>call(9568,{opType:3,param2:hole});
  const add=(template=208102,count=9999,pos=0)=>context.inventory().add({template_id:template,bag_type:1,object_id:0,pos,is_locked:false},count);
  return {db,state,saved,feature,call,wash,apply,add,setFail:()=>{fail=true;}};
}

test("tattoo: libera oito espaços exclusivamente por nível e gravações no 80",()=>{
  const f=fixture();try{
    for(const [level,count] of [[69,0],[70,2],[71,2],[72,4],[73,4],[74,5],[76,6],[78,7],[80,8]]){
      f.state.player.grades=level;assert.equal(unlockedSlots(level!),count);
      const query=f.call(9568,{opType:1});const body=decodeMessage(tattooSchemas[274],Buffer.from(query[0]!.body!,"base64"));assert.equal((body.holeInfo??[]).length,count);
      assert.throws(()=>f.wash(count!+1),/bloqueado/);
    }
    f.state.player.grades=79;assert.throws(()=>f.call(9603,{holeId:1,wish:false}),/nível 80/);
    assert.equal((f.state.player as any).vocationGrades,undefined);
  }finally{f.db.close();}
});

test("tattoo: consome em ordem, proposta não dá atributos, confirmação substitui sem acumular",()=>{
  const f=fixture();try{
    f.add(208102,9999);f.state.items["1:0:0"]!.count=3;f.add(208102,9999); // add merges: create an explicit second visible stack
    f.state.items={"1:0:0":{id:100,template_id:208102,bag_type:1,pos:0,count:3},"1:0:1":{id:101,template_id:208102,bag_type:1,pos:1,count:9984}};
    const before=calculateAttributes(f.saved.attributes);const packets=f.wash();assert.equal(f.state.items["1:0:0"],undefined);assert.equal(f.state.items["1:0:1"]!.count,9887);
    assert.deepEqual(calculateAttributes(f.saved.attributes),before);
    const delta=decodeMessage(tattooSchemas[274],Buffer.from(packets[0]!.body!,"base64"));assert.equal(delta.holeInfo[0].newAddingValue,21);assert.equal(delta.holeInfo[0].newReduceValue,-1);
    f.apply();assert.equal(calculateAttributes(f.saved.attributes).total_power,1021);assert.equal(calculateAttributes(f.saved.attributes).total_agility,999);
    const snapshot=JSON.parse(JSON.stringify(f.feature.save));f.saved.tattoo=snapshot;f.wash();assert.equal(calculateAttributes(f.saved.attributes).total_power,1021);f.apply();assert.equal(calculateAttributes(f.saved.attributes).total_power,1042);
    assert.throws(()=>f.apply(),/proposta/);assert.equal(f.feature.save.holes[0]!.applied!.plus,42);
  }finally{f.db.close();}
});

test("tattoo: travas, compra automática e falha de persistência são atômicas",()=>{
  const f=fixture();try{
    f.add();f.wash();f.apply();
    const old=f.feature.save.holes[0]!.applied!,bound=currencyBalance(f.state,"boundDiamonds");
    f.wash(1,2,{refresh_lock_add:true,refresh_lock_minus:true,lock_pay_type:2});assert.equal(currencyBalance(f.state,"boundDiamonds"),bound-20);assert.equal(f.feature.save.holes[0]!.proposal!.add,old.add);assert.equal(f.feature.save.holes[0]!.proposal!.reduce,old.reduce);
    f.state.items={};f.state.player.point=299;const before=structuredClone({state:f.state,saved:f.saved});assert.throws(()=>f.wash(1,2,{auto_buy:true,material_pay_type:1}),/insuficiente/);assert.deepEqual({state:f.state,saved:f.saved},before);
    f.state.player.point=300;f.wash(1,2,{auto_buy:true,material_pay_type:1});assert.equal(f.state.player.point,0);
    f.add();f.setFail();const snapshot=structuredClone({state:f.state,saved:f.saved}),n=f.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n;
    assert.throws(()=>f.wash(1,2,{refresh_lock_add:true,lock_pay_type:2}),/save rejected/);assert.deepEqual({state:f.state,saved:f.saved},snapshot);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n,n);
  }finally{f.db.close();}
});

test("tattoo: gravação segue tabela, respeita nível máximo e afeta somente sua própria fonte",()=>{
  const f=fixture();try{
    f.add();f.wash();f.apply();f.add(208056,9999);
    f.saved.attributes.sources.fashion={kind:"permanent",evidence:"recovered-table",values:{total_power:400}};
    for(let slot=1;slot<=4;slot++)for(let level=0;level<10;level++)f.call(9603,{holeId:slot,wish:true});
    assert.equal(f.state.player.point,980000);assert.equal(f.feature.save.engravings[0]!.level,10);
    assert.equal(AttributeCalculator.sourceValues(f.saved.attributes.sources.tattoo!).total_power,31);
    assert.equal(calculateAttributes(f.saved.attributes).total_power,1431);assert.equal(calculateAttributes(f.saved.attributes).total_agility,999);
    assert.deepEqual(f.saved.attributes.sources.fashion.values,{total_power:400});
    const state=structuredClone(f.state);assert.throws(()=>f.call(9603,{holeId:1,wish:true}),/máximo/);assert.deepEqual(f.state,state);
  }finally{f.db.close();}
});

test("tattoo: falha de gravação preserva nível e consome somente o custo; bênção sem diamantes devolve pedras",()=>{
  const f=fixture(80,max=>max-1);try{
    f.add();f.wash();f.apply();f.add(208056,9999);f.feature.save.engravings[0]!.level=9;
    f.call(9603,{holeId:1,wish:false});assert.equal(f.feature.save.engravings[0]!.level,9);assert.equal(Object.values(f.state.items).find(i=>i.template_id===208056)!.count,9998);
    f.state.player.point=499;const before=structuredClone(f.state);assert.throws(()=>f.call(9603,{holeId:1,wish:true}),/insuficiente/);assert.deepEqual(f.state,before);
  }finally{f.db.close();}
});

test("tattoo: negativos convertem primários reais, limitam o total em zero e não vazam entre contas",()=>{
  const a=fixture(),b=fixture();try{
    a.feature.save.holes[0]!.applied={type:2,add:2,plus:5000,reduce:0,minus:10000};a.feature.synchronize();
    const v=calculateAttributes(a.saved.attributes);assert.equal(v.total_power,0);assert.equal(v.total_intellect,6000);assert.ok(v.total_magic_attack!>0);assert.equal(v.total_phy_attack??0,0);
    assert.equal(calculateAttributes(b.saved.attributes).total_power,1000);assert.equal(b.feature.save.holes[0]!.applied,undefined);
    a.saved.battle={finished:false};assert.throws(()=>a.apply(),/batalha/);
  }finally{a.db.close();b.db.close();}
});

test("tattoo: material avançado consegue maximizar todos os oito espaços sem ultrapassar teto",()=>{
  const f=fixture();try{
    f.add(208102,210000);for(let slot=1;slot<=8;slot++)while((f.feature.save.holes[slot-1]!.applied?.plus??0)<5000){f.wash(slot);f.apply(slot);}
    assert.ok(f.feature.save.holes.every(h=>h.applied?.plus===5000));const value=f.feature.save.holes[0]!.applied!.plus;f.wash(1,1,{auto_buy:true,material_pay_type:2});assert.equal(f.feature.save.holes[0]!.proposal!.plus,value);
  }finally{f.db.close();}
});
