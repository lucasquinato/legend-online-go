import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
const sha256="3cf327b92ca79b3393336e7f8762968a79a59cf6544ca0c3dba71caf78b1ec77";
const data=inflateSync(readFileSync(`data/assets/objects/${sha256}.bin`).subarray(4)),tables={};let pos=4;
const wanted=new Set(["SuiteTempInfos","SkillTempInfos","SkillBufferTempInfos"]);
while(pos<data.length){const n=data[pos++],name=data.subarray(pos,pos+n).toString();pos+=n;const size=data.readUInt32BE(pos);pos+=4;
 if(wanted.has(name))tables[name]=[...data.subarray(pos,pos+size).toString().matchAll(/<\w+\s+([^>]*?)\/>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));pos+=size;
}
const items=Object.values(JSON.parse(readFileSync("reference/item-templates.json")).items),effects=[];
for(const suite of tables.SuiteTempInfos){
 const weapons=items.filter(t=>t.MasterType==="1"&&t.SonType==="101"&&t.SuiteId===suite.TemplateId);
 if(!weapons.length||!Number(suite.Template1)||[2,3,4,5,6,7,8].some(n=>Number(suite[`Template${n}`])))continue;
 const skill=tables.SkillTempInfos.find(s=>s.TemplateId===suite.Property1);if(!skill)continue;
 const buffer=tables.SkillBufferTempInfos.find(b=>b.Id===skill.BufferIds);
 if(!buffer||buffer.AttackData!=="1"||buffer.AttackType!=="6"||Number(buffer.AttackValue)!==10||buffer.ValuePercent!=="0")continue;
 effects.push({suite,skill,buffer,weapons:weapons.map(t=>Number(t.TemplateId))});
}
if(!effects.length)throw new Error("Efeitos individuais das armas ausentes");
writeFileSync("reference/equipment/weapon-effects.json",JSON.stringify({source:{path:"/xml/tempinfos.xml",sha256},effects},null,2)+"\n");
console.log({suites:effects.length,weapons:effects.flatMap(e=>e.weapons).length});
