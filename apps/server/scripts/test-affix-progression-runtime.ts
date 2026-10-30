import{writeFileSync,mkdirSync,readFileSync}from"node:fs";import{join,resolve}from"node:path";import{execFileSync}from"node:child_process";import{randomUUID}from"node:crypto";import assert from"node:assert/strict";
import{localEquipmentAffixes,localHalidomAffixes}from"../src/features/equipment/content.js";
const stage=resolve(".test-data/affix-air-"+randomUUID());mkdirSync(stage,{recursive:true});
const esc=(v:unknown)=>String(v).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const xml=(tag:string,row:Record<string,unknown>)=>`<${tag} ${Object.entries(row).map(([k,v])=>`${k}="${esc(v)}"`).join(" ")}/>`;
const fixture=join(stage,"affixes.json");writeFileSync(fixture,JSON.stringify({
 expectedCount:8520,
 skills:[...localEquipmentAffixes.skills,...localHalidomAffixes.skills].map(s=>({id:Number(s.TemplateId),stars:Number(s.Grades),name:s.TemplateName,pool:Number(s.MasterType),xml:xml("SkillTempInfo",s)})),
 properties:[...localEquipmentAffixes.properties,...localHalidomAffixes.properties].map(p=>{const field=Object.keys(p).find(k=>!["TemplateId","AddType"].includes(k))!;return{id:Number(p.TemplateId),field,value:Number(p[field]),xml:xml("SkillPropertyTempInfo",p)};})
}));
execFileSync(process.execPath,["scripts/test-forge-runtime.mjs","reference/chat/local-ui/local-2.swf","--fixture="+fixture],{stdio:"inherit",windowsHide:true});
assert.ok(JSON.parse(readFileSync("reference/mounts/probe/ForgeTest.swf.runtime.json","utf8")).logs.includes("affix-progression-runtime-passed"));
