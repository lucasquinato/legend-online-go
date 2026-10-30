import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { projectRoot } from "../../config.js";
import { Inventory, InventoryError, itemTemplate } from "../../inventory.js";
import type { Message } from "../../messages.js";
import { supportedEquipment as normalEquipment } from "./content.js";
import { equipmentGrade, strengtheningChance, strengtheningCost } from "./strengthening.js";
import { validateEquipment, type EquipmentOwner } from "./index.js";

const stoneContent: { items: number[]; recipes: Message[] } = JSON.parse(readFileSync(join(projectRoot,"reference/equipment/luck-stones.json"),"utf8"));
if(stoneContent.items.length!==9 || stoneContent.recipes.length!==8)throw new Error("Tabela de Gemas da Sorte incompleta");
export const luckyStones = new Set(stoneContent.items);
export const luckyStoneRecipes = new Map(stoneContent.recipes.map(row=>[Number(row.Id),row]));
export const forgeItem = (item: Message | undefined) => !!item && (normalEquipment(Number(item.template_id)) || luckyStones.has(Number(item.template_id)));
export type ForgeOrigins=Record<string,{bag:number;owner:number;pos:number}>;

/** Real temporary slots, independent from fashion's virtual equipment and absorption. */
export function moveForgeItem(inventory: Inventory, request: Message, owner: EquipmentOwner, origins:ForgeOrigins={}): void {
  const r={...request}, key=`${r.begin_bag_type}:${r.begin_obj_id}:${r.begin_pos}`, item=inventory.items[key];
  if(!forgeItem(item) || ![0,1,4].includes(r.begin_bag_type) || ![0,1,4].includes(r.end_bag_type) ||
    r.begin_obj_id!==(r.begin_bag_type===4?owner.heroId:0) || r.end_obj_id!==(r.end_bag_type===4?owner.heroId:0)) throw new InventoryError("Origem ou destino da forja inválido");
  if(item!.is_locked)throw new InventoryError("Desbloqueie o item antes de usar a forja");
  const gear=normalEquipment(item!.template_id);
  if(!Number.isSafeInteger(r.count)||r.count<1||r.count>item!.count)throw new InventoryError("Quantidade de item inválida");
  // Selection/return of a forge consumable always moves the full selected stack.
  if(!gear&&(r.begin_bag_type===0||r.end_bag_type===0))r.count=item!.count;
  const origin=origins[String(item!.id)];
  if(gear&&r.begin_bag_type===0&&r.end_bag_type===1&&origin&&origin.owner===owner.heroId&&!inventory.items[`4:${origin.owner}:${origin.pos}`]){
    r.end_bag_type=4;r.end_obj_id=origin.owner;r.end_pos=origin.pos;
  }
  if(gear && (item!.count!==1 || r.count!==1))throw new InventoryError("Quantidade de equipamento inválida");
  if(r.begin_bag_type===0 && r.begin_pos!==(gear?0:1))throw new InventoryError("Slot de origem da forja inválido");
  if(r.end_bag_type===0 && r.end_pos!==(gear?0:1))throw new InventoryError("Use o slot de equipamento ou o slot de pedra da sorte correspondente");
  if(r.end_bag_type===4) {
    if(!gear || inventory.items[`4:${owner.heroId}:${r.end_pos}`])throw new InventoryError("Retire o equipamento que ocupa este slot antes de devolver a peça da forja");
    validateEquipment(item!,owner,r.end_pos);
  }
  if(r.begin_bag_type===4)validateEquipment(item!,owner,r.begin_pos);
  const target=inventory.items[`${r.end_bag_type}:${r.end_obj_id}:${r.end_pos}`];
  // Caller owns the city transaction: free the incoming position before returning
  // the previous selection, so a full backpack can still exchange two items.
  if(r.end_bag_type===0&&target){
    if(key===`0:0:${r.end_pos}`)throw new InventoryError("Este item já está selecionado na forja");
    if(gear?!normalEquipment(target.template_id):!luckyStones.has(target.template_id))throw new InventoryError("O slot contém um item de outra funcionalidade");
    const incoming=inventory.consume(key,r.count);
    moveForgeItem(inventory,{begin_bag_type:0,begin_obj_id:0,begin_pos:r.end_pos,end_bag_type:1,end_obj_id:0,end_pos:-1,count:target.count},owner,origins);
    inventory.items[`0:0:${r.end_pos}`]={...incoming,bag_type:0,object_id:0,pos:r.end_pos};
    if(gear&&r.begin_bag_type===4)origins[String(incoming.id)]={bag:4,owner:owner.heroId,pos:r.begin_pos};
    return;
  }
  inventory.move(r);
  if(gear&&r.end_bag_type===0&&r.begin_bag_type===4)origins[String(item!.id)]={bag:4,owner:owner.heroId,pos:r.begin_pos};
  if(gear&&r.begin_bag_type===0&&r.end_bag_type!==0)delete origins[String(item!.id)];
}

