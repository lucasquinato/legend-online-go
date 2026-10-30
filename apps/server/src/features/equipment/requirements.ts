import {readFileSync} from "node:fs";
import {join} from "node:path";
import {projectRoot} from "../../config.js";
import {halidomIds} from "./advanced-content.js";
const content:{recipes:Record<string,string>[]} = JSON.parse(readFileSync(join(projectRoot,"reference/equipment/content.json"),"utf8"));
export const equipmentOutputs=new Set(content.recipes.map(r=>Number(r.NewMaterial)));
/** Only the six equipment synthesis tiers are rebalanced; original source tables remain preserved. */
export function equipmentRequirement(t:Record<string,string>):number {
 const level=Number(t.NeedGrades);
 if(!equipmentOutputs.has(Number(t.TemplateId)))return level;
 if(Number(t.Property7)>=1400000010&&Number(t.Property7)<=1400000100)return level;
 return Number(t.NeedChangeJob)===2?80:Number(t.NeedChangeJob)===1?70:level===70?60:level;
}
export function localEquipmentTemplate(t:Record<string,string>):Record<string,string>{
 if(halidomIds.has(Number(t.TemplateId)))return {...t,NeedGrades:"80",NeedChangeJob:"0",Property7:String(halidomAffixPool(halidomEvolution(Number(t.TemplateId))))};
 const cap=equipmentStarCap(t);
 return cap?{...t,NeedGrades:String(equipmentRequirement(t)),NeedChangeJob:"0",Property7:String(equipmentAffixPool(cap))}:t;
}
export function equipmentStarCap(t:Record<string,string>):number{
 if(halidomIds.has(Number(t.TemplateId)))return halidomPurificationCaps[halidomEvolution(Number(t.TemplateId))-1]!;
 if(!equipmentOutputs.has(Number(t.TemplateId)))return 0;
 const localCap=Number(t.Property7)-1400000000;if([10,30,50,60,70,100].includes(localCap))return localCap;
 const level=equipmentRequirement(t);return level===80?100:level;
}
export const equipmentAffixPool=(cap:number)=>1400000000+cap;

export const halidomPurificationCaps=[10,20,30,40,50,60,80,100] as const;
export const halidomEvolution=(id:number)=>id%10000-2;
export const halidomAffixPool=(evolution:number)=>1400002000+evolution;
