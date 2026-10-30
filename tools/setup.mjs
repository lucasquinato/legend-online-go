import {existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadProjectEnv} from './env.mjs';
loadProjectEnv();
const root=fileURLToPath(new URL('../',import.meta.url));
const server=resolve(root,'apps/server');
const data=resolve(server,process.env.DATA_DIR??'data');
if(!data.startsWith(server+sep))throw Error('DATA_DIR fora do servidor.');
for(const name of ['city','tutorial']){
 const input=resolve(root,'vendor/server-seed/data',name,'scenario.json');
 if(!existsSync(input))throw Error('Pacote privado de cenários ausente: '+name+'. Consulte docs/desenvolvimento.md.');
 const dest=resolve(data,name);mkdirSync(dest,{recursive:true});
 if(!existsSync(resolve(dest,'scenario.json')))copyFileSync(input,resolve(dest,'scenario.json'));
}
mkdirSync(resolve(server,'fixtures'),{recursive:true});
const replay=resolve(root,'vendor/server-seed/fixtures/bootstrap.json');
if(existsSync(replay)&&!existsSync(resolve(server,'fixtures/bootstrap.json')))copyFileSync(replay,resolve(server,'fixtures/bootstrap.json'));
if(!process.argv.includes('--no-install')){
 const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci'],{cwd:server,stdio:'inherit',shell:process.platform==='win32'});
 if(r.status!==0)process.exit(r.status??1);
}
if(!process.argv.includes('--no-assets')){
 const r=spawnSync(process.execPath,[resolve(root,'tools/assets/import.mjs')],{cwd:root,stdio:'inherit'});
 if(r.status!==0)process.exit(r.status??1);
}
console.log('Instalação preparada com vendor e configuração da raiz; nenhuma conta foi criada.');
