import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync,mkdirSync,mkdtempSync}from'node:fs';import{resolve,join}from'node:path';import{execFileSync}from'node:child_process';
const root=resolve('.'),jar=resolve('../../vendor/ffdec/ffdec.jar'),lock=JSON.parse(readFileSync('reference/ui-compat/release-lock.json'));
mkdirSync('.test-data',{recursive:true});const dir=mkdtempSync(resolve('.test-data/swf-contract-'));
const java=(script,args)=>execFileSync('java',['-Djava.awt.headless=true','-cp',jar,resolve(script),...args],{encoding:'utf8',windowsHide:true,timeout:60000,stdio:['ignore','pipe','pipe']});
const audit=(baseline,candidate,methods=[])=>java('scripts/swf/SafeSwfAudit.java',[resolve(baseline),resolve(candidate),join(dir,'audit.json'),...methods]);
const base14=lock.modules[14].file,base15=lock.modules[15].file;
const current14='reference/mounts/local-ui/local-14.swf',current15='reference/mounts/local-ui/local-15.swf';
test('town hall tax preview changes only its authorized method in the pinned current module',()=>{const row=lock.modules[4];const report=JSON.parse(audit(row.file,'reference/settlement/local-ui/local-4.swf',row.allowedMethods));assert.equal(report.classes,46);assert.equal(report.allowedMethods,1);assert.equal(report.protectedTagsByteIdentical,true);});
test('pinned current modules retain all classes and protected tags',()=>{assert.equal(JSON.parse(audit(base14,current14,lock.modules[14].allowedMethods)).classes,477);assert.equal(JSON.parse(audit(base15,current15)).classes,123);});
test('chat/battle core preserves 5155 classes and every method/tag outside its explicit overrides',()=>{const report=JSON.parse(audit(lock.modules[2].file,'reference/chat/local-ui/local-2.swf',lock.modules[2].allowedMethods));assert.equal(report.classes,5155);assert.equal(report.allowedMethods,lock.modules[2].allowedMethods.length);assert.equal(report.protectedTagsByteIdentical,true);});
test('old canonical baseline is rejected instead of silently downgrading shared features',()=>{assert.throws(()=>audit('reports/montarias/evidence/14.png.swf',current14,lock.modules[14].allowedMethods),error=>error.stderr.includes('Classes added/removed'));});
test('an edit to a protected shop method is rejected',()=>{const candidate=join(dir,'shop-regression.swf');java('scripts/swf/SwfAuditFixture.java',[resolve(base15),candidate,'method','view.ShopFrame']);assert.throws(()=>audit(base15,candidate),error=>error.stderr.includes('Protected ABC changed'));});
test('a constructor edit in the allowed class is still rejected',()=>{const candidate=join(dir,'mount-constructor-regression.swf');java('scripts/swf/SwfAuditFixture.java',[resolve(base14),candidate,'method','mounts.MountsFrame']);assert.throws(()=>audit(base14,candidate,lock.modules[14].allowedMethods),error=>error.stderr.includes('Method outside allowlist changed'));});
test('inserting an empty ABC never passes the release gate',()=>{const candidate=join(dir,'empty-regression.swf');java('scripts/swf/SwfAuditFixture.java',[resolve(base14),candidate,'empty']);assert.throws(()=>audit(base14,candidate,lock.modules[14].allowedMethods));});

test("Cosmos, titles, equipment and rune unlock preserve every other method in current module 5",()=>{const row=lock.modules[5];const report=JSON.parse(audit(row.file,"reference/skills/formation-ui/local-5.swf",row.allowedMethods));assert.equal(report.classes,407);assert.equal(report.allowedMethods,row.allowedMethods.length);assert.equal(report.protectedTagsByteIdentical,true);});

test("advanced soul inventory uses the native advanced icon and the actual level without profession",()=>{
  const manifest=JSON.parse(readFileSync("reference/skills/formation-ui/manifest.json"));
  assert.ok(manifest.soulRuntime.logs.includes("advanced-soul-inventory-icon-level-passed"));
  assert.ok(!manifest.soulRuntime.logs.some(line=>line?.startsWith("error ")||line?.startsWith("uncaught ")));
});

