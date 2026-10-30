import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame } from "../src/protocol.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import type { Message } from "../src/messages.js";
import { runeOffers } from "../src/features/runes/shop.js";
import { storageCapacity } from "../src/features/inventory/storage.js";

async function fixture(run: (city: CityWorld, store: Store) => void) {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "rune-shop-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  try {
    await store.createUser("rune_shop", "fixture-password", 1993); store.initTutorialProfile(1993);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='Rune Shop',process=25000 WHERE user_id=1993").run();
    const city = new CityWorld(store, 1993); delete city.saved.battle;
    city.state.player.grades = 80; city.state.player.point = 100000; city.state.player.gift_token = 100000; city.persist();
    run(city, store);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
}
function send(city: CityWorld, opcode: number, request: Message) {
  return city.handle(frame(opcode, 1993, encodeMessage(city.scenario.outgoing[opcode]!, request))).map(p => {
    const bytes = Buffer.from(p.frame, "base64"), op = bytes.readUInt16BE(6);
    return { opcode: op, message: city.scenario.incoming[op] ? decodeMessage(city.scenario.incoming[op]!, bytes.subarray(20)) : {} };
  });
}
const count = (city: CityWorld, id: number) => Object.values(city.state.items).filter(i => i.template_id === id).reduce((n, i) => n + Number(i.count), 0);
test("compra rápida: dez famílias e duas pedras, preços da oferta, mochila antes do callback e aprender", () => fixture((city, store) => {
  const offers = runeOffers.filter(r => Number(r.Id) >= 400 && Number(r.Id) <= 411);
  assert.equal(offers.length, 12);
  for (const offer of offers) {
    const before = count(city, Number(offer.ItemId)), coins = city.state.player.gift_token;
    const packets = send(city, 8970, { receiveUserId: 1993, carItemInfo: [{ shopId: Number(offer.Id), counts: 2, payType: 2 }] });
    assert.equal(count(city, Number(offer.ItemId)), before + 2);
    assert.equal(city.state.player.gift_token, coins - 2 * Number(offer.GiftToken));
    assert.equal(packets.find(p => p.opcode === 4783)!.message.result, 1);
    assert.equal(packets.find(p => p.opcode === 90)!.message.buyInfo.result, 1);
    assert.ok(packets.findIndex(p => p.opcode === 115) < packets.findIndex(p => p.opcode === 90));
  }
  const item = Object.values(city.state.items).find(i => i.template_id === 3020001)!;
  send(city, 8605, { user_id: 1993, opType: 1, runeId: 101, learn_runePos: item.pos });
  assert.equal(city.saved.runes!.learned[1]!.id, 101);
  assert.equal(new CityWorld(store, 1993).saved.runes!.learned[1]!.id, 101);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM currency_transactions WHERE reason LIKE 'runes:shop:%' AND delta<0").get()!.n, 12);
}));
test("compra: diamantes, preferência por vinculados com complemento, validação e rollback integral", () => fixture((city, store) => {
  city.state.player.gift_token = 3; city.persist();
  const start = city.state.player.point;
  send(city, 8970, { receiveUserId: 1993, carItemInfo: [{ shopId: 410, counts: 2, payType: 2 }] });
  assert.equal(city.state.player.gift_token, 0); assert.equal(city.state.player.point, start - 7);
  send(city, 5154, { buyInfo: { good_id: 400, count: 1, receive_id: 1993 }, pay_type: 1 });
  assert.equal(city.state.player.point, start - 17);
  const before = JSON.stringify(city.state), tx = store.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n;
  for (const request of [
    { receiveUserId: 1994, carItemInfo: [{ shopId: 410, counts: 1, payType: 2 }] },
    { carItemInfo: [{ shopId: 410, counts: 1, payType: 2 }, { shopId: 9999999, counts: 1, payType: 2 }] },
    { carItemInfo: [{ shopId: 410, counts: -1, payType: 2 }] },
    { carItemInfo: [{ shopId: 410, counts: 9999, payType: 0 }] },
    { carItemInfo: [{ shopId: 410, counts: 1, payType: 2, isDiscountShop: true }] },
    { discountTempId: 1, carItemInfo: [{ shopId: 410, counts: 1, payType: 2 }] },
    { carItemInfo: [{ shopId: 407, counts: 9999, payType: 1 }] },
  ]) {
    const packets = send(city, 8970, request); assert.equal(packets.find(p => p.opcode === 90)!.message.buyInfo.result, 0);
    assert.equal(JSON.stringify(city.state), before); assert.equal(store.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n, tx);
  }
  store.db.exec("CREATE TRIGGER fail_rune_shop BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(FAIL,'rune shop save failed'); END");
  assert.throws(() => send(city, 8970, { carItemInfo: [{ shopId: 410, counts: 1, payType: 1 }] }), /rune shop save failed/);
  assert.equal(JSON.stringify(city.state), before); assert.equal(store.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n, tx);
}));
test("mochila cheia recusa a compra e reverte o débito no ledger", () => fixture((city, store) => {
  city.state.items = {};
  for (let pos = 0; pos < storageCapacity(city.state.player, 1, Date.now()); pos++) city.state.items[`1:0:${pos}`] = {
    id: 990000 + pos, template_id: 3020013, bag_type: 1, object_id: 0, pos, count: 9999, bind: 1, exist: 1,
  };
  city.persist(); const coins = city.state.player.gift_token, before = JSON.stringify(city.state.items);
  const tx = store.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n;
  const packets = send(city, 8970, { carItemInfo: [{ shopId: 400, counts: 1, payType: 2 }] });
  assert.equal(packets.find(p => p.opcode === 90)!.message.buyInfo.result, 0);
  assert.equal(city.state.player.gift_token, coins); assert.equal(JSON.stringify(city.state.items), before);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n, tx);
}));
