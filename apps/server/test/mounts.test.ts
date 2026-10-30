import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { emptyCity } from "../src/city-state.js";
import { Inventory, itemTemplate } from "../src/inventory.js";
import { GOLD_SCHEMA } from "../src/gold.js";
import { CurrencyLedger, CURRENCY_SCHEMA, currencyBalance, setCurrencyBalance } from "../src/features/currencies/index.js";
import { MountFeature, initialMounts, type MountSave } from "../src/features/mounts/index.js";
import { mounts, cards, trainingRows, primaries, starShop } from "../src/features/mounts/content.js";
import { calculateAttributes, type AttributeState } from "../src/attributes.js";
import { protoInt, fields } from "../src/protocol.js";
import { kingAttribute } from "../src/features/mounts/kings.js";
import { kingsPacket } from "../src/features/mounts/protocol.js";
import { decodeMessage, typeName } from "../src/messages.js";
import { mountUiIndex, mountUiResource } from "../src/features/mounts/ui-resource.js";
import { deflateSync, inflateSync } from "node:zlib";

function setup(roll = () => 0.5) {
  const db = new DatabaseSync(":memory:"); db.exec(GOLD_SCHEMA + CURRENCY_SCHEMA);
  const state = emptyCity(); state.player = { grades: 80, point: 1000000, gift_token: 1000000 }; state.hero = { tempate_id: 3 };
  const saved: { mounts?: MountSave; attributes: AttributeState } = { mounts: initialMounts(), attributes: { version: 1, sources: {} } };
  const ledger = new CurrencyLedger(db); const ids = { nextId: 1 }; let now = 1900000000000;
  const inventory = () => new Inventory(state.items, ids, 1000, { materialBags: () => [1, 34], usable: item => !item.is_locked });
  const feature = new MountFeature({ state, saved, ledger, userId: 1901, now: () => now, inventory, persist: () => {}, atomic(action) {
    const before = structuredClone({ state, saved }); db.exec("SAVEPOINT mount_test");
    try { const result = action(); db.exec("RELEASE mount_test"); return result; }
    catch (error) { db.exec("ROLLBACK TO mount_test; RELEASE mount_test"); Object.keys(state).forEach(key => delete (state as any)[key]); Object.assign(state, before.state); Object.keys(saved).forEach(key => delete (saved as any)[key]); Object.assign(saved, before.saved); throw error; }
  } }, roll);
  feature.synchronize();
  function add(template: number, count: number, bag = 1, pos = 0) { state.items[`${bag}:0:${pos}`] = { id: ids.nextId++, template_id: template, count, bag_type: bag, object_id: 0, pos, exist: 1 }; }
  const request = (op: number, property = 0, count = 0, pay = 0, other = 0) => feature.handle(8529, Buffer.concat([protoInt(1, property), protoInt(2, pay), protoInt(3, count), protoInt(4, other), protoInt(5, op)]));
  return { feature, state, saved, db, add, inventory, request, advance: (ms: number) => now += ms };
}

