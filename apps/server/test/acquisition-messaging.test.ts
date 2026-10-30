import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { frame } from "../src/protocol.js";
import { acquisitionSnapshot, acquisitionGains } from "../src/features/messaging/index.js";

function setup() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "acquisition-messages-"));
  mkdirSync(join(dir, "city")); copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  store.db.prepare("INSERT INTO users(id,username,salt,hash) VALUES(1901,'receipt_test','fixture','fixture')").run();
  store.initTutorialProfile(1901);
  store.db.exec("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname='Recibos',process=26000 WHERE user_id=1901");
  let now = 1900000000000;
  const city = new CityWorld(store, 1901, () => now);
  const send = (opcode: number, value: any) => city.handle(frame(opcode, 1901, encodeMessage(city.scenario.outgoing[opcode]!, value)));
  return { city, store, send, advance: (ms: number) => { now += ms; },
    add(template: number, count: number, pos = 30) {
      city.state.items[`1:0:${pos}`] = { id: 9000000 + pos, template_id: template, count, pos, bag_type: 1, object_id: 0, exist: 1, bind: 0 };
    },
    cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
function notices(packets: { frame: string }[]) {
  return packets.flatMap(packet => {
    const b = Buffer.from(packet.frame, "base64"), opcode = b.readUInt16BE(6);
    return [83,111].includes(opcode) ? [{ opcode, userId: b.readInt32BE(8), ...decodeMessage(typeName("chat.ChatChannelMsg"), b.subarray(20)) }] : [];
  });
}
function received(packets: { frame: string }[]) { return notices(packets).filter(p => String(p.encode_msg).startsWith("Você recebeu ")); }
function assertReceipt(packets: { frame: string }[], pattern: RegExp) {
  const rows = received(packets);
  assert.deepEqual(rows.map(row => row.opcode), [83,111]);
  assert.equal(rows[0]!.encode_msg, rows[1]!.encode_msg);
  assert.match(rows[0]!.encode_msg, pattern);
  assert.ok(rows.every(row => row.userId === 1901));
}

for (const source of ["consumível", "venda", "correio", "missão capturada", "missão genérica"] as const) {
  test(`${source}: rollback não entrega recibo nem mantém crédito; repetir após correção entrega uma vez`, () => {
    const s = setup();
    try {
      let opcode: number, request: any;
      if (source === "consumível") {
        s.add(2030102, 2); opcode = 5006; request = { bag_type: 1, pos: 30, count: 1 };
      } else if (source === "venda") {
        s.add(2129006, 3); opcode = 5007; request = { begin_pos: 30 };
      } else if (source === "correio") {
        s.city.state.player.bag_count = 100;
        const id = s.store.sendLocalItems(1901, "Validação de rollback", [
          { template: -100, count: 1234 }, { template: 2030503, count: 4 },
        ]);
        opcode = 5022; request = { mailsIdArray: [id], position: [0] };
      } else {
        const quest = s.city.scenario.cases.find(c => c.opcode === 5014)!;
        opcode = 5014; request = { ...quest.request, is_pass: 0 };
        if (source === "missão genérica") s.city.scenario.cases = s.city.scenario.cases.filter(c =>
          c.opcode !== 5014 || c.request?.template_id !== request.template_id);
      }
      s.city.persist();
      const before = structuredClone(s.city.saved);
      const transactions = s.store.db.prepare("SELECT COUNT(*) AS n FROM currency_transactions").get()!.n;
      const delivered: { frame: string }[] = [];
      s.store.db.exec("CREATE TRIGGER final_message_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'final message rollback'); END");
      assert.throws(() => delivered.push(...s.send(opcode, request)), /final message rollback/);
      assert.equal(received(delivered).length, 0);
      assert.deepEqual(s.city.saved, before);
      assert.equal(s.store.db.prepare("SELECT COUNT(*) AS n FROM currency_transactions").get()!.n, transactions);
      s.store.db.exec("DROP TRIGGER final_message_fail");
      assertReceipt(s.send(opcode, request), /^Você recebeu /);
      const restored = new CityWorld(s.store, 1901, () => 1900000000000);
      assert.equal(received(restored.bootstrap()).length, 0);
      if (source === "venda" || source === "correio" || source.startsWith("missão")) {
        assert.equal(received(restored.handle(frame(opcode, 1901, encodeMessage(restored.scenario.outgoing[opcode]!, request)))).length, 0);
      }
    } finally { s.cleanup(); }
  });
}

test("impostos anunciam somente o crédito fiscal, sem incorporar produção passiva e sem repetir no cooldown", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 14; s.city.persist(); s.advance(120000);
    const packets = s.send(8327, { op: 1 });
    const tax = Number(s.store.db.prepare("SELECT delta FROM currency_transactions WHERE reason='townhall:tax'").get()!.delta);
    assert.ok(tax > 0);
    assert.ok(Number(s.store.db.prepare("SELECT SUM(delta) AS n FROM currency_transactions WHERE reason='townhall:production'").get()!.n) > 0);
    assertReceipt(packets, new RegExp(`^Você recebeu ${tax} de ouro pela coleta de impostos\\.$`));
    assert.equal(received(s.send(8327, { op: 1 })).length, 0);
  } finally { s.cleanup(); }
});

