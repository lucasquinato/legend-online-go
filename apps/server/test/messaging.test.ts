import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MessageCenter, systemMessageText, type SystemMessage } from "../src/features/messaging/index.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { frame } from "../src/protocol.js";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";

function decode(packet: { frame: string }) {
  const bytes = Buffer.from(packet.frame, "base64");
  return { userId: bytes.readInt32BE(8), opcode: bytes.readUInt16BE(6), message: decodeMessage(typeName("chat.ChatChannelMsg"), bytes.subarray(20)) };
}

test("central preserva os campos de aviso e recompensa e mantém o atraso de combate", () => {
  const center = new MessageCenter(1901);
  const text = "Você recebeu [Gema] x2.";
  const cases = [
    { actual: center.notice(text), expected: { channel: 3, type: 0, encode_msg: text, name: "Servidor local", other_id: 1901, is_centerTip: true }, delay: undefined },
    { actual: center.reward(text, 5600), expected: { channel: 3, type: 0, name: "Sistema", other_id: 1901, encode_msg: text, is_centerTip: false }, delay: 5600 },
  ];
  for (const row of cases) {
    assert.equal(row.actual.opcode, 83);
    // Field order is preserved semantically; protobuf receivers allow either order.
    const actual = encodeMessage(typeName("chat.ChatChannelMsg"), row.actual.message!);
    const expected = encodeMessage(typeName("chat.ChatChannelMsg"), row.expected);
    assert.deepEqual(decodeMessage(typeName("chat.ChatChannelMsg"), actual), decodeMessage(typeName("chat.ChatChannelMsg"), expected));
    assert.equal(row.actual.delayMs, row.delay);
  }
});

test("alertas duplos conservam a ordem distinta de requisito e recompensa de baú", () => {
  const center = new MessageCenter(1901), text = "Colete o baú antes de usar o portal.";
  const guidance = center.guidance(text), loot = center.rewardWithAlert(text);
  assert.deepEqual(guidance.map(p => p.opcode), [83, 111]);
  assert.deepEqual(loot.map(p => p.opcode), [111, 83]);
  for (const packets of [guidance, loot]) {
    assert.equal(packets.filter(p => p.opcode === 83).length, 1);
    assert.equal(packets.filter(p => p.opcode === 111).length, 1);
    assert.equal(packets[0]!.message!.encode_msg, packets[1]!.message!.encode_msg);
    assert.equal(packets.find(p => p.opcode === 83)!.message!.is_centerTip, false);
    assert.deepEqual(packets.find(p => p.opcode === 111)!.message, { channel: 7, encode_msg: text });
  }
});

test("preparação é isolada por personagem e não reaproveita objetos entre entregas", () => {
  const one = new MessageCenter(1901), two = new MessageCenter(1902);
  const request: SystemMessage = { kind: "error", text: "Ouro insuficiente." };
  const first = one.prepare(request), second = two.prepare(request);
  assert.equal(first.recipientId, 1901);
  assert.equal(second.recipientId, 1902);
  assert.equal(first.packets[0]!.message!.other_id, 1901);
  assert.equal(second.packets[0]!.message!.other_id, 1902);
  first.packets[0]!.message!.name = "Alterado";
  first.packets.push({ opcode: 0 });
  assert.equal(second.packets[0]!.message!.name, "Servidor local");
  assert.equal(one.prepare(request).packets.length, 1);
  assert.equal(one.prepare(request).packets[0]!.message!.name, "Servidor local");
  assert.deepEqual(request, { kind: "error", text: "Ouro insuficiente." });
});

test("tipos de sistema usam as políticas sem alterar o controlador nem forçar chat duplicado", () => {
  const center = new MessageCenter(1901);
  const result = center.prepare({ kind: "info", text: "Recurso recebido.", presentation: "alert", delayMs: 120 });
  assert.deepEqual(result.packets, [{ opcode: 111, message: { channel: 7, encode_msg: "Recurso recebido." }, delayMs: 120 }]);
  assert.equal(center.prepare({ kind: "reward", text: "Recursos insuficientes.", presentation: "center" }).packets[0]!.message!.is_centerTip, true);
  for (const id of [0, -1, NaN, 2147483648]) assert.throws(() => new MessageCenter(id));
  for (const text of ["", "  "]) assert.throws(() => center.notice(text));
  for (const delayMs of [-1, Infinity, NaN]) assert.throws(() => center.prepare({ kind: "info", text: "Teste", delayMs }));
});

test("textos de recompensas existentes mantêm conteúdo e ordem dos itens recebidos", () => {
  assert.equal(systemMessageText.campaignBattleXp(123), "Você recebeu 123 de XP pela batalha.");
  assert.equal(systemMessageText.campaignCompletionXp(456), "Você recebeu 456 de XP pela conclusão da campanha.");
  assert.equal(systemMessageText.campaignCardItem("Alma da Moda", 5), "Você recebeu [Alma da Moda] x5 pela carta da campanha.");
  assert.equal(systemMessageText.labyrinthFloorXp(789, 12, "Abismo"), "Você recebeu 789 de XP pelo piso 12 do Abismo.");
  assert.equal(systemMessageText.collectedItems([{ name: "Gema", count: 2 }, { name: "Moeda do Labirinto", count: 5 }]), "Obteve:Gema x2,Moeda do Labirinto x5");
});

test("erros reais de duas contas passam pela central e conservam destinatário e recursos", () => {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "messaging-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  try {
    for (const userId of [1901, 1902]) {
      store.initTutorialProfile(userId);
      store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,sex=0,nickname=?,process=26000 WHERE user_id=?").run(`Mensagem${userId}`, userId);
      const city = new CityWorld(store, userId, () => 1900000000000);
      const inventory = structuredClone(city.state.items), economy = structuredClone(city.state.economy);
      const result = city.handle(frame(5150, userId));
      const messages = result.map(decode).filter(p => p.opcode === 83);
      assert.equal(messages.length, 1);
      assert.equal(messages[0]!.userId, userId);
      assert.equal(messages[0]!.message.other_id, userId);
      assert.equal(messages[0]!.message.channel, 3);
      assert.equal(messages[0]!.message.is_centerTip, 1);
      assert.equal(messages[0]!.message.encode_msg, "A forja ainda não foi reconstruída. Nenhum item ou recurso foi consumido.");
      assert.deepEqual(city.state.items, inventory);
      assert.deepEqual(city.state.economy, economy);
    }
  } finally {
    store.close(); rmSync(dir, { recursive: true, force: true });
  }
});
