// Export only cached asset metadata and binaries; never accounts or progress.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),source=resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Informe explicitamente o diretório data de origem.');
const output=join(root,'vendor/static-assets');mkdirSync(join(output,'objects'),{recursive:true});
const db=new DatabaseSync(join(source,'state.sqlite'),{readOnly:true});
const rows=db.prepare('SELECT id,path,bytes,sha256,content_type,saved_at FROM assets ORDER BY id').all();
const copied=new Set(),valid=[];let rejected=0;
for(const row of rows){
 if(!/^[a-f0-9]{64}$/.test(row.id)||!/^\/(cdn|client|xml)\//.test(row.path)||!/^[a-f0-9]{64}$/.test(row.sha256)){rejected++;continue;}
 const input=join(source,'assets/objects',row.sha256+'.bin');
 if(!copied.has(row.sha256)){
  if(!existsSync(input)){rejected++;continue;}
  const bytes=readFileSync(input);
  if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256){rejected++;continue;}
  copyFileSync(input,join(output,'objects',row.sha256+'.bin'));copied.add(row.sha256);
 }
 valid.push(row);
}
db.close();
// Export only the OAS version index. No external database is copied.
let oas;
if(existsSync(join(source,'external-oas/cache.sqlite'))){
 const external=new DatabaseSync(join(source,'external-oas/cache.sqlite'),{readOnly:true});
 const row=external.prepare("SELECT id,path,bytes,sha256,content_type,saved_at FROM assets WHERE path='/client/res_md5.dat' ORDER BY saved_at DESC LIMIT 1").get();
 if(row&&/^[a-f0-9]{64}$/.test(row.sha256)){
  const bytes=readFileSync(join(source,'external-oas/objects',row.sha256+'.bin'));
  if(createHash('sha256').update(bytes).digest('hex')===row.sha256){copyFileSync(join(source,'external-oas/objects',row.sha256+'.bin'),join(output,'objects',row.sha256+'.bin'));oas=row;}
 }
 external.close();
}
writeFileSync(join(output,'index.json'),JSON.stringify({schema:1,assets:valid,oas},null,2)+'\n');
console.log(JSON.stringify({assets:valid.length,objects:copied.size,rejected}));
