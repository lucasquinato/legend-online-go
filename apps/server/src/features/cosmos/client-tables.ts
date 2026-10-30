import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import { cosmosVisible, localBufferDescriptions, localBufferPercentages } from "./availability.js";
import { templates } from "./content.js";
const xml = (text: string) => text.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
/** Keep template definitions for compatibility; the shop enumerates StarPoint > 0. */
export function localCosmosTables(raw: Buffer): Buffer {
  const data=inflateSync(raw.subarray(4)),parts:Buffer[]=[data.subarray(0,4)];let pos=4;
  while(pos<data.length){
    const start=pos,n=data[pos++]!,name=data.subarray(pos,pos+n).toString();pos+=n;
    const length=data.readUInt32BE(pos);pos+=4;let body=data.subarray(pos,pos+length);pos+=length;
    if(name==="ItemTempInfos")body=Buffer.from(body.toString().replace(/<\w+\b[^>]*TemplateId="208061"[^>]*\/>/g,element=>element.replace(/IsCanBatch="false"/,'IsCanBatch="true"').replace(/SonType="208"/,'SonType="203"')));
    if(name==="starTempInfos")body=Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g,element=>{
      const id=Number(element.match(/TemplateId="(\d+)"/)?.[1]);
      let result=templates.has(id)&&!cosmosVisible(templates.get(id))?element.replace(/StarPoint="[^"]*"/,'StarPoint="0"'):element;
      if(Number(templates.get(id)?.Profile)===8)result=result.replace(/NeedGrades="[^"]*"/,'NeedGrades="80"');
      return result;
    }));
    if(name==="SkillBufferTempInfos")body=Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g,element=>{
      const id=Number(element.match(/\bId="(\d+)"/)?.[1]),description=localBufferDescriptions[id];
      let result=description?element.replace(/BufferName="[^"]*"/,()=>`BufferName="${xml(description)}"`):element;
      if(localBufferPercentages[id]!==undefined)result=result.replace(/ValuePercent="[^"]*"/,`ValuePercent="${localBufferPercentages[id]}"`);
      return result;
    }));
    const size=Buffer.alloc(4);size.writeUInt32BE(body.length);parts.push(data.subarray(start,start+1+n),size,body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
