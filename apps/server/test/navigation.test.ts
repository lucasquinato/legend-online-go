import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { Store } from "../src/store.js";
import { emptyCity } from "../src/city-state.js";
import { CurrencyLedger,CURRENCY_SCHEMA,currencyBalance,setCurrencyBalance } from "../src/features/currencies/index.js";
import { GOLD_SCHEMA } from "../src/gold.js";
import { Inventory } from "../src/inventory.js";
import { NavigationFeature,NavigationError,fishingWindow } from "../src/features/navigation/index.js";
import { encodeMessage,decodeMessage,typeName,type Message } from "../src/messages.js";
function setup(){
 const db=new DatabaseSync(":memory:");db.exec(GOLD_SCHEMA+CURRENCY_SCHEMA);const state=emptyCity();state.player={grades:50,point:10000};state.economy.gold_total_count=1000000000;
 let now=Date.parse("2026-10-18T13:35:00Z"),sequence=0,fail=false;const ids={nextId:900000};
 const ledger=new CurrencyLedger(db,()=>now),store={db} as Store;
 const atomic=<T>(fn:()=>T):T=>{const before=structuredClone(state),oldIds=ids.nextId,name=`t${++sequence}`;db.exec(`SAVEPOINT ${name}`);try{const value=fn();db.exec(`RELEASE ${name}`);return value;}catch(e){db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);Object.assign(state,before);ids.nextId=oldIds;throw e;}};
 const feature=new NavigationFeature({state,store,userId:1,inventory:()=>new Inventory(state.items,ids,100),ledger,now:()=>now,persist:()=>{if(fail)throw Error("save failed");},atomic},()=>0);
 const send=(op:number,r:Message={})=>feature.handle(9600,encodeMessage(typeName("pet.NavigationOpMsg"),{op,...r}))!;
 const saved=()=>JSON.parse(String(db.prepare("SELECT state FROM local_navigation WHERE user_id=1").get()!.state));
 const model=(packets:Message[])=>decodeMessage(typeName("pet.NavigationMsg"),Buffer.from(packets.find(p=>p.opcode===342)!.body,"base64"));
 return{db,state,ledger,feature,send,saved,model,advance:(ms:number)=>{now+=ms;},fail:()=>{fail=true;}};
}
test("Navegação é bloqueada no 49; no 50 libera um navio gratuito e os três portos",()=>{
 const s=setup();try{s.state.player.grades=49;assert.deepEqual(s.feature.initialPackets(),[]);assert.throws(()=>s.send(13),NavigationError);s.state.player.grades=50;
 const m=s.model(s.feature.initialPackets());assert.equal(m.boat.length,1);assert.equal(m.port.length,3);assert.equal(m.strength,100);assert.equal(s.state.player.point,10000);
 assert.ok(m.port.every((p:Message)=>p.taskId1>0));
 }finally{s.db.close();}
});
test("navios debitam a linha seguinte e abrem slot quando o upgrade ao 3 termina, inclusive offline",()=>{
 const s=setup();try{s.feature.initialPackets();setCurrencyBalance(s.state,"navigationCoin",1000);
 s.send(3,{param1:"1"});assert.equal(currencyBalance(s.state,"navigationCoin"),960);assert.equal(s.saved().boats[0].state,3);
 assert.throws(()=>s.send(3,{param1:"1"}));s.advance(600*60000);s.send(7);assert.equal(s.saved().boats[0].grade,2);
 s.send(3,{param1:"1"});assert.equal(currencyBalance(s.state,"navigationCoin"),840);s.advance(600*60000);s.send(7);
 assert.equal(s.saved().boats.length,2);assert.equal(s.saved().boats[1].grade,1);assert.equal(s.state.player.point,10000);
 }finally{s.db.close();}
});
test("compras de movimento são limitadas ao dia global e não acumulam reserva gratuita",()=>{
 const s=setup();try{s.feature.initialPackets();s.send(8);s.send(8);assert.equal(s.saved().strength,300);assert.equal(s.state.player.point,9800);
 assert.throws(()=>s.send(8),/duas compras/);s.advance(24*3600000);s.send(13);assert.equal(s.saved().strength,100);assert.equal(s.saved().buys,0);
 }finally{s.db.close();}
});
test("loja respeita seis compras; renovar não zera o limite; falha no save desfaz débito e item",()=>{
 const s=setup();try{s.feature.initialPackets();setCurrencyBalance(s.state,"navigationCoin",1000000);
 for(let i=1;i<=6;i++)s.send(14,{param3:i});assert.equal(s.saved().shopBuys,6);assert.throws(()=>s.send(14,{param3:1}),/Oferta/);
 s.send(15,{param3:1});assert.throws(()=>s.send(14,{param3:1}),/seis compras/);assert.equal(s.saved().shopBuys,6);
 s.advance(24*3600000);s.send(13);const before=structuredClone(s.state),nav=s.saved(),transactions=s.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n;
 s.fail();assert.throws(()=>s.send(14,{param3:1}),/save failed/);assert.deepEqual(s.state,before);assert.deepEqual(s.saved(),nav);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n,transactions);
 }finally{s.db.close();}
});
test("troca consome materiais e movimento uma vez, entrega moedas e bloqueia porto durante viagem",()=>{
 const s=setup();try{s.feature.initialPackets();const nav=s.saved();nav.ports[1].tasks=[{id:1,count:0,used:false}];s.db.prepare("UPDATE local_navigation SET state=? WHERE user_id=1").run(JSON.stringify(nav));
 const gold=s.state.economy.gold_total_count;s.send(11,{param1:"2",param2:"1",param5:[1],param6:[1]});
 assert.equal(s.state.economy.gold_total_count,gold-2000000);assert.equal(currencyBalance(s.state,"navigationCoin"),20);assert.equal(s.saved().strength,80);
 assert.throws(()=>s.send(11,{param1:"2",param2:"1",param5:[1],param6:[1]}),/indisponível/);assert.equal(currencyBalance(s.state,"navigationCoin"),20);
 s.advance(3600000);s.send(13);assert.equal(s.saved().boats[0].state,2);assert.equal(s.saved().ports[1].boatId,"");s.advance(600000);s.send(13);assert.equal(s.saved().boats[0].state,0);
 }finally{s.db.close();}
});
test("pesca tem 24 janelas precisas e cobra uma saída sem custo extra para um navio",()=>{
 for(let h=0;h<24;h++){const start=Date.UTC(2026,9,18,h,30);assert.equal(fishingWindow(start-1).open,false);assert.equal(fishingWindow(start).open,true);assert.equal(fishingWindow(start+30*60000-1).open,true);assert.equal(fishingWindow(start+30*60000).open,false);}
 const s=setup();try{s.feature.initialPackets();const diamonds=s.state.player.point;s.send(16,{param2:"1"});assert.equal(s.saved().strength,80);assert.equal(s.saved().boats[0].state,4);assert.equal(s.state.player.point,diamonds);}finally{s.db.close();}
});


