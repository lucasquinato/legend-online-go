import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Inventory, itemKey } from "../src/inventory.js";
import { moveStorage, arrangeStorage, expansion, storageCapacity, serverDate, expired, stackSignature } from "../src/features/inventory/storage.js";
import { inventoryResource, inventoryResourceHash, inventoryResourceIndex } from "../src/features/inventory/ui-resource.js";
import { formationResourceHash, formationResourceMd5, formationResourceIndex } from "../src/features/skills/formation-resource.js";
import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { projectRoot, loadConfig } from "../src/config.js";
import { Store, ReplayAuth } from "../src/store.js";
import { GameServer } from "../src/game.js";
import { buildHttp } from "../src/http.js";
import { CityWorld } from "../src/city-world.js";
import { frame } from "../src/protocol.js";
import { decodeMessage, encodeMessage } from "../src/messages.js";

const now = 1900000000000;
const stone = (pos: number, count = 1, id = pos + 10, bind = 0, bag = 1): any => ({ id, template_id: 2129006, count, pos, bag_type: bag, object_id: 0, bind, exist: 1 });
const move = (from: number, to: number, count = 0, source = 1, dest = 1): any => ({ begin_bag_type: source, begin_obj_id: 0, begin_pos: from, end_bag_type: dest, end_obj_id: 0, end_pos: to, count });
function bag(items: any[], player: any = { bag_count: 0 }) {
  const state = Object.fromEntries(items.map(i => [itemKey(i), i]));
  return { state, player, inventory: new Inventory(state, { nextId: 10000 }, (b) => storageCapacity(player, b, now)) };
}

