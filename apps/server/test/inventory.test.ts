import { test } from "node:test";
import assert from "node:assert/strict";
import { Inventory, sellPrice } from "../src/inventory.js";
import type { Message } from "../src/messages.js";
const stone = (pos = 0, count = 1, id = 1): Message => ({
  id,
  template_id: 2129006,
  bag_type: 1,
  object_id: 0,
  pos,
  count,
  exist: 1,
  bind: 0,
  used: 0,
});
test("custo automático consome 3 e mais 2 do próximo slot, mesmo com ordem de inserção inversa", () => {
  const items: Record<string, Message> = {
    "1:0:20": { ...stone(20, 9931, 3), template_id: 208020 },
    "1:0:8": { ...stone(8, 9984, 2), template_id: 208020 },
    "1:0:7": { ...stone(7, 3, 1), template_id: 208020 },
    "0:0:0": { ...stone(0, 10, 4), bag_type: 0, template_id: 208020 },
  };
  const inventory = new Inventory(items, { nextId: 5 }, 42);
  const consumed = inventory.consumeTemplate(208020, 5);
  assert.deepEqual(
    consumed.map((i) => [i.pos, i.count]),
    [
      [7, 3],
      [8, 2],
    ],
  );
  assert.equal(items["1:0:7"], undefined);
  assert.equal(items["1:0:8"]!.count, 9982);
  assert.equal(items["1:0:20"]!.count, 9931);
  assert.equal(items["0:0:0"]!.count, 10);
  const before = structuredClone(items);
  assert.throws(() => inventory.consumeTemplate(208020, 30000), /insuficiente/);
  assert.deepEqual(items, before);
});

test("inventário adiciona em pilhas compatíveis e respeita o limite recuperado", () => {
  const items: Record<string, Message> = { "1:0:0": stone(0, 9998) };
  const inv = new Inventory(items, { nextId: 2 }, 3);
  inv.add(stone(0, 1), 3);
  assert.equal(items["1:0:0"]!.count, 9999);
  assert.equal(items["1:0:1"]!.count, 2);
  assert.notEqual(items["1:0:1"]!.id, items["1:0:0"]!.id);
  inv.add({ ...stone(2), bind: 1 }, 1);
  assert.equal(items["1:0:2"]!.bind, 1);
  assert.equal(items["1:0:1"]!.count, 2);
});
test("mochila cheia recusa aquisição sem alterar itens nem sobrescrever slots", () => {
  const items = { "1:0:0": stone(0, 9999) };
  const inv = new Inventory(items, { nextId: 2 }, 1),
    before = structuredClone(items);
  assert.throws(() => inv.add(stone(), 1), /espaço/);
  assert.deepEqual(items, before);
  assert.throws(
    () => inv.add({ ...stone(), template_id: 99999999 }, 1),
    /desconhecido/,
  );
});
test("devolução de equipamento não empilhável usa o próximo espaço sem substituir o ocupante", () => {
  const equipment = { ...stone(0, 1, 20), template_id: 1011003, bag_type: 0 };
  const items: Record<string, Message> = {
    "0:0:0": equipment,
    "1:0:0": { ...equipment, bag_type: 1, id: 21 },
  };
  new Inventory(items, { nextId: 22 }, 3).move({
    begin_bag_type: 0,
    begin_obj_id: 0,
    begin_pos: 0,
    end_bag_type: 1,
    end_obj_id: 0,
    end_pos: 0,
    count: 1,
  });
  assert.equal(items["1:0:0"]!.id, 21);
  assert.equal(items["1:0:1"]!.id, 20);
  assert.equal(items["0:0:0"], undefined);
});
test("movimento completa a pilha e cria outra; falta de espaço desfaz toda a operação", () => {
  const source = { ...stone(0, 3, 20), bag_type: 0 };
  const items: Record<string, Message> = {
    "0:0:0": source,
    "1:0:0": stone(0, 9998, 21),
  };
  const inv = new Inventory(items, { nextId: 22 }, 2);
  inv.move({
    begin_bag_type: 0,
    begin_obj_id: 0,
    begin_pos: 0,
    end_bag_type: 1,
    end_obj_id: 0,
    end_pos: 0,
    count: 3,
  });
  assert.equal(items["1:0:0"]!.count, 9999);
  assert.equal(items["1:0:1"]!.count, 2);
  assert.equal(items["0:0:0"], undefined);
  items["0:0:0"] = { ...source, count: 9999 };
  const before = structuredClone(items);
  assert.throws(
    () =>
      inv.move({
        begin_bag_type: 0,
        begin_obj_id: 0,
        begin_pos: 0,
        end_bag_type: 1,
        end_obj_id: 0,
        end_pos: 0,
        count: 9999,
      }),
    /espaço/,
  );
  assert.deepEqual(items, before);
});
test("dividir cria identidade própria, mover preserva identidade e juntar conserva quantidade", () => {
  const items: Record<string, Message> = { "1:0:0": stone(0, 10) };
  const inv = new Inventory(items, { nextId: 2 }, 3);
  inv.move({
    begin_bag_type: 1,
    begin_obj_id: 0,
    begin_pos: 0,
    end_bag_type: 1,
    end_obj_id: 0,
    end_pos: 1,
    count: 3,
  });
  assert.equal(items["1:0:0"]!.count, 7);
  const splitId = items["1:0:1"]!.id;
  assert.notEqual(splitId, 1);
  inv.move({
    begin_bag_type: 1,
    begin_obj_id: 0,
    begin_pos: 1,
    end_bag_type: 1,
    end_obj_id: 0,
    end_pos: 2,
    count: 0,
  });
  assert.equal(items["1:0:2"]!.id, splitId);
  inv.move({
    begin_bag_type: 1,
    begin_obj_id: 0,
    begin_pos: 2,
    end_bag_type: 1,
    end_obj_id: 0,
    end_pos: 0,
    count: 0,
  });
  assert.deepEqual(Object.keys(items), ["1:0:0"]);
  assert.equal(items["1:0:0"]!.count, 10);
  assert.equal(items["1:0:0"]!.id, 1);
  inv.consume("1:0:0", 10);
  assert.deepEqual(items, {});
  assert.throws(() => inv.consume("1:0:0", 1), /insuficiente/);
});
test("preços usam SellGold e a fórmula recuperada de fortalecimento, com proteção de gemas", () => {
  assert.equal(sellPrice(stone()), 8000);
  assert.equal(
    sellPrice({ ...stone(), template_id: 1011003, strengthen_grade: 0 }),
    300,
  );
  assert.equal(
    sellPrice({ ...stone(), template_id: 1011003, strengthen_grade: 1 }),
    671,
  );
  assert.throws(() => sellPrice({ ...stone(), join_1: 101 }), /gemas/);
  assert.throws(
    () => sellPrice({ ...stone(), strengthen_grade: 100 }),
    /inválido/,
  );
});
test("migração de IDs duplicados preserva localização, propriedades e quantidades", () => {
  const items = { "1:0:0": stone(0, 39, 123), "1:0:8": stone(8, 1, 123) };
  const ids = { nextId: 1 },
    inv = new Inventory(items, ids);
  inv.normalizeIds();
  assert.equal(items["1:0:0"].id, 123);
  assert.notEqual(items["1:0:8"].id, 123);
  assert.equal(items["1:0:0"].count + items["1:0:8"].count, 40);
  const snapshot = structuredClone(items);
  new Inventory(items, ids).normalizeIds();
  assert.deepEqual(items, snapshot);
});
