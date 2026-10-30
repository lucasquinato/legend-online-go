import {test} from "node:test";
import assert from "node:assert/strict";
import {Inventory,itemTemplate} from "../src/inventory.js";
import type {Message} from "../src/messages.js";
import {advancedEquipment,halidomIds} from "../src/features/equipment/advanced-content.js";
import {equipmentSkills,equipmentProperties,equipmentSource,localHalidomAffixes,rollEquipment,normalizeEquipmentAffixes} from "../src/features/equipment/content.js";
import {halidomEvolution,halidomPurificationCaps,equipmentStarCap} from "../src/features/equipment/requirements.js";
import {localHalidomAffixId} from "../src/features/equipment/affix-progression.js";
import {purifyEquipment,applyPurification,type PurificationSave} from "../src/features/equipment/purification.js";
const gear=(template_id:number):Message=>({id:901234,template_id,count:1,bag_type:0,object_id:0,pos:0,exist:1,bind:1});
test("both lineages expose all eight independent caps and twelve complete affix families",()=>{
 assert.equal(localHalidomAffixes.skills.length,4680);
 assert.equal(new Set(localHalidomAffixes.skills.map(s=>s.TemplateId)).size,4680);
 for(const id of halidomIds){
  const t=itemTemplate(id)!,evo=halidomEvolution(id),cap=halidomPurificationCaps[evo-1]!;
  assert.equal(equipmentStarCap(t),cap);assert.equal(t.NeedGrades,"80");assert.equal(t.NeedChangeJob,"0");
  const pool=[...equipmentSkills.values()].filter(s=>s.MasterType===t.Property7);assert.equal(pool.length,cap*12);
  const item=gear(id);rollEquipment(item,n=>n-1);
  for(let n=1;n<=Number(t.RandomSkillCount);n++)assert.equal(Number(equipmentSkills.get(item[`random_skill_${n}`])!.Grades),cap);
 }
});
test("recovered values survive migration exactly; new stars extend each evolution's own reference",()=>{
 const originalProperties=new Map(advancedEquipment.properties.map(p=>[Number(p.TemplateId),p]));
 for(const id of halidomIds){
  const evo=halidomEvolution(id),pool=[11203,11204,11205,11206,11206,11206,11206,11207][evo-1]!;
  for(const old of advancedEquipment.skills.filter(s=>Number(s.MasterType)===pool)){
   const item={...gear(id),random_skill_1:Number(old.TemplateId),join_1:2050111,mould_grade:90};
   const proposal={templateId:id,before:[item.random_skill_1],skills:[item.random_skill_1]};
   normalizeEquipmentAffixes(item,proposal);assert.equal(normalizeEquipmentAffixes(item,proposal),false);
   assert.deepEqual(proposal.before,[item.random_skill_1]);assert.equal(item.id,901234);assert.equal(item.join_1,2050111);assert.equal(item.mould_grade,90);
   const p=equipmentProperties.get(item.random_skill_1)!;
   assert.deepEqual({...p,TemplateId:old.TemplateId},originalProperties.get(Number(old.TemplateId)));
   assert.equal(Number(equipmentSkills.get(item.random_skill_1)!.Grades),Number(old.Grades));
  }
  const oldMax=advancedEquipment.skills.filter(s=>Number(s.MasterType)===pool&&Number(s.SonType)===1).sort((a,b)=>Number(b.Grades)-Number(a.Grades))[0]!;
  const cap=halidomPurificationCaps[evo-1]!,maxId=localHalidomAffixId(evo,1,cap);
  assert.equal(Number(equipmentProperties.get(maxId)!.Power),Math.trunc(Number(originalProperties.get(Number(oldMax.TemplateId))!.Power)*cap/Number(oldMax.Grades)));
  assert.equal(equipmentSource({...gear(id),random_skill_1:maxId})!.values.total_power,Number(equipmentProperties.get(maxId)!.Power));
 }
});
test("purification respects locks and star floors through all evolutions and reload",()=>{
 for(const id of halidomIds){
  const item=gear(id),evo=halidomEvolution(id),cap=halidomPurificationCaps[evo-1]!;rollEquipment(item,()=>0);
  for(let n=1;n<=Number(itemTemplate(id)!.RandomSkillCount);n++)item[`random_skill_${n}`]=localHalidomAffixId(evo,[1,2,3,5,6][n-1]!,n===1?cap:cap-1);
  const inv=new Inventory({"0:0:0":item},{nextId:1000000}),save:PurificationSave={};
  const proposal=purifyEquipment(inv,save,{lock:[true]},()=>false,n=>n-1);
  assert.equal(proposal.skills[0],item.random_skill_1);
  for(let n=1;n<Number(itemTemplate(id)!.RandomSkillCount);n++)assert.equal(Number(equipmentSkills.get(proposal.skills[n]!)!.Grades),cap);
  applyPurification(inv,save);const reloaded=JSON.parse(JSON.stringify(item));assert.equal(normalizeEquipmentAffixes(reloaded),false);assert.deepEqual(equipmentSource(reloaded),equipmentSource(item));
 }
});
