import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const backup=readFileSync('data/battle-engine-backup.txt','utf8').trim();
const current=new DatabaseSync('data/state.sqlite',{readOnly:true});
const prior=new DatabaseSync(backup+'/state.sqlite',{readOnly:true});
const previousUsers=prior.prepare('SELECT id,username,salt,hash FROM users').all();
const users=current.prepare('SELECT id,username,salt,hash FROM users').all();
const accountsPreserved=previousUsers.every(old=>users.some(u=>u.id===old.id&&u.username===old.username&&u.salt===old.salt&&u.hash===old.hash));
current.close();prior.close();
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const fashion=JSON.parse(readFileSync('data/battle-engine-fashion-preservation.json','utf8').replace(/^\uFEFF/,''));
const log=readFileSync('data/battle-engine-full-test-final.log','utf8');
const count=name=>Number(log.match(new RegExp('(?:ℹ|#) '+name+' (\\d+)'))?.[1]??-1);
const health=await(await fetch('http://127.0.0.1:8080/healthz')).json();
const report={at:new Date().toISOString(),backup,serverPid:Number(readFileSync('data/battle-server.pid','utf8').trim()),health,
  tests:{total:count('tests'),passed:count('pass'),failed:count('fail'),log:'data/battle-engine-full-test-final.log'},
  accounts:{before:previousUsers.length,current:users.length,previousAccountsAndCredentialsPreserved:accountsPreserved},
  fashion:{files:fashion.length,unchanged:fashion.every(f=>f.equal)},
  attributesSourceUnchanged:hash('src/attributes.ts')===hash(backup+'/src/attributes.ts'),
  sourceHash:hash('src/features/battle/engine.ts'),compiledHash:hash('dist/features/battle/engine.js'),
  report:'reports/batalhas/implementacao.md',formatterExecuted:false};
writeFileSync('data/battle-engine-deployment.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!health.ok||health.mode!=='tutorial'||!health.gameListening||report.tests.failed!==0||!accountsPreserved||!report.fashion.unchanged)process.exitCode=1;
