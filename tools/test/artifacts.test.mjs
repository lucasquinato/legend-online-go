import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,readdirSync,rmSync} from 'node:fs';import {resolve,join,sep} from 'node:path';import {tmpdir} from 'node:os';import {sha256} from '../release/protocol.mjs';
test('artifact package deduplicates data, restores matching locks and rejects corrupted objects',()=>{
 const root=mkdtempSync(join(tmpdir(),'legend-go-artifacts-')),tool=join(root,'tools/artifacts.mjs');
 try{
  for(const d of ['tools','docs','.artifacts'])mkdirSync(join(root,d),{recursive:true});copyFileSync(new URL('../artifacts.mjs',import.meta.url),tool);
  const bytes=Buffer.from('fixture'),hash=sha256(bytes),files=['.artifacts/one.bin','.artifacts/two.bin'].map(path=>({path,bytes:bytes.length,sha256:hash}));
  for(const row of files)writeFileSync(join(root,row.path),bytes);writeFileSync(join(root,'docs/artifacts.lock.json'),JSON.stringify({schema:1,files}));
  const run=(...args)=>execFileSync(process.execPath,[tool,...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}),pack=join(root,'package');run('pack',pack);assert.equal(readdirSync(join(pack,'objects')).length,1);
  for(const row of files)rmSync(join(root,row.path));run('restore',pack);for(const row of files)assert.deepEqual(readFileSync(join(root,row.path)),bytes);
  writeFileSync(join(pack,'objects',hash+'.bin'),'broken');assert.throws(()=>run('restore',pack));
 }finally{if(!root.startsWith(resolve(tmpdir())+sep))throw Error('Unsafe temporary directory');rmSync(root,{recursive:true,force:true});}
});