test("pesca credita a cada 20 segundos, limita 30 por dia e não duplica ao reconectar",()=>{
 const s=setup();try{s.feature.initialPackets();const gold=s.state.economy.gold_total_count;s.send(16,{param2:"1"});s.advance(60000);s.feature.tick();
 assert.equal(s.saved().fishingRewards,3);assert.equal(s.state.economy.gold_total_count,gold+15000);assert.equal(currencyBalance(s.state,"navigationCoin"),6);
 s.feature.initialPackets();s.send(18);assert.equal(s.state.economy.gold_total_count,gold+15000);
 s.advance(600000);s.feature.tick();assert.equal(s.saved().fishingRewards,30);assert.equal(s.state.economy.gold_total_count,gold+150000);assert.equal(s.saved().fish,undefined);
 s.advance(3600000);assert.throws(()=>s.send(16,{param2:"1"}),/30 recompensas/);s.advance(24*3600000);s.send(13);assert.equal(s.saved().fishingRewards,0);
 }finally{s.db.close();}
});
test("parar pesca preserva recompensas pendentes e erros de save desfazem a reclamação",()=>{
 const s=setup();try{s.feature.initialPackets();s.send(16,{param2:"1"});s.advance(40000);s.send(17);assert.equal(s.saved().fish,undefined);assert.equal(s.saved().fishPending.gold,10000);
 const before=structuredClone(s.state),nav=s.saved();s.fail();assert.throws(()=>s.send(18),/save failed/);assert.deepEqual(s.state,before);assert.deepEqual(s.saved(),nav);
 }finally{s.db.close();}
});
test("frota múltipla multiplica valor por intervalo, nunca o contador de 30 recompensas",()=>{
 const s=setup();try{s.feature.initialPackets();const nav=s.saved();nav.boats.push({id:"2",grade:1,state:0,cd:0});s.db.prepare("UPDATE local_navigation SET state=? WHERE user_id=1").run(JSON.stringify(nav));
 s.send(16,{param2:"1,2"});assert.equal(s.state.player.point,9980);s.advance(20000);s.send(18);assert.equal(s.saved().fishingRewards,1);assert.equal(s.saved().fishPending.gold,0);assert.equal(currencyBalance(s.state,"navigationCoin"),4);
 }finally{s.db.close();}
});
test("renovação natural da loja não custa moeda e não restaura o limite diário",()=>{
 const s=setup();try{s.feature.initialPackets();setCurrencyBalance(s.state,"navigationCoin",1000000);for(let i=1;i<=6;i++)s.send(14,{param3:i});const points=s.state.player.point;s.advance(4*3600000);s.send(15,{param3:0});assert.equal(s.state.player.point,points);assert.equal(s.saved().shopBuys,6);assert.ok(s.saved().shop.every((r:Message)=>r.buy));assert.throws(()=>s.send(14,{param3:1}),/seis compras/);
 }finally{s.db.close();}
});
test("moeda selecionada pelo cliente é respeitada na compra de movimento e renovação paga",()=>{
 const s=setup();try{s.feature.initialPackets();s.state.player.gift_token=500;s.send(8,{param3:0});s.send(15,{param3:1,param4:0});assert.equal(s.state.player.gift_token,390);assert.equal(s.state.player.point,10000);
 }finally{s.db.close();}
});