test("sorteio de bênção acontece por pedra e consumo atravessa pilhas/bolsa de tesouros", () => {
  let draws = 0; const s = setup(() => [0.10, 0.09, 0.50][draws++]!);
  try { s.add(208017, 1); s.add(208017, 10, 34); s.request(1, 2, 3);
    assert.equal(draws, 3); assert.equal(s.feature.save.xp.intellect, 70);
    assert.equal(s.state.items["1:0:0"], undefined); assert.equal(s.state.items["34:0:0"]!.count, 8);
    assert.equal(currencyBalance(s.state, "diamonds"), 1000000);
    assert.equal(s.feature.growthXP, 70);
  } finally { s.db.close(); }
});
test("limite consome só uma pedra e preserva restante; nenhum pagamento no máximo", () => {
  const s = setup(); try {
    s.feature.save.xp.power = Number(trainingRows[19]!.Data) - 5; s.add(208017, 10);
    s.request(1, 0, 9999); assert.equal(s.state.items["1:0:0"]!.count, 9);
    assert.equal(s.feature.save.xp.power, Number(trainingRows[19]!.Data));
    assert.throws(() => s.request(1, 0, 10), /limite/); assert.equal(s.state.items["1:0:0"]!.count, 9);
    for (const row of mounts.values()) if (Number(row.MountType) === 1) s.feature.save.owned[row.TemplateId] = { id: Number(row.TemplateId), activatedAt: 0, expiresAt: null, stars: 0, blessing: 0, flightUnlocked: false };
    assert.equal(s.feature.limit, 2500);
  } finally { s.db.close(); }
});
test("pagamento combina pedras e moedas e falha com rollback de XP, itens e histórico", () => {
  const s = setup(); try {
    s.add(208017, 1); s.state.player.point = 4; s.state.player.gift_token = 6;
    s.request(1, 0, 3); assert.equal(s.state.player.point, 0); assert.equal(s.state.player.gift_token, 0);
    const xp = s.feature.growthXP, ledger = s.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n;
    assert.throws(() => s.request(1, 0, 3), /insuficientes/);
    assert.equal(s.feature.growthXP, xp); assert.equal(s.db.prepare("SELECT COUNT(*) n FROM currency_transactions").get()!.n, ledger);
  } finally { s.db.close(); }
});
test("refino espiritual respeita nível 80, tabela 146 e usa só 698 itens no último grau", () => {
  const s = setup(); try {
    s.add(208070, 999); s.state.player.grades = 79; assert.throws(() => s.request(12, 0, 24), /80/);
    s.state.player.grades = 80; s.request(12, 0, 24);
    assert.deepEqual(s.feature.save.soul.grades, { power: 1, intellect: 1, physique: 0, agility: 0 }); assert.equal(s.feature.save.soul.xp, 4);
    s.feature.save.soul = { grades: { power: 80, intellect: 80, physique: 80, agility: 79 }, xp: 102 };
    s.request(12, 0, 999); assert.equal(s.state.items["1:0:0"]!.count, 277);
    assert.deepEqual(Object.values(s.feature.save.soul.grades), [80, 80, 80, 80]); assert.equal(s.feature.save.soul.xp, 0);
    assert.throws(() => s.request(12, 0, 1), /máximo/);
  } finally { s.db.close(); }
});

test("refino atualiza os quatro primários e derivados, envia XP/graus e baixa pilhas imediatamente", () => {
  const s = setup(); try {
    s.add(208070, 3); s.add(208070, 999, 1, 1);
    const before = structuredClone(s.state.hero);
    const packets = s.request(12, 0, 40)!;
    assert.equal(s.state.items["1:0:0"], undefined);
    assert.equal(s.state.items["1:0:1"]!.count, 962);
    assert.deepEqual(s.feature.save.soul.grades, { power: 1, intellect: 1, physique: 1, agility: 1 });
    for (const name of primaries) assert.equal(s.state.hero["total_" + name] - before["total_" + name], 1);
    assert.equal(s.state.hero.total_phy_attack - before.total_phy_attack, 4);
    assert.equal(s.state.hero.total_magic_attack - before.total_magic_attack, 4);
    assert.equal(s.state.hero.total_phy_defence - before.total_phy_defence, 5);
    assert.equal(s.state.hero.total_magic_defence - before.total_magic_defence, 5);
    assert.equal(s.state.hero.total_live - before.total_live, 20);
    const moved = packets.find(packet => packet.opcode === 115)!.message!.moved;
    assert.ok(moved.some((row: any) => row.change_pos === 0 && !row.item));
    const final = structuredClone(s.state.hero);
    s.feature.synchronize(); assert.deepEqual(s.state.hero, final);
  } finally { s.db.close(); }
});
test("cartão temporário renova; permanente promove e repetição credita essência via ledger", () => {
  const s = setup(); try {
    const temporary = [...cards.values()].find(card => Number(card.Property2) > 0)!;
    const permanent = [...cards.values()].find(p => p.Property2 === "-1" && p.Refresh !== "-1" && Number(mounts.get(Number(p.Property1))?.Power) > 0)!;
    s.add(Number(temporary.TemplateId), 2); s.feature.useCard({ bag_type: 1, pos: 0, count: 1 }); const first = s.feature.save.owned[temporary.Property1]!.expiresAt!;
    s.feature.useCard({ bag_type: 1, pos: 0, count: 1 }); assert.equal(s.feature.save.owned[temporary.Property1]!.expiresAt, first + Number(temporary.Property2) * 86400000);
    // The current two temporary cards have no permanent counterpart in this
    // table. Seed an acquired temporary variant to test the generic promotion.
    s.feature.save.owned[permanent.Property1] = { ...s.feature.save.owned[temporary.Property1]!, id: Number(permanent.Property1) };
    s.add(Number(permanent.TemplateId), 1); s.feature.useCard({ bag_type: 1, pos: 0, count: 1 }); assert.equal(s.feature.save.owned[permanent.Property1]!.expiresAt, null);
    s.add(Number(permanent.TemplateId), 1); s.feature.useCard({ bag_type: 1, pos: 0, count: 1 });
    assert.equal(currencyBalance(s.state, "mountEssence"), Number(mounts.get(Number(permanent.Property1))!.Power) * 4);
    assert.equal(s.db.prepare("SELECT COUNT(*) n FROM currency_transactions WHERE currency='mountEssence'").get()!.n, 1);
  } finally { s.db.close(); }
});

