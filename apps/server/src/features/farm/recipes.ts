import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { InventoryError, type Inventory } from "../../inventory.js";
import type { Message } from "../../messages.js";
export const farmRecipes:Message[]=JSON.parse(readFileSync(join(projectRoot,"reference/farm-recipes.json"),"utf8"));
export function synthesizeFarm(inventory:Inventory,r:Message,level:number,userId:number,debit:(gold:number)=>void):number {
 const row=farmRecipes.find(x=>Number(x.Id)===Number(r.compose_id)),count=Number(r.compose_num);
 if(!row||!Number.isSafeInteger(count)||count<1||count>9999)throw new InventoryError("Escolha uma receita e uma quantidade válida.");
 if(level<Number(row.NeedMinLevel))throw new InventoryError("Nível insuficiente para esta receita.");
 if(r.auto_buy)throw new InventoryError("Adquira os ingredientes antes de sintetizar.");
 const consumed:Message[]=[];
 for(let i=1;i<=4;i++)if(Number(row[`Material${i}`])&&Number(row[`Count${i}`]))consumed.push(...inventory.consumeTemplate(Number(row[`Material${i}`]),Number(row[`Count${i}`])*count));
 debit(Number(row.NeedGold)*count);inventory.add({template_id:Number(row.NewMaterial),bag_type:1,object_id:0,user_id:userId,bind:Number(consumed.some(i=>i.bind)),exist:1},Number(row.Counts)*count);
 return Number(row.NewMaterial);
}
