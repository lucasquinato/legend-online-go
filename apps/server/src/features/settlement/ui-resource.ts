import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { projectRoot } from "../../config.js";
const folder = join(projectRoot, "reference/settlement/local-ui");
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
const audit = JSON.parse(readFileSync(join(folder, "audit-4.json"), "utf8"));
const release = JSON.parse(readFileSync(join(projectRoot, "reference/ui-compat/release-lock.json"), "utf8"));
const bytes = readFileSync(join(folder, "local-4.swf"));
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256 || audit.candidateSha256 !== manifest.sha256 || audit.sourceSha256 !== release.modules[4].sha256 || !manifest.taxPreviewPassed || !manifest.runtimePassed || !audit.protectedTagsByteIdentical)
  throw new Error("Interface local da Prefeitura sem auditoria ou teste AIR válido");
export const settlementResource = () => bytes;
export const settlementResourceHash: string = manifest.sha256;
export const settlementResourcePath = (path: string) => ["/cdn/4.png", manifest.sourcePath, `/cdn/4_${manifest.md5}.png`].includes(path);
export function settlementResourceIndex(path: string, raw: Buffer): Buffer {
  if (!["/client/code_md5.dat", "/client/size.xml"].includes(path)) return raw;
  const compressed = path.endsWith(".dat"), text = (compressed ? inflateSync(inflateSync(raw)) : raw).toString();
  let found = false;
  const changed = text.replace(/<Item\b[^>]*\bname="4\.png"[^>]*\/>/g, row => {
    found = true;
    return row.replace(/\bmd5="[^"]*"/, `md5="${manifest.md5}"`).replace(/\bsize="[^"]*"/, `size="${bytes.length}"`);
  });
  if (!found) throw new Error("Módulo da Prefeitura ausente do índice");
  return compressed ? deflateSync(deflateSync(Buffer.from(changed))) : Buffer.from(changed);
}
