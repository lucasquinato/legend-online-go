import { backup } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "node:net";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { mirrorAccountProgress } from "./features/accounts/mirror.js";

const config = loadConfig();
const [sourceName, ...targetNames] = process.argv.slice(2);
if (!sourceName || !targetNames.length) throw new Error("Uso: tsx src/mirror-account-command.ts origem destino [destino...]. Pare o servidor antes.");
if (config.mode !== "tutorial" || config.tutorialEngine === "capture") throw new Error("Espelhamento requer o modo local dinâmico");
const listening = await new Promise<boolean>(resolve => {
  const socket = createConnection({ host: config.gameHost, port: config.gamePort });
  const done = (value: boolean) => { socket.destroy(); resolve(value); };
  socket.setTimeout(1000); socket.once("connect", () => done(true)); socket.once("error", () => done(false)); socket.once("timeout", () => done(true));
});
if (listening) throw new Error("Pare o servidor local antes de espelhar as contas: sessões antigas poderiam sobrescrever os saves.");
const store = new Store(config.dataDir);
try {
  const source = store.user(sourceName), targets = targetNames.map(name => store.user(name));
  if (!source || targets.some(t => !t)) throw new Error("Uma das contas informadas não existe");
  const at = new Date().toISOString(), folder = join(config.dataDir, "backups", "account-mirror-" + at.replace(/[:.]/g, "-"));
  mkdirSync(folder, { recursive: true }); await backup(store.db, join(folder, "state.sqlite"));
  const result = mirrorAccountProgress(store, source.id, targets.map(t => t!.id));
  const report = { at, backup: folder, source: sourceName, targets: result };
  mkdirSync(join(config.dataDir, "audits"), { recursive: true });
  writeFileSync(join(config.dataDir, "audits", "account-mirror.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { store.close(); }