test("comércio recebe índices de slots do cliente e usa os templates atuais sem confundir o ID",()=>{
 const s=setup();try{s.feature.initialPackets();const nav=s.saved();nav.ports[1].tasks=[{id:6,count:0,used:false},{id:1,count:0,used:false}];s.db.prepare("UPDATE local_navigation SET state=? WHERE user_id=1").run(JSON.stringify(nav));
 const gold=s.state.economy.gold_total_count;s.send(11,{param1:"2",param2:"1",param5:[2],param6:[1]});
 assert.equal(s.state.economy.gold_total_count,gold-2000000);assert.equal(currencyBalance(s.state,"navigationCoin"),20);assert.equal(s.saved().ports[1].tasks[0].used,false);assert.equal(s.saved().ports[1].tasks[1].used,true);
 }finally{s.db.close();}
});
test("seleções comerciais inválidas e materiais insuficientes não gastam movimento nem recompensa",()=>{
 const s=setup();try{s.feature.initialPackets();const nav=s.saved();nav.ports[1].tasks=[{id:1,count:0,used:false}];s.db.prepare("UPDATE local_navigation SET state=? WHERE user_id=1").run(JSON.stringify(nav));
 for(const slots of [[0],[-1],[2],[1,1]]){const state=structuredClone(s.state),saved=s.saved();assert.throws(()=>s.send(11,{param1:"2",param2:"1",param5:slots,param6:slots.map(()=>1)}));assert.deepEqual(s.state,state);assert.deepEqual(s.saved(),saved);}
 s.state.economy.gold_total_count=0;assert.throws(()=>s.send(11,{param1:"2",param2:"1",param5:[1],param6:[1]}));assert.equal(s.saved().strength,100);assert.equal(s.saved().ports[1].tasks[0].used,false);assert.equal(currencyBalance(s.state,"navigationCoin"),0);
 }finally{s.db.close();}
});

test("recusa de missões dura vinte minutos no relógio do cliente e expira offline",()=>{
 const s=setup();try{s.feature.initialPackets();const response=s.send(10,{param1:"1"}),m=s.model(response),cd=m.port.find((p:Message)=>p.id==="1").cd,now=Date.parse("2026-10-18T13:35:00Z");assert.equal(cd/1000-now/1000,1200);assert.equal(s.saved().ports[0].tasks.length,0);
 s.advance(1199000);s.send(13);assert.equal(s.saved().ports[0].tasks.length,0);s.advance(1000);s.feature.initialPackets();assert.equal(s.saved().ports[0].cd,0);assert.ok(s.saved().ports[0].tasks.length>0);
 }finally{s.db.close();}
});
import { resetNavigationMissions } from "../src/features/navigation/index.js";
test("reset administrativo renova missões e libera viagens sem alterar progresso, moedas ou cotas",()=>{
 const s=setup();try{s.feature.initialPackets();const nav=s.saved();nav.ports[0].cd=9999999999999;nav.ports[1].boatId="1";nav.boats[0].state=1;nav.boats[0].cd=9999999999999;nav.boats.push({id:"2",grade:2,state:3,cd:9999999999999,nextGrade:3});nav.buys=2;nav.shopBuys=6;nav.strength=40;const state=structuredClone(s.state);resetNavigationMissions(nav);
 assert.ok(nav.ports.every((p:Message)=>p.cd===0&&p.boatId===""&&!p.tasks.length));assert.equal(nav.boats[0].state,0);assert.equal(nav.boats[1].state,3);assert.equal(nav.boats[1].nextGrade,3);assert.equal(nav.buys,2);assert.equal(nav.shopBuys,6);assert.equal(nav.strength,40);assert.deepEqual(s.state,state);
 s.db.prepare("UPDATE local_navigation SET state=? WHERE user_id=1").run(JSON.stringify(nav));s.feature.initialPackets();assert.ok(s.saved().ports.every((p:Message)=>p.tasks.length>0));
 }finally{s.db.close();}
});
