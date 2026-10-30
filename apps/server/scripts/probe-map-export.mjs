import {createServer} from 'node:http';
import {createServer as tcp} from 'node:net';
import {spawn} from 'node:child_process';
import {resolve, basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const target=process.argv[2]??'reference/mounts/local-ui/local-14.swf';
const failure=process.argv.includes('--expect-failure');
const importDenied=process.argv.includes('--expect-import-denied');
const both=process.argv.includes('--both');
const targetsArgument=process.argv.find(value=>value.startsWith('--targets='));
const targets=targetsArgument?JSON.parse(targetsArgument.slice(10)):both?['reference/mounts/local-ui/local-14.swf','reference/mounts/local-ui/local-15.swf']:[target];
const core=process.argv.find(value=>value.startsWith('--core='))?.slice(7)??'reference/campaign/evidence/current2.swf';
const probe=process.argv.find(value=>value.startsWith('--probe='))?.slice(8)??'reference/mounts/probe/Probe.swf';
const battleFixture=process.argv.find(value=>value.startsWith('--battle-fixture='))?.slice(17);
const fixture=process.argv.find(value=>value.startsWith('--fixture='))?.slice(10);
const files=['reference/mounts/probe/loading-library.swf',core,...targets].filter((p,i,list)=>list.indexOf(p)===i).map(p=>pathToFileURL(resolve(p)).href);
const mountClasses=['mounts.MountsFrame','mounts.PropertyItem','mounts.MountRefiningSoulFrame','mounts.MountRefiningSoulItem','mounts.WildSoulFrame','fashion.FashionStoreFrame'];
const shopClasses=['view.ShopFrame','view.subshop.MountShopFrame','view.subshop.MountPreviewFrame','view.subshop.MountShopGoodsItem','view.subshop.ShopCartFrame','view.subshop.StarShopFrame'];
const classArgument=process.argv.find(value=>value.startsWith('--classes='));
const classes=classArgument?classArgument.slice(10).split(','):both?[...mountClasses,...shopClasses]:target.includes('15.')?shopClasses:mountClasses;
const logs=[], ipcLogs=[];
const server=createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/client/Loading.swf'){res.end(readFileSync(probe));return;}
 if(u.pathname==='/plan'){res.end(JSON.stringify({files,classes,battleFixture:battleFixture?pathToFileURL(resolve(battleFixture)).href:null,fixture:fixture?pathToFileURL(resolve(fixture)).href:null}));return;}
 const text=u.searchParams.get('text');logs.push(text);console.log(text);res.end('ok');
});
await new Promise(r=>server.listen(18893,'127.0.0.1',r));
const ipc=tcp(s=>{s.on('data',b=>{const text=b.toString();ipcLogs.push(text);if(text.startsWith('hello'))s.write('play\thttp://127.0.0.1:18893\tprobe\tunused\t1\n');});});
await new Promise(r=>ipc.listen(18894,'127.0.0.1',r));
const engine=spawn(resolve('reference/mounts/probe/runtime/LegendEngine.exe'),['--ipc=18894','--token=local-probe','--slot=probe'],{cwd:resolve('reference/mounts/probe/runtime'),windowsHide:true});
let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;engine.kill();},15000);
const exitCode=await new Promise(r=>engine.on('exit',r));clearTimeout(timeout);server.close();ipc.close();
const loaded=targets.every(p=>logs.includes('loaded '+pathToFileURL(resolve(p)).href));
const verified=classes.every(name=>logs.some(line=>line?.startsWith('verified '+name+' [class ')));
const report={at:new Date().toISOString(),target,exitCode,timedOut,loaded,verified,expectedNativeTermination:failure,logs,runtime:ipcLogs.find(l=>l.includes('AIR WIN'))};
writeFileSync('reference/mounts/probe/'+(both?'both-modules':basename(target))+'.runtime.json',JSON.stringify(report,null,2));
if(failure){assert.equal(timedOut,false);assert.equal(exitCode,0);assert.equal(loaded,false);assert.equal(verified,false);}
else{assert.equal(timedOut,false);assert.equal(exitCode,0);assert.equal(loaded,true);assert.equal(verified,true);if(importDenied)assert.ok(logs.some(l=>l?.startsWith('error SecurityError: Error #3226')));else assert.ok(!logs.some(l=>l?.startsWith('error ')||l?.startsWith('uncaught ')));}
console.log(JSON.stringify({target,loaded,verified,expectedNativeTermination:failure,passed:true}));
