import type {Message} from "../../messages.js";
import {InventoryError,type Inventory} from "../../inventory.js";
export const ADVANCED_SOUL_ITEM=208031,ADVANCED_SOUL_COST=720;
export function synchronizeAdvancedSoul(player:Message):void{
  if(Number(player.grades)>=80&&Number(player.storeGrade)>=80){
    player.seniorStoreGrade=Math.max(80,Math.min(100,Number(player.seniorStoreGrade)||80));
    player.seniorStoreGp=Number(player.seniorStoreGp)||0;
    if(player.seniorStoreGrade===100)player.seniorStoreGp=0;
  }
}
export function advancedSoulPercent(grade:number):number{
  if(!Number.isInteger(grade)||grade<80||grade>100)throw new InventoryError("Nível avançado do Selo da Alma inválido");
  return 400+(grade-80)*5;
}
export function remainingAdvancedSoul(player:Message):number{
  return Number(player.grades)>=80&&Number(player.storeGrade)>=80?Math.max(0,(100-Math.max(80,Number(player.seniorStoreGrade)||80))*720-(Number(player.seniorStoreGp)||0)):14400;
}
export function upgradeAdvancedSoul(inventory:Inventory,player:Message,r:Message):number{
  if(Number(player.grades)<80||Number(player.storeGrade)<80)throw new InventoryError("Requer personagem nível 80 e Selo da Alma comum nível 80");
  const count=Number(r.count);if(Number(r.templateId)!==ADVANCED_SOUL_ITEM||!Number.isSafeInteger(count)||count<1)throw new InventoryError("Quantidade de Selos da Alma inválida");
  synchronizeAdvancedSoul(player);const used=Math.min(count,remainingAdvancedSoul(player));
  if(!used)throw new InventoryError("O Selo da Alma avançado já atingiu o nível 100");
  inventory.consumeTemplate(ADVANCED_SOUL_ITEM,used);let gp=player.seniorStoreGp+used;
  while(gp>=720&&player.seniorStoreGrade<100){gp-=720;player.seniorStoreGrade++;}
  player.seniorStoreGp=player.seniorStoreGrade===100?0:gp;return used;
}
