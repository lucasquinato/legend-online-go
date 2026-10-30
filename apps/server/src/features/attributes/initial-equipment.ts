import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { projectRoot } from "../../config.js";
import { itemTemplate } from "../../inventory.js";
import type { Message } from "../../messages.js";
import type { AttributeSource } from "../../attributes.js";
import { equipmentSource } from "../equipment/content.js";
import { strengthenedTemplate } from "../equipment/strengthening.js";
import { gemContribution } from "../equipment/gems.js";
import { refinementBonus } from "../equipment/refinement.js";

export const initialEquipmentIds = new Set([1011003, 1041003, 1012003, 1042003, 1013003, 1043003]);
const recovered: { skills: Message[]; properties: Message[] } = JSON.parse(readFileSync(join(projectRoot, "reference/attributes/initial-equipment.json"), "utf8"));
const properties = new Map(recovered.properties.map(row => [Number(row.TemplateId), row]));
export const randomFamilies = new Map<number, number[]>();
for (const row of recovered.skills) {
  const family = Number(row.SonType);
  randomFamilies.set(family, [...(randomFamilies.get(family) ?? []), Number(row.TemplateId)]);
}
const names: Record<string, string> = { Attack: "phy_attack", MagicAttack: "magic_attack", Defence: "phy_defence", MagicDefence: "magic_defence", Live: "live", ForceHit: "force_hit", Parry: "parry", Power: "power", Agility: "agility", Intellect: "intellect", Physique: "physique", Captain: "captain", Strength: "strength", Tenacity: "tenacity", Penetrate: "penetrate" };

/** Equal probability per attribute family; different magnitudes are equiprobable inside it. */
export function rollInitialEquipment(item: Message, draw: (size: number) => number = randomInt): void {
  if (!initialEquipmentIds.has(Number(item.template_id))) return;
  const families = [...randomFamilies.keys()], count = Number(itemTemplate(item.template_id)!.RandomSkillCount);
  for (let slot = 1; slot <= 5; slot++) {
    if (slot > count) { item[`random_skill_${slot}`] = 0; continue; }
    const familyIndex = draw(families.length);
    if (!Number.isInteger(familyIndex) || familyIndex < 0 || familyIndex >= families.length) throw new Error("Sorteio de família inválido");
    const family = families.splice(familyIndex, 1)[0]!, candidates = randomFamilies.get(family)!;
    const choice = draw(candidates.length);
    if (!Number.isInteger(choice) || choice < 0 || choice >= candidates.length) throw new Error("Sorteio de bônus inválido");
    item[`random_skill_${slot}`] = candidates[choice]!;
  }
}

/** Delivers only template values and the actual instance's affixes. No conversions or deltas. */
export function initialEquipmentSource(item: Message,refinementGrade=0): AttributeSource | undefined {
  if (!initialEquipmentIds.has(Number(item.template_id))) return;
  const template = itemTemplate(item.template_id)!, values: Record<string, number> = {}, seen = new Set<number>();
  const add = (row: Message,refine=false) => {
    for (const [field, key] of Object.entries(names)) {
      const value = Number(row[field] ?? 0);
      if (value) values[`total_${key}`] = (values[`total_${key}`] ?? 0) + value + (refine?refinementBonus(value,refinementGrade):0);
    }
  };
  add(strengthenedTemplate(item,refinementGrade));
  for (let slot = 1; slot <= 5; slot++) {
    const id = Number(item[`random_skill_${slot}`] ?? 0);
    if (!id) continue;
    const family = [...randomFamilies].find(([, ids]) => ids.includes(id))?.[0], row = properties.get(id);
    if (family === undefined || !row || Number(row.AddType) !== 1 || seen.has(family)) throw new Error(`Bônus inicial inválido ou repetido: ${id}`);
    seen.add(family); add(row,true);
  }
  return { kind: "equipment", evidence: "recovered-table", values, derivePrimary: true };
}

export function synchronizeInitialEquipment(sources: Record<string, AttributeSource>, items: Record<string, Message>, heroId: number, soulGrade=0,refinementGrade=0,advancedSoulGrade=0): void {
  for (const id of Object.keys(sources)) if (id.startsWith("equipment:initial:")||id.startsWith("equipment:gems:")||id.startsWith("equipment:refinement:")) delete sources[id];
  for (const item of Object.values(items)) {
    if (Number(item.bag_type) !== 4 || Number(item.object_id) !== heroId || !item.exist || Number(item.count) <= 0) continue;
    const source = initialEquipmentSource(item) ?? equipmentSource(item);
    if (source) sources[`equipment:initial:${item.id}`] = source;
    const gems=gemContribution(item,soulGrade,0,advancedSoulGrade);if(gems)sources[`equipment:gems:${item.id}`]=gems;
    if(refinementGrade&&source){
      const refined=initialEquipmentSource(item,refinementGrade)??equipmentSource(item,refinementGrade),refinedGems=gemContribution(item,soulGrade,refinementGrade,advancedSoulGrade),values:Record<string,number>={};
      for(const [base,full]of [[source,refined],[gems,refinedGems]])for(const [key,value]of Object.entries(full?.values??{})){
        const delta=Number(value)-Number(base?.values[key]??0);if(delta)values[key]=(values[key]??0)+delta;
      }
      if(Object.keys(values).length)sources[`equipment:refinement:${item.id}`]={kind:"equipment",evidence:"recovered-table",values,derivePrimary:true};
    }
  }
}
