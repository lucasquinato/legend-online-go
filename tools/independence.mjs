// Reconstruct from Git candidates and a private artifact package, with no local state.
import {execFile,execFileSync,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,mkdtempSync} from 'node:fs';
import {resolve,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {inflateSync} from 'node:zlib';
const root=fileURLToPath(new URL('../',import.meta.url)),run=promisify(execFile);
const packagePath=process.argv[2]&&resolve(process.argv[2]);
const destination=mkdtempSync(join(tmpdir(),'legend-go-independent-'));
if(!relative(resolve(root,'..'),destination).startsWith('..'+sep))throw Error('A prova deve ficar fora da instalação antiga.');
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).split('\0').filter(Boolean))];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of files){const target=resolve(destination,file);if(!target.startsWith(destination+sep))throw Error('Caminho fora da cópia.');mkdirSync(resolve(target,'..'),{recursive:true});copyFileSync(resolve(root,file),target);}
const results=[];
async function command(label,args,cwd=destination){
 console.log('Validando: '+label);
 const result=await run(process.execPath,args,{cwd,windowsHide:true,env:{...process.env,LEGEND_SKIP_ENV_FILE:'true'},maxBuffer:32*1024*1024,timeout:600000});
 results.push({check:label,passed:true});
 return result.stdout;
}
let child;
try{
 if(packagePath)await command('restauração integral',['tools/artifacts.mjs','restore',packagePath]);
 await command('hashes dos artefatos',['tools/artifacts.mjs','verify']);
 await command('instalação pelo lock',['tools/setup.mjs']);
 await command('importação de assets sem contas',['tools/assets/import.mjs']);
 const server=join(destination,'apps/server');
 await command('TypeScript',['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],server);
 await command('compilação backend',['node_modules/typescript/bin/tsc','-p','tsconfig.json'],server);
 console.log('Validando: launcher sem chave privada');
 if(existsSync(join(destination,'.local/signing/release-private.pem')))throw Error('A prova não pode receber a chave privada.');
 await run('pwsh',['-NoProfile','-File','tools/build/launcher.ps1'],{cwd:destination,windowsHide:true,timeout:120000});
 results.push({check:'launcher e updater sem chave privada',passed:true});
 await command('ferramentas e pacotes',['--test',...['artifacts','releases','env'].map(n=>'tools/test/'+n+'.test.mjs')]);
 await command('capturador e fallback de assets',['--test',...['asset-fallback','external-gateway','mount-collector'].map(n=>'test/'+n+'.test.mjs')],server);
 await command('cadastro e social',['--import','tsx','--test','test/launcher-registration.test.ts','test/social-integration.test.ts'],server);
 await command('contrato Flash',['--test','test/swf-contract.test.mjs'],server);
 await command('runtime AIR real',['scripts/probe-mount-runtime.mjs','reference/mounts/local-ui/local-14.swf','--both'],server);
 const initial=JSON.parse((await command('verificação inicial',['tools/verify.mjs'])).trim());
 if(initial.accounts!==0)throw Error('A cópia limpa recebeu contas.');
 const freePort=async()=>{const listener=createServer();await new Promise((r,j)=>{listener.once('error',j);listener.listen(0,'127.0.0.3',r);});const port=listener.address().port;await new Promise(r=>listener.close(r));return port;};
 const httpPort=await freePort(),gamePort=await freePort(),policyPort=await freePort();
 let output='';
 child=spawn(process.execPath,['dist/main.js'],{cwd:server,windowsHide:true,env:{...process.env,SERVER_MODE:'tutorial',RESOURCE_MODE:'offline',HTTP_HOST:'127.0.0.3',HTTP_PORT:String(httpPort),PUBLIC_ORIGIN:'http://127.0.0.3:'+httpPort,GAME_HOST:'127.0.0.3',GAME_PORT:String(gamePort),POLICY_PORT:String(policyPort),ADVERTISED_GAME_HOST:'127.0.0.3',CAPTURE_PACKETS:'false'}});
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const origin='http://127.0.0.3:'+httpPort;
 let health;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Servidor encerrou: '+output.slice(-3000));
  try{health=await fetch(origin+'/healthz',{signal:AbortSignal.timeout(1000)}).then(r=>r.json());if(health.ok)break;}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!health?.ok||health.resourceMode!=='offline')throw Error('Servidor isolado não iniciou offline: '+output.slice(-3000));
 const endpoints=['/client/code_md5.dat','/client/size.xml','/client/Loading.swf'];
 const served=[];
 for(const path of endpoints){const response=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(path+': HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());served.push({path,bytes:bytes.length,sha256:hash(bytes)});}
 const indexResponse=await fetch(origin+'/client/code_md5.dat');
 const indexXml=inflateSync(inflateSync(Buffer.from(await indexResponse.arrayBuffer()))).toString();
 const modules=[];
 for(const match of indexXml.matchAll(/<Item\b([^>]+)\/?\s*>/g)){
  const fields=Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
  if(/^\d+\.png$/.test(fields.name??'')&&/^[a-f0-9]{8}$/i.test(fields.md5??''))modules.push('/cdn/'+fields.name.replace('.png','_'+fields.md5+'.png'));
 }
 if(!modules.length)throw Error('Índice não contém módulos.');
 for(const path of modules){const response=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Módulo ativo ausente: '+path);const bytes=Buffer.from(await response.arrayBuffer());if(createHash('md5').update(bytes).digest('hex').slice(8,16)!==path.match(/_([a-f0-9]{8})\.png$/)[1])throw Error('Token de versão divergente: '+path);served.push({path,bytes:bytes.length,sha256:hash(bytes)});}
 results.push({check:'servidor isolado offline, índices e todos os módulos indexados',passed:true});
 const report={schema:1,at:new Date().toISOString(),destination,codeFiles:files.length,privateSigningKeyRequired:false,accountsImported:initial.accounts,assets:initial.assets,results,served,sourceTreeDigest:hash(files.sort().map(f=>f+'\0'+hash(readFileSync(resolve(root,f)))).join('\n'))};
 mkdirSync(join(root,'.local/validation'),{recursive:true});
 writeFileSync(join(root,'.local/validation/independence.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{
 if(child&&child.exitCode===null){child.kill();await new Promise(r=>{child.once('exit',r);setTimeout(r,5000).unref();});}
 console.log('Cópia de validação preservada em '+destination);
}
