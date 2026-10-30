import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const folder='reference/ui-compat';mkdirSync(join(folder,'baselines'),{recursive:true});
const db=new DatabaseSync('data/state.sqlite',{readOnly:true});
function asset(path){const rows=db.prepare('SELECT * FROM assets WHERE path=?').all(path);if(!rows.length||new Set(rows.map(r=>r.sha256)).size!==1)throw Error('Missing/ambiguous exact-version asset: '+path);const row=rows[0],bytes=readFileSync('data/assets/objects/'+row.sha256+'.bin');if(sha(bytes)!==row.sha256||bytes.length!==row.bytes)throw Error('Corrupt cached asset: '+path);return {...row,bytes};}
function decode(wire){if(wire.subarray(0,3).toString()==='CWS')return wire;const prefix=wire.subarray(0,5).toString()==='road7'?37:0,t=wire.subarray(prefix);const bytes=Buffer.concat([Buffer.from('CWS'),t.subarray(-121),t.subarray(21,-121)]);if(bytes.readUInt32LE(4)<8||inflateSync(bytes.subarray(8)).length+8<bytes.readUInt32LE(4))throw Error('Invalid decoded SWF length');return bytes;}
const index=asset('/client/code_md5.dat'),xml=inflateSync(inflateSync(index.bytes)).toString();
const modules={};for(const id of[2,14,15]){
 const text=xml.match(new RegExp(`<Item\\b[^>]*name="${id}\\.png"[^>]*/>`))?.[0];if(!text)throw Error('Module absent from original index: '+id);
 const token=text.match(/md5="([a-f0-9]{8,32})"/)?.[1];if(!token)throw Error('Invalid version token');
 const sourcePath=`/cdn/${id}_${token}.png`,source=asset(sourcePath),bytes=decode(source.bytes),file=join(folder,'baselines',`${id}-${token}.swf`);
 writeFileSync(file,bytes);modules[id]={sourcePath,token,wireSha256:source.sha256,wireBytes:source.bytes.length,file,sha256:sha(bytes),bytes:bytes.length,allowedMethods:id===14?['mounts.MountsFrame.__refiningSoulBtnHandler']:[]};
}
db.close();const lock={schema:1,index:{path:'/client/code_md5.dat',sha256:index.sha256},modules};
const path=join(folder,'release-lock.json');if(existsSync(path)&&readFileSync(path,'utf8')!==JSON.stringify(lock,null,2))throw Error('Pinned release changed; create a new release lock and revalidate dependencies instead of overwriting');
writeFileSync(path,JSON.stringify(lock,null,2));console.log(JSON.stringify(lock));

