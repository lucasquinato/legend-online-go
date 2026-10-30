import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { projectRoot } from "../src/config.js";
import { templates, buffers } from "../src/features/cosmos/content.js";
import { cosmosVisible } from "../src/features/cosmos/availability.js";
import { localCosmosTables } from "../src/features/cosmos/client-tables.js";
import { initialCosmos } from "../src/features/cosmos/state.js";
import { cosmosAttributeSource } from "../src/features/cosmos/attributes.js";
import { AttributeCalculator } from "../src/attributes.js";

const hidden=[1,2,3,804,805,904,905,1003,1004,1005,1313,1314,1315];
test("cosmos: catálogo original preservado; apenas a lista autorizada fica disponível",()=>{
  assert.equal(templates.size,82);
  assert.deepEqual([...templates.values()].filter(row=>!cosmosVisible(row)).map(row=>Number(row.TemplateId)),hidden);
  for(const id of [4,5,107,205,208,1014,1015,1104,1105,1204,1205,1304,1305,1404,1405,1604,1605,1705,1805,1905])assert.ok(cosmosVisible(templates.get(id)),String(id));
  const save=initialCosmos();
  for(const id of hidden){save.instances={1:{id:1,templateId:id,bag:2,pos:0,level:10,xp:123,locked:false}};const source=cosmosAttributeSource(save,()=>true);assert.deepEqual(AttributeCalculator.snapshot({version:1,sources:{cosmos:source}}),{attributes:{fighting_capacity:0},combatModifiers:[]});}
});
function tables(raw:Buffer):Map<string,Buffer>{
  const all=new Map<string,Buffer>(),data=inflateSync(raw.subarray(4));let pos=4;
  while(pos<data.length){const n=data[pos++]!,name=data.subarray(pos,pos+n).toString();pos+=n;const size=data.readUInt32BE(pos);pos+=4;all.set(name,data.subarray(pos,pos+size));pos+=size;}return all;
}
test("cosmos: loja e tooltips locais mudam apenas os campos autorizados; modas e demais tabelas ficam intactas",()=>{
  const raw=readFileSync(join(projectRoot,"reference/quests/tempinfos.original.bin")),before=tables(raw),after=tables(localCosmosTables(raw));
  assert.equal(before.size,after.size);
  for(const [name,body]of before)if(!["starTempInfos","SkillBufferTempInfos","ItemTempInfos"].includes(name))assert.deepEqual(after.get(name),body,name);
  const parse=(body:Buffer)=>[...body.toString().matchAll(/<\w+\s+([^>]*?)\/>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
  assert.equal(after.get("ItemTempInfos")!.toString(),before.get("ItemTempInfos")!.toString().replace(/<\w+\b[^>]*TemplateId="208061"[^>]*\/>/g,element=>element.replace(/IsCanBatch="false"/,'IsCanBatch="true"').replace(/SonType="208"/,'SonType="203"')));
  const rows=parse(after.get("starTempInfos")!),original=parse(before.get("starTempInfos")!);assert.equal(rows.length,82);
  for(const row of rows){const id=Number(row.TemplateId),old=original.find(row=>Number(row.TemplateId)===id)!;assert.deepEqual(row,{...old,...(hidden.includes(id)?{StarPoint:"0"}:{}),...(Number(old.Profile)===8?{NeedGrades:"80"}:{})});}
  const oldBuffers=parse(before.get("SkillBufferTempInfos")!),newBuffers=parse(after.get("SkillBufferTempInfos")!);
  for(let i=0;i<oldBuffers.length;i++){
    const old=oldBuffers[i]!,row=newBuffers[i]!;
    if([80701,80702,80901,80902].includes(Number(old.Id))){assert.equal(row.BufferName,buffers.get(Number(old.Id))!.BufferName);assert.equal(row.ValuePercent,[80701,80901].includes(Number(old.Id))?"2":"5");assert.match(row.BufferName!,/10%/);assert.match(row.BufferName!,/sem limite/);assert.doesNotMatch(row.BufferName!,/30000|50000/);assert.deepEqual({...row,BufferName:old.BufferName,ValuePercent:old.ValuePercent},old);}else assert.deepEqual(row,old);
  }
  assert.deepEqual(localCosmosTables(localCosmosTables(raw)),localCosmosTables(raw),"transformação deve ser idempotente");
});