test("cartas de Mamute e Leopardo ativam destinos próprios; três montarias custam um diamante", () => {
  const s = setup(); try {
    assert.equal(itemTemplate(2180061)!.TemplateName, "Carta do Mamute");
    assert.equal(Number(cards.get(2180061)!.Property1), 7005);
    assert.equal(Number(cards.get(2180161)!.Property1), 1147);
    s.add(2180061, 1); s.feature.useCard({ bag_type: 1, pos: 0, count: 1 });
    assert.ok(s.feature.save.owned[7005]); assert.equal(s.feature.save.owned[1147], undefined);
    s.add(2180161, 1); s.feature.useCard({ bag_type: 1, pos: 0, count: 1 });
    assert.ok(s.feature.save.owned[1147]);
    s.add(2180050, 1); s.add(2180052, 1, 1, 1);
    const before = currencyBalance(s.state, "diamonds");
    for (const id of [1118, 6002, 6004]) {
      s.request(4, 0, id, 1); assert.ok(s.feature.save.owned[id]);
      assert.equal(s.feature.save.owned[id]!.expiresAt, null);
      assert.throws(() => s.request(4, 0, id, 1), /já ativada/);
    }
    assert.equal(currencyBalance(s.state, "diamonds"), before - 3);
    assert.equal(s.inventory().countTemplate(2180050), 1, "compra direta não consome carta de Dora");
    assert.equal(s.inventory().countTemplate(2180052), 1, "compra direta não consome carta do Leão do Gelo");
    assert.equal(s.feature.save.owned[1136], undefined); assert.equal(s.feature.save.owned[1138], undefined);
  } finally { s.db.close(); }
});
test("troca conserva atributos e identidade; capacidade aérea acompanha montagem/validade", () => {
  const s = setup(); try {
    const row = [...mounts.values()].find(row => row.MountType === "1" && row.IsFly === "1")!;
    s.feature.save.owned[row.TemplateId] = { id: Number(row.TemplateId), activatedAt: 0, expiresAt: null, stars: 0, blessing: 0, flightUnlocked: false };
    s.feature.synchronize(); const attributes = calculateAttributes(s.saved.attributes);
    s.request(2, 0, Number(row.TemplateId)); s.request(3, 0, 1);
    assert.equal(s.feature.save.mobility.mode, "air-capable"); assert.equal(s.state.army.mount_tempId, Number(row.TemplateId)); assert.equal(s.state.hero.tempate_id, 3);
    assert.deepEqual(calculateAttributes(s.saved.attributes), attributes);
    s.request(3, 0, 0); assert.equal(s.feature.save.mobility.mode, "ground"); assert.deepEqual(calculateAttributes(s.saved.attributes), attributes);
    s.feature.save.owned[row.TemplateId]!.expiresAt = 1900000000000 + 1000; s.request(3, 0, 1); s.advance(1001); s.feature.synchronize();
    assert.equal(s.feature.save.selected, 1000); assert.equal(s.feature.save.mobility.mode, "ground");
  } finally { s.db.close(); }
});
test("fontes de montaria convertem primários e refino não multiplica outras fontes", () => {
  const s = setup(); try {
    s.saved.attributes.sources.other = { kind: "natural", evidence: "local-balance", values: { total_magic_attack: 1000 } };
    for (const name of primaries) s.feature.save.soul.grades[name] = 80;
    s.feature.synchronize(); const values = calculateAttributes(s.saved.attributes);
    assert.equal(s.feature.finalPrimary("power"), 20); assert.equal(values.total_phy_attack, 80); assert.equal(values.total_magic_attack, 1080); assert.equal(values.total_live, 400);
    for (const row of mounts.values()) if (row.MountType === "1") s.feature.save.owned[row.TemplateId] = { id: Number(row.TemplateId), activatedAt: 0, expiresAt: null, stars: 5, blessing: 0, flightUnlocked: false };
    assert.equal(s.feature.finalPrimary("power") - s.feature.rawPrimary("power"), 300000);
  } finally { s.db.close(); }
});
test("lista de rede é paginada sem herdar montarias e sem estourar tamanho de frame", () => {
  const s = setup(); try {
    assert.equal(s.feature.active.length, 1);
    for (const row of mounts.values()) s.feature.save.owned[row.TemplateId] = { id: Number(row.TemplateId), activatedAt: 1900000000000, expiresAt: null, stars: 0, blessing: 0, flightUnlocked: false };
    const pages = s.feature.list(); assert.equal(pages.length, 4);
    let total = 0; const stamps = new Set();
    for (const packet of pages) { const bytes = Buffer.from(packet.body!, "base64"); assert.ok(bytes.length < 65515); const m = decodeMessage(typeName("campaign.MountAvatarMsg"), bytes); total += m.avatarInfo.length; stamps.add(m.$4.value); assert.equal(Number(m.$5.value), 4); }
    assert.equal(total, 733); assert.equal(stamps.size, 1);
  } finally { s.db.close(); }
});
test("loja entrega cartão, cobra essência e protege oferta repetida", () => {
  const s = setup(); try {
    s.request(8); const offer = s.feature.save.shop[0]!; assert.ok(offer);
    setCurrencyBalance(s.state, "mountEssence", offer.price);
    s.request(9, 0, offer.item, 0, 0); assert.equal(currencyBalance(s.state, "mountEssence"), 0);
    assert.ok(Object.values(s.state.items).some(item => item.template_id === offer.item));
    assert.throws(() => s.request(9, 0, offer.item, 0, 0), /indisponível/);
  } finally { s.db.close(); }
});

