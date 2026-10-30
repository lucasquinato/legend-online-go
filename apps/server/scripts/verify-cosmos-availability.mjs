import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const summary=path=>{const log=readFileSync(path,'utf8');return {path,tests:Number(log.match(/ℹ tests (\d+)/)?.[1]),pass:Number(log.match(/ℹ pass (\d+)/)?.[1]),fail:Number(log.match(/ℹ fail (\d+)/)?.[1]),failures:[...new Set([...log.matchAll(/^✖ (.*?) \([\d.]+ms\)/gm)].map(m=>m[1]))]};};
const focused=summary('data/cosmos-availability-tests.log'),regression=summary('data/cosmos-availability-regression.log'),baseline=summary('data/cosmos-availability-baseline.log');
const health=await(await fetch('http://127.0.0.1:8080/healthz')).json();
const response=await fetch('http://127.0.0.1:8080/xml/tempinfos.xml'),transport=Buffer.from(await response.arrayBuffer()),data=inflateSync(transport.subarray(4));let pos=4;const tables={};
while(pos<data.length){const n=data[pos++],name=data.subarray(pos,pos+n).toString();pos+=n;const size=data.readUInt32BE(pos);pos+=4;if(['starTempInfos','SkillBufferTempInfos'].includes(name))tables[name]=[...data.subarray(pos,pos+size).toString().matchAll(/<\w+\s+([^>]*?)\/>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));pos+=size;}
const policy=JSON.parse(readFileSync('reports/cosmos/disponibilidade-e-efeitos.json'));
const hidden=policy.hidden.map(row=>({id:row.id,shopPoints:Number(tables.starTempInfos.find(r=>Number(r.TemplateId)===row.id)?.StarPoint)}));
const descriptions=tables.SkillBufferTempInfos.filter(row=>[80701,80702,80901,80902].includes(Number(row.Id))).map(row=>({id:Number(row.Id),description:row.BufferName,unlimited:/sem limite/.test(row.BufferName)&&!/30000|50000/.test(row.BufferName)}));
const result={at:new Date().toISOString(),health,focused,regression,baseline,existingFailuresConfirmed:JSON.stringify([...regression.failures].sort())===JSON.stringify([...baseline.failures].sort()),http:{status:response.status,sha256:createHash('sha256').update(transport).digest('hex'),templates:tables.starTempInfos.length,hidden,descriptions},backup:readFileSync('data/cosmos-availability-backup.txt','utf8').trim()};
writeFileSync('reports/cosmos/verificacao-disponibilidade.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({focused,regression,baseline,existingFailuresConfirmed:result.existingFailuresConfirmed,http:{status:response.status,templates:result.http.templates,hidden:result.http.hidden.length,allHiddenFromShop:hidden.every(row=>row.shopPoints===0),unlimitedDescriptions:descriptions.filter(row=>row.unlimited).length},health}));
if(focused.fail||!focused.tests||!result.existingFailuresConfirmed||response.status!==200||hidden.some(row=>row.shopPoints!==0)||descriptions.length!==4||descriptions.some(row=>!row.unlimited))process.exitCode=1;
