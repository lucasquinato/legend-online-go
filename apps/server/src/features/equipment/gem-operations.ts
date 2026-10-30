import {readFileSync} from "node:fs";
import {join} from "node:path";
import {projectRoot} from "../../config.js";
import {InventoryError,itemTemplate,type Inventory} from "../../inventory.js";
import type {Message} from "../../messages.js";
import {equipmentGems} from "./gems.js";
const content:{transforms:Message[]}=JSON.parse(readFileSync(join(projectRoot,"reference/equipment/forge.json"),"utf8"));
export const transforms=new Map(content.transforms.map(t=>[Number(t.TransformId),t]));
export const forgeGem=(id:number)=>equipmentGems.has(id);
export function decomposeGems(inventory:Inventory,userId:number,debit:(gold:number)=>void):void{
 const selected=Object.entries(inventory.items).filter(([,i])=>i.bag_type===0&&!i.object_id);
 if(!selected.length||selected.length>12)throw new InventoryError("Selecione gemas duplas para decompor");
 for(const [,item]of selected)if(!equipmentGems.has(item.template_id)||Number(itemTemplate(item.template_id)?.SonType)!==228)throw new InventoryError("A decomposição está disponível somente para gemas duplas");
 const results:Message[]=[];let gold=0;
 for(const [key,item]of selected){
  const t=itemTemplate(item.template_id)!;
  for(const field of ["Property5","Property6"]){const id=Number(t[field]);if(!equipmentGems.has(id)||Number(itemTemplate(id)?.SonType)!==205)throw new InventoryError("Componentes da gema não encontrados");results.push({...item,template_id:id,bag_type:1,object_id:0,pos:0});}
  gold+=1000*item.count;inventory.consume(key,item.count);
 }
 debit(gold);for(const item of results)inventory.add(item,item.count);
}
export function convertGems(inventory:Inventory,r:Message,userId:number,debit:(gold:number)=>void):number{
 const src=Number(r.src_itemid),dst=Number(r.des_itemid),count=Number(r.count),source=itemTemplate(src),target=itemTemplate(dst),group=transforms.get(Number(source?.TransformId));
 if(!Number.isSafeInteger(count)||count<1||count>9999||src===dst||!equipmentGems.has(src)||!equipmentGems.has(dst)||Number(source?.SonType)!==205||Number(target?.SonType)!==205||!group||Number(source?.TransformId)!==Number(target?.TransformId)||source?.Property6!==target?.Property6||![1,2,3,4,5,6,7,8].every(n=>group[`Material${n}`]!==undefined)||!Object.values(group).includes(String(dst)))throw new InventoryError("Converta apenas gemas simples de famílias diferentes e do mesmo nível");
 const selected=inventory.items["0:0:0"];
 if(!selected||selected.template_id!==src||count>selected.count||Object.values(inventory.items).some(i=>i.bag_type===0&&!i.object_id&&i.pos!==0))throw new InventoryError("Selecione a gema de origem na conversão");
 const consumed=inventory.consume("0:0:0",count);debit(Number(group.CostGold)*count);
 inventory.add({...consumed,template_id:dst,bag_type:1,object_id:0,pos:0,user_id:userId},count);return dst;
}
