import {readFileSync} from "node:fs";
import {join} from "node:path";
import {projectRoot} from "../../config.js";
import {itemTemplate} from "../../inventory.js";
import type {Message} from "../../messages.js";
import type {CombatModifierInput} from "../attributes/combat-modifiers.js";

const recovered:{effects:{suite:Message;skill:Message;buffer:Message;weapons:number[]}[]}=JSON.parse(readFileSync(join(projectRoot,"reference/equipment/weapon-effects.json"),"utf8"));
const effects=new Map(recovered.effects.map(row=>[Number(row.suite.TemplateId),row]));
const furyByLevel:Record<number,number>={10:10,30:10,50:15,60:15,70:20,80:20};
/** Local balance uses the effective equip requirement, after tier remapping. */
export function weaponFury(templateId:number):number{
 const template=itemTemplate(templateId);
 return template&&Number(template.MasterType)===1&&Number(template.SonType)===101?(furyByLevel[Number(template.NeedGrades)]??0):0;
}
/** Single-piece weapon effects only. Multi-piece equipment sets remain separate. */
export function weaponCombatModifiers(item:Message):CombatModifierInput[]{
 const template=itemTemplate(item.template_id),effect=template&&effects.get(Number(template.SuiteId));
 const value=weaponFury(Number(item.template_id));if(!value)return [];
 return [{kind:"furyOnAction",origin:{instanceId:Number(item.id),templateId:Number(item.template_id),bufferId:Number(effect?.buffer.Id??1094),slot:0},level:1,refinement:0,value,percent:0,trigger:"onAction"}];
}
