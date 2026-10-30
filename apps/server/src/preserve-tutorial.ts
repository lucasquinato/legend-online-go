import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, projectRoot } from "./config.js";
import { Store } from "./store.js";
import { AssetCache } from "./assets.js";
const config = loadConfig();
config.resourceMode = "cache-first";
const store = new Store(config.dataDir),
  cache = new AssetCache(config, store);
const pending = JSON.parse(
  readFileSync(join(projectRoot, "reference/tutorial-assets.json"), "utf8"),
) as string[];
const results: {
  path: string;
  saved: boolean;
  bytes?: number;
  sha256?: string;
  status?: number;
}[] = [];
try {
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      let path: string | undefined;
      while ((path = pending.shift())) {
        try {
          const asset = await cache.get(new URL(path, config.upstreamOrigin));
          results.push({
            path,
            saved: true,
            bytes: asset.bytes,
            sha256: asset.sha256,
          });
        } catch (error) {
          results.push({
            path,
            saved: false,
            status: (error as { statusCode?: number }).statusCode ?? 502,
          });
        }
      }
    }),
  );
  results.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(
    join(config.dataDir, "tutorial", "assets-report.json"),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  console.log(
    JSON.stringify({
      saved: results.filter((r) => r.saved).length,
      missing: results.filter((r) => !r.saved),
      report: "data/tutorial/assets-report.json",
    }),
  );
} finally {
  store.close();
}
