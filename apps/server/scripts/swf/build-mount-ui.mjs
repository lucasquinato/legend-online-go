import{readFileSync,writeFileSync,mkdirSync,copyFileSync}from'node:fs';
import{resolve,join}from'node:path';
import{execFileSync}from'node:child_process';
import{createHash,randomUUID}from'node:crypto';
import assert from'node:assert/strict';
const root=resolve('.'),jar=resolve('../../vendor/ffdec/ffdec.jar');
const lock=JSON.parse(readFileSync('reference/ui-compat/release-lock.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const entry of Object.values(lock.modules))assert.equal(sha(readFileSync(entry.file)),entry.sha256,'Pinned baseline changed: '+entry.sourcePath);
const stage=join(root,'reference/ui-compat/staging',randomUUID());mkdirSync(stage,{recursive:true});
function java(script,args){return execFileSync('java',['-Djava.awt.headless=true','-cp',jar,resolve(script),...args],{encoding:'utf8',windowsHide:true,timeout:120000});}
const critical={14:['mounts.MountsFrame','mounts.WildSoulFrame','mounts.MountRefiningSoulFrame','fashion.FashionStoreFrame','fashion.FashionComposeView','fashion.FashionSwitchView','fashion.FashionRefreshView','fashion.FashionRefreshItem','fashion.FashionRefreshAttributeView','fashion.FashionRefreshAttributeItem'],15:['view.ShopFrame','view.subshop.StarShopFrame','view.subshop.MountShopFrame','view.subshop.MountPreviewFrame','view.subshop.MountShopGoodsItem']};
const rows=[];
for(const id of[14,15]){
 const entry=lock.modules[id],input=resolve(entry.file),output=join(stage,'local-'+id+'.swf'),auditPath=join(stage,'audit-'+id+'.json');
 if(id===14){const mountOutput=join(stage,'mount-14.swf'),forgeOutput=join(stage,'forge-14.swf'),recipeOutput=join(stage,'recipes-14.swf'),featureOutput=join(stage,'features-14.swf');java('scripts/swf/MountCurrentPatch.java',[input,mountOutput]);java('scripts/swf/ForgeUiPatch.java',[mountOutput,forgeOutput]);java('scripts/swf/ForgeRecipeFilter.java',[forgeOutput,recipeOutput,resolve('reference/equipment/gems.json'),resolve('reference/equipment/content.json')]);java('scripts/swf/ForgeFeaturePatch.java',[recipeOutput,featureOutput]);java('scripts/swf/EquipmentLevelGatePatch.java',[featureOutput,output]);}else copyFileSync(input,output);
 java('scripts/swf/SafeSwfAudit.java',[input,output,auditPath,...entry.allowedMethods]);
 const bytes=readFileSync(output),audit=JSON.parse(readFileSync(auditPath));
 rows.push({module:id,file:'local-'+id+'.swf',sha256:sha(bytes),md5:createHash('md5').update(bytes).digest('hex').slice(8,16),bytes:bytes.length,sourcePath:entry.sourcePath,sourceSha256:entry.sha256,releaseIndexSha256:lock.index.sha256,changedMethods:entry.allowedMethods,criticalClasses:critical[id],audit});
}
// Exercise both modules and frozen feature entry points in one real AIR domain.
execFileSync(process.execPath,['scripts/probe-mount-runtime.mjs',join(stage,'local-14.swf'),'--core='+lock.modules[2].file,'--targets='+JSON.stringify(rows.map(row=>join(stage,row.file))),'--classes='+[...Object.values(critical).flat(),'store.ComposeView1','store.compose.ComposeSubListView','store.compose.ComposeListView','store.NewResolveView','store.StoreBagII','store.StoreView1','store.refresh.RefreshView','store.cast.CastView','store.switched.SwitchView'].join(',')],{stdio:'inherit',windowsHide:true,timeout:60000});
// Publishing is last: failed audit/native checks leave the active bundle intact.
const destination=resolve('reference/mounts/local-ui');
for(const row of rows){copyFileSync(join(stage,row.file),join(destination,row.file));copyFileSync(join(stage,'audit-'+row.module+'.json'),join(destination,'audit-'+row.module+'.json'));}
writeFileSync(join(destination,'manifest.json'),JSON.stringify(rows,null,2));
writeFileSync(join(stage,'manifest.json'),JSON.stringify(rows,null,2));
console.log(JSON.stringify({published:true,stage,modules:rows.map(row=>({module:row.module,md5:row.md5,classes:row.audit.classes}))}));
