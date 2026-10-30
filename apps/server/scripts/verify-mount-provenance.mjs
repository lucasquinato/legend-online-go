import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const db=new DatabaseSync('data/state.sqlite',{readOnly:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const records=[];
for(const [module,version] of [[14,'0eb4d3bf'],[15,'25f5d0a9']])for(const versioned of [false,true]){
 const path=`/cdn/${module}${versioned?'_'+version:''}.png`;
 const row=db.prepare('SELECT * FROM assets WHERE path=?').get(path);if(!row)continue;
 const wire=readFileSync('data/assets/objects/'+row.sha256+'.bin');
 const prefix=wire.subarray(0,5).toString()==='road7'?37:0;
 const body=wire.subarray(prefix);
 const decoded=Buffer.concat([Buffer.from('CWS'),body.subarray(-121),body.subarray(21,-121)]);
 const reference=versioned?`reference/mounts/online-${module}.swf`:`reports/montarias/evidence/${module}.png.swf`;
 const expected=readFileSync(reference);
 records.push({path,wireBytes:wire.length,wireSha256:sha(wire),outerHeaderBytes:prefix,decodedBytes:decoded.length,decodedSha256:sha(decoded),reference,referenceSha256:sha(expected),matches:sha(decoded)===sha(expected)});
}
db.close();if(records.some(r=>!r.matches))throw Error('Source module provenance mismatch');
writeFileSync('reference/mounts/local-ui/source-provenance.json',JSON.stringify(records,null,2));console.log(JSON.stringify(records.map(r=>({path:r.path,outerHeaderBytes:r.outerHeaderBytes,matches:r.matches}))));
