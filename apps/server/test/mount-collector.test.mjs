import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {buildMountPlan,validMountAsset,collectMountAssets} from '../scripts/collect-mount-assets.mjs';
function swf(){const b=Buffer.alloc(16);b.write('FWS');b[3]=10;b.writeUInt32LE(16,4);b.set([8,0,0,12,1,0,0,0],8);return b;}
test('plan uses resource versions, deduplicates mounts and skips only the Koala preview',()=>{
  const content={mounts:[{TemplateId:1,TemplateName:'A',AvatarPath:'/mount_a'},{TemplateId:2,TemplateName:'B',AvatarPath:'/mount_a'},{TemplateId:8473,TemplateName:'Koala',AvatarPath:'/mount_koala'}],cards:[]};
  const index=new Map([['/cdn/equip_show/mount_a/2.swf',{md5:'12345678',size:'16'}]]);
  const plan=buildMountPlan(content,index);assert.equal(plan.length,4);
  assert.equal(plan[0].path,'/cdn/equip_show/mount_a/2_12345678.swf');assert.equal(plan[0].mounts.length,2);
  assert.equal(plan.find(r=>r.kind==='preview'&&r.mounts[0].id===8473).skip,'known-koala-preview-403');
  assert.equal(plan.find(r=>r.kind==='world'&&r.mounts[0].id===8473).skip,undefined);
  assert.equal(validMountAsset(Buffer.alloc(0),{path:'/2.bswf',expectedBytes:200}),false);
});
test('collector saves a real binary, rejects empty HTTP 200, resumes without downloading valid files',async()=>{
  const dir=mkdtempSync(resolve('.test-data/mount-collector-'));mkdirSync(join(dir,'assets/objects'),{recursive:true});
  const db=new DatabaseSync(join(dir,'state.sqlite'));db.exec('CREATE TABLE assets(id TEXT PRIMARY KEY,path TEXT,bytes INTEGER,sha256 TEXT,content_type TEXT,saved_at TEXT)');
  const body=swf(),plan=[{path:'/cdn/equip_show/a/2.swf',kind:'preview',expectedBytes:16,mounts:[]},{path:'/cdn/swf/avatar/b/2.bswf',kind:'world',expectedBytes:200,mounts:[]}];
  let calls=0;const fetchFile=async url=>{calls++;const bytes=url.pathname.includes('/a/')?body:Buffer.alloc(0);return new Response(bytes,{headers:{'content-length':String(bytes.length),'content-type':'application/octet-stream'}});};
  try{
    const opts={db,dataDir:dir,origin:'https://example.test',plan,reportPath:join(dir,'report.json'),fetchFile};
    const first=await collectMountAssets(opts);assert.equal(first.summary.downloaded,1);assert.equal(first.summary.failed,1);assert.equal(calls,2);
    const row=db.prepare('SELECT * FROM assets').get();assert.deepEqual(readFileSync(join(dir,'assets/objects',row.sha256+'.bin')),body);
    calls=0;const second=await collectMountAssets(opts);assert.equal(second.summary['already-cached'],1);assert.equal(calls,1);
    assert.equal(validMountAsset(body,{path:'/2.swf',expectedBytes:17}),false);
    const packed=Buffer.concat([Buffer.from('CWS'),body.subarray(3,8),deflateSync(body.subarray(8))]);assert.equal(validMountAsset(packed,{path:'/2.swf',expectedBytes:packed.length}),true);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
