import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {sha256} from './protocol.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),version=process.argv[2],origin=new URL(process.argv[3]??'http://127.0.0.1:18080');
if(!/^\d+\.\d+\.\d+$/.test(version??'')||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Informe versão X.Y.Z e servidor de preparação local.');
const dest=resolve(root,'dist/releases/client',version),stage=dest+'.staging';if(existsSync(dest)||existsSync(stage))throw Error('Release ou staging já existente.');mkdirSync(stage,{recursive:true});
const files=[];
async function save(path){const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Recurso não disponível: '+path+' ('+response.status+')');const bytes=Buffer.from(await response.arrayBuffer());const name=path.slice(1);mkdirSync(join(stage,name,'..'),{recursive:true});writeFileSync(join(stage,name),bytes);files.push({path:name,bytes:bytes.length,sha256:sha256(bytes)});return bytes;}
const index=await save('/client/code_md5.dat');await save('/client/size.xml');await save('/client/Loading.swf');
const xml=inflateSync(inflateSync(index)).toString('utf8');
for(const m of xml.matchAll(/<Item\b([^>]+)\/?\s*>/g)){const fields=Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));if(/^\d+\.png$/.test(fields.name??'')&&/^[a-f0-9]{8}$/i.test(fields.md5??''))await save('/cdn/'+fields.name.replace('.png','_'+fields.md5+'.png'));}
writeFileSync(join(stage,'release.json'),JSON.stringify({schema:1,kind:'client',version,protocol:1,assetPack:'docs/artifacts.lock.json',files},null,2)+'\n');renameSync(stage,dest);console.log('Snapshot dos módulos e índices servido pelo backend preservado em '+dest+'. O acervo de recursos é um pacote separado.');
if(process.argv.includes('--publish')){const base=resolve(root,'apps/server/releases/client');mkdirSync(join(base,'files'),{recursive:true});if(existsSync(join(base,'files',version)))throw Error('Versão já publicada.');cpSync(dest,join(base,'files',version),{recursive:true,errorOnExist:true,force:false});writeFileSync(join(base,'stable.json.next'),JSON.stringify({version}));renameSync(join(base,'stable.json.next'),join(base,'stable.json'));console.log('Canal stable preparado. Reinicie com CLIENT_RELEASE_CHANNEL=stable para ativar.');}
