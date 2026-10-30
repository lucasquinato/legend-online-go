import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OPENING_WAIT_MS, RESULT_ANIMATION_MS, RESULT_MARGIN_MS } from '../dist/features/battle/timing.js';
const health=await(await fetch('http://127.0.0.1:8080/healthz')).json();
const tests=['data/battle-timing-test.log','data/battle-timing-return-test.log'].map(file=>{
 const log=readFileSync(file,'utf8'),count=name=>Number(log.match(new RegExp('(?:ℹ|#) '+name+' (\\d+)'))?.[1]??-1);
 return {file,total:count('tests'),passed:count('pass'),failed:count('fail')};
});
const result={at:new Date().toISOString(),health,pid:Number(readFileSync('data/battle-server.pid','utf8').trim()),
 openingWaitMs:OPENING_WAIT_MS,endingAnimationMs:RESULT_ANIMATION_MS,endingMarginMs:RESULT_MARGIN_MS,
 tests,sourceHash:createHash('sha256').update(readFileSync('src/features/battle/timing.ts')).digest('hex'),
 backup:readFileSync('data/battle-timing-backup.txt','utf8').trim(),formatterExecuted:false};
writeFileSync('data/battle-timing-deployment.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(!health.ok||health.mode!=='tutorial'||!health.gameListening||tests.some(t=>t.failed!==0||t.passed!==t.total))process.exitCode=1;