test("manual swap on a full backpack preserves identities and binding", () => {
  const s = bag(Array.from({ length: 42 }, (_, i) => stone(i, i === 0 ? 9999 : 224, i + 1, i === 0 ? 1 : 0)));
  moveStorage(s.inventory, s.player, move(41, 0), now);
  assert.equal(s.state["1:0:0"].id, 42);
  assert.equal(s.state["1:0:0"].bind, 0);
  assert.equal(s.state["1:0:41"].id, 1);
  assert.equal(s.state["1:0:41"].count, 9999);
});
test("ativar tesouros transfere todas as categorias imediatamente, preserva IDs/proteção e limpa origens no 115", async () => {
  const s = await setup();
  try {
    const templates = JSON.parse(readFileSync(join(projectRoot, "reference/item-templates.json"), "utf8")).items;
    const models = [205, 224, 228, 312, 329, 343, 344, 752, 753, 760, 761].map((type, pos) => ({
      ...stone(pos, 1, 2000 + pos), template_id: Number(Object.values(templates).find((t: any) => Number(t.SonType) === type && Number(t.MaxCount) > 0)!.TemplateId),
      is_locked: pos === 0 ? 1 : 0,
    }));
    s.city.state.items = Object.fromEntries(models.map(i => [itemKey(i), i]));
    s.city.state.items["1:0:20"] = stone(20, 3);
    const result = s.send(9569, { pay_type: 0 });
    const stored = Object.values(s.city.state.items).filter(i => i.bag_type === 34);
    assert.equal(stored.length, 11);
    for (const model of models) {
      const item = stored.find(i => i.id === model.id)!;
      assert.ok(item); assert.equal(item.template_id, model.template_id);
      assert.equal(item.count, model.count); assert.equal(item.is_locked, model.is_locked);
    }
    assert.ok(s.city.state.items["1:0:20"]);
    const deltas = s.msg(result, 115).moved;
    assert.equal(deltas.filter((i: any) => i.change_type === 1 && !i.item).length, 11);
    assert.equal(deltas.filter((i: any) => i.change_type === 34 && i.item).length, 11);
    s.reload(); assert.equal(Object.values(s.city.state.items).filter(i => i.bag_type === 34).length, 11);
  } finally { s.close(); }
});
test("teste matador: gema recebida por email com mochila cheia vai direto para tesouros, sem atualização intermediária", async () => {
  const s = await setup();
  try {
    s.send(9569, { pay_type: 0 });
    s.city.state.items = Object.fromEntries(Array.from({ length: 42 }, (_, pos) => { const i = stone(pos, 9999); return [itemKey(i), i]; }));
    const common = structuredClone(s.city.state.items);
    const id = s.store.sendLocalItems(1959, "Gema com mochila cheia", [{ template: 2050101, count: 4 }]);
    s.city.persist();
    const response = s.send(5022, { mailsIdArray: [id], position: [0] });
    const deltas = s.msg(response, 115).moved;
    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].change_type, 34);
    assert.equal(deltas[0].item.template_id, 2050101);
    assert.equal(deltas[0].item.count, 4);
    assert.equal(s.city.state.mails[id].isAnnex1, 1);
    assert.deepEqual(Object.fromEntries(Object.entries(s.city.state.items).filter(([, i]) => i.bag_type === 1)), common);
    s.send(5022, { mailsIdArray: [id], position: [0] });
    assert.equal(Object.values(s.city.state.items).filter(i => i.template_id === 2050101).reduce((n, i) => n + i.count, 0), 4);
  } finally { s.close(); }
});
test("sem tesouros ativos a gema usa mochila comum; cheia recusa sem perder o anexo", async () => {
  const s = await setup();
  try {
    const first = s.store.sendLocalItems(1959, "Gema comum", [{ template: 2050101, count: 1 }]);
    s.city.persist();
    assert.equal(s.msg(s.send(5022, { mailsIdArray: [first], position: [0] }), 115).moved[0].change_type, 1);
    s.city.state.items = Object.fromEntries(Array.from({ length: 42 }, (_, pos) => { const i = stone(pos, 9999); return [itemKey(i), i]; }));
    const id = s.store.sendLocalItems(1959, "Sem espaço", [{ template: 2050101, count: 2 }]);
    s.city.persist();
    const before = structuredClone(s.city.state.items);
    s.send(5022, { mailsIdArray: [id], position: [0] });
    assert.deepEqual(s.city.state.items, before);
    assert.equal(s.city.state.mails[id].isAnnex1, 0);
    assert.equal(s.city.state.player.$125.value, "0");
  } finally { s.close(); }
});
test("roteamento direto não aceita tipos indevidos, nem pela inserção explícita nem devolução temporária", async () => {
  const s = await setup();
  try {
    s.send(9569, { pay_type: 0 });
    const inv = (s.city as any).inventory(s.city.state) as Inventory;
    inv.add({ ...stone(0), template_id: 2030102, bag_type: 34 }, 1);
    assert.ok(Object.values(s.city.state.items).some(i => i.template_id === 2030102 && i.bag_type === 1));
    assert.ok(!Object.values(s.city.state.items).some(i => i.template_id === 2030102 && i.bag_type === 34));
    s.city.state.items["0:0:0"] = { ...stone(0), template_id: 2030102, bag_type: 0 };
    s.send(5005, move(0, 1, 0, 0, 34));
    assert.ok(s.city.state.items["0:0:0"]);
    assert.equal(s.city.state.items["34:0:1"], undefined);
  } finally { s.close(); }
});
test("organizar transfere gemas antigas, mescla com o destino e conserva quantidade e identidade restante", async () => {
  const s = await setup();
  try {
    s.send(9569, { pay_type: 0 });
    s.city.state.items = {
      "1:0:0": { ...stone(0, 8, 99), template_id: 2050101 },
      "1:0:1": stone(1, 5, 100),
      "34:0:0": { ...stone(0, 9997, 98, 0, 34), template_id: 2050101 },
    };
    s.send(8220, { bagType: 1, isStackItem: 1, arrangeInfo: [{ oldplace: 1, newplace: 0 }, { oldplace: 0, newplace: 1 }] });
    assert.equal(s.city.state.items["34:0:0"].count, 9999);
    assert.equal(s.city.state.items["34:0:1"].count, 6);
    assert.equal(s.city.state.items["34:0:1"].id, 99);
    assert.equal(s.city.state.items["1:0:0"].template_id, 2129006);
    assert.equal(s.city.state.items["1:0:1"], undefined);
  } finally { s.close(); }
});
test("falha no save da ativação reverte transferência, desbloqueio e custo; contas já ativadas são reparadas ao relogar", async () => {
  const s = await setup();
  try {
    s.city.state.items = { "1:0:0": { ...stone(0, 3), template_id: 2050101 } };
    s.city.persist();
    const before = structuredClone(s.city.saved), persist = s.city.persist;
    s.city.persist = () => { throw new Error("treasure save failure"); };
    assert.throws(() => s.send(9569, { pay_type: 0 }), /treasure save failure/);
    assert.deepEqual(s.city.saved, before);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM currency_transactions WHERE reason='inventory-stone-bag'").get()!.n, 0);
    s.city.persist = persist;
    s.city.state.player.$125 = { wire: 0, value: "245" };
    delete s.city.saved.treasureRoutingVersion;
    s.city.persist(); s.reload();
    assert.equal(s.city.state.items["1:0:0"], undefined);
    assert.equal(s.city.state.items["34:0:0"].count, 3);
    assert.equal(s.city.saved.treasureRoutingVersion, 1);
  } finally { s.close(); }
});
test("partial merge fills max and leaves overflow at origin, even with no empty slot", () => {
  const s = bag([stone(0, 9998), stone(1, 100)]);
  moveStorage(s.inventory, s.player, move(1, 0, 50), now);
  assert.equal(s.state["1:0:0"].count, 9999);
  assert.equal(s.state["1:0:1"].count, 99);
});
test("split allocates an ID, moving a whole pile preserves it; partial swap is rejected without mutation", () => {
  const s = bag([stone(0, 100), stone(1, 2, 30, 1)]);
  moveStorage(s.inventory, s.player, move(0, 2, 5), now);
  assert.equal(s.state["1:0:0"].count, 95);
  const id = s.state["1:0:2"].id;
  assert.notEqual(id, s.state["1:0:0"].id);
  moveStorage(s.inventory, s.player, move(2, 3), now);
  assert.equal(s.state["1:0:3"].id, id);
  const before = structuredClone(s.state);
  assert.throws(() => moveStorage(s.inventory, s.player, move(0, 1, 5), now));
  assert.deepEqual(s.state, before);
});
test("arrangement handles cyclic permutations atomically and merges only matching bind/metadata", () => {
  const s = bag([stone(0, 2), stone(1, 3), stone(2, 4, 12, 1)]);
  arrangeStorage(s.inventory, s.player, { bagType: 1, isStackItem: 0, arrangeInfo: [{ oldplace: 0, newplace: 1 }, { oldplace: 1, newplace: 2 }, { oldplace: 2, newplace: 0 }] }, now);
  assert.deepEqual([0, 1, 2].map(p => s.state[`1:0:${p}`].id), [12, 10, 11]);
  arrangeStorage(s.inventory, s.player, { bagType: 1, isStackItem: 1, arrangeInfo: [{ oldplace: 1, newplace: 0 }, { oldplace: 2, newplace: 1 }, { oldplace: 0, newplace: 2 }] }, now);
  assert.deepEqual(Object.values(s.state).map(i => [i.count, i.bind, i.pos]), [[5, 0, 0], [4, 1, 1]]);
});
test("malformed/stale organize never deletes unlisted items", () => {
  const s = bag([stone(0), stone(1)]), before = structuredClone(s.state);
  for (const arrangeInfo of [[{ oldplace: 0, newplace: 0 }], [{ oldplace: 0, newplace: 0 }, { oldplace: 1, newplace: 0 }]]) {
    assert.throws(() => arrangeStorage(s.inventory, s.player, { bagType: 1, arrangeInfo }, now));
    assert.deepEqual(s.state, before);
  }
});
test("expansion matches every recorded online purchase, limits and 1075 total", () => {
  let extra = 0, cost = 0;
  for (const [rows, expectedExtra, expectedCost] of [[1, 7, 5], [1, 14, 10], [8, 70, 260], [8, 126, 400], [8, 182, 400]]) {
    const result = expansion({ bag_count: extra }, rows!);
    assert.deepEqual(result, { extra: expectedExtra, cost: expectedCost });
    extra = result.extra; cost += result.cost;
  }
  assert.equal(cost, 1075);
  assert.throws(() => expansion({ bag_count: extra }, 1));
  assert.throws(() => expansion({}, 0));
});
test("expired rentals retain items for withdrawal but deny new deposits, expired validity uses offline time", () => {
  const player = { bag_count: 182, status: 2, rentalBagTime: serverDate(now - 1000) };
  const s = bag([stone(224, 5)], player);
  assert.equal(storageCapacity(player, 1, now), 224);
  assert.equal(storageCapacity(player, 1, now, true), 322);
  assert.throws(() => moveStorage(s.inventory, player, move(224, 225), now));
  moveStorage(s.inventory, player, move(224, 0), now);
  assert.equal(s.state["1:0:0"].count, 5);
  assert.equal(expired({ valid_date: 10, begin_date: serverDate(now - 600001) }, now), true);
  assert.equal(expired({ valid_date: 0, begin_date: serverDate(0) }, now), false);
});
test("presentation metadata does not prevent stacking; binding and expiration still do", () => {
  assert.equal(stackSignature(stone(0)), stackSignature({ ...stone(1), is_new: 1, is_locked: 0 }));
  assert.notEqual(stackSignature(stone(0)), stackSignature(stone(1, 1, 11, 1)));
  assert.notEqual(stackSignature(stone(0)), stackSignature({ ...stone(0), valid_date: 10 }));
  assert.equal(stackSignature({ ...stone(0), begin_date: serverDate(now) }), stackSignature({ ...stone(1), begin_date: serverDate(0) }));
  assert.notEqual(stackSignature({ ...stone(0), valid_date: 10, begin_date: serverDate(now) }), stackSignature({ ...stone(1), valid_date: 10, begin_date: serverDate(0) }));
});
test("original online UI has six pages and treasure storage and is SHA verified", () => {
  assert.equal(createHash("sha256").update(inventoryResource()).digest("hex"), inventoryResourceHash);
  const source = readFileSync(join(projectRoot, "reference/inventory/evidence/scripts/scripts/armyII/ArmyFrameII.as"), "utf8");
  assert.match(source, /new EquipBagII\(7,8,6\)/);
  assert.match(source, /new StoreBag\(7,8,6\)/);
  const encrypted = readFileSync(join(projectRoot, "reference/inventory/evidence/5_13cbe084.png"));
  assert.deepEqual(inventoryResource(), Buffer.concat([Buffer.from("CWS"), encrypted.subarray(-121), encrypted.subarray(21, -121)]));
  const xml = '<root><Item name="5.png" md5="13cbe084" size="690743" /><Item name="13.png" md5="abcdef12" size="10" /></root>';
  const compressed = deflateSync(deflateSync(Buffer.from(xml)));
  const next = inflateSync(inflateSync(inventoryResourceIndex("/client/code_md5.dat", compressed))).toString();
  assert.ok(next.includes('md5="3edbbd2d"'));
  assert.ok(next.includes('<Item name="13.png" md5="abcdef12" size="10" />'));
});

