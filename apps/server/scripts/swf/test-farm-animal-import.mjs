import { readFileSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const [candidate,stage]=process.argv.slice(2),jar=resolve('../../vendor/ffdec/ffdec.jar'),lock=JSON.parse(readFileSync('reference/ui-compat/release-lock.json'));
const java=(file,args)=>execFileSync('java',['-Djava.awt.headless=true','-cp',jar,resolve(file),...args],{encoding:'utf8',windowsHide:true,timeout:120000});
const probe=join(stage,'FarmAnimalImportProbe.swf');
execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-replace',resolve('reference/mounts/probe/Probe.swf'),probe,'MountRuntimeProbe',resolve('scripts/swf/FarmAnimalImportProbe.as')],{encoding:'utf8',windowsHide:true,timeout:120000});
const db=new DatabaseSync('data/state.sqlite',{readOnly:true});const animals=['cow','sheep','horse','deer'].map(name=>{const row=db.prepare('SELECT * FROM assets WHERE path LIKE ? AND bytes>0 ORDER BY saved_at DESC LIMIT 1').get('/cdn/icon/farm/animal/'+name+'_%');assert.ok(row,'Animal asset missing '+name);const file=resolve('data/assets/objects/'+row.sha256+'.bin');assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),row.sha256);return {name,file,sha256:row.sha256,path:row.path};});db.close();
const reports={baseline:null,candidates:[]};
for(const [label,input] of [['baseline',lock.modules[2].file],['candidate',candidate]]){
 const alias=join(stage,`farm-${label}-alias.swf`);java('scripts/swf/FarmAnimalImportPatch.java',[resolve(input),alias,'--test-only']);
 for(const animal of label==='baseline'?animals.slice(0,1):animals){
  const output=execFileSync(process.execPath,['scripts/probe-mount-runtime.mjs',alias,'--core='+alias,'--targets=[]','--probe='+probe,'--battle-fixture='+animal.file,'--classes=farm.view.FarmAnimalItem'],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.ok(output.includes(label==='baseline'?'baseline-farm-animal-3226-reproduced':'farm-animal-native-import-passed'));
  const report=JSON.parse(readFileSync(`reference/mounts/probe/farm-${label}-alias.swf.runtime.json`));
  if(label==='baseline')reports.baseline=report;else reports.candidates.push({animal:animal.name,assetPath:animal.path,assetSha256:animal.sha256,...report});
 }
}
writeFileSync(join(stage,'farm-import-runtime.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
