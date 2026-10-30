import {inflateSync} from "node:zlib";
import {encodeClientTableBundle} from "../../client-table-bundle.js";
import {itemTemplate} from "../../inventory.js";
import {equipmentOutputs} from "./requirements.js";
import {localForgeOffers} from "./materials.js";
import {localEquipmentAffixes,localHalidomAffixes} from "./content.js";
import {halidomIds} from "./advanced-content.js";
import {weaponFury} from "./weapon-effects.js";
const escapeXml=(value:unknown)=>String(value).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const xmlRows=(tag:string,rows:Record<string,unknown>[])=>rows.map(row=>`<${tag} ${Object.entries(row).map(([k,v])=>`${k}="${escapeXml(v)}"`).join(" ")}/>`).join("");
/** Rebuild length-prefixed table records, leaving all unrelated records unchanged. */
export function localEquipmentTables(raw:Buffer):Buffer{
 const data=inflateSync(raw.subarray(4)),parts=[data.subarray(0,4)];let pos=4;
 while(pos<data.length){
  const start=pos,n=data[pos++]!,name=data.subarray(pos,pos+n).toString();pos+=n;
  const length=data.readUInt32BE(pos);pos+=4;let body=data.subarray(pos,pos+length);pos+=length;
  if(/^(itemtempinfos|composetempinfos)$/i.test(name))body=Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g,row=>{
   const recipe=/\bNewMaterial="(\d+)"/.exec(row),id=Number(recipe?.[1]??/\bTemplateId="(\d+)"/.exec(row)?.[1]);
   const fury=!recipe?weaponFury(id):0;
   if(fury){const original=itemTemplate(id)!.Description??"",description=(original?original+"\\n":"")+`Efeito da arma: ganha ${fury} pontos de fúria por ação.`;row=row.replace(/Description="[^"]*"/,`Description="${escapeXml(description)}"`);}
   if(!equipmentOutputs.has(id)&&!halidomIds.has(id))return row;
   const level=itemTemplate(id)!.NeedGrades;
   return recipe?row.replace(/NeedMinLevel="[^"]*"/,`NeedMinLevel="${level}"`):row.replace(/NeedGrades="[^"]*"/,`NeedGrades="${level}"`).replace(/NeedChangeJob="[^"]*"/,'NeedChangeJob="0"').replace(/Property7="[^"]*"/,`Property7="${itemTemplate(id)!.Property7}"`);
  }));
  if(/^shoptempinfos$/i.test(name))body=Buffer.from(body.toString().replace(/<\/[^>]+>\s*$/,closing=>localForgeOffers.map(offer=>`<ShopTempInfo ${Object.entries(offer).map(([k,v])=>`${k}="${v}"`).join(" ")}/>`).join("")+closing));
  // The shared buffer carries the native resource event; each weapon describes its local amount.
  if(name==="SkillTempInfos")body=Buffer.from(body.toString().replace(/<SkillTempInfo\s+[^>]*\bTemplateId="1094"[^>]*\/>/,row=>row.replace(/TemplateName="[^"]*"/,'TemplateName="Ganha fúria por ação conforme o nível da arma."')));
  if(name==="SkillBufferTempInfos")body=Buffer.from(body.toString().replace(/<SkillBufferTempInfo\s+[^>]*\bId="1094"[^>]*\/>/,row=>row.replace(/BufferName="[^"]*"/,'BufferName="Ganho de fúria da arma."')));
  if(name==="SkillTempInfos")body=Buffer.from(body.toString().replace(/<\/[^>]+>\s*$/,closing=>xmlRows("SkillTempInfo",[...localEquipmentAffixes.skills,...localHalidomAffixes.skills])+closing));
  if(name==="SkillPropertyTempInfos")body=Buffer.from(body.toString().replace(/<\/[^>]+>\s*$/,closing=>xmlRows("SkillPropertyTempInfo",[...localEquipmentAffixes.properties,...localHalidomAffixes.properties])+closing));
  const size=Buffer.alloc(4);size.writeUInt32BE(body.length);parts.push(data.subarray(start,start+1+n),size,body);
 }
 return encodeClientTableBundle(Buffer.concat(parts));
}
