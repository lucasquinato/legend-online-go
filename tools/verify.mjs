import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {loadProjectEnv} from './env.mjs';
loadProjectEnv();
const root=fileURLToPath(new URL('../',import.meta.url)),server=resolve(root,'apps/server');
for(const name of ['fixtures/bootstrap.json','data/city/scenario.json','data/tutorial/scenario.json','reference/mounts/probe/runtime/LegendEngine.exe'])if(!existsSync(resolve(server,name)))throw Error('Dependência local ausente: '+name);
for(const name of ['client/manifests/update-public.xml','vendor/ffdec/ffdec.jar','vendor/air-runtime/LegendEngine.exe'])if(!existsSync(resolve(root,name)))throw Error('Dependência local ausente: '+name);
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const lock=JSON.parse(readFileSync(resolve(server,'reference/ui-compat/release-lock.json'),'utf8'));
for(const row of Object.values(lock.modules)){if(sha(resolve(server,row.file.replaceAll('\\','/')))!==row.sha256)throw Error('Base Flash modificada: '+row.sourcePath);}
for(const name of ['city','tutorial'])if(!existsSync(resolve(server,'data',name,'scenario.json')))throw Error('Cenário ausente: '+name);
const db=new DatabaseSync(resolve(server,process.env.DATA_DIR??'data','state.sqlite'),{readOnly:true});
const assets=db.prepare('SELECT COUNT(*) n FROM assets').get().n,hasUsers=db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get();
const accounts=hasUsers?db.prepare('SELECT COUNT(*) n FROM users').get().n:0;db.close();
console.log(JSON.stringify({pinnedModules:Object.keys(lock.modules).length,assets,accounts}));
