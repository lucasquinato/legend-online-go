import { test } from "node:test";
import assert from "node:assert/strict";
import { initialResidence,settleResidence,collectResidence,changeFurniture,totalLuxury } from "../src/features/residence/economy.js";
import { nextGameReset,gameDay } from "../src/game-clock.js";
test("moradia produz offline, para após doze horas e reinicia após coleta manual",()=>{
 const s=initialResidence(0);s.owned=true;settleResidence(s,24*3600000);assert.equal(s.accrued,1200000);
 let gold=0;assert.equal(collectResidence(s,48*3600000,n=>gold+=n),1200000);assert.equal(gold,1200000);
 settleResidence(s,49*3600000);assert.equal(s.accrued,100000);
});
test("alterar taxa não reavalia armazenamento; fracasso no crédito não esvazia a moradia",()=>{
 const s=initialResidence(0);s.owned=true;settleResidence(s,3600000);s.rate=1000000;
 settleResidence(s,2*3600000);assert.equal(s.accrued,1100000);const before=structuredClone(s);
 assert.throws(()=>collectResidence(s,3*3600000,()=>{throw Error("ledger");}),/ledger/);assert.deepEqual(s,before);
});
test("móveis guardados/repetidos contam por propriedade, sem inventar luxo para o catálogo zero",()=>{
 const s=initialResidence(0);s.owned=true;changeFurniture(s,101002,2,3600000);assert.equal(totalLuxury(s),0);assert.equal(s.rate,100000);assert.equal(s.accrued,100000);
 assert.throws(()=>changeFurniture(s,101002,-3,2*3600000));assert.equal(s.furniture[101002],2);
});
test("árvore usa próximo reset real às 04h, inclusive antes da virada",()=>{
 for(const date of ["2026-10-18T06:59:59.000Z","2026-10-18T07:00:00.000Z","2026-10-18T23:00:00.000Z"]){
  const now=Date.parse(date),reset=nextGameReset(now);assert.ok(reset>now);assert.equal(gameDay(reset-1),gameDay(now));assert.notEqual(gameDay(reset),gameDay(now));
 }
});

test("recuo do relógio não derruba login nem duplica renda",()=>{const s=initialResidence(3600000);s.owned=true;settleResidence(s,0);assert.equal(s.lastAt,3600000);assert.equal(s.accrued,0);settleResidence(s,2*3600000);assert.equal(s.accrued,100000);});
import { grantResidenceDecorations } from "../src/features/residence/grants.js";
import { furniture } from "../src/features/navigation/content.js";
test("liberação de decorações preserva layout, não compra a casa e não duplica ao repetir",()=>{
 const s=initialResidence(0);s.layout={1:{id:1,templateId:101002,pos_x:0,pos_y:0,rotation:0}};s.furniture={101002:1};s.nextId=1;
 assert.equal(grantResidenceDecorations(s,3600000),furniture.length-1);assert.equal(s.owned,false);assert.equal(s.accrued,0);assert.deepEqual(s.layout[1],{id:1,templateId:101002,pos_x:0,pos_y:0,rotation:0});assert.equal(Object.keys(s.layout).length,furniture.length);
 for(const row of furniture)assert.ok(Object.values(s.layout).some(i=>i.templateId===Number(row.TemplateId)));
 assert.equal(grantResidenceDecorations(s,7200000),0);assert.equal(Object.keys(s.layout).length,furniture.length);
});

test("salvar decoração substitui o layout completo e guarda parede antiga e fogueira omitidas",async()=>{
 const {saveResidenceLayout,normalizeResidenceSurfaces}=await import('../src/features/residence/layout.js');const s=initialResidence(0);s.layout={1:{id:1,templateId:101002,pos_x:0,pos_y:0,rotation:0},2:{id:2,templateId:101032,pos_x:0,pos_y:0,rotation:1},3:{id:3,templateId:710001,pos_x:3,pos_y:7,rotation:1}};
 normalizeResidenceSurfaces(s);assert.equal(s.layout[1]!.pos_x,-1);saveResidenceLayout(s,[{id:2,pos_x:0,pos_y:0,rotation:1}]);assert.equal(s.layout[3]!.pos_x,-1);assert.equal(s.layout[2]!.pos_x,0);const before=structuredClone(s);assert.throws(()=>saveResidenceLayout(s,[{id:1,pos_x:0,pos_y:0,rotation:0},{id:2,pos_x:0,pos_y:0,rotation:1}]),/parede/);assert.deepEqual(s,before);
});
