import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { projectRoot } from "../../config.js";
const folder = join(projectRoot, "reference/residence/navigation-shop-ui");
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
const audit = JSON.parse(readFileSync(join(folder, "audit-15.json"), "utf8"));
const release = JSON.parse(readFileSync(join(projectRoot, "reference/ui-compat/release-lock.json"), "utf8"));
const bytes = readFileSync(join(folder, "local-15.swf"));
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256 || audit.candidateSha256 !== manifest.sha256 || audit.sourceSha256 !== release.modules[15].sha256 || !manifest.runtimePassed || !audit.protectedTagsByteIdentical)
  throw new Error("Interface local da Residência sem auditoria ou teste AIR válido");
export const navigationShopResource = () => bytes;
export const navigationShopResourceHash: string = manifest.sha256;
export const navigationShopResourcePath = (path: string) => /^\/cdn\/15(?:_[a-f0-9]{8})?\.png$/i.test(path);
export function navigationShopResourceIndex(path: string, raw: Buffer): Buffer {
  if (!["/client/code_md5.dat", "/client/size.xml"].includes(path)) return raw;
  const compressed = path.endsWith(".dat"), text = (compressed ? inflateSync(inflateSync(raw)) : raw).toString();
  let found = false;
  const changed = text.replace(/<Item\b[^>]*\bname="15\.png"[^>]*\/>/g, row => {
    found = true;
    return row.replace(/\bmd5="[^"]*"/, `md5="${manifest.md5}"`).replace(/\bsize="[^"]*"/, `size="${bytes.length}"`);
  });
  if (!found) throw new Error("Módulo da Residência ausente do índice");
  return compressed ? deflateSync(deflateSync(Buffer.from(changed))) : Buffer.from(changed);
}
