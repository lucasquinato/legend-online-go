import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { projectRoot } from "../../config.js";
import { itemTemplate, InventoryError, type Inventory } from "../../inventory.js";
import type { Message } from "../../messages.js";
import type { AttributeSource } from "../../attributes.js";
import { strengthenedTemplate } from "./strengthening.js";
import { ensureEquipmentSockets } from "./gems.js";
import {generateEquipmentAffixes,localAffixId,generateHalidomAffixes,localHalidomAffixId} from "./affix-progression.js";
import {equipmentStarCap,halidomEvolution} from "./requirements.js";
import {advancedEquipment,halidomIds,halidomRecipes} from "./advanced-content.js";
import {refinementBonus} from "./refinement.js";
import {weaponCombatModifiers} from "./weapon-effects.js";

const content: { families: number[]; recipes: Message[]; skills: Message[]; properties: Message[] } = JSON.parse(readFileSync(join(projectRoot, "reference/equipment/content.json"), "utf8"));
export const equipmentRecipes = new Map(content.recipes.map(r => [Number(r.Id), r]));
export const localEquipmentAffixes=generateEquipmentAffixes(content);
export const localHalidomAffixes=generateHalidomAffixes(advancedEquipment);
export const equipmentSkills = new Map([...content.skills,...advancedEquipment.skills,...localEquipmentAffixes.skills,...localHalidomAffixes.skills].map(s => [Number(s.TemplateId), s]));
export const equipmentProperties = new Map([...content.properties,...advancedEquipment.properties,...localEquipmentAffixes.properties,...localHalidomAffixes.properties].map(s => [Number(s.TemplateId), s]));
const skills=equipmentSkills,properties=equipmentProperties;
const names: Record<string, string> = { Attack: "phy_attack", MagicAttack: "magic_attack", Defence: "phy_defence", MagicDefence: "magic_defence", Live: "live", ForceHit: "force_hit", Parry: "parry", Power: "power", Agility: "agility", Intellect: "intellect", Physique: "physique", Captain: "captain", Strength: "strength", Tenacity: "tenacity", Penetrate: "penetrate" };
export function normalEquipment(id: number): boolean {
  const t = itemTemplate(id);
  return !!t && Number(t.MasterType) === 1 && content.families.includes(Number(t.SonType));
}
export const supportedEquipment=(id:number)=>normalEquipment(id)||halidomIds.has(Number(id));
export function equipmentSource(item: Message,refinementGrade=0): AttributeSource | undefined {
  if (!supportedEquipment(item.template_id)) return;
  const values: Record<string, number> = {}, families = new Set<number>();
  const add = (row: Message,refine=false) => { for (const [field, name] of Object.entries(names)) if (Number(row[field] ?? 0)) values[`total_${name}`] = (values[`total_${name}`] ?? 0) + Number(row[field]) + (refine?refinementBonus(Number(row[field]),refinementGrade):0); };
  add(strengthenedTemplate(item,refinementGrade));
  for (let slot = 1; slot <= 5; slot++) {
    const original = Number(item[`random_skill_${slot}`] ?? 0); if (!original) continue;
    const id=equipmentAffixId(item.template_id,original);
    const skill = skills.get(id), row = properties.get(id);
    if (!skill || !row || Number(row.AddType) !== 1 || families.has(Number(skill.SonType))) throw new InventoryError(`Bônus de equipamento inválido: ${id}`);
    families.add(Number(skill.SonType)); add(row,true);
  }
  const combatModifiers=weaponCombatModifiers(item);
  return { kind: "equipment", evidence: equipmentStarCap(itemTemplate(item.template_id)!)||combatModifiers.length?"local-balance":"recovered-table", values, derivePrimary: true,...(combatModifiers.length?{combatModifiers}:{}) };
}
/** Re-identify affixes without rerolling families/stars, including an unapplied proposal. */
export function equipmentAffixId(templateId:number,id:number):number{
 const t=itemTemplate(templateId),cap=t?equipmentStarCap(t):0;if(!id||!cap)return id;
 const skill=skills.get(id);if(!skill)throw new InventoryError(`Atributo de equipamento desconhecido: ${id}`);
 const stars=Math.min(cap,Math.max(1,Number(skill.Grades))),next=halidomIds.has(templateId)?localHalidomAffixId(halidomEvolution(templateId),Number(skill.SonType),stars):localAffixId(cap,Number(skill.SonType),stars);
 if(!skills.has(next))throw new InventoryError(`Família de atributo indisponível: ${skill.SonType}`);return next;
}
export function normalizeEquipmentAffixes(item:Message,proposal?:{templateId:number;before:number[];skills:number[]}):boolean{
 const t=itemTemplate(item.template_id),cap=t?equipmentStarCap(t):0;if(!cap)return false;
 const convert=(id:number)=>equipmentAffixId(item.template_id,id);
 let changed=false;for(let slot=1;slot<=5;slot++){const id=Number(item[`random_skill_${slot}`]??0),next=convert(id);if(id!==next){item[`random_skill_${slot}`]=next;changed=true;}}
 if(proposal&&proposal.templateId===item.template_id){proposal.before=proposal.before.map(convert);proposal.skills=proposal.skills.map(convert);}
 return changed;
}
/** Recovered pool and distinct affix families. Original random weights are not present in the table. */
export function rollEquipment(item: Message, draw: (size: number) => number = randomInt): void {
  const t = itemTemplate(item.template_id)!;
  const groups = new Map<number, number[]>();
  for (const skill of skills.values()) if (skill.MasterType === t.Property7 && properties.has(Number(skill.TemplateId))) {
    const family = Number(skill.SonType);
    groups.set(family, [...(groups.get(family) ?? []), Number(skill.TemplateId)]);
  }
  const families = [...groups.keys()], count = Number(t.RandomSkillCount ?? 0);
  if (count > Math.min(5, families.length)) throw new InventoryError("Tabela de purificação incompleta para este equipamento");
  for (let slot = 1; slot <= 5; slot++) {
    if (slot > count) { item[`random_skill_${slot}`] = 0; continue; }
    const family = families.splice(draw(families.length), 1)[0]!, choices = groups.get(family)!;
    item[`random_skill_${slot}`] = choices[draw(choices.length)]!;
  }
}

