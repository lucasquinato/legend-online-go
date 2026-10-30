import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync,copyFileSync,statSync} from 'node:fs';
import {resolve,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),lock=join(root,'docs/artifacts.lock.json'),mode=process.argv[2];
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function path(base,name){const p=resolve(base,name);if(!p.startsWith(resolve(base)+sep))throw Error('Caminho fora do pacote.');return p;}
function list(folder){if(!existsSync(folder))return[];return readdirSync(folder,{withFileTypes:true}).flatMap(d=>d.isDirectory()?list(join(folder,d.name)):[join(folder,d.name)]);}
if(mode==='index'){
 const files=[...list(join(root,'vendor')),...list(join(root,'apps/server/reports')),
 ...list(join(root,'apps/server/reference')).filter(f=>/\.(swf|bin|exe|dll|png|jpg|zip)$/i.test(f))];
 const entries=files.filter(f=>!f.includes(sep+'staging'+sep)&&!f.endsWith('.log')).map(file=>({path:relative(root,file).split(sep).join('/'),bytes:statSync(file).size,sha256:hash(file)})).sort((a,b)=>a.path.localeCompare(b.path));
 writeFileSync(lock,JSON.stringify({schema:1,privateCapturedTemplates:true,files:entries},null,2)+'\n');console.log('Artefatos fixados: '+entries.length);
}else if(['pack','restore','verify'].includes(mode)){
 const manifest=JSON.parse(readFileSync(lock,'utf8'));if(manifest.schema!==1)throw Error('Lock de artefatos inválido.');
 const folder=process.argv[3]?resolve(process.argv[3]):undefined;
 if(mode!=='verify'&&!folder)throw Error('Informe o diretório do pacote.');
 if(mode==='pack'&&existsSync(folder))throw Error('Destino de pacote já existe.');
 if(mode==='pack'){mkdirSync(join(folder,'objects'),{recursive:true});copyFileSync(lock,join(folder,'artifacts.lock.json'));}
 if(mode==='restore'&&readFileSync(join(folder,'artifacts.lock.json'),'utf8')!==readFileSync(lock,'utf8'))throw Error('O pacote não corresponde ao commit atual.');
 for(const row of manifest.files){if(!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Hash inválido.');const local=path(root,row.path),object=folder?join(folder,'objects',row.sha256+'.bin'):undefined,input=mode==='restore'?object:local;
  if(!existsSync(input)||statSync(input).size!==row.bytes||hash(input)!==row.sha256)throw Error('Artefato ausente ou diferente: '+row.path);
  if(mode==='pack'&&!existsSync(object))copyFileSync(input,object);
  if(mode==='restore'){if(existsSync(local)&&hash(local)!==row.sha256)throw Error('Arquivo local diferente; restauração não sobrescreve: '+row.path);mkdirSync(resolve(local,'..'),{recursive:true});if(!existsSync(local))copyFileSync(input,local);}
 }
 console.log(mode+': '+manifest.files.length+' entradas verificadas.');
}else throw Error('Uso: node tools/artifacts.mjs index|verify|pack DESTINO|restore PACOTE');
