import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
test('root environment selects .env or example as a whole and preserves process overrides',()=>{
 const folder=mkdtempSync(join(tmpdir(),'legend-env-'));
 try{
  mkdirSync(join(folder,'tools'));copyFileSync(new URL('../env.mjs',import.meta.url),join(folder,'tools/env.mjs'));
  writeFileSync(join(folder,'.env.example'),'LEGEND_ENV_TEST_VALUE=example\nLEGEND_ENV_TEST_EXAMPLE_ONLY=present\n');
  const script="import {loadProjectEnv} from './tools/env.mjs';loadProjectEnv();console.log(JSON.stringify({value:process.env.LEGEND_ENV_TEST_VALUE,only:process.env.LEGEND_ENV_TEST_EXAMPLE_ONLY??null}));";
  const run=extra=>{const env={...process.env,...extra};delete env.LEGEND_SKIP_ENV_FILE;delete env.LEGEND_ENV_TEST_EXAMPLE_ONLY;return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:folder,env,encoding:'utf8'}));};
  assert.deepEqual(run({}),{value:'example',only:'present'});
  writeFileSync(join(folder,'.env'),'LEGEND_ENV_TEST_VALUE=local\n');
  assert.deepEqual(run({}),{value:'local',only:null});
  assert.deepEqual(run({LEGEND_ENV_TEST_VALUE:'process'}),{value:'process',only:null});
 }finally{if(!folder.startsWith(resolve(tmpdir())+sep))throw Error('Unsafe temporary path');rmSync(folder,{recursive:true,force:true});}
});
test('backend config uses the root fallback even when launched inside apps/server',()=>{
 const folder=mkdtempSync(join(tmpdir(),'legend-backend-env-'));
 try{
  const server=join(folder,'apps/server');mkdirSync(join(server,'src'),{recursive:true});
  copyFileSync(new URL('../../apps/server/src/config.ts',import.meta.url),join(server,'src/config.ts'));
  writeFileSync(join(folder,'package.json'),'{"type":"module"}');
  writeFileSync(join(folder,'.env.example'),'SERVER_MODE=tutorial\nHTTP_PORT=18011\n');
  const script="import {loadConfig} from './src/config.ts';console.log(loadConfig().httpPort);";
  const run=(extra={})=>{const env={...process.env};delete env.LEGEND_SKIP_ENV_FILE;delete env.HTTP_PORT;Object.assign(env,extra);return Number(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:server,env,encoding:'utf8'}).trim());};
  assert.equal(run(),18011);writeFileSync(join(folder,'.env'),'HTTP_PORT=18012\n');
  assert.equal(run(),18012);assert.equal(run({HTTP_PORT:'18013'}),18013);
 }finally{if(!folder.startsWith(resolve(tmpdir())+sep))throw Error('Unsafe temporary path');rmSync(folder,{recursive:true,force:true});}
});
