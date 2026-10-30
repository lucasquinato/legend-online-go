import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { projectRoot } from "../../config.js";
import { inflateSync, deflateSync } from "node:zlib";
const folder = join(projectRoot, "reference/campaign/local-ui");
const manifest = JSON.parse(
  readFileSync(join(folder, "manifest.json"), "utf8"),
);
const bytes = readFileSync(join(folder, "local-13.png"));
if (createHash("sha256").update(bytes).digest("hex") !== manifest.localSha256)
  throw new Error("Módulo local de energia corrompido");
if (bytes.subarray(0, 3).toString() !== "CWS")
  throw new Error("Módulo local incompatível com ModuleLoader.handleModule");
const localMd5 = createHash("md5").update(bytes).digest("hex").slice(8, 16);
export const energyDialogSourcePath: string = manifest.sourcePath;
export function energyDialogResource(
  originalSha256: string,
): Buffer | undefined {
  return originalSha256 === manifest.sourceSha256 ? bytes : undefined;
}

/** ModuleLoader appends the checksum published in code_md5.dat to the filename. */
export function energyDialogPath(path: string): boolean {
  return path === "/cdn/13.png" || path === `/cdn/13_${localMd5}.png`;
}

/** Flash caches modules by the MD5 advertised here, independently of HTTP cache. */
export function energyDialogIndex(
  path: string,
  raw: Buffer,
): Buffer | undefined {
  if (!["/client/code_md5.dat", "/client/size.xml"].includes(path)) return;
  const compressed = path.endsWith(".dat");
  const text = (compressed ? inflateSync(inflateSync(raw)) : raw).toString(
    "utf8",
  );
  let found = false;
  const changed = text.replace(
    /<Item\b[^>]*\bname="13\.png"[^>]*\/>/g,
    (row) => {
      found = true;
      return row
        .replace(/\bmd5="[^"]*"/, `md5="${localMd5}"`)
        .replace(/\bsize="[^"]*"/, `size="${bytes.length}"`);
    },
  );
  if (!found)
    throw new Error("Módulo de campanha ausente do manifesto do Flash");
  const value = Buffer.from(changed);
  return compressed ? deflateSync(deflateSync(value)) : value;
}
