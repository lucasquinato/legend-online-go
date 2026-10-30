import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { encodeMessage } from "../src/messages.js";
import { frame } from "../src/protocol.js";
import { calculateAttributes } from "../src/attributes.js";

async function setup(icon = 3) {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const dir = mkdtempSync(join(projectRoot, ".test-data/equipment-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  await store.createUser("equipment_test", "test-password-123", 1959);
  store.initTutorialProfile(1959);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,nickname='Local',sex=?,process=25000 WHERE user_id=1959").run(icon, icon > 3 ? 1 : 0);
  let city = new CityWorld(store, 1959, () => 1900000000000);
  city.state.player.grades = 11; delete city.saved.battle; city.persist();
  const move = (from: number, to: number, pos: number, dest: number, overrides = {}) => city.handle(frame(5005, 1959, encodeMessage(city.scenario.outgoing[5005]!, {
    begin_bag_type: from, begin_obj_id: from === 4 ? city.state.hero.hero_id : 0, begin_pos: pos,
    end_bag_type: to, end_obj_id: to === 4 ? city.state.hero.hero_id : 0, end_pos: dest, count: 1, ...overrides,
  })));
  return { store, get city() { return city; }, move, reload: () => city = new CityWorld(store, 1959, () => 1900000000000), close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test("six identities unequip/re-equip real starter items, replace central contributions and persist without accumulation", async () => {
  for (const icon of [1, 2, 3, 4, 5, 6]) {
    const s = await setup(icon);
    try {
      const hero = s.city.state.hero.hero_id, item = structuredClone(s.city.state.items[`4:${hero}:0`]);
      const full = calculateAttributes(s.city.saved.attributes!), before = structuredClone(s.city.saved.attributes!);
      delete before.sources[`equipment:initial:${item.id}`];
      const without = calculateAttributes(before);
      for (let n = 0; n < 3; n++) {
        const result = s.move(4, 1, 0, 30);
        assert.ok(!result.some(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === 83));
        assert.equal(s.city.state.items[`4:${hero}:0`], undefined);
        assert.equal(s.city.state.items["1:0:30"].id, item.id);
        assert.deepEqual(calculateAttributes(s.city.saved.attributes!), without);
        for (const op of [115, 113, 150, 3]) assert.ok(result.some(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === op));
        s.reload(); assert.deepEqual(calculateAttributes(s.city.saved.attributes!), without);
        s.move(1, 4, 30, 0);
        assert.equal(s.city.state.items[`4:${hero}:0`].id, item.id);
        assert.deepEqual(calculateAttributes(s.city.saved.attributes!), full);
        assert.equal(s.city.state.player.fighting_capacity, s.city.state.hero.fighting_capacity);
        assert.equal(s.city.state.army.simple_hero_info.total_magic_attack, s.city.state.hero.total_magic_attack);
      }
    } finally { s.close(); }
  }
});
test("occupied weapon swap works with full backpack and credits only the new equipped affixes", async () => {
  const s = await setup();
  try {
    const hero = s.city.state.hero.hero_id, original = structuredClone(s.city.state.items[`4:${hero}:0`]);
    s.city.state.items = Object.fromEntries([
      ...Object.entries(s.city.state.items).filter(([, i]) => i.bag_type !== 1),
      ...Array.from({ length: 42 }, (_, pos) => [`1:0:${pos}`, { id: 700000 + pos, template_id: 2129006, count: 9999, bag_type: 1, object_id: 0, pos, bind: 0, exist: 1 }]),
    ]);
    s.city.state.items["1:0:30"] = { ...original, id: 800000, bag_type: 1, object_id: 0, pos: 30, random_skill_1: 0, random_skill_2: 0, random_skill_3: 0 };
    s.city.persist();
    const full = calculateAttributes(s.city.saved.attributes!);
    s.move(1, 4, 30, 0);
    assert.equal(s.city.state.items[`4:${hero}:0`].id, 800000);
    assert.equal(s.city.state.items["1:0:30"].id, original.id);
    assert.ok(!s.city.saved.attributes!.sources[`equipment:initial:${original.id}`]);
    assert.ok(s.city.saved.attributes!.sources["equipment:initial:800000"]);
    assert.notDeepEqual(calculateAttributes(s.city.saved.attributes!), full);
  } finally { s.close(); }
});
test("wrong owner/class/slot, protected items, full backpack and failed save never lose items or attributes", async () => {
  const s = await setup();
  try {
    const hero = s.city.state.hero.hero_id;
    const reject = (fn: () => unknown) => { const before = structuredClone(s.city.saved); fn(); assert.deepEqual(s.city.saved, before); };
    reject(() => s.move(4, 1, 0, 30, { begin_obj_id: hero + 1 }));
    reject(() => s.move(4, 4, 0, 2));
    s.city.state.items[`4:${hero}:0`].is_locked = 1;
    reject(() => s.move(4, 1, 0, 30));
    s.city.state.items[`4:${hero}:0`].is_locked = 0;
    s.move(4, 1, 0, 30);
    s.city.state.items["1:0:30"].template_id = 1011003;
    reject(() => s.move(1, 4, 30, 0));
    s.city.state.items["1:0:30"].template_id = 1013003;
    s.move(1, 4, 30, 0);
    reject(() => s.move(4, 1, 0, 42));
    const before = structuredClone(s.city.saved), persist = s.city.persist;
    s.city.persist = () => { throw new Error("forced equipment save failure"); };
    assert.throws(() => s.move(4, 1, 0, 30), /forced equipment save failure/);
    assert.deepEqual(s.city.saved, before); s.city.persist = persist;
  } finally { s.close(); }
});
test("armor affixes leave the central calculator and a full backpack refuses unequip atomically", async () => {
  const s = await setup();
  try {
    const hero = s.city.state.hero.hero_id, full = calculateAttributes(s.city.saved.attributes!);
    // Real wire ownership is the local account ID; translation resolves the stored hero ID.
    s.move(4, 1, 2, 31, { begin_obj_id: 1959 });
    const without = calculateAttributes(s.city.saved.attributes!);
    assert.equal(s.city.state.items[`4:${hero}:2`], undefined);
    assert.ok(without.total_phy_defence < full.total_phy_defence || without.total_magic_defence < full.total_magic_defence);
    s.move(1, 4, 31, 2, { end_obj_id: 1959 });
    assert.deepEqual(calculateAttributes(s.city.saved.attributes!), full);
    for (let pos = 0; pos < 42; pos++) s.city.state.items[`1:0:${pos}`] = { id: 900000 + pos, template_id: 2129006, count: 9999, exist: 1, bag_type: 1, object_id: 0, pos };
    s.city.persist();
    const before = structuredClone(s.city.saved);
    const result = s.move(4, 1, 2, -1);
    assert.ok(result.some(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === 83));
    assert.deepEqual(s.city.saved, before);
  } finally { s.close(); }
});
