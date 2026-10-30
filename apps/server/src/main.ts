import { loadConfig } from "./config.js";
import { Store, ReplayAuth } from "./store.js";
import { GameServer } from "./game.js";
import { buildHttp } from "./http.js";
import { createPolicyServer } from "./policy.js";

const config = loadConfig();
const store = new Store(config.dataDir);
const auth = new ReplayAuth(store);
const game = new GameServer(config, store, auth, (event, detail) =>
  console.log(JSON.stringify({ event, detail })),
);
const app = buildHttp(config, store, auth, game);
const policy = createPolicyServer(config.gamePort);
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await game.close();
  if (policy.listening)
    await new Promise<void>((resolve) => policy.close(() => resolve()));
  await app.close();
  store.close();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
try {
  await game.listen();
  await new Promise<void>((resolve, reject) => {
    policy.once("error", reject);
    policy.listen(config.policyPort ?? 843, config.gameHost, () => {
      policy.off("error", reject);
      resolve();
    });
  });
  await app.listen({ host: config.httpHost, port: config.httpPort });
  console.log(
    JSON.stringify({
      event: "server-ready",
      mode: config.mode,
      http: config.publicOrigin,
      gamePort: config.gamePort,
      policyPort: config.policyPort ?? 843,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao iniciar");
  await stop();
  process.exitCode = 1;
}