test("tattoo blank-tab fix changes only its own-character engraving gate and reproduces the null regression in AIR",()=>{
  const withSoul=join(dir,"blank-tab-with-soul.swf");
  java("scripts/swf/SoulSealPatch.java",[resolve("reference/tattoo/evidence/blank-tab-5.swf"),withSoul,"ui"]);
  const report=JSON.parse(audit(withSoul,"reference/skills/formation-ui/local-5.swf",["armyII.viewII.tattoo.TattooView.setImprintState"]));
  assert.equal(report.classes,407);assert.equal(report.allowedMethods,1);assert.equal(report.protectedTagsByteIdentical,true);
  const manifest=JSON.parse(readFileSync("reference/skills/formation-ui/manifest.json"));
  assert.ok(manifest.tattooRuntime.logs.includes("tattoo-self-view-null-safe-passed"));
  assert.ok(manifest.blankTabRuntime.logs.some(line=>line?.includes("error TypeError: Error #1009")));
});


test("residence navigation gate preserves the other 1308 classes and all unrelated tags",()=>{const row=lock.modules[3];const report=JSON.parse(audit(row.file,"reference/residence/local-ui/local-3.swf",row.allowedMethods));assert.equal(report.classes,1309);assert.equal(report.protectedTagsByteIdentical,true);});
test("navigation shop changes only refresh visibility and preserves all 123 current classes",()=>{const row=lock.modules[15];const report=JSON.parse(audit(row.file,"reference/residence/navigation-shop-ui/local-15.swf",row.allowedMethods));assert.equal(report.classes,123);assert.equal(report.protectedTagsByteIdentical,true);});

test("campaign avatar callback reproduces AIR 3226 on baseline and imports executable bytes on candidate",()=>{const report=JSON.parse(readFileSync('reference/residence/local-ui/campaign-import-runtime.json'));assert.ok(report.baseline.logs.includes('baseline-campaign-import-3226-reproduced'));assert.ok(report.candidate.logs.includes('campaign-avatar-native-import-passed'));assert.ok(!report.candidate.logs.some(line=>line?.startsWith('error ')||line?.startsWith('uncaught ')));const manifest=JSON.parse(readFileSync('reference/residence/local-ui/manifest.json'));assert.equal(manifest.campaignAvatarImportPassed,true);});

test('pasture animal loader reproduces AIR 3226 and imports all four real animal animations',()=>{
 const manifest=JSON.parse(readFileSync('reference/chat/local-ui/manifest.json'));
 assert.ok(manifest.farmRuntime.baseline.logs.includes('baseline-farm-animal-3226-reproduced'));
 assert.deepEqual(manifest.farmRuntime.candidates.map(r=>r.animal),['cow','sheep','horse','deer']);
 for(const report of manifest.farmRuntime.candidates){assert.equal(report.loaded,true);assert.equal(report.verified,true);assert.ok(report.logs.some(line=>line?.startsWith('farm-animal-native-import-passed')));assert.ok(!report.logs.some(line=>line?.startsWith('error ')||line?.startsWith('uncaught ')));}
});

test('animal fix changes only its load callback against the previously deployed core',()=>{
 const report=JSON.parse(audit('reports/pastagem/core-before-animal-fix.swf','reports/social/evidence/core-before-social.swf',['farm.view.FarmAnimalItem.__onComplete']));
 assert.equal(report.classes,5155);assert.equal(report.allowedMethods,1);assert.equal(report.protectedTagsByteIdentical,true);
});


test('social level gates preserve every other core method and asset',()=>{const report=JSON.parse(audit('reports/social/evidence/core-before-social.swf','reference/chat/local-ui/local-2.swf',['yishi.manager.FriendManager.__friendAddHandler','yishi.view.community.PlayerMenu.setData','yishi.view.community.PlayerMenu.__chatHandler','chat.view.ChatItemMenu.init','chat.view.ChatItemMenu.__chatmessageHandler','chat.view.ChatItemMenu.__blacklistHandler','chat.view.ChatItemMenu.__addfriendHandler','mvc.module.marry.MarryModel.canEnterWedding','managers.FreedomTeamManager.canInviteMember']));assert.equal(report.classes,5155);assert.equal(report.protectedTagsByteIdentical,true);});
test('marriage compatibility preserves all original module 9 classes and uses one isolated bridge',()=>{const root='reference/social/local-ui/',manifest=JSON.parse(readFileSync(root+'manifest.json')),report=JSON.parse(audit(lock.modules[9].file,root+'audit-original-classes.swf',lock.modules[9].allowedMethods));assert.equal(report.protectedTagsByteIdentical,true);assert.deepEqual(manifest.audit.addedClasses,['SocialMarriageBridge']);java('scripts/swf/SocialBridgeAudit.java',[resolve(lock.modules[9].file),resolve(root+'local-9.swf'),resolve(root+'bridge.swf')]);assert.ok(manifest.runtime.candidate.logs.includes('social-marriage-native-ring-init-passed'));assert.ok(manifest.runtime.candidate.logs.includes('social-level-one-proposal-passed'));});
