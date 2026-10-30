import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,mkdirSync,existsSync,readdirSync} from 'node:fs';import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {sha256,seal} from '../release/protocol.mjs';
import {releasePrivateKey} from '../env.mjs';
const run=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
const build=async(version)=>run('pwsh',['-NoProfile','-File','tools/build/launcher.ps1','-Version',version],{cwd:root,windowsHide:true});
mkdirSync(resolve(root,'.local/tests'),{recursive:true});const temp=mkdtempSync(resolve(root,'.local/tests/updater-'));
await build('0.1.0');const install=join(temp,'install');cpSync(resolve(root,'dist/launcher'),install,{recursive:true});
const version=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version;await build(version);
const files=[],packageRoot=resolve(root,'dist/launcher');
function walk(folder,prefix=''){for(const d of readdirSync(folder,{withFileTypes:true})){if(d.isDirectory())walk(join(folder,d.name),prefix+d.name+'/');else{const bytes=readFileSync(join(folder,d.name));files.push({path:prefix+d.name,bytes:bytes.length,sha256:sha256(bytes)});}}}walk(packageRoot);
const release={schema:1,kind:'launcher',version,protocol:1,files},envelope=seal(release,releasePrivateKey());let tampered=false;
const bad={...envelope,payload:Buffer.from(JSON.stringify({...release,version:'9.9.9'})).toString('base64')};
const server=createServer((req,res)=>{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path==='/updates/launcher/stable.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify(tampered?bad:envelope));return;}const name=path.replace('/updates/launcher/files/'+version+'/','');if(!files.some(f=>f.path===name)){res.writeHead(404).end();return;}res.end(readFileSync(join(packageRoot,name)));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const updater=resolve(root,'dist/launcher/LegendOnline.Updater.exe'),origin='http://127.0.0.1:'+server.address().port;
try{
await run(updater,['--install',install,'--server',origin,'--no-launch'],{cwd:root,windowsHide:true,timeout:60000});
for(const row of release.files)assert.equal(sha256(readFileSync(join(install,row.path))),row.sha256,row.path);
assert.ok(!existsSync(join(install,'.update/transaction.json')));
// Recover an interrupted transaction before opening any AIR process.
const backup=join(install,'.update/backup-test');mkdirSync(backup,{recursive:true});writeFileSync(join(backup,'recovery.txt'),'original');writeFileSync(join(install,'recovery.txt'),'partial');writeFileSync(join(install,'new-file.txt'),'partial');
writeFileSync(join(install,'.update/transaction.json'),JSON.stringify({backup:'backup-test',files:[{path:'recovery.txt',existed:true},{path:'new-file.txt',existed:false}]}));
await run(updater,['--install',install,'--server',origin,'--recover','--no-launch'],{cwd:root,windowsHide:true,timeout:30000});
assert.equal(readFileSync(join(install,'recovery.txt'),'utf8'),'original');assert.ok(!existsSync(join(install,'new-file.txt')));
// Native verifier must reject a tampered signed payload, not merely the JS validator.
tampered=true;await assert.rejects(run(updater,['--verify-only','--manifest',origin+'/updates/launcher/stable.json'],{cwd:root,windowsHide:true,timeout:30000}),e=>e.code===1&&e.stderr.includes('Assinatura'));
console.log(JSON.stringify({upgrade:'0.1.0 -> '+version,files:release.files.length,crashRecovery:true,tamperedManifestRejected:true,install}));
}finally{await new Promise(r=>server.close(r));}