test("dez cartas repetidas geram essência e compram outra montaria, sem bônus duplicado", () => {
  const s = setup(); try {
    const card = [...cards.values()].find(row => Number(row.Property2) === -1 && Number(row.Refresh) !== -1 && Number(mounts.get(Number(row.Property1))?.Power) >= 100)!;
    s.add(Number(card.TemplateId), 1); s.feature.useCard({ bag_type: 1, pos: 0, count: 1 });
    const attributes = calculateAttributes(s.saved.attributes);
    for (let pos = 0; pos < 10; pos++) {
      s.add(Number(card.TemplateId), 1, 1, pos); s.feature.useCard({ bag_type: 1, pos, count: 1 });
    }
    const essence = Number(mounts.get(Number(card.Property1))!.Power) * 4 * 10;
    assert.equal(currencyBalance(s.state, "mountEssence"), essence);
    assert.deepEqual(calculateAttributes(s.saved.attributes), attributes);
    s.request(8); const index = s.feature.save.shop.findIndex(row => row.price <= essence); assert.ok(index >= 0);
    const offer = s.feature.save.shop[index]!; s.request(9, 0, offer.item, 0, index);
    assert.equal(currencyBalance(s.state, "mountEssence"), essence - offer.price);
    assert.equal(s.inventory().countTemplate(offer.item), 1);
    const transactions = s.db.prepare("SELECT reason FROM currency_transactions WHERE currency='mountEssence'").all();
    assert.equal(transactions.length, 11);
  } finally { s.db.close(); }
});

test("ferradura usa preço recuperado, pilhas, diamantes e limite de estrelas no nível 70", () => {
  const s = setup(() => 0.9); try {
    const offer = starShop[0]!; assert.equal(Number(offer.GiftToken), 10);
    s.state.player.gift_token = 15; s.state.player.point = 20; s.state.player.grades = 69;
    const packets = s.feature.buyStarMaterial(5154, { buyInfo: { good_id: Number(offer.Id), count: 3 }, pay_type: 2 })!;
    assert.ok(packets.some(row => row.opcode === 90));
    assert.equal(currencyBalance(s.state, "boundDiamonds"), 0); assert.equal(currencyBalance(s.state, "diamonds"), 5);
    assert.equal(s.inventory().countTemplate(208035), 3);
    assert.throws(() => s.request(6, 1000), /70/); assert.equal(s.inventory().countTemplate(208035), 3);
    s.state.player.grades = 70; s.request(6, 1000); s.request(6, 1000);
    assert.equal(s.inventory().countTemplate(208035), 2); assert.equal(s.feature.save.owned[1000]!.blessing, 1);
    const before = structuredClone({ items: s.state.items, player: s.state.player });
    assert.throws(() => s.feature.buyStarMaterial(8970, { carItemInfo: [{ shopId: Number(offer.Id), counts: 1, payType: 1 }] }), /insuficiente/);
    assert.deepEqual({ items: s.state.items, player: s.state.player }, before);
    assert.throws(() => s.feature.buyStarMaterial(5154, { buyInfo: { good_id: Number(offer.Id), count: 1, receive_id: 999 } }), /sua conta/);
  } finally { s.db.close(); }
});

