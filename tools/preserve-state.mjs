// Explicit private backup; never used by setup, builds or artifact packages.
import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {releasePrivateKey,loadProjectEnv} from './env.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv[2])throw Error('Informe explicitamente a pasta do servidor a preservar.');
const source=resolve(process.argv[2]),dest=resolve(root,'.local/preservation',process.argv[3]??new Date().toISOString().replaceAll(':','-'));
if(!dest.startsWith(resolve(root,'.local/preservation')+sep))throw Error('Destino fora da preservação privada.');
if(existsSync(dest))throw Error('Destino já existe; backups não são sobrescritos.');
const db=new DatabaseSync(join(source,'data/state.sqlite'),{readOnly:true});
db.exec('PRAGMA busy_timeout=15000');
mkdirSync(dest,{recursive:true});
try{await backup(db,join(dest,'state.sqlite'));}finally{db.close();}
for(const [input,output] of [['data/replay-rsa.pem','replay-rsa.pem'],['.env','server.env']])if(existsSync(join(source,input)))copyFileSync(join(source,input),join(dest,output));
writeFileSync(join(dest,'release-private.pem'),releasePrivateKey(),{mode:0o600});
copyFileSync(loadProjectEnv(),join(dest,'server.env'));
const files=['state.sqlite','replay-rsa.pem','server.env','release-private.pem'].filter(name=>existsSync(join(dest,name))).map(path=>({path,bytes:statSync(join(dest,path)).size,sha256:createHash('sha256').update(readFileSync(join(dest,path))).digest('hex')}));
const restored=new DatabaseSync(join(dest,'state.sqlite'),{readOnly:true});
const integrity=restored.prepare('PRAGMA integrity_check').get().integrity_check;
const accounts=restored.prepare('SELECT COUNT(*) n FROM users').get().n;
restored.close();if(integrity!=='ok')throw Error('Integridade do backup inválida.');
writeFileSync(join(dest,'manifest.json'),JSON.stringify({schema:1,private:true,at:new Date().toISOString(),integrity,accounts,files},null,2)+'\n');
console.log(JSON.stringify({destination:dest,integrity,accounts,files:files.length}));
