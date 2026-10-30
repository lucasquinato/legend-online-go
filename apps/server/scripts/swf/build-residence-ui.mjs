import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const lock=JSON.parse(readFileSync('reference/ui-compat/release-lock.json'));
const sha=b=>createHash('sha256').update(b).digest('hex'),stage=resolve('reference/ui-compat/staging',randomUUID());mkdirSync(stage,{recursive:true});
const jar=resolve('../../vendor/ffdec/ffdec.jar'),plan=[{id:3,patch:'ResidenceAccessPatch.java',folder:'reference/residence/local-ui'},{id:15,patch:'NavigationShopPatch.java',folder:'reference/residence/navigation-shop-ui'}];
for(const row of plan){const source=lock.modules[row.id];assert.equal(sha(readFileSync(source.file)),source.sha256);row.file=join(stage,`local-${row.id}.swf`);row.audit=join(stage,`audit-${row.id}.json`);
 execFileSync('java',['-Djava.awt.headless=true','-cp',jar,resolve('scripts/swf',row.patch),resolve(source.file),row.file],{stdio:'inherit',windowsHide:true});
 execFileSync(process.execPath,['scripts/swf/audit.mjs',String(row.id),row.file,row.audit],{stdio:'inherit',windowsHide:true});}
const nav=JSON.parse(readFileSync('reports/residencia/catalog.json')).modules.find(m=>m.id===11),token=nav.path.match(/_([a-f0-9]+)\.png/)[1],navFile=`reports/residencia/evidence/module11/11-${token}.swf`;assert.equal(sha(readFileSync(navFile)),nav.sha256);
const targets=[plan[0].file,navFile,'reference/skills/formation-ui/local-5.swf','reference/mounts/local-ui/local-14.swf',plan[1].file];
const runtime=execFileSync(process.execPath,['scripts/probe-mount-runtime.mjs',plan[0].file,'--core=reference/chat/local-ui/local-2.swf','--targets='+JSON.stringify(targets),'--classes=farm.FarmEnterNewFrame,farm.newview.HomeFrame,navigation.NavigationFrame,navigation.NavigationBoatFrame,navigation.NavigationPortFrame,fashion.FashionStoreFrame,view.ShopFrame,view.subshop.NavigationShopFrame,armyII.SkillFrame,map.campaign.view.house.HouseUIView,map.campaign.view.house.FurnitureBagCell,map.campaign.view.house.FurnitureLayer,map.campaign.view.house.HouseStoreView'],{encoding:'utf8',windowsHide:true,timeout:30000});
const report=JSON.parse(readFileSync('reference/mounts/probe/local-3.swf.runtime.json'));assert.ok(report.loaded&&report.verified&&!report.timedOut);
// Execute the unchanged native callback on a test-only injection copy. Baseline must reproduce 3226.
const probe=join(stage,'CampaignImportProbe.swf'),fixture=join(stage,'BattleImportFixture.swf');
execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-replace',resolve('reference/mounts/probe/Probe.swf'),probe,'MountRuntimeProbe',resolve('scripts/swf/CampaignImportProbe.as')],{stdio:'inherit',windowsHide:true,timeout:120000});
execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-replace',resolve('reference/mounts/probe/Probe.swf'),join(stage,'raw-fixture.swf'),'MountRuntimeProbe',resolve('scripts/swf/BattleImportFixture.as')],{stdio:'inherit',windowsHide:true,timeout:120000});
execFileSync('java',['-Djava.awt.headless=true','-cp',jar,resolve('scripts/swf/BattleFixtureName.java'),join(stage,'raw-fixture.swf'),fixture],{stdio:'inherit',windowsHide:true});
const imports={};
for(const [label,input]of [['baseline',lock.modules[3].file],['candidate',plan[0].file]]){
 const alias=join(stage,`campaign-${label}-alias.swf`);
 execFileSync('java',['-Djava.awt.headless=true','-cp',jar,resolve('scripts/swf/CampaignImportAliases.java'),resolve(input),alias],{stdio:'inherit',windowsHide:true});
 const output=execFileSync(process.execPath,['scripts/probe-mount-runtime.mjs',alias,'--core=reference/chat/local-ui/local-2.swf','--probe='+probe,'--battle-fixture='+fixture,'--classes=map.campaign.mediator.singlecampaign.SingleCampaignNpcAvatarView'],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.ok(output.includes(label==='baseline'?'baseline-campaign-import-3226-reproduced':'campaign-avatar-native-import-passed'));imports[label]=JSON.parse(readFileSync(`reference/mounts/probe/campaign-${label}-alias.swf.runtime.json`));
}
writeFileSync('reference/residence/local-ui/campaign-import-runtime.json',JSON.stringify(imports,null,2));
for(const row of plan){const bytes=readFileSync(row.file),source=lock.modules[row.id];mkdirSync(row.folder,{recursive:true});copyFileSync(row.file,join(row.folder,`local-${row.id}.swf`));copyFileSync(row.audit,join(row.folder,`audit-${row.id}.json`));writeFileSync(join(row.folder,'runtime.json'),JSON.stringify(report,null,2));writeFileSync(join(row.folder,'runtime.log'),runtime);writeFileSync(join(row.folder,'manifest.json'),JSON.stringify({at:new Date().toISOString(),sourcePath:source.sourcePath,sourceSha256:source.sha256,sha256:sha(bytes),md5:createHash('md5').update(bytes).digest('hex').slice(8,16),bytes:bytes.length,runtimePassed:true,...(row.id===3?{campaignAvatarImportPassed:true}:{})},null,2));}
console.log('Residence and navigation UI passed bytecode and native AIR gates.');
