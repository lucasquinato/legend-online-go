import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { projectRoot } from "../../config.js";

// Original online module, recovered by the exact version in code_md5.dat.
// The old canonical 5.png in the cache does not expose the newer storage UI.
export const inventoryResourcePath = (path: string) => ["/cdn/5.png", "/cdn/5_13cbe084.png", "/cdn/5_3edbbd2d.png"].includes(path);
// Only the outer transport encryption was removed by the recovered ModuleLoader
// algorithm. Every compressed SWF byte and every script is unchanged. Its own
// MD5 invalidates AIR's older canonical-resource cache without editing the SWF.
const bytes = readFileSync(join(projectRoot, "reference/inventory/evidence/5.swf"));
export const inventoryResourceHash = "1baee1ea2c096cd63fab2a923c6550f54cee0b907f2c5984ed36e1e37fbaa648";
if (createHash("sha256").update(bytes).digest("hex") !== inventoryResourceHash)
  throw new Error("Módulo original da mochila ausente ou corrompido");
export const inventoryResource = () => bytes;
export function inventoryResourceIndex(path: string, raw: Buffer): Buffer {
  if (!["/client/code_md5.dat", "/client/size.xml"].includes(path)) return raw;
  const compressed = path.endsWith(".dat");
  const text = (compressed ? inflateSync(inflateSync(raw)) : raw).toString("utf8");
  let found = false;
  const updated = text.replace(/<Item\b[^>]*\bname="5\.png"[^>]*\/>/g, row => {
    found = true;
    return row.replace(/\bmd5="[^"]*"/, 'md5="3edbbd2d"').replace(/\bsize="[^"]*"/, `size="${bytes.length}"`);
  });
  if (!found) throw new Error("Módulo da mochila ausente do manifesto do Flash");
  const result = Buffer.from(updated);
  return compressed ? deflateSync(deflateSync(result)) : result;
}
