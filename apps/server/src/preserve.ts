import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { AssetCache } from "./assets.js";
const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Uso: npm run preserve -- /cdn/caminho-do-arquivo [...]");
  process.exitCode = 1;
} else {
  const config = loadConfig();
  // Comando explícito de preservação. Não altera o modo do servidor em execução.
  config.resourceMode = "cache-first";
  const store = new Store(config.dataDir);
  const assets = new AssetCache(config, store);
  try {
    for (const path of paths) {
      try {
        const asset = await assets.get(new URL(path, config.upstreamOrigin));
        console.log(
          JSON.stringify({
            path: asset.path,
            bytes: asset.bytes,
            sha256: asset.sha256,
            saved: true,
          }),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            path: new URL(path, config.upstreamOrigin).pathname,
            saved: false,
            status: (error as { statusCode?: number }).statusCode ?? 502,
          }),
        );
        process.exitCode = 1;
      }
    }
  } finally {
    store.close();
  }
}
