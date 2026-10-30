import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createConnection, type AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { projectRoot, type Config } from "../src/config.js";
import { Store, ReplayAuth } from "../src/store.js";
import { GameServer } from "../src/game.js";
import type { TutorialWorld } from "../src/world.js";
import { frame, crypt, FrameReader, INITIAL_KEY, protoInt, protoString } from "../src/protocol.js";

function setup() {
  const base = join(projectRoot, ".test-data");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "sqlite-contention-"));
  const store = new Store(dir);
  return { dir, store, cleanup() {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  } };
}

async function temporaryWriter(path: string) {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(workerData);
    db.exec('BEGIN IMMEDIATE');
    parentPort.postMessage('locked');
    setTimeout(() => { db.exec('COMMIT'); db.close(); }, 150);
  `, { eval: true, workerData: path });
  const exited = once(worker, "exit");
  await once(worker, "message");
  return exited;
}

test("gravações de progresso aguardam o escritor concorrente sem perder dados", async () => {
  const s = setup();
  try {
    assert.equal(s.store.db.prepare("PRAGMA busy_timeout").get()!.timeout, 5000);
    assert.equal(s.store.db.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal");
    const exited = await temporaryWriter(join(s.dir, "state.sqlite"));
    s.store.initTutorialProfile(1901);
    await exited;
    assert.equal(s.store.tutorialProfile(1901)!.process, 0);
  } finally { s.cleanup(); }
});

test("inicialização configura a espera antes das migrações do banco", async () => {
  const s = setup();
  s.store.close();
  try {
    const exited = await temporaryWriter(join(s.dir, "state.sqlite"));
    const reopened = new Store(s.dir);
    reopened.close();
    await exited;
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});

test("tráfego sob bloqueio mantém captura e acumula contadores sem bloquear pacotes", async () => {
  const s = setup(), writer = new DatabaseSync(join(s.dir, "state.sqlite"));
  const packet = frame(125, 1901, protoInt(1, 123));
  let locked = false;
  try {
    s.store.record("in", packet, true, "before-lock");
    writer.exec("BEGIN IMMEDIATE"); locked = true;
    const started = performance.now();
    for (let n = 0; n < 300; n++) s.store.record("in", packet, true, "locked");
    s.store.record("out", packet, false, "locked");
    assert.ok(performance.now() - started < 1000, "contadores não devem aguardar o busy timeout de progresso");
    assert.equal(readFileSync(join(s.dir, `packets-${new Date().toISOString().slice(0, 10)}.jsonl`), "utf8").trim().split("\n").length, 301);
    assert.equal(s.store.db.prepare("SELECT packets FROM traffic WHERE direction='in'").get()!.packets, 1);
    writer.exec("COMMIT"); locked = false;
    for (let n = 0; n < 100; n++) {
      if (s.store.db.prepare("SELECT packets FROM traffic WHERE direction='in'").get()!.packets === 301) break;
      await delay(20);
    }
    assert.deepEqual(s.store.db.prepare("SELECT direction,packets,bytes FROM traffic ORDER BY direction").all().map((r) => ({ ...r })), [
      { direction: "in", packets: 301, bytes: packet.length * 301 },
      { direction: "out", packets: 1, bytes: packet.length },
    ]);
    await delay(300);
    assert.equal(s.store.db.prepare("SELECT packets FROM traffic WHERE direction='in'").get()!.packets, 301, "retry não duplica contadores");
  } finally {
    if (locked) writer.exec("ROLLBACK");
    writer.close(); s.cleanup();
  }
});

test("encerramento descarrega contadores pendentes depois de liberar o bloqueio", () => {
  const s = setup(), writer = new DatabaseSync(join(s.dir, "state.sqlite"));
  writer.exec("BEGIN IMMEDIATE");
  s.store.record("in", frame(125, 1901), false, "shutdown");
  writer.exec("COMMIT");
  s.store.close();
  try {
    assert.equal(writer.prepare("SELECT packets FROM traffic").get()!.packets, 1);
  } finally {
    writer.close(); rmSync(s.dir, { recursive: true, force: true });
  }
});

for (const failSend of [false, true]) test(`timer TCP ${failSend ? "contém falhas de envio e save" : "envia pacotes com o SQLite bloqueado"}`, async () => {
  const s = setup(), writer = new DatabaseSync(join(s.dir, "state.sqlite"));
  s.store.initTutorialProfile(1901);
  s.store.db.exec("UPDATE tutorial_profiles SET active=1 WHERE user_id=1901");
  const response = { frame: frame(3, 1901, protoInt(1, 1901)).toString("base64"), delayMs: 10 };
  mkdirSync(join(s.dir, "tutorial"));
  writeFileSync(join(s.dir, "tutorial/scenario.json"), JSON.stringify({
    version: 1, userId: 1901, login: [response],
    steps: [{ request: frame(8271, 1901).toString("base64"), responses: [] }],
  }));
  const config: Config = {
    mode: "tutorial", tutorialEngine: "dynamic", dataDir: s.dir,
    gameHost: "127.0.0.1", gamePort: 0, httpHost: "127.0.0.1", httpPort: 0,
    publicOrigin: "http://127.0.0.1", advertisedGameHost: "127.0.0.1",
    upstreamOrigin: "https://example.invalid", upstreamGameHost: "127.0.0.1",
    upstreamGamePort: 1, upstreamTimeoutMs: 1000, fixturePath: "", capturePackets: false,
  };
  const auth = new ReplayAuth(s.store);
  auth.validate = () => true;
  const events: string[] = [];
  const game = new GameServer(config, s.store, auth, (event) => events.push(event));
  let locked = false;
  game.world = () => ({
    userId: 1901, tick: () => [],
    login: () => {
      if (!failSend) { writer.exec("BEGIN IMMEDIATE"); locked = true; }
      return [response];
    },
    city: () => { if (failSend) throw new Error("scheduled failure"); },
    save: () => { if (failSend) throw new Error("save failure"); },
  }) as unknown as TutorialWorld;
  let socket: ReturnType<typeof createConnection> | undefined;
  try {
    await game.listen();
    socket = createConnection({ host: "127.0.0.1", port: (game.server.address() as AddressInfo).port });
    await once(socket, "connect");
    const key = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
    const reader = new FrameReader(); reader.key = Buffer.from(key);
    const received: Buffer[] = [];
    socket.on("data", (chunk) => reader.push(chunk, (packet) => received.push(packet)));
    socket.write(crypt(frame(20001, 1901, Buffer.concat([
      protoString(2, "test-proof"), ...Array.from(key, (v) => protoInt(3, v)),
    ])), Buffer.from(INITIAL_KEY)));
    for (let n = 0; n < 100; n++) {
      if (failSend ? events.includes("world-save-error") : received.length) break;
      await delay(20);
    }
    assert.equal(game.server.listening, true);
    if (failSend) {
      assert.ok(events.includes("world-send-error"));
      assert.ok(events.includes("world-save-error"));
    } else {
      assert.ok(locked, "o pacote deve chegar enquanto o outro escritor mantém o lock");
      assert.equal(received[0]?.readUInt16BE(6), 3);
      assert.deepEqual(events, []);
    }
  } finally {
    if (locked) writer.exec("ROLLBACK");
    socket?.destroy();
    await game.close();
    writer.close(); s.cleanup();
  }
});
