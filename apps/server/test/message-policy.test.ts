import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { decodeMessage, typeName } from "../src/messages.js";
import type { TutorialResponse } from "../src/tutorial.js";
import { MessageCenter, presentSystemMessage, type MessagePurpose } from "../src/features/messaging/index.js";

function setup() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "message-policy-"));
  mkdirSync(join(dir, "city")); copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  for (const id of [1901,1902]) {
    store.initTutorialProfile(id);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname=?,process=26000 WHERE user_id=?").run(`Policy${id}`, id);
  }
  let now = 1900000000000;
  const a = new CityWorld(store, 1901, () => now), b = new CityWorld(store, 1902, () => now);
  const reload = (id = 1901) => new CityWorld(store, id, () => now);
  const credits = (id = 1901) => store.db.prepare("SELECT COALESCE(SUM(delta),0) AS amount FROM currency_transactions WHERE user_id=? AND reason='townhall:production'").get(id)!.amount;
  return { a, b, store, now: () => now, reload, credits, advance: (ms: number) => { now += ms; },
    cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
function summaries(packets: TutorialResponse[]) {
  return packets.flatMap(p => {
    const bytes = Buffer.from(p.frame, "base64");
    if (![83,111].includes(bytes.readUInt16BE(6))) return [];
    const m = decodeMessage(typeName("chat.ChatChannelMsg"), bytes.subarray(20));
    return String(m.encode_msg).startsWith("Produção da prefeitura:") ? [{ ...m, opcode: bytes.readUInt16BE(6), recipient: bytes.readInt32BE(8) }] : [];
  });
}
function assertSummary(result: TutorialResponse[], gold: number, recipient = 1901) {
  const rows = summaries(result); assert.equal(rows.length, 1);
  assert.equal(rows[0]!.opcode, 83); assert.equal(rows[0]!.is_centerTip, 0);
  assert.equal(rows[0]!.other_id, recipient); assert.equal(rows[0]!.recipient, recipient);
  assert.equal(rows[0]!.encode_msg, `Produção da prefeitura: ${gold} de ouro acumulados desde o último resumo.`);
}

test("política define chat, tela e ambas as apresentações por finalidade", () => {
  const center = new MessageCenter(1901);
  const cases: [MessagePurpose, number[], boolean][] = [
    ["notice", [83], true], ["error", [83], true], ["native-error", [83], false], ["acquisition", [83,111], false],
    ["reward-log", [83], false], ["guidance", [83,111], false],
    ["chest-reward", [111,83], false], ["passive-income", [83], false], ["screen-info", [111], false],
  ];
  for (const [purpose, opcodes, centerTip] of cases) {
    const delivery = presentSystemMessage(center, purpose, "Teste", 5600);
    assert.equal(delivery.recipientId, 1901);
    assert.deepEqual(delivery.packets.map(p => p.opcode), opcodes);
    assert.ok(delivery.packets.every(p => p.delayMs === 5600));
    const chat = delivery.packets.find(p => p.opcode === 83);
    if (chat) assert.equal(chat.message!.is_centerTip, centerTip);
  }
});

test("produção é consolidada em um resumo por minuto, sem conceder ouro adicional", () => {
  const s = setup();
  try {
    s.advance(10000); s.a.persist();
    assert.equal(summaries(s.a.bootstrap()).length, 0);
    s.advance(49000); assert.equal(summaries(s.a.tick()).length, 0);
    s.advance(1000);
    const result = s.a.tick(), credited = Number(s.credits());
    assert.ok(credited > 0); assertSummary(result, credited);
    const balance = s.a.state.economy.gold_total_count;
    assert.equal(summaries(s.a.tick()).length, 0);
    assert.equal(summaries(s.a.bootstrap()).length, 0);
    assert.equal(summaries(s.reload().bootstrap()).length, 0);
    assert.equal(s.a.state.economy.gold_total_count, balance);
    s.advance(60000); assertSummary(s.a.tick(), Number(s.credits()) - credited);
  } finally { s.cleanup(); }
});

test("produção offline aparece uma vez; imposto e créditos de outra conta não entram no resumo", () => {
  const s = setup();
  try {
    s.a.changeCurrency("gold", 12345, "townhall:tax");
    s.advance(3600000); s.b.persist();
    const restored = s.reload(), credited = Number(s.credits());
    assert.ok(credited > 0);
    assertSummary(restored.bootstrap(), credited);
    assert.equal(summaries(s.reload().bootstrap()).length, 0);
    assertSummary(s.b.bootstrap(), Number(s.credits(1902)), 1902);
  } finally { s.cleanup(); }
});

test("primeira instalação ignora o histórico antigo e passa a resumir novos créditos", () => {
  const s = setup();
  try {
    s.advance(3600000); s.a.persist();
    const historical = Number(s.credits()); assert.ok(historical > 0);
    delete s.a.saved.messageReceipts; s.a.persist();
    const restored = s.reload();
    assert.equal(summaries(restored.bootstrap()).length, 0);
    s.advance(60000); assertSummary(restored.tick(), Number(s.credits()) - historical);
  } finally { s.cleanup(); }
});

test("sem crédito efetivo no teto de ouro, não existe resumo de ganho fictício", () => {
  const s = setup();
  try {
    s.a.state.economy.gold_total_count = s.a.state.economy.gold_max; s.a.persist();
    s.advance(60000);
    assert.equal(summaries(s.a.tick()).length, 0); assert.equal(s.credits(), 0);
  } finally { s.cleanup(); }
});

test("falha ao salvar o checkpoint preserva os créditos pendentes para a próxima tentativa", () => {
  const s = setup();
  try {
    s.advance(60000); s.a.persist();
    const before = structuredClone(s.a.saved.messageReceipts);
    s.store.db.exec(`CREATE TRIGGER summary_fail BEFORE UPDATE ON city_worlds
      WHEN json_extract(NEW.state,'$.messageReceipts.production.reportedAt')=${s.now()}
      BEGIN SELECT RAISE(ABORT,'summary checkpoint failure'); END`);
    const delivered: TutorialResponse[] = [];
    assert.throws(() => delivered.push(...s.a.tick()), /summary checkpoint failure/);
    assert.equal(summaries(delivered).length, 0);
    assert.deepEqual(s.a.saved.messageReceipts, before);
    s.store.db.exec("DROP TRIGGER summary_fail");
    assertSummary(s.a.bootstrap(), Number(s.credits()));
    assert.equal(summaries(s.reload().bootstrap()).length, 0);
  } finally { s.cleanup(); }
});

test("o resumo aguarda o fim da batalha sem perder os créditos acumulados", () => {
  const s = setup();
  try {
    s.a.startBattle(0); assert.ok(s.a.saved.battle && !s.a.saved.battle.finished);
    s.advance(60000); assert.equal(summaries(s.a.tick()).length, 0);
    s.a.saved.battle!.finished = true;
    assertSummary(s.a.bootstrap(), Number(s.credits()));
  } finally { s.cleanup(); }
});
