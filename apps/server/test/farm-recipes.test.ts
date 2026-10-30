import { test } from "node:test";
import assert from "node:assert/strict";
import { Inventory } from "../src/inventory.js";
import { synthesizeFarm,farmRecipes } from "../src/features/farm/recipes.js";
import type { Message } from "../src/messages.js";
import { residencePolicy,animalShopRows } from "../src/features/residence/policy.js";
test("todas as sete receitas da fazenda consomem materiais e ouro, sem sorteio de falha",()=>{
 assert.equal(farmRecipes.length,7);
 for(const r of farmRecipes){const items:Record<string,Message>={},inv=new Inventory(items,{nextId:1},100);for(let i=1;i<=4;i++)if(Number(r[`Material${i}`])&&Number(r[`Count${i}`]))inv.add({template_id:Number(r[`Material${i}`]),bag_type:1,object_id:0,user_id:1,exist:1,bind:1},Number(r[`Count${i}`])*3);
 let cost=0;assert.equal(synthesizeFarm(inv,{compose_id:Number(r.Id),compose_num:3},Number(r.NeedMinLevel),1,n=>cost+=n),Number(r.NewMaterial));assert.equal(cost,Number(r.NeedGold)*3);
 assert.equal(Object.values(items).filter(i=>i.template_id===Number(r.NewMaterial)).reduce((n,i)=>n+Number(i.count),0),Number(r.Counts)*3);assert.ok(Object.values(items).every(i=>i.bind===1));
 }
});
test("síntese rejeita quantidade e nível inválidos antes de consumir",()=>{const items:Record<string,Message>={},inv=new Inventory(items,{nextId:1},100),r=farmRecipes[0]!;for(const count of [-1,0,1.5,10000])assert.throws(()=>synthesizeFarm(inv,{compose_id:Number(r.Id),compose_num:count},100,1,()=>assert.fail()));assert.throws(()=>synthesizeFarm(inv,{compose_id:Number(r.Id),compose_num:1},1,1,()=>assert.fail()),/Nível/);assert.deepEqual(items,{});});
test("ofertas provisórias de animais e ração usam apenas ouro e limite de nível 11",()=>{const rows=animalShopRows({});assert.equal(rows.length,5);for(const row of rows){assert.equal(Number(row.Gold),residencePolicy.animalGold[Number(row.ItemId)]);assert.equal(row.NeedGrades,"11");assert.equal(row.Point,"0");assert.equal(row.GiftToken,"0");assert.equal(row.MazeCoin,"0");}});