async function setup() {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const dir = mkdtempSync(join(projectRoot, ".test-data", "storage-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  await store.createUser("storage_test", "test-password-123", 1959);
  store.initTutorialProfile(1959);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='Local',sex=0,process=25000 WHERE user_id=1959").run();
  let time = now, city = new CityWorld(store, 1959, () => time);
  city.state.items = {};
  city.state.player.bag_count = 0;
  city.state.player.point = 10000;
  city.state.player.gift_token = 10000;
  city.persist();
  const send = (op: number, r: any) => city.handle(frame(op, 1959, encodeMessage(city.scenario.outgoing[op]!, r)));
  const msg = (responses: any[], op: number) => {
    const p = responses.find(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === op);
    assert.ok(p, `missing opcode ${op}`);
    return decodeMessage(city.scenario.incoming[op]!, Buffer.from(p.frame, "base64").subarray(20));
  };
  return { store, send, msg, get city() { return city; }, advance: (ms: number) => time += ms,
    reload: () => city = new CityWorld(store, 1959, () => time),
    close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test("protocol expansion/rental costs central ledger, persists, renews after remaining time", async () => {
  const s = await setup();
  try {
    for (const property1 of [1, 1, 8, 8, 8]) s.send(5010, { pay_type: 0, property1 });
    assert.equal(s.city.state.player.bag_count, 182);
    assert.equal(s.city.state.player.gift_token, 8925);
    const r = s.msg(s.send(8819, { op_type: 1, param1: 0, param2: "30" }), 4709);
    assert.equal(r.status, 2);
    assert.deepEqual(r.$4, { wire: 0, value: "0" });
    const first = s.city.state.player.rentalBagTime;
    s.advance(86400000);
    s.send(8819, { op_type: 1, param1: 1, param2: "180" });
    assert.equal(s.city.state.player.point, 8200);
    assert.equal(Date.parse(s.city.state.player.rentalBagTime.replace(" ", "T") + "Z") - Date.parse(first.replace(" ", "T") + "Z"), 180 * 86400000);
    s.reload();
    assert.equal(s.city.state.player.bag_count, 182);
    assert.equal(s.city.state.player.status, 2);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM currency_transactions WHERE reason LIKE 'inventory-%'").get()!.n, 7);
  } finally { s.close(); }
});
test("insufficient funds rolls back expansion and ledger, bound option splits debit", async () => {
  const s = await setup();
  try {
    s.city.state.player.point = 0; s.city.state.player.gift_token = 3;
    const r = s.send(5010, { pay_type: 0, property1: 1 });
    assert.ok(r.some(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === 83));
    assert.equal(s.city.state.player.bag_count, 0);
    assert.equal(s.city.state.player.gift_token, 3);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM currency_transactions WHERE reason='inventory-expand'").get()!.n, 0);
    s.city.state.player.point = 2;
    s.send(5010, { pay_type: 0, property1: 1 });
    assert.equal(s.city.state.player.gift_token, 0); assert.equal(s.city.state.player.point, 0);
    assert.equal(s.city.state.player.bag_count, 7);
  } finally { s.close(); }
});
test("storage movements and organization produce slot deltas, persist and preserve attributes/fashion", async () => {
  const s = await setup();
  try {
    s.city.state.items = { "1:0:0": stone(0, 9999, 10, 1), "1:0:1": stone(1, 100, 11) };
    const attributes = structuredClone(s.city.saved.attributes), fashion = structuredClone(s.city.saved.fashion);
    assert.equal(s.msg(s.send(5005, move(1, 0)), 115).moved.length, 2);
    s.send(8220, { bagType: 1, isStackItem: 1, arrangeInfo: [{ oldplace: 1, newplace: 0 }, { oldplace: 0, newplace: 1 }] });
    s.reload();
    assert.equal(s.city.state.items["1:0:0"].id, 10);
    assert.equal(s.city.state.items["1:0:1"].id, 11);
    assert.deepEqual(s.city.saved.attributes, attributes);
    assert.deepEqual(s.city.saved.fashion, fashion);
  } finally { s.close(); }
});
test("treasure purchase exposes field125, persists and restricts eligible templates", async () => {
  const s = await setup();
  try {
    const r = s.send(9569, { pay_type: 0 });
    assert.deepEqual(s.msg(r, 3).$125, { wire: 0, value: "245" });
    assert.ok(r.some(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === 276));
    assert.equal(s.city.state.player.gift_token, 9000);
    s.send(9569, { pay_type: 0 }); assert.equal(s.city.state.player.gift_token, 9000);
    // Fashion souls do not belong in the treasure bag.
    s.city.state.items["1:0:0"] = stone(0, 20);
    s.send(5005, move(0, 0, 0, 1, 34));
    assert.ok(s.city.state.items["1:0:0"]);
    s.reload(); assert.equal(s.city.state.player.$125.value, "245");
  } finally { s.close(); }
});
test("protected items cannot be sold; password is hashed, never logged and requires confirmation after relog", async () => {
  const s = await setup();
  try {
    s.city.state.items["1:0:0"] = stone(0, 20);
    s.send(8806, { op_type: 2, input_pass: "284619", new_pass: "284619" });
    assert.notEqual(s.city.saved.storageProtection!.hash, "284619");
    s.send(8809, { op_type: 1, item_pos: 0 });
    assert.equal(s.city.state.items["1:0:0"].is_locked, 1);
    s.send(5007, { begin_bag_type: 1, begin_obj_id: 0, begin_pos: 0 });
    assert.equal(s.city.state.items["1:0:0"].count, 20);
    s.reload(); s.send(8809, { op_type: 1, item_pos: 0 });
    assert.equal(s.city.state.items["1:0:0"].is_locked, 1);
    assert.equal(s.msg(s.send(8806, { op_type: 1, input_pass: "284619" }), 4696).result, 1);
    s.send(8809, { op_type: 1, item_pos: 0 });
    assert.equal(s.city.state.items["1:0:0"].is_locked, 0);
    const events = s.store.db.prepare("SELECT detail FROM tutorial_events WHERE kind='city-request'").all();
    assert.ok(!JSON.stringify(events).includes("284619"));
  } finally { s.close(); }
});
test("expiration request cannot delete permanent items but removes genuinely expired stacks", async () => {
  const s = await setup();
  try {
    s.city.state.items["1:0:0"] = stone(0, 20);
    s.send(8346, { bag_type: 1, pos: 0 }); assert.ok(s.city.state.items["1:0:0"]);
    Object.assign(s.city.state.items["1:0:0"], { valid_date: 10, begin_date: serverDate(now - 600000) });
    assert.ok(s.msg(s.send(8346, { bag_type: 1, pos: 0 }), 115).moved.some((i: any) => !i.item && i.change_pos === 0));
    assert.equal(s.city.state.items["1:0:0"], undefined);
  } finally { s.close(); }
});
test("manual treasure transfers swap compatible locations; selling pays central gold and reconnect preserves slots", async () => {
  const s = await setup();
  try {
    s.send(9569, { pay_type: 0 });
    s.city.state.items["1:0:0"] = { ...stone(0, 10), template_id: 2050101 };
    s.send(5005, move(0, 244, 4, 1, 34));
    assert.equal(s.city.state.items["1:0:0"].count, 6);
    assert.equal(s.city.state.items["34:0:244"].count, 4);
    const id = s.city.state.items["34:0:244"].id;
    s.send(5005, move(244, 245, 0, 34, 34));
    assert.equal(s.city.state.items["34:0:244"].id, id);
    assert.equal(s.city.state.items["34:0:245"], undefined);
    const gold = s.city.state.economy.gold_total_count;
    const result = s.send(5007, { begin_bag_type: 34, begin_obj_id: 0, begin_pos: 244 });
    assert.equal(s.msg(result, 109).gold_total_count, gold + 2000);
    assert.equal(s.city.state.items["34:0:244"], undefined);
    assert.equal(s.store.db.prepare("SELECT delta FROM currency_transactions WHERE reason='inventory-sale'").get()!.delta, 2000);
    s.reload(); assert.equal(s.city.state.items["1:0:0"].count, 6);
  } finally { s.close(); }
});
test("save failure rolls back swapped locations, split IDs, expansion and ledger", async () => {
  const s = await setup();
  try {
    s.city.state.items = { "1:0:0": stone(0, 10), "1:0:1": stone(1, 8, 12, 1) };
    s.city.persist();
    const before = structuredClone(s.city.saved), persist = s.city.persist;
    s.city.persist = () => { throw new Error("forced storage save failure"); };
    assert.throws(() => s.send(5005, move(0, 1)), /forced storage save failure/);
    assert.deepEqual(s.city.saved, before);
    assert.throws(() => s.send(5005, move(0, 2, 3)), /forced storage save failure/);
    assert.deepEqual(s.city.saved, before);
    assert.throws(() => s.send(5010, { pay_type: 0, property1: 1 }), /forced storage save failure/);
    assert.deepEqual(s.city.saved, before);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM currency_transactions WHERE reason='inventory-expand'").get()!.n, 0);
    s.city.persist = persist;
    s.reload(); assert.deepEqual(s.city.state.items, before.state.items);
  } finally { s.close(); }
});
test("organize rejection clears phantom destination slots instead of leaving duplicates in the client", async () => {
  const s = await setup();
  try {
    s.city.state.items = { "1:0:0": stone(0), "1:0:1": stone(1, 2) };
    const result = s.send(8220, { bagType: 1, isStackItem: 1, arrangeInfo: [{ oldplace: 0, newplace: 2 }] });
    const deltas = s.msg(result, 115).moved;
    assert.ok(deltas.some((i: any) => i.change_pos === 2 && !i.item));
    assert.deepEqual(Object.keys(s.city.state.items), ["1:0:0", "1:0:1"]);
  } finally { s.close(); }
});
test("newly received materials enter treasure storage; protected piles stay out of automatic costs", async () => {
  const s = await setup();
  try {
    s.send(9569, { pay_type: 0 });
    s.city.state.items = { "1:0:0": { ...stone(0, 3), template_id: 2050101 }, "34:0:0": { ...stone(0, 9998, 11, 0, 34), template_id: 2050101 } };
    // Exercise the same storage adapter used by mail, campaign, shop and labyrinth rewards.
    const inv = (s.city as any).inventory(s.city.state) as Inventory;
    inv.add({ ...stone(-1), template_id: 2050101, is_new: 1 }, 5);
    assert.equal(s.city.state.items["34:0:0"].count, 9999);
    assert.equal(s.city.state.items["34:0:1"].count, 4);
    s.city.state.items["34:0:0"].is_locked = 1;
    inv.consumeTemplate(2050101, 5);
    assert.equal(s.city.state.items["1:0:0"], undefined);
    assert.equal(s.city.state.items["34:0:1"].count, 2);
    assert.equal(s.city.state.items["34:0:0"].count, 9999);
    const before = structuredClone(s.city.state.items);
    assert.throws(() => inv.consumeTemplate(2050101, 3));
    assert.deepEqual(s.city.state.items, before);
  } finally { s.close(); }
});
test("formation manifest updates module 5 without changing other modules", () => {
  const other='<Item name="14.png" md5="unchanged" size="123"/>';
  const text=`<root><Item name="5.png" md5="old" size="1"/>${other}</root>`;
  const result=formationResourceIndex("/client/code_md5.dat",deflateSync(deflateSync(Buffer.from(text))));
  const decoded=inflateSync(inflateSync(result)).toString();
  assert.ok(decoded.includes(`md5="${formationResourceMd5}"`));
  assert.ok(decoded.includes(other));
  assert.equal(formationResourceIndex("/other.xml",Buffer.from(text)).toString(),text);
});

test("HTTP serves matching inventory UI offline for canonical and versioned URLs without contacting upstream", async () => {
  const s = await setup();
  let app: ReturnType<typeof buildHttp> | undefined;
  try {
    mkdirSync(join(s.store.dir, "tutorial"));
    copyFileSync(join(projectRoot, "data/tutorial/scenario.json"), join(s.store.dir, "tutorial/scenario.json"));
    const config = { ...loadConfig(), dataDir: s.store.dir, mode: "tutorial" as const, resourceMode: "offline" as const, capturePackets: false };
    const auth = new ReplayAuth(s.store), game = new GameServer(config, s.store, auth);
    app = buildHttp(config, s.store, auth, game);
    for (const url of ["/cdn/5.png", "/cdn/5_13cbe084.png", "/cdn/5_3edbbd2d.png", `/cdn/5_${formationResourceMd5}.png`]) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(createHash("sha256").update(response.rawPayload).digest("hex"), formationResourceHash);
    }
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM assets").get()!.n, 0);
    await app.close(); app = undefined;
  } finally { await app?.close(); s.close(); }
});
