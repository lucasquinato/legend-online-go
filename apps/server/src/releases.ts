import {existsSync,createReadStream,readFileSync,statSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,sep} from 'node:path';
import type {FastifyInstance} from 'fastify';
import {projectRoot} from './config.js';
export function registerReleaseRoutes(app:FastifyInstance,directory=join(projectRoot,'releases')):void{
 const root=join(directory,'launcher');
 const channel=process.env.CLIENT_RELEASE_CHANNEL??'live';
 if(!['live','stable'].includes(channel))throw Error('CLIENT_RELEASE_CHANNEL deve ser live ou stable.');
 const clientRoot=join(directory,'client'),frozen=new Map<string,{file:string;sha256:string;bytes:number}>();
 let activeVersion:string|undefined;
 if(channel==='stable'){
  activeVersion=JSON.parse(readFileSync(join(clientRoot,'stable.json'),'utf8')).version;
  if(!/^\d+\.\d+\.\d+$/.test(activeVersion??''))throw Error('Versão ativa inválida.');
  const versions=readdirSync(join(clientRoot,'files')).filter(v=>/^\d+\.\d+\.\d+$/.test(v)&&v!==activeVersion).concat(activeVersion!);
  for(const version of versions){const base=join(clientRoot,'files',version),manifest=JSON.parse(readFileSync(join(base,'release.json'),'utf8'));
   if(manifest.schema!==1||manifest.kind!=='client'||manifest.version!==version||manifest.protocol!==1||!Array.isArray(manifest.files))throw Error('Release Flash inválida.');
   for(const row of manifest.files){if(!/^(?:client\/(?:code_md5\.dat|size\.xml|Loading\.swf)|cdn\/\d+_[a-f0-9]{8}\.png)$/.test(row.path))throw Error('Caminho inválido na release Flash.');
    const file=join(base,row.path),bytes=readFileSync(file),sha256=createHash('sha256').update(bytes).digest('hex');
    if(sha256!==row.sha256||bytes.length!==row.bytes)throw Error('Release Flash corrompida: '+row.path);
    if(version!==activeVersion&&!row.path.startsWith('cdn/'))continue;
    const previous=frozen.get('/'+row.path);if(previous&&row.path.startsWith('cdn/')&&previous.sha256!==sha256)throw Error('Mesmo token Flash com conteúdo diferente.');
    frozen.set('/'+row.path,{file,sha256,bytes:bytes.length});
   }
  }
  app.addHook('onRequest',async(request,reply)=>{const pathname=new URL(request.url,'http://localhost').pathname,row=frozen.get(pathname);if(!row||request.method!=='GET')return;return reply.header('cache-control',pathname.startsWith('/client/')?'no-store':'public, max-age=31536000, immutable').header('x-asset-sha256',row.sha256).header('x-client-release',activeVersion!).type('application/octet-stream').send(createReadStream(row.file));});
 }
 app.get('/updates/client/status',async()=>({channel,version:activeVersion??null}));
 app.get('/updates/launcher/stable.json',async(_request,reply)=>{
  const path=join(root,'stable.json');if(!existsSync(path))return reply.code(404).send({error:'Nenhuma atualização publicada'});
  return reply.header('cache-control','no-store').type('application/json').send(readFileSync(path));
 });
 app.get('/updates/launcher/files/:version/*',async(request,reply)=>{
  const params=request.params as {version:string;'*':string};
  if(!/^\d+\.\d+\.\d+$/.test(params.version)||!params['*']||!params['*'].split('/').every(p=>/^[A-Za-z0-9_. -]+$/.test(p)&&p!=='.'&&p!=='..'&&!p.endsWith('.')&&!p.endsWith(' ')))return reply.code(404).send();
  const base=resolve(root,'files',params.version),file=resolve(base,params['*']);
  if(!file.startsWith(base+sep)||!existsSync(file)||!statSync(file).isFile())return reply.code(404).send();
  return reply.type('application/octet-stream').header('cache-control','public, max-age=31536000, immutable').send(createReadStream(file));
 });
}
