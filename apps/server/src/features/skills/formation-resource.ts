import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { projectRoot } from "../../config.js";

const folder = join(projectRoot, "reference/skills/formation-ui");
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
const bytes = readFileSync(join(folder, "local-5.swf"));
export const formationResourceHash: string = manifest.sha256;
export const formationResourceMd5: string = manifest.md5;
if (createHash("sha256").update(bytes).digest("hex") !== formationResourceHash || bytes.subarray(0, 3).toString() !== "CWS")
  throw new Error("Módulo local de formação ausente ou corrompido");
if (!manifest.tattooRuntime?.logs?.includes("tattoo-gates-behavior-passed") || !manifest.tattooRuntime?.logs?.includes("tattoo-self-view-null-safe-passed") || !manifest.audit?.protectedTagsByteIdentical)
  throw new Error("Módulo local sem auditoria e validação AIR das tatuagens");
if (!manifest.soulRuntime?.logs?.includes("advanced-soul-ui-gates-passed") || !manifest.soulRuntime?.logs?.includes("advanced-soul-inventory-icon-level-passed"))
  throw new Error("Módulo local sem validação AIR do Selo da Alma avançado");
export const formationResource = () => bytes;
export const formationResourcePath = (path: string) => path === `/cdn/5_${formationResourceMd5}.png`;
export function formationResourceIndex(path: string, raw: Buffer): Buffer {
  if (!["/client/code_md5.dat", "/client/size.xml"].includes(path)) return raw;
  const compressed = path.endsWith(".dat");
  const text = (compressed ? inflateSync(inflateSync(raw)) : raw).toString("utf8");
  let found = false;
  const next = text.replace(/<Item\b[^>]*\bname="5\.png"[^>]*\/>/g, row => {
    found = true;
    return row.replace(/\bmd5="[^"]*"/, `md5="${formationResourceMd5}"`).replace(/\bsize="[^"]*"/, `size="${bytes.length}"`);
  });
  if (!found) throw new Error("Módulo de formação ausente do manifesto");
  const result = Buffer.from(next);
  return compressed ? deflateSync(deflateSync(result)) : result;
}
