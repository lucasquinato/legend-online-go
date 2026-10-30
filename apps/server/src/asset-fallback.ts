import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const canonical = (path: string) => path.replace(/_[a-f0-9]{8}(?=\.[^/.]+$)/ig, "").toLowerCase();

/** OAS has different version suffixes. Never substitute its executable modules or templates. */
export class AssetFallback {
  private versions = new Map<string, string>();
  constructor(directory: string) {
    let db: DatabaseSync | undefined;
    try {
      const root = join(directory, "external-oas");
      db = new DatabaseSync(join(root, "cache.sqlite"), { readOnly: true });
      const row = db.prepare("SELECT sha256 FROM assets WHERE path='/client/res_md5.dat' ORDER BY saved_at DESC LIMIT 1").get();
      if (row && /^[a-f0-9]{64}$/.test(String(row.sha256))) {
        const xml = inflateSync(inflateSync(readFileSync(join(root, "objects", row.sha256 + ".bin")))).toString();
        for (const match of xml.matchAll(/<Item\s+([^>]+)>/g)) {
          const fields = Object.fromEntries([...match[1]!.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
          if (fields.name && /^[a-f0-9]{8}$/i.test(fields.md5 ?? ""))
            this.versions.set(canonical("/cdn/" + fields.name.replaceAll("\\", "/")), fields.md5!);
        }
      }
    } catch { /* The unversioned OAS resource remains an optional fallback. */ }
    finally { db?.close(); }
  }
  candidates(url: URL): URL[] {
    if(/^\/cdn\/\d+(?:_[a-f0-9]{8})?\.png$/i.test(url.pathname))return [];
    // These are visual resources; code, configuration and template bundles stay version pinned.
    if (!/^\/cdn\/(?:icon|equip_show|equip|swf|maps|mapmaterial|ui|images|skilleffect|skillname|sceneima|sound|music)\//i.test(url.pathname) && !/^\/cdn\/[^/]+\.(?:png|jpg|jpeg|gif)$/i.test(url.pathname)) return [];
    const key = canonical(url.pathname), version = this.versions.get(key);
    const path = (version ? key.replace(/(\.[^/.]+)$/, "_" + version + "$1") : key).replace(/^\/cdn/, "");
    return [new URL(path, "https://res806oas.creaction-network.com"),
      new URL(path, "http://res806oas.creaction-network.com:8080")];
  }
}
