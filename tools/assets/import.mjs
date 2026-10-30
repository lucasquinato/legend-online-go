import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,copyFileSync,existsSync,statSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadProjectEnv} from '../env.mjs';
loadProjectEnv();
const root=fileURLToPath(new URL('../../',import.meta.url));
const input=resolve(root,'vendor/static-assets'),dest=resolve(root,'apps/server',process.env.DATA_DIR??'data');
if(!dest.startsWith(resolve(root,'apps/server')+sep))throw Error('DATA_DIR fora do servidor.');
const manifest=JSON.parse(readFileSync(join(input,'index.json'),'utf8'));
if(manifest.schema!==1)throw Error('Índice de assets desconhecido.');
mkdirSync(join(dest,'assets/objects'),{recursive:true});
const db=new DatabaseSync(join(dest,'state.sqlite'));
const schema='CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,path TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,content_type TEXT NOT NULL,saved_at TEXT NOT NULL)';db.exec(schema);
const insert=db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,bytes=excluded.bytes,sha256=excluded.sha256,content_type=excluded.content_type,saved_at=excluded.saved_at');
const checked=new Set();
function object(row,folder){
 if(!/^[a-f0-9]{64}$/.test(row.sha256)||!/^[a-f0-9]{64}$/.test(row.id))throw Error('Hash inválido no pacote.');
 const src=join(input,'objects',row.sha256+'.bin');
 if(!checked.has(row.sha256)){const bytes=readFileSync(src);if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Asset corrompido: '+row.path);checked.add(row.sha256);}
 mkdirSync(folder,{recursive:true});const target=join(folder,row.sha256+'.bin');
 if(!existsSync(target)||statSync(target).size!==row.bytes||createHash('sha256').update(readFileSync(target)).digest('hex')!==row.sha256)copyFileSync(src,target);
}
try{db.exec('BEGIN');for(const row of manifest.assets){object(row,join(dest,'assets/objects'));insert.run(row.id,row.path,row.bytes,row.sha256,row.content_type,row.saved_at);}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
if(manifest.oas){const row=manifest.oas;object(row,join(dest,'external-oas/objects'));const external=new DatabaseSync(join(dest,'external-oas/cache.sqlite'));external.exec(schema);external.prepare('INSERT OR REPLACE INTO assets VALUES(?,?,?,?,?,?)').run(row.id,row.path,row.bytes,row.sha256,row.content_type,row.saved_at);external.close();}
console.log('Acervo importado: '+manifest.assets.length+' entradas; nenhuma conta importada.');