test("montaria registra apenas quatro primários; personagem converte e soma às outras fontes", () => {
  const s = setup(); try {
    s.saved.attributes.sources.other = { kind: "natural", evidence: "local-balance", values: { total_phy_attack: 400, total_magic_attack: 500, total_phy_defence: 100, total_magic_defence: 120, total_live: 2000 } };
    const before = calculateAttributes(s.saved.attributes);
    const card = [...cards.values()].find(row => Number(row.Property2) === -1 && Number(row.Refresh) !== -1 && Number(mounts.get(Number(row.Property1))?.Power) > 0)!;
    const definition = mounts.get(Number(card.Property1))!;
    s.add(Number(card.TemplateId), 1); s.feature.useCard({ bag_type: 1, pos: 0, count: 1 });
    assert.deepEqual(Object.keys(s.saved.attributes.sources.mounts!.values).sort(), ["total_agility", "total_intellect", "total_physique", "total_power"]);
    const after = calculateAttributes(s.saved.attributes);
    assert.equal(after.total_power! - before.total_power!, Number(definition.Power));
    assert.equal(after.total_intellect! - before.total_intellect!, Number(definition.Intellect));
    assert.equal(after.total_phy_attack! - before.total_phy_attack!, Number(definition.Power) * 4);
    assert.equal(after.total_magic_attack! - before.total_magic_attack!, Number(definition.Intellect) * 4);
    assert.equal(after.total_phy_defence! - before.total_phy_defence!, Number(definition.Power) + Number(definition.Agility) * 4);
    assert.equal(after.total_magic_defence! - before.total_magic_defence!, Number(definition.Intellect) + Number(definition.Agility) * 4);
    assert.equal(after.total_live! - before.total_live!, Number(definition.Physique) * 20);
  } finally { s.db.close(); }
});

test("expiração em sessão remove aparência e bônus sem apagar propriedade nem mudar classe", () => {
  const s = setup(); try {
    const row = [...mounts.values()].find(row => row.MountType === "1" && Number(row.Power) > 0)!;
    s.feature.save.owned[row.TemplateId] = { id: Number(row.TemplateId), activatedAt: 0, expiresAt: 1900000001000, stars: 0, blessing: 0, flightUnlocked: false };
    s.request(2, 0, Number(row.TemplateId)); s.request(3, 0, 1);
    const before = s.feature.rawPrimary("power"); s.advance(1001);
    const packets = s.feature.tick(); assert.ok(packets.some(p => p.opcode === 113));
    assert.ok(s.feature.rawPrimary("power") < before); assert.equal(s.state.army.mount_tempId, 1000);
    assert.equal(s.state.hero.tempate_id, 3); assert.ok(s.feature.save.owned[row.TemplateId]); assert.deepEqual(s.feature.tick(), []);
  } finally { s.db.close(); }
});
test("primeira estrela é gratuita; posteriores consomem material e respeitam bênção", () => {
  const s = setup(() => 0.9); try {
    const id = 1000; s.request(6, id); assert.equal(s.feature.save.owned[id]!.stars, 1);
    s.add(208035, 3); s.request(6, id); assert.equal(s.feature.save.owned[id]!.blessing, 1); assert.equal(s.state.items["1:0:0"]!.count, 2);
    s.feature.save.owned[id]!.blessing = 100; s.request(6, id); assert.equal(s.feature.save.owned[id]!.stars, 2); assert.equal(s.feature.save.owned[id]!.blessing, 0);
  } finally { s.db.close(); }
});

