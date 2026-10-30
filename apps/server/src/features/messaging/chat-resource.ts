import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { projectRoot } from "../../config.js";

const folder = join(projectRoot, "reference/chat/local-ui");
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
const baseline = JSON.parse(readFileSync(join(projectRoot, "reference/ui-compat/release-lock.json"), "utf8"));
const bytes = readFileSync(join(folder, manifest.file));
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== manifest.sha256 || bytes.length !== manifest.bytes ||
    createHash("md5").update(bytes).digest("hex").slice(8,16) !== manifest.md5 ||
    manifest.sourceSha256 !== baseline.modules[2].sha256 || manifest.releaseIndexSha256 !== baseline.index.sha256 ||
    JSON.stringify(manifest.changedMethods) !== JSON.stringify(baseline.modules[2].allowedMethods) ||
    manifest.audit.sourceSha256 !== manifest.sourceSha256 || manifest.audit.candidateSha256 !== sha256 ||
    !manifest.audit.protectedTagsByteIdentical || manifest.audit.emptyAbc || manifest.audit.duplicates ||
    !manifest.runtime.loaded || !manifest.runtime.verified || !manifest.runtime.logs.includes("chat-filters-passed") ||
    !manifest.runtime.logs.includes("battle-dispatch-passed") ||
    !manifest.farmRuntime?.baseline?.logs?.includes("baseline-farm-animal-3226-reproduced") ||
    manifest.farmRuntime?.candidates?.length !== 4 ||
    !manifest.farmRuntime?.candidates?.every((r: { loaded: boolean; verified: boolean; logs: string[] }) => r.loaded && r.verified && r.logs.some(line => line.startsWith("farm-animal-native-import-passed")) && !r.logs.some(line => line.startsWith("error ") || line.startsWith("uncaught "))) ||
    !manifest.socialRuntime?.candidate?.logs?.includes("social-marriage-native-ring-init-passed") ||
    !manifest.socialRuntime?.candidate?.logs?.includes("social-level-one-proposal-passed") ||
    !manifest.soulRuntime?.logs?.includes("advanced-soul-percent-passed") ||
    !manifest.eventsRuntime?.loaded || !manifest.eventsRuntime?.verified || !manifest.eventsRuntime.logs.includes("event-visibility-96-passed") ||
    !manifest.eventsRuntime.logs.includes("event-grouping-seven-children-preserved") ||
    !manifest.resourceRuntime?.loaded || !manifest.resourceRuntime?.verified ||
    !manifest.resourceRuntime.logs.includes("battle-resource-imports-passed") ||
    !manifest.resourceRuntime.logs.includes("skill-effect-import-passed") ||
    !manifest.resourceRuntime.logs.includes("formation-preview-import-passed") ||
    !manifest.healingRuntime?.loaded || !manifest.healingRuntime?.verified || !manifest.healingRuntime.logs.includes("critical-healing-conversion-passed") ||
    !manifest.forgeRuntime?.loaded || !manifest.forgeRuntime?.verified || !manifest.forgeRuntime.logs.includes("forge-behavior-passed") ||
    !manifest.baselineResourceRuntime?.logs.some((line: string) => line.startsWith("error SecurityError: Error #3226")))
  throw new Error("MÃ³dulo de chat sem validaÃ§Ã£o de integridade, proteÃ§Ã£o do core ou teste AIR");
export const chatResourceHash: string = sha256;
export const chatResourceMd5: string = manifest.md5;
export function chatResource(path: string): Buffer | undefined {
  return path === "/cdn/2.png" || path === `/cdn/2_${manifest.md5}.png` || path === manifest.sourcePath ? bytes : undefined;
}
export function chatResourceIndex(path: string, raw: Buffer): Buffer {
  if (path !== "/client/code_md5.dat" && path !== "/client/size.xml") return raw;
  const compressed = path.endsWith(".dat");
  const source = (compressed ? inflateSync(inflateSync(raw)) : raw).toString("utf8");
  let found = false;
  const text = source.replace(/<Item\b[^>]*\bname="2\.png"[^>]*\/>/g, row => {
    found = true;
    return row.replace(/\bmd5="[^"]*"/, `md5="${manifest.md5}"`).replace(/\bsize="[^"]*"/, `size="${bytes.length}"`);
  });
  if (!found) throw new Error("MÃ³dulo core/chat ausente do Ã­ndice do cliente");
  const result = Buffer.from(text);
  return compressed ? deflateSync(deflateSync(result)) : result;
}
