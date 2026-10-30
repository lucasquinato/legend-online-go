import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { decodeMessage, encodeMessage, typeName, type Message } from "../src/messages.js";
import { frame, protoInt } from "../src/protocol.js";
import { equipmentAppearance, synchronizeEquipmentAppearance } from "../src/features/equipment/appearance.js";
import { classForIcon } from "../src/combat.js";

async function setup(icon = 3) {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "equipment-appearance-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  await store.createUser("visual_test", "test-visual-password", 1971);
  store.initTutorialProfile(1971);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,sex=?,nickname='Visual',process=25000 WHERE user_id=1971").run(icon, icon <= 3 ? 1 : 0);
  let city = new CityWorld(store, 1971, () => 1900000000000);
  city.state.player.grades = 80; delete city.saved.battle;
  const heroId = Number(city.state.hero.hero_id), job = classForIcon(icon);
  for (const [pos, template] of [[0, 2019001 + job * 100], [2, 2019004 + job * 100]]) {
    const key = `4:${heroId}:${pos}`;
    city.state.items[key] = { ...city.state.items[key], id: 910000 + pos!, user_id: 1971, template_id: template,
      object_id: heroId, bag_type: 4, pos, count: 1, exist: 1, bind: 1, strengthen_grade: 0,
      random_skill_1: 0, random_skill_2: 0, random_skill_3: 0, random_skill_4: 0, random_skill_5: 0,
      join_1: -1, join_2: -1, join_3: -1, join_4: -1 };
  }
  city.persist();
  const move = (begin: number, end: number, pos: number, dest: number) => city.handle(frame(5005, 1971,
    encodeMessage(city.scenario.outgoing[5005]!, { begin_bag_type: begin, begin_obj_id: begin === 4 ? heroId : 0,
      begin_pos: pos, end_bag_type: end, end_obj_id: end === 4 ? heroId : 0, end_pos: dest, count: 1 })));
  return { store, get city() { return city; }, heroId, move,
    reload: () => city = new CityWorld(store, 1971, () => 1900000000000),
    close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test("aparência considera apenas arma e armadura realmente equipadas pelo proprietário", () => {
  const item = { template_id: 2019301, bag_type: 4, object_id: 123, pos: 0, count: 1, exist: 1 };
  assert.deepEqual(equipmentAppearance({ "4:123:0": item }, 123), { arm: "/wizard_arms081", cloth: "" });
  for (const invalid of [{ object_id: 124 }, { bag_type: 1 }, { pos: 1 }, { count: 0 }, { exist: 0 }, { template_id: 2019304 }])
    assert.deepEqual(equipmentAppearance({ "4:123:0": { ...item, ...invalid } }, 123), { arm: "", cloth: "" });
});

test("as seis identidades anunciam seus equipamentos no painel, mapa, sala e reconexão sem modificar modas", async () => {
  for (const icon of [1, 2, 3, 4, 5, 6]) {
    const s = await setup(icon);
    try {
      const prefix = { 1: "warrior", 2: "hunter", 3: "wizard" }[classForIcon(icon)];
      const expected = { arm: `/${prefix}_arms081`, cloth: `/${prefix}_body081` };
      const fashion = structuredClone(s.city.saved.fashion), collection = structuredClone(s.city.state.fashions);
      const hero = structuredClone(s.city.state.hero);
      synchronizeEquipmentAppearance(s.city.state);
      assert.deepEqual(s.city.state.hero, hero, "sincronizar visual não altera atributos");
      for (const opcode of [113, 131, 150, 21]) {
        const response = s.city.packet({ opcode, message: opcode === 21 ? { player: [{ player_id: s.city.scenario.userId }] } : {} }, true);
        const msg = decodeMessage(s.city.scenario.incoming[opcode]!, Buffer.from(response.frame, "base64").subarray(20));
        const target = opcode === 21 ? msg.player[0] : msg;
        assert.equal(target.arm, expected.arm, `${icon}: ${opcode}`);
        assert.equal(target.cloth, expected.cloth, `${icon}: ${opcode}`);
        if (msg.simple_hero_info) assert.equal(msg.simple_hero_info.cloth, expected.cloth);
      }
      s.reload();
      assert.equal(s.city.state.army.arm, expected.arm); assert.equal(s.city.state.hero.cloth, expected.cloth);
      assert.deepEqual(s.city.saved.fashion, fashion); assert.deepEqual(s.city.state.fashions, collection);
    } finally { s.close(); }
  }
});

test("ocultar moda mantém a camada real; desequipar e trocar equipamento limpam o visual antigo", async () => {
  const s = await setup();
  try {
    const fashion = structuredClone(s.city.saved.fashion), collection = structuredClone(s.city.state.fashions);
    s.city.handle(frame(9582, 1971, Buffer.concat([7, 8, 9, 10].map(field => protoInt(field, 1)))));
    assert.equal(s.city.state.army.fashion_arm, ""); assert.equal(s.city.state.army.fashion_cloth, "");
    assert.equal(s.city.state.army.arm, "/wizard_arms081"); assert.equal(s.city.state.army.cloth, "/wizard_body081");
    const replies = s.move(4, 1, 0, 30);
    assert.equal(s.city.state.army.arm, ""); assert.equal(s.city.state.hero.arm, "");
    const update = replies.find(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === 150)!;
    assert.equal(decodeMessage(typeName("army.ArmyMsg"), Buffer.from(update.frame, "base64").subarray(20)).arm, "");
    s.move(1, 4, 30, 0);
    assert.equal(s.city.state.army.arm, "/wizard_arms081");
    // No-visual starter gear restores the class default rather than retaining the last tier.
    s.city.state.items[`4:${s.heroId}:0`].template_id = 1013003;
    s.city.state.items[`4:${s.heroId}:2`].template_id = 1043003;
    s.city.persist();
    assert.equal(s.city.state.army.arm, ""); assert.equal(s.city.state.army.cloth, "");
    s.city.handle(frame(9582, 1971, Buffer.concat([7, 8, 9, 10].map(field => protoInt(field, 0)))));
    assert.deepEqual(s.city.saved.fashion, fashion);
    assert.deepEqual(s.city.state.fashions, collection);
  } finally { s.close(); }
});

test("batalhas novas e retomadas usam o visual atual sem alterar inimigos ou estado de combate", async () => {
  const s = await setup();
  try {
    s.city.saved.won = []; delete s.city.saved.battle;
    const captured = structuredClone(s.city.scenario.battles[0]!.prepare);
    s.city.startBattle(0);
    const battle = s.city.saved.battle!;
    const hero = battle.prepare.heros.find((h: Message) => h.living_id === battle.hero)!;
    assert.equal(hero.slot_avata, "/wizard_arms081"); assert.equal(hero.cloth_avate, "/wizard_body081");
    assert.deepEqual(s.city.scenario.battles[0]!.prepare, captured);
    hero.slot_avata = "/old-captured-weapon"; hero.cloth_avate = "/old-captured-clothes";
    const engine = structuredClone(battle.engine), fury = battle.sp;
    const resumed = s.city.startBattle(0).find(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === 157)!;
    const msg = decodeMessage(typeName("battle.BattlePrepareMsg"), Buffer.from(resumed.frame, "base64").subarray(20));
    const actual = msg.heros.find((h: Message) => h.living_id === battle.hero)!;
    assert.equal(actual.slot_avata, "/wizard_arms081"); assert.equal(actual.cloth_avate, "/wizard_body081");
    assert.equal(battle.sp, fury); assert.deepEqual(battle.engine, engine);
  } finally { s.close(); }
});
