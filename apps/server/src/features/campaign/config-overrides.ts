import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import { sweepSeconds } from "./rules.js";
/** Serve the local timer in the client table without changing preserved assets. */
export function localCampaignConfig(raw: Buffer): Buffer {
  const data = inflateSync(raw.subarray(4));
  let pos = 4;
  while (pos < data.length) {
    const n = data[pos++]!,
      name = data.subarray(pos, pos + n).toString();
    pos += n;
    const lengthAt = pos,
      length = data.readUInt32BE(pos);
    pos += 4;
    const start = pos;
    pos += length;
    if (name !== "ConfigInfos") continue;
    const text = data.subarray(start, pos).toString();
    const changed = text.replace(
      /(<\w+\b[^>]*ConfigName="Campaign_Sweep_Time"[^>]*ConfigValue=")[^"]+("[^>]*\/?>)/,
      `$1${sweepSeconds}$2`,
    );
    if (changed === text) return raw;
    const body = Buffer.from(changed),
      head = Buffer.from(data.subarray(0, start));
    head.writeUInt32BE(body.length, lengthAt);
    const value = Buffer.concat([head, body, data.subarray(pos)]);
    return encodeClientTableBundle(value);
  }
  return raw;
}
