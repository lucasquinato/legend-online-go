import {existsSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {root,loadProjectEnv} from './env.mjs';
if(!process.argv.includes('--yes'))throw Error('Encerre o servidor e use npm run reset -- --yes para apagar contas e dados gerados.');
loadProjectEnv();
const server=resolve(root,'apps/server'),data=resolve(server,process.env.DATA_DIR??'data');
if(!data.startsWith(server+sep))throw Error('DATA_DIR fora do servidor.');
const host=['0.0.0.0','::'].includes(process.env.HTTP_HOST??'')?'127.0.0.1':process.env.HTTP_HOST??'127.0.0.1';
let running=false;
try{running=(await fetch(`http://${host}:${process.env.HTTP_PORT??18080}/healthz`,{signal:AbortSignal.timeout(1000)})).ok;}catch{}
if(running)throw Error('O servidor ainda está ativo. Encerre antes do reset.');
for(const name of ['.local','.artifacts','.test-data','dist','apps/server/.test-data','apps/server/dist','apps/server/releases','apps/server/fixtures']){
 const target=resolve(root,name);if(!target.startsWith(resolve(root)+sep))throw Error('Caminho fora do projeto.');
 if(existsSync(target))rmSync(target,{recursive:true,force:true});
}
if(existsSync(data))rmSync(data,{recursive:true,force:true});
console.log('Contas, progresso, cache e saídas descartáveis removidos. vendor, código e configuração preservados. Execute npm run setup e npm run build.');
