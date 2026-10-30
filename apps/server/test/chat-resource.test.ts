import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { chatResource, chatResourceHash, chatResourceMd5, chatResourceIndex } from "../src/features/messaging/chat-resource.js";
import { projectRoot, loadConfig } from "../src/config.js";
import { Store, ReplayAuth } from "../src/store.js";
import { GameServer } from "../src/game.js";
import { buildHttp } from "../src/http.js";

test("índice do chat muda somente o core 2 e aceita XML e dupla compressão",()=>{
 const other='<Item name="14.png" md5="preserved" size="123"/>';
 const xml=`<root><Item name="2.png" md5="old" size="1"/>${other}</root>`;
 for(const path of ["/client/size.xml","/client/code_md5.dat"]){
  const raw=Buffer.from(xml),result=chatResourceIndex(path,path.endsWith(".dat")?deflateSync(deflateSync(raw)):raw);
  const text=(path.endsWith(".dat")?inflateSync(inflateSync(result)):result).toString();
  assert.ok(text.includes(other));assert.ok(text.includes(`md5="${chatResourceMd5}"`));
  assert.ok(text.includes(`size="${chatResource('/cdn/2.png')!.length}"`));
 }
 assert.equal(chatResourceIndex("/other.xml",Buffer.from(xml)).toString(),xml);
 assert.throws(()=>chatResourceIndex("/client/size.xml",Buffer.from("<root/>")),/ausente/);
});
test("core do chat tem auditoria da versão fixa, teste AIR dos cinco filtros e interfaces protegidas",()=>{
 const manifest=JSON.parse(readFileSync(join(projectRoot,"reference/chat/local-ui/manifest.json"),"utf8"));
 const release=JSON.parse(readFileSync(join(projectRoot,"reference/ui-compat/release-lock.json"),"utf8"));
 assert.equal(manifest.audit.allowedMethods,release.modules[2].allowedMethods.length);assert.equal(manifest.audit.classes,5155);
 assert.equal(manifest.audit.protectedTagsByteIdentical,true);assert.equal(manifest.audit.emptyAbc,false);
 assert.ok(manifest.runtime.loaded&&manifest.runtime.verified);
 assert.ok(manifest.runtime.logs.includes("chat-filters-passed"));
 assert.ok(manifest.runtime.logs.includes("battle-dispatch-passed"));
 assert.ok(manifest.resourceRuntime.loaded&&manifest.resourceRuntime.verified);
 assert.ok(manifest.resourceRuntime.logs.includes("battle-resource-imports-passed"));
 assert.ok(manifest.resourceRuntime.logs.includes("skill-effect-import-passed"));
 assert.ok(manifest.resourceRuntime.logs.includes("formation-preview-import-passed"));
 assert.ok(manifest.baselineResourceRuntime.logs.some((line: string)=>line.startsWith("error SecurityError: Error #3226")));
 for(const channel of [0,3,5,6,10])assert.ok(manifest.runtime.logs.includes(`chat-filter-${channel}`));
 assert.equal(createHash("sha256").update(chatResource('/cdn/2.png')!).digest("hex"),chatResourceHash);
 assert.equal(chatResource('/cdn/999.png'),undefined);
});
test("HTTP local entrega o core de chat correto offline, canônico e versionado, sem buscar outro módulo",async()=>{
 mkdirSync(join(projectRoot,".test-data"),{recursive:true});
 const dir=mkdtempSync(join(projectRoot,".test-data","chat-http-"));
 for(const feature of ["tutorial","city"]){mkdirSync(join(dir,feature));copyFileSync(join(projectRoot,`data/${feature}/scenario.json`),join(dir,feature,"scenario.json"));}
 const store=new Store(dir),auth=new ReplayAuth(store);
 const config={...loadConfig(),dataDir:dir,mode:"tutorial" as const,resourceMode:"offline" as const,capturePackets:false};
 const game=new GameServer(config,store,auth),app=buildHttp(config,store,auth,game);
 try{
  for(const url of ['/cdn/2.png',`/cdn/2_${chatResourceMd5}.png`,'/cdn/2_d41294b0.png']){
   const response=await app.inject({method:"GET",url});assert.equal(response.statusCode,200);
   assert.equal(response.headers['cache-control'],'no-store');
   assert.equal(createHash('sha256').update(response.rawPayload).digest('hex'),chatResourceHash);
  }
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM assets").get()!.n,0);
 }finally{await app.close();await game.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
