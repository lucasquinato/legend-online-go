import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { AssetCache } from '../dist/assets.js';

for (const primary of ['ok','404','html','timeout']) test(`asset recovery: ${primary}, OAS version and durable cache`,async()=>{
 mkdirSync('.test-data',{recursive:true});const dir=mkdtempSync('.test-data/asset-fallback-');
 const db=new DatabaseSync(':memory:');const realFetch=globalThis.fetch,calls=[];
 const root=join(dir,'external-oas');mkdirSync(join(root,'objects'),{recursive:true});
 const index=deflateSync(deflateSync(Buffer.from('<Root><Item name="icon/test.png" md5="12345678" size="4" /></Root>')));
 const hash=createHash('sha256').update(index).digest('hex');writeFileSync(join(root,'objects',hash+'.bin'),index);
 const ext=new DatabaseSync(join(root,'cache.sqlite'));ext.exec('CREATE TABLE assets(path TEXT,sha256 TEXT,saved_at TEXT)');ext.prepare('INSERT INTO assets VALUES(?,?,?)').run('/client/res_md5.dat',hash,'now');ext.close();
 const config={upstreamOrigin:'https://remake.example',upstreamTimeoutMs:1000,resourceMode:'cache-first'};
 const cache=new AssetCache(config,{dir,db,dependency(){}}),url=new URL('/cdn/icon/test_aaaaaaaa.png?rnd=1',config.upstreamOrigin);
 globalThis.fetch=async(source)=>{calls.push(String(source));if(calls.length===1){if(primary==='timeout')throw new Error('timeout');if(primary==='404')return new Response('',{status:404});if(primary==='html')return new Response('<html>error</html>',{headers:{'content-type':'text/html'}});}return new Response(Buffer.from([137,80,78,71]),{headers:{'content-type':'image/png'}});};
 try{
  const asset=await cache.get(url);assert.equal(asset.bytes,4);assert.equal(calls.length,primary==='ok'?1:2);
  if(primary!=='ok')assert.equal(calls[1],'https://res806oas.creaction-network.com/icon/test_12345678.png');
  await cache.get(url);assert.equal(calls.length,primary==='ok'?1:2);
  config.resourceMode='offline';await cache.get(url);await assert.rejects(cache.get(new URL('/cdn/icon/missing.png',config.upstreamOrigin)));
  assert.equal(calls.length,primary==='ok'?1:2);
  assert.equal(db.prepare('SELECT source FROM asset_sources').get().source,calls.at(-1));
 }finally{globalThis.fetch=realFetch;db.close();rmSync(dir,{recursive:true,force:true});}
});
import { AssetFallback } from '../dist/asset-fallback.js';
test('foreign executable modules and templates never use OAS',()=>{
 const fallback=new AssetFallback('.test-data/no-external-cache');
 for(const path of ['/client/Loading.swf','/client/Module/3.swf','/xml/tempinfos.xml','/cdn/9_177f9627.png','/cdn/2.png'])assert.deepEqual(fallback.candidates(new URL(path,'https://remake.example')),[]);
 for(const path of ['/cdn/swf/boss040/boss040.swf','/cdn/skilleffect/fire.swf','/cdn/equip/body/0.bswf'])assert.equal(fallback.candidates(new URL(path,'https://remake.example')).length,2);
});