test("bolsas e energia informam o crédito real: teto de 200 não anuncia o excedente", () => {
  const s = setup();
  try {
    s.add(2030102, 2);
    assertReceipt(s.send(5006, { bag_type: 1, pos: 30, count: 1 }), /500000 de ouro pelo consumo/);
    s.city.state.player.weary = 180; s.add(2030503, 2, 31);
    assertReceipt(s.send(5006, { bag_type: 1, pos: 31, count: 1 }), /20 de energia pelo consumo/);
    assert.equal(s.city.state.player.weary, 200);
    assert.equal(received(s.send(5006, { bag_type: 1, pos: 31, count: 1 })).length, 0);
    assert.equal(received(s.send(5006, { bag_type: 1, pos: 31, count: 1 })).length, 0);
  } finally { s.cleanup(); }
});

test("venda informa o ouro confirmado e pedidos repetidos não anunciam outra recompensa", () => {
  const s = setup();
  try {
    s.add(2129006, 3);
    assertReceipt(s.send(5007, { begin_pos: 30 }), /24000 de ouro pela venda de itens/);
    assert.equal(received(s.send(5007, { begin_pos: 30 })).length, 0);
  } finally { s.cleanup(); }
});

test("anexos mistos agregam pilhas e relatam moedas, XP e itens uma única vez", () => {
  const s = setup();
  try {
    s.city.state.player.bag_count = 100;
    const id = s.store.sendLocalItems(1901, "Recibo", [
      { template: -100, count: 1234 }, { template: -700, count: 567 },
      { template: 2030503, count: 3 }, { template: 2030503, count: 4 },
    ]);
    const request = { mailsIdArray: [id], position: [0] };
    const result = s.send(5022, request);
    assertReceipt(result, /1234 de ouro, 567 de XP, \[.+\] x7 pelos anexos do correio/);
    assert.equal(received(s.send(5022, request)).length, 0);
  } finally { s.cleanup(); }
});

test("missão capturada informa ganhos reais, sem repetir o prêmio ao resgatar novamente", () => {
  const s = setup();
  try {
    const quest = s.city.scenario.cases.find(c => c.opcode === 5014)!;
    const request = { ...quest.request, is_pass: 0 };
    const before = acquisitionSnapshot(s.city.state);
    const result = s.send(5014, request);
    const gains = acquisitionGains(before, acquisitionSnapshot(s.city.state));
    assert.ok(gains.length);
    assertReceipt(result, /pela missão\.$/);
    assert.equal(received(s.send(5014, request)).length, 0);
  } finally { s.cleanup(); }
});

test("falha no save desfaz impostos e não entrega mensagem de sucesso", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 14; s.city.persist();
    const before = structuredClone(s.city.saved), delivered: any[] = [];
    s.store.db.exec("CREATE TRIGGER receipt_fail BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'receipt save failure'); END");
    assert.throws(() => delivered.push(...s.send(8327, { op: 1 })), /receipt save failure/);
    assert.equal(received(delivered).length, 0);
    assert.deepEqual(s.city.saved, before);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) AS n FROM currency_transactions WHERE reason='townhall:tax'").get()!.n, 0);
    s.store.db.exec("DROP TRIGGER receipt_fail");
    assertReceipt(s.send(8327, { op: 1 }), /pela coleta de impostos/);
  } finally { s.cleanup(); }
});

test("missão resolvida pelo modelo genérico também usa a central", () => {
  const s = setup();
  try {
    const quest = s.city.scenario.cases.find(c => c.opcode === 5014)!;
    s.city.scenario.cases = s.city.scenario.cases.filter(c => c.opcode !== 5014 || c.request?.template_id !== quest.request!.template_id);
    const request = { ...quest.request, is_pass: 0 };
    assertReceipt(s.send(5014, request), /pela missão\.$/);
    assert.equal(received(s.send(5014, request)).length, 0);
  } finally { s.cleanup(); }
});
