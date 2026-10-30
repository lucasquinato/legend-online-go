import {test} from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";import {join} from "node:path";import {inflateSync} from "node:zlib";
import {projectRoot} from "../src/config.js";import {itemTemplate,Inventory} from "../src/inventory.js";import type {Message} from "../src/messages.js";
import {equipmentRecipes,equipmentSkills,equipmentProperties,equipmentSource,localEquipmentAffixes,localHalidomAffixes,rollEquipment,normalizeEquipmentAffixes} from "../src/features/equipment/content.js";
import {equipmentStarCap,equipmentRequirement} from "../src/features/equipment/requirements.js";import {localAffixId} from "../src/features/equipment/affix-progression.js";
import {localEquipmentTables} from "../src/features/equipment/client-tables.js";import {purifyEquipment,applyPurification,type PurificationSave} from "../src/features/equipment/purification.js";
const model=(template_id:number):Message=>({id:910001,template_id,count:1,bag_type:0,object_id:0,pos:0,exist:1,bind:1});
const tiers=[[1991091,10,10,83],[1891091,30,30,249],[1991101,50,50,415],[1998101,60,60,498],[2018101,70,70,581],[2019101,80,100,830]] as const;
test("all six tiers use one linear reference, with exact approved force values and independent caps",()=>{
 assert.equal(localEquipmentAffixes.skills.length,3840);assert.equal(new Set(localEquipmentAffixes.skills.map(s=>s.TemplateId)).size,3840);
 const expected:Record<string,number>={Power:83,Agility:83,Intellect:83,Captain:83,Physique:83,Attack:248,Defence:248,MagicAttack:248,MagicDefence:248,ForceHit:248,Parry:248,Live:516};
 for(const [template,level,cap,power]of tiers){const t=itemTemplate(template)!;assert.equal(equipmentRequirement(t),level);assert.equal(equipmentStarCap(t),cap);
  const pool=[...equipmentSkills.values()].filter(s=>s.MasterType===t.Property7);assert.equal(pool.length,cap*(cap>=60?11:12));assert.equal(Math.max(...pool.map(s=>Number(s.Grades))),cap);
  assert.equal(Number(equipmentProperties.get(localAffixId(cap,1,cap))!.Power),power);
  for(const s of pool){const p=equipmentProperties.get(Number(s.TemplateId))!,field=Object.keys(expected).find(k=>p[k]!==undefined)!;const value=Math.trunc(expected[field]!*Number(s.Grades)/10);assert.equal(Number(p[field]),value);assert.ok(String(s.TemplateName).endsWith(`+${value}`));}
 }
 for(const r of equipmentRecipes.values()){const t=itemTemplate(Number(r.NewMaterial))!;const cap=equipmentStarCap(t);assert.ok([10,30,50,60,70,100].includes(cap));const gear=model(Number(r.NewMaterial));rollEquipment(gear,n=>n-1);for(let slot=1;slot<=5;slot++)assert.equal(Number(equipmentSkills.get(gear[`random_skill_${slot}`])!.Grades),cap);}
});
test("legacy affixes and pending proposals migrate by family and stars without rerolls, charging or losing instance metadata",()=>{
 const gear={...model(2019101),random_skill_1:73154,random_skill_2:73354,random_skill_3:74154,join_1:2050111,mould_grade:81,strengthen_grade:5};
 const original=structuredClone(gear),proposal={templateId:2019101,before:[73154,73354,74154,0,0],skills:[73154,73354,74154,0,0]};
 assert.equal(normalizeEquipmentAffixes(gear,proposal),true);assert.equal(normalizeEquipmentAffixes(gear,proposal),false);
 assert.equal(gear.id,original.id);assert.equal(gear.join_1,original.join_1);assert.equal(gear.mould_grade,81);assert.equal(gear.strengthen_grade,5);
 assert.equal(Number(equipmentSkills.get(gear.random_skill_1)!.Grades),10);assert.equal(Number(equipmentProperties.get(gear.random_skill_1)!.Power),83);assert.deepEqual(proposal.before.slice(0,3),[gear.random_skill_1,gear.random_skill_2,gear.random_skill_3]);
 assert.equal(equipmentSource({...model(1891091),random_skill_1:localAffixId(30,1,30)})!.values.total_power,249);
 assert.equal(equipmentSource({...model(2019101),random_skill_1:localAffixId(100,1,100),random_skill_2:localAffixId(100,3,100),random_skill_3:localAffixId(100,10,100)})!.values.total_power,830);
 const starter={...model(1011003),random_skill_1:70102};assert.equal(normalizeEquipmentAffixes(starter),false);assert.equal(starter.random_skill_1,70102);
});
test("purification reaches new caps, keeps a locked family and cannot reduce existing stars, including 100-star attributes",()=>{
 for(const [template,,cap]of tiers){const gear=model(template);rollEquipment(gear,()=>0);gear.random_skill_1=localAffixId(cap,1,cap);for(let n=2;n<=5;n++)gear[`random_skill_${n}`]=localAffixId(cap,[2,3,4,5][n-2]!,cap-1);
  const items={"0:0:0":gear},inventory=new Inventory(items,{nextId:1000000}),save:PurificationSave={};
  const proposal=purifyEquipment(inventory,save,{lock:[true,false,false,false,false]},()=>false,n=>n-1);
  assert.equal(proposal.skills[0],localAffixId(cap,1,cap));for(let n=1;n<5;n++)assert.ok(Number(equipmentSkills.get(proposal.skills[n]!)!.Grades)>=cap-1);
  applyPurification(inventory,save);assert.equal(inventory.items["0:0:0"]!.random_skill_1,localAffixId(cap,1,cap));
 }
});
test("client receives every generated skill and property, preserves original rows and has no ID collisions",()=>{
 const source=JSON.parse(readFileSync(join(projectRoot,"reference/item-templates.json"),"utf8")).source,raw=readFileSync(join(projectRoot,`data/assets/objects/${source.sha256}.bin`));
 const records=(raw:Buffer)=>{const d=inflateSync(raw.subarray(4)),out=new Map<string,string>();let pos=4;while(pos<d.length){const n=d[pos++]!,name=d.subarray(pos,pos+n).toString();pos+=n;const len=d.readUInt32BE(pos);pos+=4;out.set(name,d.subarray(pos,pos+len).toString());pos+=len;}assert.equal(pos,d.length);return out;};
 const before=records(raw),after=records(localEquipmentTables(raw));
 assert.equal(after.get("SkillBufferTempInfos"),before.get("SkillBufferTempInfos")!.replace(/<SkillBufferTempInfo\s+[^>]*\bId="1094"[^>]*\/>/,row=>row.replace(/BufferName="[^"]*"/,'BufferName="Ganho de fúria da arma."')));
 for(const [name,tag,generated]of [["SkillTempInfos","SkillTempInfo",[...localEquipmentAffixes.skills,...localHalidomAffixes.skills]],["SkillPropertyTempInfos","SkillPropertyTempInfo",[...localEquipmentAffixes.properties,...localHalidomAffixes.properties]]] as const){
  const original=before.get(name)!,body=after.get(name)!;
  const old=name==="SkillTempInfos"?original.replace(/<SkillTempInfo\s+[^>]*\bTemplateId="1094"[^>]*\/>/,row=>row.replace(/TemplateName="[^"]*"/,'TemplateName="Ganha fúria por ação conforme o nível da arma."')):original;
  assert.ok(body.startsWith(old.slice(0,old.lastIndexOf("</"))));const ids=[...body.matchAll(new RegExp(`<${tag}\\s+TemplateId="(\\d+)"`,"g"))].map(m=>Number(m[1]));assert.equal(new Set(ids).size,ids.length);
  const unique=new Set(ids);for(const row of generated)assert.ok(unique.has(Number(row.TemplateId)));
 }
 for(const [name,body]of before)if(!["ItemTempInfos","ComposeTempInfos","ShopTempInfos","SkillTempInfos","SkillPropertyTempInfos","SkillBufferTempInfos"].includes(name))assert.equal(after.get(name),body);
});
