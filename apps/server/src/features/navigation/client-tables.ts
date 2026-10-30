import { residencePolicy, furnitureFields, animalShopRows } from "../residence/policy.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
export const residenceClientConfig:Record<string,string>={
 navigation_boat_activate_point:"0",navigation_shop_refresh_cd:String(residencePolicy.navigation.shopRefreshMs/60000),navigation_strength_assist_speedup:"0",
 navigation_fishing_time:Array.from({length:24},(_,h)=>`${String(h).padStart(2,"0")}:30,${String(h+1).padStart(2,"0")}:00`).join("|"),
};
/** Only approved overrides. Original costs/rewards and unrelated tables remain intact. */
export function localResidenceTables(raw:Buffer):Buffer {
 const data=inflateSync(raw.subarray(4)),parts=[data.subarray(0,4)];let pos=4;
 while(pos<data.length){const start=pos,n=data[pos++]!,name=data.subarray(pos,pos+n).toString();pos+=n;const length=data.readUInt32BE(pos);pos+=4;let body=data.subarray(pos,pos+length);pos+=length;
  if(name==="ConfigInfos"){body=Buffer.from(body.toString().replace(/<ConfigInfo\s+[^>]*\/>/g,row=>{
   const key=row.match(/\bConfigName="([^"]+)"/)?.[1],value=key&&residenceClientConfig[key];
   return value!==undefined?row.replace(/\bConfigValue="[^"]*"/,`ConfigValue="${value}"`):row;
  }));
   let text=body.toString();for(const [key,value]of Object.entries(residenceClientConfig))if(!text.includes(`ConfigName="${key}"`))text=text.replace('</ConfigInfos>',`<ConfigInfo ConfigName="${key}" ConfigValue="${value}" Description=""/></ConfigInfos>`);body=Buffer.from(text);
  }
  const xmlRow=(tag:string,row:Record<string,any>)=>`<${tag} ${Object.entries(row).map(([k,v])=>`${k}="${String(v).replaceAll('&','&amp;').replaceAll('"','&quot;')}"`).join(' ')}/>`;
  if(name==="FurnitureTempInfos")body=Buffer.from(body.toString().replace(/<FurnitureTempInfo\s+[^>]*\/>/g,element=>{const row=Object.fromEntries([...element.matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1]!,m[2]!]));for(const [k,v]of Object.entries(furnitureFields(row)))element=element.replace(new RegExp(`\\b${k}="[^"]*"`),`${k}="${v}"`);return element;}));
  if(name==="ShopTempInfos"){const text=body.toString(),match=text.match(/<ShopTempInfo\b[^>]*ShopType="6"[^>]*\/>/)?.[0];if(match){const base=Object.fromEntries([...match.matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1]!,m[2]!]));body=Buffer.from(text.replace('</ShopTempInfos>',animalShopRows(base).filter(r=>!text.includes(`Id="${r.Id}"`)).map(r=>xmlRow('ShopTempInfo',r)).join('')+'</ShopTempInfos>'));}}
  if(name==="FurnitureShopTempInfos")body=Buffer.from(body.toString().replace(/CostItemId="[^"]*"/g,'CostItemId="-400"').replace(/CostItemCount="[^"]*"/g,'CostItemCount="100"'));
  if(name==="MapInfos"&&!body.toString().includes('Id="5601"'))body=Buffer.from(body.toString().replace('</MapInfos>',xmlRow('MapInfo',{Id:5601,CampaignId:5601,MapName:'Residência',Type:1,MinLevel:11,MaxLevel:999,Width:1200,Height:1200,MapFileId:5601,BattleGround:1,MusicPath:'BGM007',Description:'',Index:0})+'</MapInfos>'));
  if(name==="Campaigns"&&!body.toString().includes('CampaignId="5601"')){const row=JSON.parse(readFileSync(join(projectRoot,'reference/residence/campaign-row.json'),'utf8'))[0];body=Buffer.from(body.toString().replace('</Campaigns>',xmlRow('Campaign',{...row,CampaignId:5601,CampaignName:'Residência',MinLevel:11,MaxLevel:999,Capacity:1})+'</Campaigns>'));}
  const size=Buffer.alloc(4);size.writeUInt32BE(body.length);parts.push(data.subarray(start,start+1+n),size,body);
 }
 return encodeClientTableBundle(Buffer.concat(parts));
}
