import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync('data/state.sqlite',{readOnly:true});
const a=db.prepare('SELECT * FROM assets WHERE path=?').get('/client/code_md5.dat');db.close();
if(a){const b=readFileSync('data/assets/objects/'+a.sha256+'.bin');const xml=inflateSync(inflateSync(b)).toString();console.log(xml.match(/<Item\b[^>]*\/>/g)?.filter(r=>r.includes('name="14.png"')||r.includes('name="15.png"')||r.includes('name="2.png"')).join('\n'));}