/** Caller supplies one DB/inventory transaction and the central gold debit. No set bonuses. */
export function synthesizeEquipment(inventory: Inventory, request: Message, level: number, job: number, userId: number, heroId: number, debit: (amount: number) => void): number {
  const recipe = equipmentRecipes.get(Number(request.compose_id))??halidomRecipes.get(Number(request.compose_id)), count = Number(request.compose_num);
  if (!recipe || !Number.isSafeInteger(count) || count < 1 || count > 99) throw new InventoryError("Síntese disponível apenas para equipamentos comuns");
  const t = itemTemplate(Number(recipe.NewMaterial))!;
  if (Number(t.NeedGrades) > level) throw new InventoryError("Nível insuficiente para esta síntese");
  if (![0, job].includes(Number(t.Job))) throw new InventoryError("Receita de outra classe");
  if (Number(recipe.IsLearn) || Number(recipe.NeedBuildingTemp)) throw new InventoryError("Esta receita exige uma liberação ainda indisponível");
  if (request.auto_buy) throw new InventoryError("Desmarque a compra automática e use os materiais da mochila");
  if (![0,1].includes(Number(request.pay_type ?? 0))) throw new InventoryError("Modo de pagamento inválido");
  const cost = Number(recipe.NeedGold) * count;
  if (!Number.isSafeInteger(cost) || cost < 0) throw new InventoryError("Custo de síntese inválido");
  const consumed: Message[] = [];
  const upgrades: { key: string; item: Message }[] = [];
  if (supportedEquipment(Number(recipe.Material1))) {
    if (Number(recipe.Count1) !== 1 || Number(recipe.Counts) !== 1) throw new InventoryError("Receita de evolução incompatível");
    const candidates = Object.entries(inventory.items).filter(([,item]) => item.template_id === Number(recipe.Material1) && item.count === 1 &&
      !item.is_locked && ((item.bag_type === 1 && !item.object_id) || (item.bag_type === 4 && item.object_id === heroId)))
      .sort(([,a],[,b]) => a.bag_type - b.bag_type || a.pos - b.pos);
    if (candidates.length < count) throw new InventoryError("Equipamentos insuficientes para evoluir");
    for (const [key] of candidates.slice(0,count)) upgrades.push({key,item:inventory.consume(key,1)});
    consumed.push(...upgrades.map(u=>u.item));
  }
  for (let n = 1; n <= 4; n++) {
    if (n === 1 && upgrades.length) continue;
    const template = Number(recipe[`Material${n}`]), quantity = Number(recipe[`Count${n}`]) * count;
    if (template && quantity) consumed.push(...inventory.consumeTemplate(template, quantity));
  }
  // The client requests mould inheritance separately. Preserve unsupported instance modifiers instead of destroying them.
  if (consumed.some(i => Number(itemTemplate(i.template_id)?.MasterType) === 1 &&
    Number(i.strengthen_grade ?? 0) > Number(t.StrengthenMax)))
    throw new InventoryError("O fortalecimento deve caber no limite da nova peça");
  debit(cost);
  if (upgrades.length) {
    for (const upgrade of upgrades) inventory.items[upgrade.key] = { ...upgrade.item, template_id:Number(recipe.NewMaterial), bind: consumed.some(i=>i.bind) ? 1 : 0 };
    return Number(recipe.NewMaterial);
  }
  for (let n = 0; n < count * Number(recipe.Counts); n++) {
    const item: Message = { template_id: Number(recipe.NewMaterial), count: 1, bag_type: 1, object_id: 0, pos: 0, exist: 1, bind: consumed.some(i => i.bind) ? 1 : 0, used: 0, user_id: userId, strengthen_grade: 0, mould_grade: 0, join_1: -1, join_2: -1, join_3: -1, join_4: -1 };
    ensureEquipmentSockets(item);rollEquipment(item); inventory.add(item, 1);
  }
  return Number(recipe.NewMaterial);
}
