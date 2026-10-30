import { InventoryError, itemTemplate, type Inventory } from "../../inventory.js";
import type { Message } from "../../messages.js";
import { refinementLevels } from "./advanced-content.js";

export const REFINEMENT_STONE=208055, REFINEMENT_MAX=Math.max(...refinementLevels.keys());
export function refinementBonus(value:number,grade:number):number {
  if(!Number.isSafeInteger(grade)||grade<0||grade>REFINEMENT_MAX)throw new InventoryError("Nível de refinação inválido");
  return value>0?Math.ceil(value*grade*5/100):0;
}
export function remainingRefinementXP(hero:Message):number {
  const grade=Number(hero.equipment_refining_grade??0),xp=Number(hero.equipment_refining_gp??0);refinementBonus(0,grade);
  if(!Number.isSafeInteger(xp)||xp<0||(grade<REFINEMENT_MAX&&xp>=refinementLevels.get(grade+1)!))throw new InventoryError("XP de refinação inválido");
  return Math.max(0,[...refinementLevels].filter(([g])=>g>grade).reduce((n,[,cost])=>n+cost,0)-xp);
}
/** ConciseFrame: opcode 9592, type-117 XP table, item 208055 Property1. */
export function upgradeRefinement(inventory:Inventory,hero:Message,level:number,r:Message):number {
  if(level<80)throw new InventoryError("Refinação de equipamentos exige nível 80");
  const count=Number(r.count),xpPerStone=Number(itemTemplate(REFINEMENT_STONE)!.Property1);
  if(Number(r.templateId)!==REFINEMENT_STONE||!Number.isSafeInteger(count)||count<1||count>2147483647)throw new InventoryError("Pedras de refinação ou quantidade inválidas");
  const remaining=remainingRefinementXP(hero);if(!remaining)throw new InventoryError("Refinação de equipamentos já está no máximo");
  const used=Math.min(count,Math.ceil(remaining/xpPerStone));inventory.consumeTemplate(REFINEMENT_STONE,used);
  let grade=Number(hero.equipment_refining_grade??0),xp=Number(hero.equipment_refining_gp??0)+used*xpPerStone;
  while(grade<REFINEMENT_MAX&&xp>=refinementLevels.get(grade+1)!){xp-=refinementLevels.get(grade+1)!;grade++;}
  hero.equipment_refining_grade=grade;hero.equipment_refining_gp=grade===REFINEMENT_MAX?0:xp;
  return used;
}
