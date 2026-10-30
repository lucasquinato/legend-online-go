import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { validAsset } from './external-launcher-gateway.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
export const canonical=path=>path.replace(/_[a-f0-9]{8}(?=\.[^/.]+$)/ig,'').replace(/\/+/g,'/').toLowerCase();
export function parseResourceIndex(bytes){
  const xml=inflateSync(inflateSync(bytes)).toString();const index=new Map();
  for(const item of xml.matchAll(/<Item\s+([^>]+)\/?\s*>/g)){
    const fields=Object.fromEntries([...item[1].matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    if(fields.name)index.set(canonical('/cdn/'+fields.name.replaceAll('\\','/')),fields);
  }return index;
}
export function buildMountPlan(content,index,dependencies=[],onlyMounts=[]){
  const rows=new Map();
  function add(path,kind,mount){
    const key=canonical(path);if(!/^\/cdn\/(?:equip_show|swf\/avatar|icon)\//.test(key)||key.includes('..'))return;
    const definition=index.get(key),version=definition?.md5;
    if(version&&!/^[a-f0-9]{8}$/i.test(version))throw new Error('Sufixo de versão inválido no índice.');
    const expectedPath=version?key.replace(/(\.[^/.]+)$/,'_'+version.toLowerCase()+'$1'):key;
    const row=rows.get(expectedPath)??{path:expectedPath,kind,expectedBytes:definition?Number(definition.size):null,mounts:[]};
    if(mount&&!row.mounts.some(m=>m.id===Number(mount.TemplateId)))row.mounts.push({id:Number(mount.TemplateId),name:mount.TemplateName});
    if(key==='/cdn/equip_show/mount_koala/2.swf')row.skip='known-koala-preview-403';
    rows.set(expectedPath,row);
  }
  const selected=content.mounts.filter(m=>!onlyMounts.length||onlyMounts.includes(Number(m.TemplateId)));
  const selectedIds=new Set(selected.map(m=>Number(m.TemplateId)));
  for(const mount of selected){add('/cdn/equip_show'+mount.AvatarPath+'/2.swf','preview',mount);add('/cdn/swf/avatar'+mount.AvatarPath+'/2.bswf','world',mount);}
  for(const card of content.cards)if(selectedIds.has(Number(card.Property1)))add('/cdn/icon/'+String(card.Icon).replace(/^\/+/,''),'card-icon',selected.find(m=>Number(m.TemplateId)===Number(card.Property1)));
  if(!onlyMounts.length)for(const row of dependencies)if(/^\/cdn\/(?:equip_show|swf\/avatar)\/[^/]*mount[^/]*\//i.test(row.path))add(row.path,'observed-client-request');
  return [...rows.values()];
}
export function validMountAsset(bytes,row,mime=''){
  if(row.expectedBytes!==null&&(!Number.isSafeInteger(row.expectedBytes)||row.expectedBytes<=0||bytes.length!==row.expectedBytes))return false;
  if(!validAsset(bytes,row.path,mime))return false;
  if(/\.png$/i.test(row.path)&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return false;
  if(/\.bswf$/i.test(row.path)&&bytes.length<8)return false;
  return true;
}
export async function collectMountAssets({db,dataDir,origin,plan,reportPath,concurrency=2,limit=Infinity,planOnly=false,fetchFile=fetch,indexSource=null}){
  const report={startedAt:new Date().toISOString(),origin,concurrency,planned:plan.length,indexSource,indexScope:'previews, world animations, card icons, observed mounted-avatar requests',results:[]};
  const folder=join(dataDir,'assets/objects');mkdirSync(folder,{recursive:true});
  const checkpoint=()=>writeFileSync(reportPath,JSON.stringify({...report,summary:summarize(report.results)},null,2));
  const cached=db.prepare('SELECT * FROM assets ORDER BY saved_at DESC').all();
  const byPath=new Map();for(const asset of cached){const key=asset.path.toLowerCase();if(!byPath.has(key))byPath.set(key,[]);byPath.get(key).push(asset);}
  const work=[];
  function store(row,bytes,mime){
    const url=new URL(row.path,origin).href,id=sha(Buffer.from(url)),hash=sha(bytes),file=join(folder,hash+'.bin');
    if(!existsSync(file)||sha(readFileSync(file))!==hash){const temp=join(dataDir,'assets',randomUUID()+'.part');writeFileSync(temp,bytes);renameSync(temp,file);}
    db.prepare('INSERT INTO assets(id,path,bytes,sha256,content_type,saved_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,bytes=excluded.bytes,sha256=excluded.sha256,content_type=excluded.content_type,saved_at=excluded.saved_at').run(id,row.path,bytes.length,hash,mime??'application/octet-stream',new Date().toISOString());
    return hash;
  }
  for(const row of plan){
    if(row.skip){report.results.push({...row,status:'skipped-known',reason:row.skip});continue;}
    let found;
    for(const asset of byPath.get(row.path.toLowerCase())??[]){
      try{
        let bytes=readFileSync(join(folder,asset.sha256+'.bin'));if(bytes.length!==asset.bytes||sha(bytes)!==asset.sha256)bytes=null;
        if(bytes&&validMountAsset(bytes,row,asset.content_type)){found={asset,bytes};break;}
      }catch{}
    }
    if(found){const expectedId=sha(Buffer.from(new URL(row.path,origin).href));if(!planOnly&&found.asset.id!==expectedId)store(row,found.bytes,found.asset.content_type);report.results.push({...row,status:'already-cached',bytes:found.bytes.length,sha256:found.asset.sha256});}
    else work.push(row);
  }
  report.missingOrInvalid=work.length;report.selectedForDownload=Math.min(limit,work.length);checkpoint();
  if(!planOnly){
    let next=0,finished=0;const selected=work.slice(0,limit);
    await Promise.all(Array.from({length:concurrency},async()=>{
      while(next<selected.length){const row=selected[next++];let result;
        for(let attempt=1;attempt<=2;attempt++){
          try{
            const response=await fetchFile(new URL(row.path,origin),{headers:{'user-agent':'LegendOnline-Node-Gateway/0.2'},redirect:'manual',signal:AbortSignal.timeout(30000)});
            if(response.status!==200){result={...row,status:'failed',httpStatus:response.status,reason:'http-error',attempt};if(response.body)await response.body.cancel();if(response.status<500)break;continue;}
            const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>128*1024*1024)throw new Error('oversize');chunks.push(Buffer.from(chunk));}
            const bytes=Buffer.concat(chunks),mime=response.headers.get('content-type')??'',length=response.headers.get('content-length');
            if(!response.headers.get('content-encoding')&&length!==null&&Number(length)!==bytes.length)throw new Error('incomplete-transfer');
            if(!validMountAsset(bytes,row,mime)){result={...row,status:'failed',httpStatus:200,bytes:bytes.length,reason:!bytes.length?'empty-response':'size-or-format-mismatch',attempt};break;}
            result={...row,status:'downloaded',bytes:bytes.length,sha256:store(row,bytes,mime),attempt};break;
          }catch(error){result={...row,status:'failed',reason:['oversize','incomplete-transfer','existing-object-corrupted'].includes(error.message)?error.message:'network-error',attempt};}
        }
        report.results.push(result);finished++;checkpoint();
        if(finished%20===0||finished===selected.length)console.log(JSON.stringify({completed:finished,total:selected.length,...summarize(report.results)}));
      }
    }));
    for(const row of work.slice(limit))report.results.push({...row,status:'not-selected'});
  }else for(const row of work)report.results.push({...row,status:'pending'});
  report.finishedAt=new Date().toISOString();report.summary=summarize(report.results);checkpoint();return report;
}
function summarize(rows){return Object.fromEntries(['already-cached','downloaded','failed','skipped-known','pending','not-selected'].map(status=>[status,rows.filter(r=>r.status===status).length]));}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(existsSync(join(root,'.env')))loadEnvFile(join(root,'.env'));
  const args=process.argv.slice(2),number=(key,fallback)=>{const value=args.find(a=>a.startsWith('--'+key+'='));return value?Number(value.split('=')[1]):fallback;};
  const concurrency=number('concurrency',2),limit=number('limit',Infinity),mounts=args.find(a=>a.startsWith('--mounts='))?.split('=')[1].split(',').map(Number)??[];
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4||(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<1)))throw new Error('Use concorrência de 1–4 e limite inteiro positivo.');
  const origin=new URL(process.env.UPSTREAM_ORIGIN??'https://servidor.legendremake.com').origin;
  if(!origin.startsWith('https://'))throw new Error('A origem deve usar HTTPS.');
  const dataDir=resolve(root,process.env.DATA_DIR??'data');
  if(dataDir===root||!dataDir.startsWith(root+(process.platform==='win32'?'\\':'/')))throw new Error('Dados devem ficar dentro do backend.');
  const db=new DatabaseSync(join(dataDir,'state.sqlite'));db.exec('PRAGMA busy_timeout=5000');
  try{
    const row=db.prepare("SELECT * FROM assets WHERE path='/client/res_md5.dat' ORDER BY saved_at DESC LIMIT 1").get();if(!row)throw new Error('Índice de recursos não encontrado.');
    const bytes=readFileSync(join(dataDir,'assets/objects',row.sha256+'.bin'));if(sha(bytes)!==row.sha256||bytes.length!==row.bytes)throw new Error('Índice inválido.');
    const index=parseResourceIndex(bytes),content=JSON.parse(readFileSync(join(root,'reference/mounts/content.json')));
    const plan=buildMountPlan(content,index,db.prepare('SELECT path FROM dependencies').all(),mounts);
    const reportPath=join(root,'reports/montarias/collector-latest.json');
    console.log(JSON.stringify({origin,plan:plan.length,concurrency,mode:args.includes('--plan')?'plan':'download',reportPath}));
    const report=await collectMountAssets({db,dataDir,origin,plan,reportPath,concurrency,limit,planOnly:args.includes('--plan'),fetchFile:fetch,indexSource:{path:row.path,sha256:row.sha256}});
    console.log(JSON.stringify({finished:true,missingOrInvalid:report.missingOrInvalid,...report.summary}));
  }finally{db.close();}
}