export function synthesizeLuckyStone(inventory: Inventory, r: Message, level: number, userId: number, debit: (amount: number)=>void): number {
  const recipe=luckyStoneRecipes.get(Number(r.compose_id)), count=Number(r.compose_num);
  if(!recipe || !Number.isSafeInteger(count) || count<1 || count>9999)throw new InventoryError("Receita ou quantidade de pedra da sorte inválida");
  if(level<Number(recipe.NeedMinLevel))throw new InventoryError("Nível insuficiente para sintetizar esta pedra");
  if(r.auto_buy)throw new InventoryError("Desmarque a compra automática e utilize as pedras da mochila");
  const consumed=inventory.consumeTemplate(Number(recipe.Material1),Number(recipe.Count1)*count);
  debit(Number(recipe.NeedGold)*count);
  inventory.add({template_id:Number(recipe.NewMaterial),bag_type:1,object_id:0,pos:0,count,exist:1,bind:consumed.some(i=>i.bind)?1:0,used:0,user_id:userId,strengthen_grade:0,join_1:-1,join_2:-1,join_3:-1,join_4:-1},count*Number(recipe.Counts));
  return Number(recipe.NewMaterial);
}

/** One genuine chance check per attempt. Caller commits cost, stone and outcome atomically. */
export function strengthenEquipment(inventory: Inventory, r: Message, heroId: number, debit: (amount: number)=>void, draw:(size:number)=>number=randomInt): Message {
  if(Number(r.opType??0)!==0)throw new InventoryError("Use o fortalecimento individual nesta etapa");
  const explicit=Number(r.src_itemid??0);
  if(!Number.isSafeInteger(explicit)||explicit<0)throw new InventoryError("Identificador de equipamento inválido");
  const item=explicit?Object.values(inventory.items).find(i=>i.id===explicit):inventory.items["0:0:0"];
  if(!item || !normalEquipment(Number(item.template_id)) || item.count!==1 || item.is_locked ||
    !((item.bag_type===0&&item.object_id===0&&item.pos===0)||(item.bag_type===1&&!item.object_id)||(item.bag_type===4&&item.object_id===heroId)))throw new InventoryError("Selecione um equipamento comum válido para fortalecer");
  const grade=equipmentGrade(item), template=itemTemplate(item.template_id)!;
  if(grade>=Number(template.StrengthenMax))throw new InventoryError("Este equipamento já atingiu o fortalecimento máximo");
  const stone=inventory.items["0:0:1"];
  if(stone && (!luckyStones.has(stone.template_id)||stone.is_locked))throw new InventoryError("Use uma Gema da Sorte de nível 1 a 9");
  const chance=strengtheningChance(item,stone?Number(itemTemplate(stone.template_id)!.Property1):0), cost=strengtheningCost(item);
  const roll=draw(10000);if(!Number.isInteger(roll)||roll<0||roll>=10000)throw new InventoryError("Sorteio inválido");
  // consume enforces protection, expiry and availability, even when the target is not removed.
  const checked=inventory.consume(`${item.bag_type}:${item.object_id??0}:${item.pos}`,1);
  const key=`${checked.bag_type}:${checked.object_id??0}:${checked.pos}`;inventory.items[key]=checked;
  debit(cost);
  if(stone){inventory.consume("0:0:1",1);if(stone.bind)checked.bind=1;}
  const success=roll<chance*100;
  if(success)checked.strengthen_grade=grade+1;
  return {streng_result:success?1:0,strengthenGrade:grade+(success?1:0),pos:checked.pos,objectId:checked.object_id??0,bagType:checked.bag_type,$9:{wire:0,value:String(cost)}};
}
