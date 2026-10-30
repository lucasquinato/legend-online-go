import { InventoryError, itemTemplate } from "../../inventory.js";
import type { Message } from "../../messages.js";
import { refinementBonus } from "./refinement.js";
import { halidomIds } from "./advanced-content.js";

// GoodsHelp.getStrengthenAddition and the fields shown by IntensifyView/EquipTipsContent.
const fields = ["Power","Agility","Intellect","Physique","Captain","Attack","MagicAttack","Defence","MagicDefence","Parry","Live","ForceHit","Conat"];
export function equipmentGrade(item: Message): number {
  const t = itemTemplate(item.template_id), grade = Number(item.strengthen_grade ?? 0);
  if (!t || !Number.isSafeInteger(grade) || grade < 0 || grade > Number(t.StrengthenMax)) throw new InventoryError("Nível de fortalecimento inválido");
  return grade;
}
export function strengthenedTemplate(item: Message,refinementGrade=0): Message {
  const template = itemTemplate(item.template_id), grade = equipmentGrade(item), result: Message = { ...template };
  const mould=Number(item.mould_grade??0),cap=halidomIds.has(Number(item.template_id))?(Number(item.template_id)%10000>=7?160:80):Number(template!.NeedGrades)>=70?160:Number(template!.NeedGrades)>=50?80:0;
  if(!Number.isInteger(mould)||mould<0||mould>cap)throw new InventoryError("Molde divino inválido para este equipamento");
  for (const field of fields) {
    const base = Number(template![field] ?? 0);
    if (base) {
      const strengthening=Math.trunc(base*grade*.1)+grade*5,mouldBonus=Math.trunc(base*Math.min(mould,80)*.3)+Math.trunc(base*Math.max(0,mould-80)*.4);
      result[field]=base+strengthening+mouldBonus+refinementBonus(strengthening,refinementGrade)+refinementBonus(mouldBonus,refinementGrade);
    }
  }
  return result;
}
/** GoodsCheck.strengthEquipGold uses the current grade, before the attempt. */
export function strengtheningCost(item: Message): number {
  const t = itemTemplate(item.template_id)!, grade = equipmentGrade(item), level = Number(t.NeedGrades), quality = Number(t.Profile);
  const cost = Math.trunc(level >= 80
    ? Math.pow(Math.floor(level / 10) + 1, 2) * (quality >= 6 ? quality + 2 : quality) * Math.pow(grade + 1, 2.1) * 10
    : Math.pow(1.5, Math.trunc(level / 10) + 1) * (quality + 1) * Math.pow(grade + 1, 2.2) * 5 + 500);
  if (!Number.isSafeInteger(cost) || cost < 1 || cost > 2147483647) throw new InventoryError("Custo de fortalecimento inválido");
  return cost;
}
export function strengtheningChance(item: Message, bonus = 0): number {
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > 100) throw new InventoryError("Bônus de sorte inválido");
  return Math.min(100, Math.max(10, 100 - equipmentGrade(item) * 10) + bonus);
}
