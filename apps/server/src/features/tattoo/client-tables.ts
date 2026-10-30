import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import { localTattooPolicy } from "./content.js";
/** Hidden quote records for the native auto-buy check; no original offer is edited. */
export function localTattooTables(raw:Buffer):Buffer {
  const data=inflateSync(raw.subarray(4)),parts=[data.subarray(0,4)];let pos=4;
  while(pos<data.length){const start=pos,n=data[pos++]!,name=data.subarray(pos,pos+n).toString();pos+=n;
    const length=data.readUInt32BE(pos);pos+=4;let body=data.subarray(pos,pos+length);pos+=length;
    if(/^shoptempinfos$/i.test(name)){
      const rows=[1,2].map(type=>`<ShopTempInfo Id="${987100+type}" ShopType="90" Area="0" ItemId="${type===1?208101:208102}" Point="${localTattooPolicy.autoBuyUnitPrice[type]}" GiftToken="${localTattooPolicy.autoBuyUnitPrice[type]}" Gold="0" NeedGrades="70" ValidDate="0" Sort="999" IsHot="false"/>`).join("");
      body=Buffer.from(body.toString().replace(/<\/[^>]+>\s*$/,closing=>rows+closing));
    }
    const size=Buffer.alloc(4);size.writeUInt32BE(body.length);parts.push(data.subarray(start,start+1+n),size,body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
