import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import { createExternalGateway, validAsset } from '../scripts/external-launcher-gateway.mjs';

test('proxy preserves requests and bodies, isolates another origin and rejects empty/error assets',async()=>{
  const dir=mkdtempSync(resolve('.test-data/external-gateway-'));
  const upstream=http.createServer((request,reply)=>{assert.equal(request.headers.cookie,'test=session');reply.end('original body');});
  await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
  const gateway=createExternalGateway({directory:dir,port:0,enableDebugger:false});
  try {
    const address=await gateway.start();
    const body=await new Promise((done,fail)=>{
      http.get({host:'127.0.0.1',port:address.port,path:`http://127.0.0.1:${upstream.address().port}/game`,headers:{cookie:'test=session'}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>done(body));}).on('error',fail);
    });assert.equal(body,'original body');
    assert.equal(gateway.save('https://lobr.creaction-network.com/cdn/mount/2.bswf',Buffer.alloc(0),'application/octet-stream','test'),false);
    assert.equal(gateway.save('https://lobr.creaction-network.com/cdn/mount/2.bswf',Buffer.from('<html>error</html>'),'text/html','test'),false);
    assert.equal(gateway.save('https://example.com/cdn/mount/2.bswf',Buffer.from('binary'),'application/octet-stream','test'),false);
    assert.equal(gateway.save('https://lobr.creaction-network.com/cdn/mount/2.bswf?token=private',Buffer.from('binary asset'),'application/octet-stream','test'),true);
    const db=new DatabaseSync(join(dir,'cache.sqlite'),{readOnly:true});const rows=db.prepare('SELECT * FROM assets').all();db.close();
    assert.equal(rows.length,1);assert.equal(rows[0].path,'/cdn/mount/2.bswf');assert.equal(rows[0].origin,'https://lobr.creaction-network.com');
    assert.equal(readFileSync(join(dir,'objects',rows[0].sha256+'.bin')).toString(),'binary asset');
    assert.ok(!JSON.stringify(rows).includes('private'));
  }finally{await gateway.close();await new Promise(done=>upstream.close(done));rmSync(dir,{recursive:true,force:true});}
});

test('binary fallback saves valid SWF once, keeps credentials out of metadata and rejects truncation',async()=>{
  const dir=mkdtempSync(resolve('.test-data/external-binary-'));
  const body=Buffer.from([8,0,0,12,1,0,0,0]);const header=Buffer.alloc(8);header.write('CWS');header[3]=10;header.writeUInt32LE(16,4);
  const swf=Buffer.concat([header,deflateSync(body)]);let downloads=0;
  const gateway=createExternalGateway({directory:dir,port:0,enableDebugger:false,fetchAsset:async(url,options)=>{
    downloads++;assert.equal(options.headers.Cookie,'test-cookie');
    return new Response(swf,{headers:{'content-type':'application/x-shockwave-flash','content-length':String(swf.length)}});
  }});
  try{
    const url='https://res806oas.creaction-network.com:8080/equip_show/mount/test.swf?session=private';
    assert.equal(gateway.save(url,Buffer.from(swf.toString('utf8')),'application/x-shockwave-flash','cef-debugger'),false);
    assert.deepEqual(await Promise.all([gateway.download(url,{Cookie:'test-cookie'}),gateway.download(url,{Cookie:'test-cookie'})]),[true,true]);
    assert.equal(downloads,1);assert.equal(await gateway.download(url),true);assert.equal(downloads,1);
    const db=new DatabaseSync(join(dir,'cache.sqlite'),{readOnly:true});const row=db.prepare('SELECT * FROM assets').get();const request=db.prepare('SELECT * FROM requests').get();db.close();
    assert.equal(row.transport,'direct-binary');assert.deepEqual(readFileSync(join(dir,'objects',row.sha256+'.bin')),swf);
    assert.ok(!JSON.stringify({row,request}).includes('private'));assert.ok(!JSON.stringify({row,request}).includes('test-cookie'));
    assert.equal(validAsset(swf.subarray(0,swf.length-2),'/2.swf','application/x-shockwave-flash'),false);
    const compressed=deflateSync(Buffer.from('<root>data</root>')),prefix=Buffer.alloc(4);prefix.writeUInt32BE(compressed.length);
    const table=Buffer.concat([prefix,compressed]);assert.equal(validAsset(table,'/xml/tempinfos.xml'),true);
    assert.equal(validAsset(Buffer.from(table.toString('utf8')),'/xml/tempinfos.xml'),false);
  }finally{await gateway.close();rmSync(dir,{recursive:true,force:true});}
});

test('CONNECT tunnels bytes unchanged without certificate interception',async()=>{
  const dir=mkdtempSync(resolve('.test-data/external-tunnel-'));
  const echo=net.createServer(socket=>socket.pipe(socket));await new Promise(done=>echo.listen(0,'127.0.0.1',done));
  const gateway=createExternalGateway({directory:dir,port:0,enableDebugger:false});
  try {
    const address=await gateway.start();
    await new Promise((done,fail)=>{
      const socket=net.connect(address.port,'127.0.0.1');let buffer=Buffer.alloc(0),established=false;
      socket.setTimeout(3000,()=>{socket.destroy();fail(new Error('Tunnel timeout'));});socket.on('error',fail);
      socket.on('connect',()=>socket.write(`CONNECT 127.0.0.1:${echo.address().port} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`));
      socket.on('data',chunk=>{if(!established){buffer=Buffer.concat([buffer,chunk]);if(buffer.includes('\r\n\r\n')){assert.match(buffer.toString(),/200 Connection Established/);established=true;socket.write('unchanged encrypted bytes');}}else{assert.equal(chunk.toString(),'unchanged encrypted bytes');socket.destroy();done();}});
    });assert.equal(gateway.status.httpsTunnels,1);assert.equal(gateway.status.captured,0);
  }finally{await gateway.close();await new Promise(done=>echo.close(done));rmSync(dir,{recursive:true,force:true});}
});
