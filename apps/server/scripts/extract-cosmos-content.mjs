import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const source='reference/quests/tempinfos.original.bin',raw=readFileSync(source),bytes=inflateSync(raw.subarray(4));
const tables={};let pos=4;
while(pos<bytes.length){const n=bytes[pos++],name=bytes.subarray(pos,pos+n).toString();pos+=n;const size=bytes.readUInt32BE(pos);pos+=4;tables[name]=[...bytes.subarray(pos,pos+size).toString().matchAll(/<\w+\s+([^>]*?)\/>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));pos+=size;}
const ids=new Set(tables.starTempInfos.map(row=>row.DefaultSkill).filter(Boolean));
const out={source:{path:source,sha256:createHash('sha256').update(raw).digest('hex')},templates:tables.starTempInfos,buffers:tables.SkillBufferTempInfos.filter(row=>ids.has(row.Id)),upgrades:tables.UpGradeTempInfos.filter(row=>[9,10,11,12,13,22,60,103].includes(Number(row.Types))),configs:tables.ConfigInfos.filter(row=>/^Star/.test(row.ConfigName)||row.ConfigName==='astrology_free_function_level'),advancedRecipes:tables.ComposeTempInfos.filter(row=>row.Types==='14')};
writeFileSync('reference/cosmos/content.json',JSON.stringify(out,null,2));console.log({templates:out.templates.length,buffers:out.buffers.length,configs:out.configs.length});
