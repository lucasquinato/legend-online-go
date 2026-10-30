import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { TutorialWorld } from "../src/world.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { frame, protoInt } from "../src/protocol.js";
import { RejectionFeedback } from "../src/features/messaging/index.js";
import type { TutorialResponse, TutorialScenario } from "../src/tutorial.js";

function setup() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "rejection-messages-"));
  mkdirSync(join(dir, "city")); copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); store.initTutorialProfile(1901);
  store.db.exec("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Avisos',process=26000 WHERE user_id=1901");
  let now = 1900000000000;
  const city = new CityWorld(store, 1901, () => now);
  return { store, city, now: () => now, advance: (ms: number) => { now += ms; },
    send(opcode: number, value: any) { return city.handle(frame(opcode, 1901, encodeMessage(city.scenario.outgoing[opcode]!, value))); },
    cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
function alerts(packets: TutorialResponse[]) {
  return packets.flatMap(p => {
    const b = Buffer.from(p.frame, "base64");
    return b.readUInt16BE(6) === 83 ? [{ recipient: b.readInt32BE(8), ...decodeMessage(typeName("chat.ChatChannelMsg"), b.subarray(20)) }] : [];
  });
}
function assertError(packets: TutorialResponse[], reason: RegExp) {
  const rows = alerts(packets); assert.equal(rows.length, 1);
  assert.match(rows[0]!.encode_msg, reason);
  assert.equal(rows[0]!.channel, 3); assert.equal(rows[0]!.is_centerTip, 1);
  assert.equal(rows[0]!.recipient, 1901); assert.equal(rows[0]!.other_id, 1901);
}

test("missão bloqueada explica o requisito, conserva o progresso e limita avisos repetidos", () => {
  const s = setup();
  try {
    const c = s.city.scenario.cases.find(c => c.opcode === 5014 && c.request?.template_id === 1836)!;
    const before = structuredClone(s.city.saved);
    assertError(s.send(5014, c.request), /missão/i);
    assert.deepEqual(s.city.saved, before);
    assert.equal(alerts(s.send(5014, c.request)).length, 0);
    s.advance(2000);
    assertError(s.send(5014, c.request), /missão/i);
    assert.ok(s.store.db.prepare("SELECT 1 FROM tutorial_events WHERE kind='city-rejected'").get());
  } finally { s.cleanup(); }
});

test("recompensa resgatada informa a repetição sem conceder recursos", () => {
  const s = setup();
  try {
    const c = s.city.scenario.cases.find(c => c.opcode === 5014)!;
    s.send(5014, c.request);
    const before = structuredClone(s.city.saved);
    assertError(s.send(5014, c.request), /já foi resgatada/);
    assert.deepEqual(s.city.saved, before);
  } finally { s.cleanup(); }
});

test("tempo online informa espera e coleta repetida com mensagens diferentes", () => {
  const s = setup();
  try {
    const r = { time: 5, operate: 1 };
    assertError(s.send(5019, r), /Aguarde o tempo indicado/);
    s.advance(300000);
    s.send(5019, r);
    const spirit = s.city.state.player.strategy;
    assertError(s.send(5019, r), /já foi coletada/);
    assert.equal(s.city.state.player.strategy, spirit);
  } finally { s.cleanup(); }
});

test("cartas e encontros indisponíveis mostram um erro em vez de silêncio", () => {
  const s = setup();
  try {
    assertError(s.send(5122, { para_int1: 1901, para_int2: 0 }), /Cartas de campanha indisponíveis/);
    s.city.saved.won = [];
    assertError(s.city.startBattle(1), /Conclua a primeira batalha/);
    assert.equal(s.city.saved.battle, undefined);
  } finally { s.cleanup(); }
});

test("erros de mochila que já tinham aviso não passam a gerar duas mensagens", () => {
  const s = setup();
  try {
    assertError(s.send(5005, { begin_bag_type: 1, begin_obj_id: 0, begin_pos: 999,
      end_bag_type: 1, end_obj_id: 0, end_pos: 30, count: 1 }), /item|origem|posição/i);
  } finally { s.cleanup(); }
});

test("sincronizações e confirmações automáticas sem ação pendente permanecem silenciosas", () => {
  const s = setup();
  try {
    for (const op of [20008,20010,10007,10010,10022,5035])
      assert.equal(alerts(s.city.handle(frame(op, 1901))).length, 0);
  } finally { s.cleanup(); }
});

test("tutorial usa a central para impedimentos explícitos sem avisar sobre marcos automáticos", () => {
  const s = setup();
  try {
    s.store.db.exec("UPDATE tutorial_profiles SET process=0 WHERE user_id=1901");
    const scenario = JSON.parse(readFileSync(join(projectRoot, "data/tutorial/scenario.json"), "utf8")) as TutorialScenario;
    const world = new TutorialWorld(s.store, scenario, 1901, s.now);
    assertError(world.start(1), /Conclua o encontro anterior/);
    assert.equal(alerts(world.start(1)).length, 0);
    assert.equal(alerts(world.handle(frame(5017, 1901, protoInt(1, 19000)))).length, 0);
    assert.equal(alerts(world.handle(frame(65500, 1901))).length, 0);
    assert.equal(world.state.rewardCount, 0);
  } finally { s.cleanup(); }
});

test("limite de repetição é por conta e ação, expira e tolera relógio voltando", () => {
  let now = 10000;
  const a = new RejectionFeedback(1901, () => now), b = new RejectionFeedback(1902, () => now);
  assert.equal(a.prepare("Bloqueado", "quest:1").length, 1);
  assert.equal(a.prepare("Bloqueado", "quest:1").length, 0);
  assert.equal(a.prepare("Bloqueado", "quest:2").length, 1);
  assert.equal(b.prepare("Bloqueado", "quest:1").length, 1);
  now += 2000; assert.equal(a.prepare("Bloqueado", "quest:1").length, 1);
  now -= 3000; assert.equal(a.prepare("Bloqueado", "quest:1").length, 1);
  for (let i = 0; i < 200; i++) a.prepare("Bloqueado", `action:${i}`);
  assert.equal(a.prepare("Bloqueado", "action:199").length, 0);
});