test("auto-refinar lê param1 do cliente e faz dez tentativas; pay_type não seleciona o lote", () => {
  const s = setup(() => 0.9); try {
    s.request(6, 1000); s.add(208035, 3); s.add(208035, 20, 1, 1);
    s.request(6, 1000, 1, 0);
    assert.equal(s.inventory().countTemplate(208035), 13);
    assert.equal(s.state.items["1:0:0"], undefined);
    s.request(6, 1000, 0, 1);
    assert.equal(s.inventory().countTemplate(208035), 12, "pay_type=1 com param1=0 continua refinação simples");
  } finally { s.db.close(); }
  const max = setup(() => 0); try {
    max.request(6, 1000);
    max.feature.save.owned[1000]!.stars = String(mounts.get(1000)!.StarAddition).split(",").length - 1;
    max.add(208035, 10); max.request(6, 1000, 1, 0);
    assert.equal(max.inventory().countTemplate(208035), 9, "atingir máximo interrompe o lote sem desperdiçar materiais");
    assert.throws(() => max.request(6, 1000, 1, 0), /máximo/);
    assert.equal(max.inventory().countTemplate(208035), 9);
  } finally { max.db.close(); }
});
test("Rei das Feras ganha 50 XP por pedra e preserva excedente no nível 180", () => {
  const s = setup(() => { throw new Error("King XP does not use a random blessing"); }); try {
    const id = 9001; s.feature.save.owned[id] = { id, activatedAt: 0, expiresAt: null, stars: 0, blessing: 0, flightUnlocked: false };
    s.add(208017, 9999); s.request(7, 0, id, 0, 9999);
    assert.deepEqual(s.feature.save.kings[id], { level: 59, xp: 4950 });
    s.feature.save.kings[id] = { level: 179, xp: 9995 }; s.add(208017, 10); s.request(7, 0, id, 0, 10);
    assert.deepEqual(s.feature.save.kings[id], { level: 180, xp: 0 }); assert.equal(s.state.items["1:0:0"]!.count, 9);
    assert.throws(() => s.request(7, 0, id, 0, 1), /máximo/);
  } finally { s.db.close(); }
});

test("Reis reproduzem Adicionar 100% observado e 2000 por primário no nível 180", () => {
  const s = setup(); try {
    const before = structuredClone(s.state.hero);
    for (const id of [9001, 9002, 9003, 9004]) {
      for (const [level, expected] of [[0, 200], [59, 790], [109, 1290], [159, 1790], [180, 2000]])
        for (const name of primaries) assert.equal(kingAttribute(id, name, { level: level!, xp: 0 }), expected);
      s.feature.save.owned[id] = { id, activatedAt: 0, expiresAt: null, stars: 0, blessing: 0, flightUnlocked: false };
      s.feature.save.kings[id] = { level: 180, xp: 0 };
    }
    s.feature.synchronize();
    for (const name of primaries) assert.equal(s.state.hero["total_" + name] - before["total_" + name], 8000);
    assert.equal(s.state.hero.total_phy_attack - before.total_phy_attack, 32000);
    assert.equal(s.state.hero.total_magic_attack - before.total_magic_attack, 32000);
    assert.equal(s.state.hero.total_live - before.total_live, 160000);
    const list = fields(Buffer.from(kingsPacket(s.feature.save.kings).body!, "base64"));
    assert.equal(list.length, 4);
    for (const entry of list) assert.equal(Number(fields(entry.value as Buffer).find(field => field.number === 2)!.value), 100);
    const update = fields(Buffer.from(kingsPacket(s.feature.save.kings, 4974, 9001).body!, "base64"));
    assert.equal(Number(update.find(field => field.number === 2)!.value), 100);
    const after = structuredClone(s.state.hero);
    s.feature.synchronize(); assert.deepEqual(s.state.hero, after, "recalcular não duplica bônus");
    assert.equal(kingAttribute(9001, "power", { level: 180, xp: 0, extraPercent: 0 }), 1000, "percentual próprio explícito não é substituído pelo padrão capturado");
  } finally { s.db.close(); }
});
test("manifesto Flash expõe versões locais e mantém compressão dupla", () => {
  const xml = '<root><Item name="14.png" md5="00000000" size="0"/><Item name="15.png" md5="00000000" size="0"/></root>';
  const changed = mountUiIndex('/client/code_md5.dat', deflateSync(deflateSync(Buffer.from(xml))));
  const text = inflateSync(inflateSync(changed)).toString();
  for (const id of [14, 15]) {
    const row = mountUiResource(`/cdn/${id}.png`)!; assert.ok(text.includes(`md5="${row.md5}"`));
    assert.ok(text.includes(`size="${row.bytes.length}"`)); assert.equal(mountUiResource(`/cdn/${id}_${row.md5}.png`)!.sha256, row.sha256);
    assert.equal(row.bytes.subarray(0, 3).toString(), 'CWS');
  }
  assert.equal(mountUiResource('/cdn/5.png'), undefined);
});
