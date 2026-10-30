import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const folder=resolve('.test-data/loading-table-probe'); mkdirSync(folder,{recursive:true});
const bundle=Buffer.from(await (await fetch('http://127.0.0.1:8080/xml/tempinfos.xml')).arrayBuffer());
assert.equal(bundle.readUInt32BE(0),bundle.length-4,'live HTTP response must declare its compressed payload size');
const original=readFileSync('reference/quests/tempinfos.original.bin');
const data=inflateSync(bundle.subarray(4)); let offset=4,count=0;
while(offset<data.length) { const n=data[offset++]; offset+=n; const size=data.readUInt32BE(offset); offset+=4+size; count++; }
assert.equal(offset,data.length);
const bundleFile=join(folder,'tables.bin'),fixture=join(folder,'fixture.json'),probe=join(folder,'ClientTableProbe.swf');
writeFileSync(bundleFile,bundle);
writeFileSync(fixture,JSON.stringify({url:pathToFileURL(bundleFile).href,version:data.readUInt32BE(0),tables:count,oldHeader:original.readUInt32BE(0),actualPayloadBytes:bundle.length-4}));
execFileSync('java',['-Djava.awt.headless=true','-jar',resolve('../../vendor/ffdec/ffdec.jar'),'-replace',resolve('reference/mounts/probe/Probe.swf'),probe,'MountRuntimeProbe',resolve('scripts/swf/ClientTableProbe.as')],{stdio:'inherit',windowsHide:true});
const core='reference/chat/local-ui/local-2.swf';
execFileSync(process.execPath,['scripts/probe-mount-runtime.mjs',core,'--core='+core,'--probe='+probe,'--targets='+JSON.stringify([core]),'--classes=com.pickgliss.loaderii.BaseLoaderII,com.pickgliss.loader.data.LoaderInfo','--fixture='+fixture],{stdio:'inherit',windowsHide:true});
const result=JSON.parse(readFileSync('reference/mounts/probe/local-2.swf.runtime.json'));
assert.ok(result.logs.includes('stale-header-rejection-reproduced'));
assert.ok(result.logs.some(line=>line?.startsWith('native-table-loader-passed tables=292')));
mkdirSync('reports/loading-73-95',{recursive:true});
writeFileSync('reports/loading-73-95/native-loader.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({nativeLoader:true,xmlTables:count,header:bundle.readUInt32BE(0),payloadBytes:bundle.length-4}));
