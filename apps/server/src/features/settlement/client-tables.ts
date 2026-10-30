import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import { settlementBuildingFields } from "./balance.js";

/** Keep local client previews and authoritative settlement balance in agreement. */
export function localSettlementTables(raw: Buffer): Buffer {
  const data = inflateSync(raw.subarray(4)), parts = [data.subarray(0, 4)];
  let pos = 4;
  while (pos < data.length) {
    const start = pos, n = data[pos++]!, name = data.subarray(pos, pos + n).toString(); pos += n;
    const length = data.readUInt32BE(pos); pos += 4;
    let body = data.subarray(pos, pos + length); pos += length;
    if (name === "BuildingTempInfos") body = Buffer.from(body.toString().replace(/<BuildingTempInfo\s+[^>]*\/>/g, element => {
      const row = Object.fromEntries([...element.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1]!, m[2]!]));
      for (const [key, value] of Object.entries(settlementBuildingFields(row)))
        element = element.replace(new RegExp(`\\b${key}="[^"]*"`), () => `${key}="${value}"`);
      return element;
    }));
    const size = Buffer.alloc(4); size.writeUInt32BE(body.length);
    parts.push(data.subarray(start, start + 1 + n), size, body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
