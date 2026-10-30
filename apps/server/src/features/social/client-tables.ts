import {advancedRingOffer} from "./shop.js";
import {inflateSync} from "node:zlib";
import {encodeClientTableBundle} from "../../client-table-bundle.js";
/** Native Andrew option and the local advanced ring-material diamond offer. */
export function localMarriageTables(raw:Buffer):Buffer{
 const data=inflateSync(raw.subarray(4)),parts=[data.subarray(0,4)];let pos=4;
 while(pos<data.length){const start=pos,n=data[pos++]!;const name=data.subarray(pos,pos+n).toString();pos+=n;const length=data.readUInt32BE(pos);pos+=4;let body=data.subarray(pos,pos+length);pos+=length;
 if(name==="MapNodeInfos")body=Buffer.from(body.toString().replace(/<MapNodeInfo\s+[^>]*\/>/g,row=>{if(!/\bId="22"/.test(row)||!/\bMapId="10000"/.test(row))return row;return row.replace(/\bParam3="([^"]*)"/,(_,options:string)=>`Param3="${options.split('|').some(x=>x.trim().startsWith('21,'))?options:options+'|21,Missões de Casamento'}"`);}));
 if(name==="ShopTempInfos"&&!body.toString().includes(`Id="${advancedRingOffer.Id}"`)){const row=`<ShopTempInfo ${Object.entries(advancedRingOffer).map(([key,value])=>`${key}="${String(value)}"`).join(' ')}/>`;body=Buffer.from(body.toString().replace('</ShopTempInfos>',row+'</ShopTempInfos>'));}
 const size=Buffer.alloc(4);size.writeUInt32BE(body.length);parts.push(data.subarray(start,start+1+n),size,body);
 }return encodeClientTableBundle(Buffer.concat(parts));
}
