import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { projectRoot, loadConfig } from "../src/config.js";
import { DatabaseSync } from "node:sqlite";
const config=loadConfig(),root=projectRoot;
const collection=JSON.parse(readFileSync(join(root,"reports/cosmos/assets-implementation.json"),"utf8"));
const db=new DatabaseSync(join(config.dataDir,"state.sqlite"),{readOnly:true});
const assets=collection.rows.map((row:any)=>{
  const file=join(config.dataDir,"assets/objects",row.sha256+".bin");
  try{const bytes=readFileSync(file);return {id:row.id,path:row.path,sha256:row.sha256,valid:bytes.length===row.bytes&&createHash("sha256").update(bytes).digest("hex")===row.sha256};}catch{return {id:row.id,path:row.path,valid:false};}
});
const accounts=db.prepare("SELECT user_id,state FROM city_worlds ORDER BY user_id").all().map(row=>{
  const save=JSON.parse(String(row.state));
  return {userId:row.user_id,level:save.state.player.grades,cosmosInitialized:Boolean(save.cosmos),cosmosInstances:Object.keys(save.cosmos?.instances??{}).length};
});db.close();
const frozen="src/features/fashion/feature.ts",before="data/backups/before-cosmos-2026-10-14T22-53-29.003Z/"+frozen;
const hash=(path:string)=>createHash("sha256").update(readFileSync(join(root,path))).digest("hex");
const tests=readFileSync(join(config.dataDir,"cosmos-regression-tests.log"),"utf8"),focused=readFileSync(join(config.dataDir,"cosmos-focused-tests.log"),"utf8");
const summary=(log:string)=>({tests:Number(log.match(/ℹ tests (\d+)/)?.[1]),passed:Number(log.match(/ℹ pass (\d+)/)?.[1]),failed:Number(log.match(/ℹ fail (\d+)/)?.[1])});
const result={at:new Date().toISOString(),assets:{total:assets.length,valid:assets.filter((r:any)=>r.valid).length,rows:assets},accounts,fashionFeatureUnchanged:hash(frozen)===hash(before),tests:summary(tests),focused:summary(focused)};
writeFileSync(join(root,"reports/cosmos/verificacao-implementacao.json"),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,assets:{total:result.assets.total,valid:result.assets.valid}}));
if(assets.some((row:any)=>!row.valid)||!result.fashionFeatureUnchanged||!result.tests.tests||result.tests.failed||!result.focused.tests||result.focused.failed)process.exitCode=1;
