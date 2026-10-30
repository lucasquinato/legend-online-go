import {test} from 'node:test';import assert from 'node:assert/strict';import {inflateSync} from 'node:zlib';import {encodeClientTableBundle} from '../src/client-table-bundle.js';import {localMarriageTables} from '../src/features/social/client-tables.js';
test('local ring material offer is advertised once with its price and leaves other offers intact',()=>{
 const rows=[['ShopTempInfos','<ShopTempInfos><ShopTempInfo Id="8519" ShopType="1" ItemId="208036" GiftToken="10"/></ShopTempInfos>'],['Untouched','<Untouched value="exact"/>']],parts=[Buffer.alloc(4)];
 for(const [name,xml]of rows){const n=Buffer.from(name!),b=Buffer.from(xml!),len=Buffer.alloc(4);len.writeUInt32BE(b.length);parts.push(Buffer.from([n.length]),n,len,b);}
 const raw=encodeClientTableBundle(Buffer.concat(parts)),out=localMarriageTables(raw),text=inflateSync(out.subarray(4)).toString();
 assert.ok(text.includes('<ShopTempInfo Id="8519" ShopType="1" ItemId="208036" GiftToken="10"/>'));assert.ok(/Id="985058"[^>]*ItemId="208058"[^>]*GiftToken="50"/.test(text));assert.ok(text.includes('<Untouched value="exact"/>'));
 assert.deepEqual(localMarriageTables(out),out);
});
