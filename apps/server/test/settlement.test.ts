import { setCurrencyBalance } from "../src/features/currencies/index.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame } from "../src/protocol.js";
import { encodeMessage, decodeMessage, typeName, type Message } from "../src/messages.js";
import {
  buildingTemplates,
  pawnValue,
} from "../src/features/settlement/content.js";
import { createAdventure, advanceAdventure } from "../src/adventure-combat.js";
import { choose } from "../src/features/battle/engine.js";
import { SocialFeature, localPresence } from "../src/features/social/index.js";
import { characterLevels } from "../src/features/fashion/index.js";
import { itemTemplate } from "../src/inventory.js";
import { classForIcon } from "../src/combat.js";
import { GameServer } from "../src/game.js";
import { recordTitleAcquisition, titleCatalog } from "../src/features/titles/index.js";
import { researchSons, buildingAt } from "../src/features/settlement/content.js";
import { AttributeCalculator } from "../src/attributes.js";
import { ReplayAuth } from "../src/store.js";
import { loadConfig } from "../src/config.js";
import { createConnection, type Socket, type AddressInfo } from "node:net";
import { publicEncrypt, createPublicKey, constants } from "node:crypto";
import {
  FrameReader,
  crypt,
  INITIAL_KEY,
  protoString,
  protoInt,
} from "../src/protocol.js";
function setup() {
  const base = join(projectRoot, ".test-data");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "settlement-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(
    join(projectRoot, "data/city/scenario.json"),
    join(dir, "city/scenario.json"),
  );
  const store = new Store(dir);
  let now = 1900000000000;
  for (const [id, name] of [
    [1951, "AnaLocal"],
    [1952, "BetoLocal"],
  ] as const) {
    store.db
      .prepare("INSERT INTO users(id,username,salt,hash) VALUES(?,?,?,?)")
      .run(id, name, "fixture", "fixture");
    store.initTutorialProfile(id);
    store.db
      .prepare(
        "UPDATE tutorial_profiles SET active=1,icon=3,nickname=?,process=25000 WHERE user_id=?",
      )
      .run(name, id);
  }
  const a = new CityWorld(store, 1951, () => now),
    b = new CityWorld(store, 1952, () => now);
  const send = (world: CityWorld, op: number, m: Message) =>
    world.handle(
      frame(
        op,
        world.userId,
        world.scenario.outgoing[op]
          ? encodeMessage(world.scenario.outgoing[op], m)
          : Buffer.alloc(0),
      ),
    );
  const message = (responses: Message[], opcode: number) => {
    const p = responses
      .map((p) => Buffer.from(p.frame, "base64"))
      .find((p) => p.readUInt16BE(6) === opcode);
    assert.ok(p, `Opcode ${opcode} ausente`);
    return decodeMessage(a.scenario.incoming[opcode], p.subarray(20));
  };
  const seed = (world: CityWorld, count = 4, id = 2160003) => {
    world.state.items["1:0:90"] = {
      id: 999000 + world.userId,
      exist: 1,
      template_id: id,
      count,
      bag_type: 1,
      object_id: 0,
      pos: 90,
      bind: 1,
      used: 0,
      strengthen_grade: 0,
      join_1: -1,
      join_2: -1,
      join_3: -1,
      join_4: -1,
    };
    world.persist();
  };
  const plant = (world: CityWorld, pos: number) =>
    send(world, 15044, {
      friend_id: world.userId,
      op_type: 1,
      pos,
      template_id: world.state.items["1:0:90"]!.template_id,
      bag_pos: 90,
    });
  const farm = (id: number) =>
    JSON.parse(
      String(
        store.db
          .prepare("SELECT state FROM local_farms WHERE user_id=?")
          .get(id)!.state,
      ),
    );
  const care = (world: CityWorld, id: number, pos: number) => {
    for (const [op, field] of [
      [2, "is_worm"],
      [3, "is_grass"],
      [4, "is_gloomy"],
      [5, "is_ill"],
    ] as const) {
      const p = farm(id).model.farmLandInfo.find((p: Message) => p.pos === pos);
      if (p[field]) send(world, 15044, { friend_id: id, op_type: op, pos });
    }
  };
  const befriend = () => {
    send(a, 15003, { nick_name: "BetoLocal", relation: 1 });
    assert.equal(a.saved.friends!.length, 0);
    assert.equal(new SocialFeature(store, 1952).requests().length, 1);
    send(b, 15012, { nick_name: "AnaLocal" });
    a.tick();
    assert.equal(a.saved.friends!.length, 1);
  };
  const level = (world: CityWorld, lv: number) => {
    world.state.player.grades = lv;
    world.state.player.gp = 0;
    world.persist();
  };
  return {
    store,
    a,
    b,
    send,
    message,
    seed,
    plant,
    farm,
    care,
    befriend,
    level,
    advance: (ms: number) => (now += ms),
    now: () => now,
    reload: (id: number) => new CityWorld(store, id, () => now),
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("entrada na cidade conserva equipamentos iniciais de cada uma das seis opções de personagem", () => {
  for (let icon = 1; icon <= 6; icon++) {
    const s = setup();
    try {
      s.store.db.prepare("DELETE FROM city_worlds WHERE user_id=1951").run();
      s.store.db
        .prepare("UPDATE tutorial_profiles SET icon=? WHERE user_id=1951")
        .run(icon);
      const city = new CityWorld(s.store, 1951, s.now),
        job = classForIcon(icon);
      const items = Object.values(city.state.items).filter(
        (i) => i.bag_type === 4,
      );
      assert.equal(items.length, 2);
      assert.deepEqual(
        items.map((i) => Number(itemTemplate(i.template_id)!.Job)),
        [job, job],
      );
      assert.deepEqual(s.reload(1951).state.items, city.state.items);
      const before = structuredClone(city.state.hero);
      s.level(city, 27);
      assert.equal(
        city.state.hero.base_magic_attack,
        before.base_magic_attack * 17,
      );
      assert.equal(
        city.state.hero.base_live,
        before.base_live * 17,
      );
      const once = structuredClone(city.state.hero);
      s.reload(1951).persist();
      assert.deepEqual(s.reload(1951).state.hero, once);
    } finally {
      s.cleanup();
    }
  }
});
test("toda fonte de XP sincroniza as construções físicas, sem maximizar pesquisas", () => {
  const s = setup();
  try {
    const initial = s.a.state.player.grades;
    s.a.state.player.gp = characterLevels.get(initial + 1)! - 1;
    s.a.persist();
    s.store.sendLocalItems(1951, "XP", [{ template: -700, count: 1 }]);
    s.a.persist();
    const mail = Object.values(s.a.state.mails).find(
      (m) => m.annex1Name === -700,
    )!;
    const result = s.send(s.a, 5022, {
      mailsIdArray: [mail.id],
      position: [0],
    });
    assert.equal(s.a.state.player.grades, initial + 1);
    s.message(result, 4130);
    for (const b of Object.values(s.a.state.buildings).filter((b) =>
      [402, 501, 901].includes(b.son_type),
    ))
      assert.equal(
        Number(buildingTemplates.get(b.template_id)!.BuildingGrade),
        initial + 1,
      );
    assert.equal(s.a.state.buildings[181001441]!.template_id, 144100);
    assert.equal(
      s.reload(1951).state.buildings[18101]!.template_id,
      90100 + initial + 1,
    );
  } finally {
    s.cleanup();
  }
});
test("tropas liberam pelos níveis 4/20/30, pagam espírito e persistem upgrade de reserva e tropas equipadas", () => {
  const s = setup();
  try {
    s.level(s.a, 19);
    let rejected = s.send(s.a, 5155, { tempate_id: 10301, own_pawns: 10 });
    s.message(rejected, 83);
    s.level(s.a, 20);
    s.a.state.economy.gold_total_count = 100000;
    s.a.state.player.strategy = 1000;
    s.a.persist();
    s.send(s.a, 5155, { tempate_id: 10301, own_pawns: 100 });
    assert.equal(s.a.state.economy.gold_total_count, 99700);
    s.send(s.a, 5156, { tempate_id: 10301, own_pawns: 70, sites: 0 });
    const before = s.a.state.player.strategy;
    const up = s.send(s.a, 5158, { tempate_id: 10301 });
    s.message(up, 116);
    assert.equal(s.a.state.player.strategy, before - 40);
    assert.equal(s.a.state.army.armyPawn[0].tempate_id, 10302);
    assert.equal(
      s.a.state.pawnStock!.find((p) => p.son_type === 103)!.own_pawns,
      30,
    );
    assert.equal(s.reload(1951).state.army.armyPawn[0].tempate_id, 10302);
    rejected = s.send(s.a, 5155, { tempate_id: 10401, own_pawns: 1 });
    s.message(rejected, 83);
    assert.ok(
      s
        .message(s.send(s.a, 8281, {}), 4130)
        .building.find(
          (b: Message) => b.son_type === 402 && b.template_id === 40220,
        ),
    );
  } finally {
    s.cleanup();
  }
});
test("troca de espécie e desequipar devolvem os soldados à reserva sem duplicar população", () => {
  const s = setup();
  try {
    const pop = s.a.state.economy.cur_population;
    s.send(s.a, 5155, { tempate_id: 10101, own_pawns: 100 });
    s.send(s.a, 5155, { tempate_id: 10201, own_pawns: 80 });
    s.send(s.a, 5156, { tempate_id: 10101, own_pawns: 100, sites: 0 });
    s.send(s.a, 5156, { tempate_id: 10201, own_pawns: 70, sites: 0 });
    assert.equal(
      s.a.state.pawnStock!.find((p) => p.son_type === 101)!.own_pawns,
      100,
    );
    assert.equal(s.a.state.economy.cur_population, pop + 180);
    s.send(s.a, 5156, { tempate_id: 10201, own_pawns: 0, sites: 0 });
    assert.equal(
      s.a.state.pawnStock!.find((p) => p.son_type === 102)!.own_pawns,
      80,
    );
    s.send(s.a, 5157, { tempate_id: 10101, own_pawns: 20 });
    assert.equal(s.a.state.economy.cur_population, pop + 160);
  } finally {
    s.cleanup();
  }
});
test("upgrade de soldado respeita o nível do quartel e rollback do save preserva espírito", () => {
  const s = setup();
  try {
    s.a.state.player.strategy = 1000000;
    s.a.persist();
    let p = s.a.state.pawnStock!.find((p) => p.son_type === 101)!;
    for (let lv = 1; lv < 10; lv++) {
      s.send(s.a, 5158, { tempate_id: p.tempate_id });
      p = s.a.state.pawnStock!.find((p) => p.son_type === 101)!;
    }
    assert.equal(p.tempate_id, 10110);
    const before = s.a.state.player.strategy;
    s.message(s.send(s.a, 5158, { tempate_id: 10110 }), 83);
    assert.equal(s.a.state.player.strategy, before);
    s.level(s.a, 11);
    const state = JSON.stringify(s.a.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_save BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'forced failure'); END",
    );
    assert.throws(
      () => s.send(s.a, 5158, { tempate_id: 10110 }),
      /forced failure/,
    );
    assert.equal(JSON.stringify(s.a.saved), state);
    assert.equal(s.a.state.player.strategy, before);
  } finally {
    s.cleanup();
  }
});
test("santuário aplica ataque, magia, defesa, vida e infantaria em fontes permanentes", () => {
  const s = setup();
  try {
    s.a.state.economy.crystals_count = 10000;
    s.a.persist();
    const before = structuredClone(s.a.state.hero);
    for (const son of [1441, 1442, 1443, 1444, 1445, 1446])
      s.send(s.a, 8203, { building_id: 195100000 + son });
    assert.equal(
      s.a.state.hero.total_phy_attack,
      before.total_phy_attack + 125,
    );
    assert.equal(
      s.a.state.hero.total_magic_attack,
      before.total_magic_attack + 125,
    );
    assert.equal(
      s.a.state.hero.total_phy_defence,
      before.total_phy_defence + 87,
    );
    assert.equal(
      s.a.state.hero.total_magic_defence,
      before.total_magic_defence + 87,
    );
    assert.equal(s.a.state.hero.total_live, before.total_live + 250);
    assert.equal(s.a.state.hero.total_conat_army, before.total_conat_army + 87);
    assert.equal(s.a.state.economy.crystals_count, 9700);
    const attributes = structuredClone(s.a.state.hero);
    assert.deepEqual(s.reload(1951).state.hero, attributes);
  } finally {
    s.cleanup();
  }
});
test("LOGo: pesquisas máximas somam fontes do herói, tropas e renda sem duplicar ao reconectar", () => {
  const s = setup();
  try {
    s.level(s.a, 80);
    s.send(s.a, 5155, { tempate_id: 10101, own_pawns: 100 });
    s.send(s.a, 5156, { tempate_id: 10101, own_pawns: 100, sites: 0 });
    for (const son of researchSons) {
      const b = Object.values(s.a.state.buildings).find(b => b.son_type === son)!;
      b.template_id = Number(buildingAt(son, 80)!.TemplateId);
    }
    s.a.persist();
    const common = s.a.saved.attributes!.sources.sanctuary!.values, advanced = s.a.saved.attributes!.sources.sanctuaryAdvanced!.values;
    const source = Object.fromEntries(Object.keys(common).map(key => [key, common[key]! + advanced[key]!]));
    assert.equal(source.total_phy_attack, 23000);
    assert.equal(source.total_magic_attack, 23000);
    assert.equal(source.total_phy_defence, 16000);
    assert.equal(source.total_magic_defence, 16000);
    assert.equal(source.total_live, 46000);
    assert.equal(source.total_conat_army, 16000);
    const pawn = s.a.state.army.armyPawn[0];
    assert.deepEqual(pawn.pawnLive.map((p: Message) => p.skill_Data), [23000, 16000, 23000, 16000, 46000, 0]);
    assert.equal(s.a.state.economy.gold_yield, 7000000);
    const hero = structuredClone(s.a.state.hero);
    const restored = s.reload(1951);
    assert.deepEqual(restored.state.hero, hero);
    assert.equal(restored.state.economy.gold_yield, 7000000);
  } finally { s.cleanup(); }
});

test("Prefeitura: fontes brutas e percentuais compõem uma renda global sem alterar poder de combate", () => {
  const s = setup();
  try {
    s.level(s.a, 80);
    const power = s.a.state.hero.fighting_capacity;
    s.a.saved.attributes!.sources.recurringTest = { kind: "permanent", evidence: "local-balance", values: { total_gold_production: 1000000 }, percentages: { total_gold_production: 20 } };
    s.a.persist();
    assert.equal(AttributeCalculator.calculate(s.a.saved.attributes!).total_gold_production, 7200000);
    assert.equal(s.a.state.economy.gold_yield, 7200000);
    assert.equal(s.a.state.hero.fighting_capacity, power);
    assert.equal(s.a.state.hero.total_gold_production, undefined);
    const balance = s.a.state.economy.gold_total_count;
    s.send(s.a, 8327, { op: 1 });
    assert.equal(s.a.state.economy.gold_total_count, balance + 7200000);
    assert.equal(s.a.state.economy.gold_yield, 7200000);
    s.advance(3600000);
    const restored = s.reload(1951);
    assert.equal(restored.state.economy.gold_total_count, balance + 14400000);
    assert.equal(restored.state.economy.gold_yield, 7200000);
  } finally { s.cleanup(); }
});

test("Prefeitura: disponível no nível 10, VIP expira por tentativa e não amplia a cota diária", () => {
  const s = setup();
  try {
    assert.equal(s.a.state.player.grades, 10);
    s.a.saved.vip = { level: 1, expiresAt: s.now() + 60000 };
    s.a.persist();
    s.message(s.send(s.a, 8327, { op: 1 }), 4242);
    s.message(s.send(s.a, 8327, { op: 1 }), 4242);
    assert.equal(s.a.saved.settlement!.taxes, 2);
    assert.equal(s.message(s.send(s.a, 8279, {}), 4187).buildOrder[2].remain_time, 0);
    s.advance(60000);
    s.message(s.send(s.a, 8327, { op: 1 }), 83);
    assert.equal(s.a.saved.settlement!.taxes, 2);
    assert.equal(s.message(s.send(s.a, 8279, {}), 4187).buildOrder[2].remain_time, 540);
    s.advance(540000);
    s.message(s.send(s.a, 8327, { op: 1 }), 4242);
    s.a.saved.vip.expiresAt = s.now() + 60000;
    s.a.persist();
    s.message(s.send(s.a, 8327, { op: 2 }), 4242);
    assert.equal(s.a.saved.settlement!.taxes, 5);
    s.message(s.send(s.a, 8327, { op: 1 }), 83);
    assert.equal(s.reload(1951).saved.settlement!.taxes, 5);
  } finally { s.cleanup(); }
});

test("Prefeitura: sessenta créditos de um minuto preservam a taxa horária sem perder frações", () => {
  const s = setup();
  try {
    s.level(s.a, 30);
    const rate = s.a.state.economy.gold_yield, balance = s.a.state.economy.gold_total_count;
    assert.equal(rate, 1785714);
    for (let minute = 0; minute < 60; minute++) { s.advance(60000); s.a.persist(); }
    assert.equal(s.a.state.economy.gold_total_count, balance + rate);
    assert.equal(s.a.saved.settlement!.goldCarry, 0);
    const rows = s.store.db.prepare("SELECT delta FROM currency_transactions WHERE user_id=1951 AND reason='townhall:production'").all();
    assert.equal(rows.length, 60);
    assert.ok(rows.every(r => [29761,29762].includes(Number(r.delta))));
    s.a.changeCurrency("gold", 99999, "quest:one-time");
    assert.equal(s.a.state.economy.gold_yield, rate);
  } finally { s.cleanup(); }
});

test("Prefeitura: virada das 04h preserva recarga e reinicialização não renova a cota duas vezes", () => {
  const s = setup();
  try {
    const time = Date.parse("2031-05-12T06:55:00Z");
    s.advance(time - s.now()); s.a.saved.settlement!.goldAt = time; s.a.persist();
    s.send(s.a, 8327, { op: 1 });
    assert.equal(s.a.saved.settlement!.taxDay, "2031-05-11");
    s.advance(5 * 60000);
    const restored = s.reload(1951);
    assert.equal(restored.saved.settlement!.taxDay, "2031-05-12");
    assert.equal(restored.saved.settlement!.taxes, 0);
    assert.equal(s.message(s.send(restored, 8279, {}), 4187).buildOrder[2].remain_time, 300);
    s.message(s.send(restored, 8327, { op: 1 }), 83);
    s.advance(5 * 60000);
    s.message(s.send(restored, 8327, { op: 1 }), 4242);
    assert.equal(s.reload(1951).saved.settlement!.taxes, 1);
  } finally { s.cleanup(); }
});

test("Prefeitura: sessões com contador antigo não duplicam a coleta; falha de save reverte ouro e contador", () => {
  const s = setup();
  try {
    s.a.saved.vip = { level: 1, expiresAt: s.now() + 600000 }; s.a.persist();
    const stale = s.reload(1951);
    for (let i = 0; i < 5; i++) s.message(s.send(i % 2 ? stale : s.a, 8327, { op: 1 }), 4242);
    s.message(s.send(stale, 8327, { op: 1 }), 83);
    assert.equal(s.reload(1951).saved.settlement!.taxes, 5);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) AS n FROM currency_transactions WHERE user_id=1951 AND reason='townhall:tax'").get()!.n, 5);
    s.advance(86400000);
    const restored = s.reload(1951), before = structuredClone(restored.saved);
    s.store.db.exec("CREATE TRIGGER tax_save_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'tax rollback'); END");
    assert.throws(() => s.send(restored, 8327, { op: 1 }), /tax rollback/);
    assert.deepEqual(restored.saved, before);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) AS n FROM currency_transactions WHERE user_id=1951 AND reason='townhall:tax'").get()!.n, 5);
    s.store.db.exec("DROP TRIGGER tax_save_fail");
    s.message(s.send(restored, 8327, { op: 1 }), 4242);
    assert.equal(s.reload(1951).saved.settlement!.taxes, 1);
  } finally { s.cleanup(); }
});

test("Santuário: confirmação única em MSG só após sucesso persistido; erro e rollback não confirmam", () => {
  const s = setup();
  const success = (responses: Message[]) => responses.map(p => Buffer.from(p.frame, "base64"))
    .filter(p => p.readUInt16BE(6) === 83)
    .map(p => decodeMessage(s.a.scenario.incoming[83], p.subarray(20)))
    .filter(m => String(m.encode_msg).startsWith("[Santuário]"));
  try {
    s.a.state.economy.crystals_count = 10000; s.a.persist();
    const result = s.send(s.a, 8203, { building_id: 195101441 }), messages = success(result);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.channel, 3);
    assert.equal(messages[0]!.is_centerTip, 0);
    assert.match(String(messages[0]!.encode_msg), /nível 1\. Bônus: \+125/);
    assert.equal(s.reload(1951).state.buildings[181001441]!.template_id, s.a.state.buildings[181001441]!.template_id);
    s.a.state.economy.crystals_count = 0; s.a.persist();
    assert.equal(success(s.send(s.a, 8203, { building_id: 195101441 })).length, 0);
    s.a.state.economy.crystals_count = 10000; s.a.persist();
    const before = structuredClone(s.a.saved);
    s.store.db.exec("CREATE TRIGGER sanctuary_save_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'sanctuary rollback'); END");
    const sent: Message[] = [];
    assert.throws(() => sent.push(...s.send(s.a, 8203, { building_id: 195101441 })), /sanctuary rollback/);
    assert.equal(success(sent).length, 0);
    assert.deepEqual(s.a.saved, before);
    s.store.db.exec("DROP TRIGGER sanctuary_save_fail");
    assert.equal(success(s.send(s.a, 8203, { building_id: 195101441 })).length, 1);
  } finally { s.cleanup(); }
});

test("Santuário: vida avançada é exatamente dobro do ataque em níveis ímpares e fontes não se substituem", () => {
  const s = setup();
  try {
    s.level(s.a, 80);
    for (const son of [1441,1445,2441,2445]) {
      const row = Object.values(s.a.state.buildings).find(b => b.son_type === son)!;
      row.template_id = Number(buildingAt(son, 3)!.TemplateId);
    }
    s.a.persist();
    const common = s.a.saved.attributes!.sources.sanctuary!, advanced = s.a.saved.attributes!.sources.sanctuaryAdvanced!;
    assert.equal(common.values.total_live, 750);
    assert.equal(common.values.total_live, 2 * common.values.total_phy_attack!);
    assert.equal(advanced.values.total_phy_attack, 487);
    assert.equal(advanced.values.total_live, 974);
    assert.equal(advanced.values.total_live, 2 * advanced.values.total_phy_attack!);
    const before = structuredClone(s.a.saved.attributes);
    assert.deepEqual(s.reload(1951).saved.attributes, before);
  } finally { s.cleanup(); }
});

test("pesquisa de soldados informa skill_Data e altera os atributos usados na batalha", () => {
  const s = setup();
  try {
    s.a.state.economy.crystals_count = 10000;
    s.send(s.a, 5155, { tempate_id: 10101, own_pawns: 100 });
    s.send(s.a, 5156, { tempate_id: 10101, own_pawns: 100, sites: 0 });
    for (const son of [1420, 1421, 1422, 1423, 1424])
      s.send(s.a, 8203, { building_id: 195100000 + son });
    const p = s.a.state.army.armyPawn[0];
    assert.equal(pawnValue(p, 0), 189);
    assert.equal(pawnValue(p, 1), 137);
    assert.equal(pawnValue(p, 4), 573);
    assert.equal(pawnValue(p, 2), 0);
    const ref = s.a.scenario.battles.find((b) => b.tableCombat)!;
    const b = createAdventure(ref, 3, s.a.state);
    assert.equal(
      b.prepare.soldiers.find((p: Message) => p.side === 1).init_hp,
      573,
    );
    assert.equal(b.stats![1]!.attack, 189);
  } finally {
    s.cleanup();
  }
});
test("segunda aba bloqueia antes de 50 e pesquisa não passa do personagem", () => {
  const s = setup();
  try {
    s.a.state.economy.crystals_count = 100000;
    s.level(s.a, 49);
    s.message(s.send(s.a, 8203, { building_id: 195102441 }), 83);
    assert.equal(s.a.state.buildings[181002441]!.template_id, 244100);
    s.level(s.a, 50);
    s.send(s.a, 8203, { building_id: 195102441 });
    assert.equal(s.a.state.buildings[181002441]!.template_id, 244101);
    s.a.state.buildings[181001441]!.template_id = 144150;
    s.a.persist();
    s.message(s.send(s.a, 8203, { building_id: 195101441 }), 83);
    assert.equal(s.a.state.buildings[181001441]!.template_id, 144150);
  } finally {
    s.cleanup();
  }
});
test("formação valida identidade, persiste e muda posições e alvo da linha de frente", () => {
  const s = setup();
  try {
    s.send(s.a, 5155, { tempate_id: 10101, own_pawns: 100 });
    s.send(s.a, 5156, { tempate_id: 10101, own_pawns: 100, sites: 0 });
    s.send(s.a, 8276, { user_id: 1951, hero_pos: 1, pawn_pos: 3 });
    assert.equal(s.reload(1951).state.hero.fight_pos, 1);
    const b = createAdventure(s.a.scenario.battles[0]!, 0, s.a.state);
    assert.equal(b.prepare.heros.find((p: Message) => p.type === 1).pos, 4);
    assert.deepEqual(
      b.prepare.soldiers
        .filter((p: Message) => p.side === 1)
        .map((p: Message) => p.pos),
      [3, 12],
    );
    b.ready = true;
    // Isolate target selection from the new selection-order scheduler.
    const enemy = b.engine!.actors.find(a => a.side === 2)!;
    choose(b.engine!, enemy.id, enemy.defaultSkill, s.now(), true);
    advanceAdventure(b, s.a.scenario.battles[0]!, s.now());
    const events = advanceAdventure(b, s.a.scenario.battles[0]!, s.now() + 3000);
    const hostile = events.filter(
      (e) =>
        e.opcode === 153 &&
        b.fighters.find((p: Message) => p.living_id === e.message!.living_id)
          ?.side === 2,
    );
    assert.ok(hostile.length);
    for (const e of hostile)
      assert.equal(e.message!.damages[0].living_id, b.hero);
    s.message(
      s.send(s.a, 8276, { user_id: 1952, hero_pos: 3, pawn_pos: 1 }),
      83,
    );
    assert.equal(s.a.state.hero.fight_pos, 1);
  } finally {
    s.cleanup();
  }
});
test("prefeitura produz ouro offline, preserva frações e usa a taxa anterior no level-up", () => {
  const s = setup();
  try {
    const gold = s.a.state.economy.gold_total_count,
      rate = s.a.state.economy.gold_yield;
    s.advance(3600000);
    const restored = s.reload(1951);
    assert.equal(restored.state.economy.gold_total_count, gold + rate);
    assert.equal(s.reload(1951).state.economy.gold_total_count, gold + rate);
    s.advance(1800000);
    s.level(restored, 11);
    const at = restored.state.economy.gold_total_count,
      newRate = restored.state.economy.gold_yield;
    assert.equal(at, gold + rate + rate / 2);
    s.advance(3600000);
    restored.persist();
    assert.equal(restored.state.economy.gold_total_count, at + newRate);
    const reasons = s.store.db
      .prepare(
        "SELECT reason FROM currency_transactions WHERE user_id=1951 AND currency='gold'",
      )
      .all();
    assert.ok(reasons.every((r) => r.reason === "townhall:production"));
  } finally {
    s.cleanup();
  }
});
test("produção de ouro do santuário aumenta renda e impostos respeitam nível, limite diário e reconexão", () => {
  const s = setup();
  try {
    s.message(s.send(s.a, 8327, { op: 0 }), 83);
    s.level(s.a, 14);
    s.a.state.economy.crystals_count = 1000;
    const rate = s.a.state.economy.gold_yield;
    s.send(s.a, 8203, { building_id: 195101304 });
    assert.equal(s.a.state.economy.gold_yield, rate + 12500);
    const before = s.a.state.economy.gold_total_count;
    const rsp = s.message(s.send(s.a, 8327, { op: 1 }), 4242);
    assert.equal(rsp.left_impose, 1);
    assert.equal(
      s.a.state.economy.gold_total_count,
      before + s.a.state.economy.gold_yield,
    );
    s.message(s.send(s.a, 8327, { op: 1 }), 83);
    s.advance(600000);
    s.message(s.send(s.a, 8327, { op: 2 }), 83);
    for (let i = 0; i < 4; i++) {
      s.send(s.a, 8327, { op: 1 });
      s.advance(600000);
    }
    assert.equal(s.reload(1951).saved.settlement!.taxes, 5);
    const receipts = s.store.db.prepare("SELECT delta FROM currency_transactions WHERE user_id=? AND currency='gold' AND reason='townhall:tax'").all(1951);
    assert.equal(receipts.length, 5);
    assert.ok(receipts.every(r => r.delta === s.a.state.economy.gold_yield));
    assert.equal(receipts.reduce((sum, r) => sum + Number(r.delta), 0), 5 * s.a.state.economy.gold_yield);
    s.message(s.send(s.a, 8327, { op: 1 }), 83);
    s.advance(86400000);
    assert.equal(s.message(s.send(s.a, 8327, { op: 1 }), 4242).left_impose, 1);
  } finally {
    s.cleanup();
  }
});

test("filas iniciais liberam construção/pesquisa e impostos atualizam o temporizador existente", () => {
  const s = setup();
  try {
    s.level(s.a, 14);
    const orders = s.message(s.a.bootstrap(), 4155).buildOrder;
    assert.deepEqual(
      orders.map((o: Message) => o.order_type),
      [1, 2, 3],
    );
    assert.ok(orders.every((o: Message) => o.remain_time === 0));
    const timer = s.message(s.send(s.a, 8327, { op: 1 }), 151);
    assert.equal(timer.order_id, 10);
    assert.equal(timer.remain_time, 600);
    assert.equal(
      s.message(s.send(s.a, 8279, {}), 4187).buildOrder[2].remain_time,
      600,
    );
  } finally {
    s.cleanup();
  }
});

test("pesquisa atualiza apenas o atributo interno; impostos não enviam animação de construção e expiram offline", () => {
  const s = setup();
  try {
    s.level(s.a, 14);
    s.a.state.economy.crystals_count = 10000;
    s.a.persist();
    const research = s.send(s.a, 8203, { building_id: 195101441 });
    const changes = s.message(research, 4130).building;
    assert.equal(changes.length, 1);
    assert.equal(changes[0].son_type, 1441);
    const tax = s.send(s.a, 8327, { op: 1 });
    assert.equal(
      tax.some((p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 4130),
      false,
    );
    assert.equal(s.message(tax, 151).remain_time, 600);
    s.advance(20000);
    const restored = s.reload(1951);
    assert.equal(
      s.message(restored.bootstrap(), 4155).buildOrder[2].remain_time,
      580,
    );
    assert.equal(
      s.message(s.send(restored, 8327, { op: 1 }), 151).remain_time,
      580,
    );
    s.advance(580000);
    const ready = restored.tick();
    assert.equal(s.message(ready, 151).remain_time, 0);
    assert.equal(s.message(ready, 4242).left_impose, 1);
    assert.equal(
      s.message(s.send(restored, 8327, { op: 1 }), 4242).left_impose,
      2,
    );
    for (let i = 0; i < 3; i++) {
      s.advance(600000);
      s.send(restored, 8327, { op: 1 });
    }
    assert.equal(restored.saved.settlement!.taxes, 5);
  } finally {
    s.cleanup();
  }
});

test("pack padrão de energia é enviado a todas as contas uma vez, retirado e consumido pelo ledger", async () => {
  const s = setup();
  try {
    s.store.ensureEnergyMails();
    s.store.ensureEnergyMails();
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM account_grants").get()!.n,
      2,
    );
    for (const id of [1951, 1952]) {
      const row = s.store.db
        .prepare("SELECT mail_id,detail FROM local_mail WHERE user_id=?")
        .get(id)!;
      const detail = JSON.parse(String(row.detail));
      assert.equal(detail.annex1Name, 2030503);
      assert.equal(detail.annex1Count, 9999);
    }
    const id = Number(
      s.store.db
        .prepare("SELECT mail_id FROM account_grants WHERE user_id=1951")
        .get()!.mail_id,
    );
    const restored = s.reload(1951);
    assert.ok(
      restored
        .tick()
        .some((p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 148),
    );
    s.send(restored, 5022, { mailsIdArray: [id], position: [0] });
    const potion = Object.values(restored.state.items).find(
      (i) => i.template_id === 2030503,
    )!;
    assert.equal(potion.count, 9999);
    restored.state.player.weary = 0;
    const energy = restored.state.player.weary;
    s.send(restored, 5006, { bag_type: 1, pos: potion.pos, count: 3 });
    assert.equal(restored.state.player.weary, energy + 150);
    assert.equal(potion.count, 9996);
    s.store.ensureEnergyMails();
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM account_grants").get()!.n,
      2,
    );
    await s.store.createUser("new_energy", "local-password-123", 1953);
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM account_grants").get()!.n,
      3,
    );
    s.store.db.exec(
      "CREATE TRIGGER fail_energy_grant BEFORE INSERT ON account_grants BEGIN SELECT RAISE(ABORT,'falha concessão'); END",
    );
    await assert.rejects(
      s.store.createUser("failed_energy", "local-password-123", 1954),
      /falha concessão/,
    );
    assert.equal(s.store.user("failed_energy"), undefined);
    assert.equal(
      s.store.db
        .prepare("SELECT COUNT(*) n FROM local_mail WHERE user_id=1954")
        .get()!.n,
      0,
    );
  } finally {
    s.cleanup();
  }
});

test("animal requer alimento, produz após oito horas offline e pode ser alimentado novamente", () => {
  const s = setup();
  try {
    s.level(s.a, 27);
    s.seed(s.a, 1, 2131261);
    s.plant(s.a, 1000);
    assert.equal(
      s.farm(1951).model.farmLandInfo.find((p: Message) => p.pos === 1000)
        .is_hunger,
      1,
    );
    s.seed(s.a, 10, 2131250);
    s.send(s.a, 15044, { friend_id: 1951, op_type: 7, pos: 1000 });
    assert.equal(s.a.state.items["1:0:90"]!.count, 5);
    s.advance(8 * 3600000);
    const restored = s.reload(1951);
    s.send(restored, 15044, { friend_id: 1951, op_type: 0 });
    s.care(restored, 1951, 1000);
    const reward = s
      .farm(1951)
      .model.farmLandInfo.find((p: Message) => p.pos === 1000).reward_count;
    s.send(restored, 15044, { friend_id: 1951, op_type: 6, pos: 1000 });
    assert.equal(
      Object.values(restored.state.items)
        .filter((i) => i.template_id === 2131264)
        .reduce((n, i) => n + i.count, 0),
      reward,
    );
    assert.equal(
      s.farm(1951).model.farmLandInfo.find((p: Message) => p.pos === 1000)
        .is_hunger,
      1,
    );
    s.send(restored, 15044, { friend_id: 1951, op_type: 7, pos: 1000 });
    assert.equal(restored.state.items["1:0:90"], undefined);
    assert.equal(
      s.farm(1951).model.farmLandInfo.find((p: Message) => p.pos === 1000)
        .is_hunger,
      0,
    );
  } finally {
    s.cleanup();
  }
});
test("plantar completa objetivo durável e colher depois de reconectar paga a moeda da semente uma vez", () => {
  const s = setup();
  try {
    s.a.state.quests[1839] = {
      template_id: 1839,
      is_accept: 1,
      is_complete: 0,
    };
    s.seed(s.a);
    s.plant(s.a, 0);
    s.plant(s.a, 1);
    assert.equal(s.a.state.quests[1839]!.is_complete, 1);
    s.message(s.send(s.a, 15044, { friend_id: 1951, op_type: 6, pos: 0 }), 83);
    s.advance(3600000);
    const restored = s.reload(1951);
    s.send(restored, 15044, { friend_id: 1951, op_type: 0 });
    s.care(restored, 1951, 0);
    const p = s.farm(1951).model.farmLandInfo.find((p: Message) => p.pos === 0);
    const gold = restored.state.economy.gold_total_count;
    s.send(restored, 15044, { friend_id: 1951, op_type: 6, pos: 0 });
    assert.equal(
      restored.state.economy.gold_total_count,
      gold + p.reward_count,
    );
    assert.equal(restored.state.quests[1839]!.is_complete, 1);
    const balance = restored.state.economy.gold_total_count;
    s.message(
      s.send(restored, 15044, { friend_id: 1951, op_type: 6, pos: 0 }),
      83,
    );
    assert.equal(restored.state.economy.gold_total_count, balance);
    assert.ok(s.farm(1951).model.grades > 1);
  } finally {
    s.cleanup();
  }
});
test("loja integrada compra sementes usando ouro; não vende cartas como animais nem permite compra sem saldo", () => {
  const s = setup();
  try {
    s.send(s.a,15044,{friend_id:1951,op_type:0});
    s.message(s.send(s.a,5154,{buyInfo:{good_id:60002,count:1,receive_id:1951,type:6}}),83);
    s.store.db.prepare("UPDATE local_farms SET state=json_set(state,'$.model.grades',2) WHERE user_id=1951").run();
    const before = s.a.state.economy.gold_total_count;
    const p = s.message(
      s.send(s.a, 5154, {
        buyInfo: { good_id: 60002, count: 3, receive_id: 1951, type: 6 },
        pay_type: 0,
      }),
      90,
    );
    assert.equal(p.buyInfo.result, 1);
    assert.equal(s.a.state.economy.gold_total_count, before - 1500);
    assert.ok(
      Object.values(s.a.state.items).some(
        (i) => i.template_id === 2160003 && i.count === 3,
      ),
    );
    s.a.state.economy.gold_total_count = 0;
    s.a.persist();
    const items = structuredClone(s.a.state.items);
    s.message(
      s.send(s.a, 5154, {
        buyInfo: { good_id: 60002, count: 1, receive_id: 1951, type: 6 },
      }),
      83,
    );
    assert.deepEqual(s.a.state.items, items);
    s.seed(s.a, 1, 2180001);
    s.message(s.plant(s.a, 1000), 83);
    assert.equal(s.a.state.items["1:0:90"]!.count, 1);
  } finally {
    s.cleanup();
  }
});
test("solo usa diamante escolhido, maturação/recompensa por nível e slots liberam a cada cinco níveis", () => {
  const s = setup();
  try {
    s.level(s.a, 30);
    const d = s.farm(1951);
    d.model.grades = 29;
    s.store.db
      .prepare("UPDATE local_farms SET state=? WHERE user_id=1951")
      .run(JSON.stringify(d));
    s.a.state.player.gift_token = 100;
    s.a.state.player.point = 100;
    s.a.persist();
    s.message(s.send(s.a, 15044, { op_type: 11, pay_type: 0 }), 83);
    assert.equal(s.a.state.player.gift_token, 100);
    d.model.grades = 30;
    s.store.db.prepare("UPDATE local_farms SET state=? WHERE user_id=1951").run(JSON.stringify(d));
    s.send(s.a, 15044, { op_type: 11, pay_type: 0 });
    assert.equal(s.a.state.player.gift_token, 82);
    assert.equal(s.a.state.player.point, 100);
    const q = s.message(
      s.send(s.a, 15044, { friend_id: 1951, op_type: 0 }),
      4386,
    );
    assert.equal(q.farmLandInfo.filter((p: Message) => p.pos < 1000).length, 9);
    assert.equal(q.land_grades, 2);
    s.seed(s.a);
    s.plant(s.a, 5);
    const p = s.farm(1951).model.farmLandInfo.find((p: Message) => p.pos === 5);
    assert.equal(Date.parse(p.mature_time) - Date.parse(p.add_time), 3528000);
    assert.equal(p.reward_count, 61800);
    s.message(s.plant(s.a, 9), 83);
  } finally {
    s.cleanup();
  }
});
test("amizade aceita sincroniza duas contas, presença TCP e roubo de colheita não duplica com save antigo do dono", () => {
  const s = setup();
  try {
    s.message(s.send(s.a, 15044, { friend_id: 1952, op_type: 0 }), 83);
    s.befriend();
    localPresence(s.store, 1952, true);
    const packets = s.a.tick();
    assert.equal(s.message(packets, 160).other_id, 1952);
    s.seed(s.b);
    s.plant(s.b, 0);
    s.advance(3600000);
    s.send(s.b, 15044, { friend_id: 1952, op_type: 0 });
    s.care(s.a, 1952, 0);
    const before = s
        .farm(1952)
        .model.farmLandInfo.find((p: Message) => p.pos === 0).reward_count,
      gold = s.a.state.economy.gold_total_count;
    s.send(s.a, 15044, { friend_id: 1952, op_type: 14, pos: 0 });
    assert.equal(s.a.state.economy.gold_total_count - gold >= 6000, true);
    const after = s
      .farm(1952)
      .model.farmLandInfo.find((p: Message) => p.pos === 0);
    assert.equal(after.reward_count, before - 6000);
    assert.deepEqual(after.stolenUsers, [1951]);
    s.b.persist();
    assert.equal(
      s.farm(1952).model.farmLandInfo.find((p: Message) => p.pos === 0)
        .reward_count,
      after.reward_count,
    );
    s.message(s.send(s.a, 15044, { friend_id: 1952, op_type: 14, pos: 0 }), 83);
    assert.equal(
      s.farm(1952).model.farmLandInfo.find((p: Message) => p.pos === 0)
        .stolen_count,
      1,
    );
    assert.ok(
      s.b
        .tick()
        .some((p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 4387),
    );
    s.send(s.a, 15004, { other_id: 1952 });
    s.b.tick();
    assert.equal(s.b.saved.friends!.length, 0);
    s.message(s.send(s.a, 15044, { friend_id: 1952, op_type: 0 }), 83);
  } finally {
    s.cleanup();
  }
});
test("roubo com falha de save reverte dono, inventário, contador diário e moedas do visitante", () => {
  const s = setup();
  try {
    s.befriend();
    s.seed(s.b);
    s.plant(s.b, 0);
    s.advance(3600000);
    s.send(s.b, 15044, { friend_id: 1952, op_type: 0 });
    s.care(s.b, 1952, 0);
    const before = JSON.stringify(s.farm(1952));
    const gold = s.a.state.economy.gold_total_count;
    s.store.db.exec(
      "CREATE TRIGGER fail_owner_save BEFORE UPDATE ON city_worlds WHEN NEW.user_id=1951 BEGIN SELECT RAISE(ABORT,'forced farm failure'); END",
    );
    assert.throws(
      () => s.send(s.a, 15044, { friend_id: 1952, op_type: 14, pos: 0 }),
      /forced farm failure/,
    );
    assert.equal(JSON.stringify(s.farm(1952)), before);
    assert.equal(s.a.state.economy.gold_total_count, gold);
  } finally {
    s.cleanup();
  }
});
test("árvore própria usa intervalo de dez minutos e árvore de amigo permite uma energização diária", () => {
  const s = setup();
  try {
    s.level(s.a, 11);
    s.level(s.b, 11);
    s.befriend();
    const response = s.send(s.a, 15017, { user_id: 1951 });
    assert.equal(s.message(response, 147).tree[0].waterCount, 1);
    s.message(s.send(s.a, 15017, { user_id: 1951 }), 83);
    s.advance(600000);
    s.send(s.a, 15017, { user_id: 1951 });
    assert.equal(s.farm(1951).model.tree_info.waterCount, 2);
    s.send(s.a, 15017, { user_id: 1952 });
    assert.equal(s.farm(1952).model.tree_info.waterCount, 1);
    s.message(s.send(s.a, 15017, { user_id: 1952 }), 83);
    assert.ok(s.farm(1951).model.today_from_friend_gp > 0);
    assert.equal(s.message(s.b.tick(), 147).tree[0].userId, 1952);
  } finally {
    s.cleanup();
  }
});
test("bootstrap elimina personagens capturados, convites e fazendas herdadas", () => {
  const s = setup();
  try {
    s.a.saved.friends = [{ user_id: 1605, relation: 1 }];
    s.a.state.packets[84] = {
      opcode: 84,
      message: { other_id: 1605, nick_name: "Fantasma", relation: 1 },
    };
    s.a.state.farms[1605] = { user_id: 1605 };
    s.a.persist();
    const restored = s.reload(1951),
      packets = restored.bootstrap().map((p) => Buffer.from(p.frame, "base64"));
    assert.equal(restored.saved.friends!.length, 0);
    assert.deepEqual(Object.keys(restored.state.farms), ["1810"]);
    assert.equal(
      packets.some((p) => p.readUInt16BE(6) === 84),
      false,
    );
    assert.equal(
      s.message(restored.bootstrap(), 4157).friendFarmState?.length ?? 0,
      0,
    );
  } finally {
    s.cleanup();
  }
});

test("duas sessões TCP isolam recibos/erros, não repetem no login e sincronizam amizade, fazenda e presença", async () => {
  const s = setup(),
    sockets: Socket[] = [],
    errors: unknown[] = [];
  let game: GameServer | undefined;
  try {
    mkdirSync(join(s.store.dir, "tutorial"));
    copyFileSync(
      join(projectRoot, "data/tutorial/scenario.json"),
      join(s.store.dir, "tutorial/scenario.json"),
    );
    for (const world of [s.a, s.b]) {
      s.level(world, 11);
      s.seed(world);
      world.state.items["1:0:91"] = {
        id: 999800 + world.userId, exist: 1, template_id: 2030102, count: 3,
        bag_type: 1, object_id: 0, pos: 91, bind: 1, used: 0,
      };
      world.persist();
      s.store.db
        .prepare("INSERT INTO tutorial_worlds(user_id,state) VALUES(?,?)")
        .run(
          world.userId,
          JSON.stringify({
            version: 1,
            wins: [0, 1, 2],
            process: 25000,
            cityEntered: true,
            complete: true,
            rewardCount: 3,
          }),
        );
    }
    const auth = new ReplayAuth(s.store);
    game = new GameServer(
      {
        ...loadConfig(),
        dataDir: s.store.dir,
        mode: "tutorial",
        tutorialEngine: "dynamic",
        resourceMode: "offline",
        capturePackets: false,
        gamePort: 0,
      },
      s.store,
      auth,
      (event, detail) => {
        if (event.includes("error")) errors.push(detail);
      },
    );
    await game.listen();
    const connect = async (id: number, name: string) => {
      const cipher = publicEncrypt(
        {
          key: createPublicKey({ key: auth.jwk, format: "jwk" }),
          padding: constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(`${name}|${s.store.issue(id)}|${1234567 + id}|${id}`),
      ).toString("base64");
      const { proof } = auth.login(cipher);
      const socket = createConnection({
        host: "127.0.0.1",
        port: (game!.server.address() as AddressInfo).port,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      const received: { opcode: number; recipient: number; message: Message }[] = [],
        reader = new FrameReader();
      const key = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
      reader.key = Buffer.from(key);
      const sendKey = Buffer.from(key);
      socket.on("data", (chunk) => {
        try {
          reader.push(chunk, (p) => {
            const opcode = p.readUInt16BE(6),
              schema = s.a.scenario.incoming[opcode];
            received.push({
              opcode,
              recipient: p.readInt32BE(8),
              message: schema ? decodeMessage(schema, p.subarray(20)) : {},
            });
          });
        } catch (error) {
          errors.push(error);
        }
      });
      const wait = async (
        opcode: number,
        after = 0,
        predicate: (m: Message) => boolean = () => true,
      ) => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const packet = received
            .slice(after)
            .find((p) => p.opcode === opcode && predicate(p.message));
          if (packet) return packet.message;
          assert.deepEqual(errors, []);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(
          `Sessão ${id} não recebeu ${opcode}: ${JSON.stringify(errors)}`,
        );
      };
      const raw = (opcode: number, body: Buffer) => socket.write(crypt(frame(opcode,id,body),sendKey));
      const send = (opcode: number, message: Message = {}) =>
        socket.write(
          crypt(
            frame(
              opcode,
              id,
              [15005,8198].includes(opcode) || s.a.scenario.outgoing[opcode]
                ? encodeMessage([15005,8198].includes(opcode) ? typeName("chat.ChatChannelMsg") : s.a.scenario.outgoing[opcode], message)
                : Buffer.alloc(0),
            ),
            sendKey,
          ),
        );
      socket.write(
        crypt(
          frame(
            20001,
            id,
            Buffer.concat([
              protoString(2, proof),
              ...Array.from(key, (k) => protoInt(3, k)),
            ]),
          ),
          Buffer.from(INITIAL_KEY),
        ),
      );
      send(8271);
      await wait(6);
      return { socket, received, send, raw, wait };
    };
    let a = await connect(1951, "AnaLocal");
    const b = await connect(1952, "BetoLocal");
    assert.deepEqual([...s.store.onlineUsers].sort(), [1951, 1952]);
    const titleWorld = game.world(1951).city()!;
    recordTitleAcquisition(titleWorld.saved.titles!, titleCatalog, 26, Date.now(), null, { system: "test", reference: "tcp-title" });
    titleWorld.persist();
    const titleMark = a.received.length;
    a.send(8597, { appellId: 26, look: 0 });
    assert.equal((await a.wait(3, titleMark, m => m.appell_id === 26)).appell_id, 26);
    assert.equal((await a.wait(4484, titleMark)).appells.find((t: Message) => t.appellId === 26).isGet, 1);
    assert.equal(game.world(1952).city()!.currentTitleIdentity().id, 0);
    const globalAtA = a.received.length, globalAtB = b.received.length;
    a.send(8198, { encode_msg: "Olá, servidor!", name: "Falso", other_id: 1952, job: 1, appellid: 999999 });
    const globalA = await a.wait(83, globalAtA, m => m.channel === 10);
    const globalB = await b.wait(83, globalAtB, m => m.channel === 10);
    assert.equal(globalA.encode_msg, "Olá, servidor!");
    assert.deepEqual(globalA, globalB);
    assert.equal(globalB.name, "AnaLocal"); assert.equal(globalB.other_id, 1951); assert.equal(globalB.job, 0);
    assert.equal(globalB.appellid, 26);
    assert.equal(a.received.slice(globalAtA).filter(p => p.opcode === 83 && p.message.channel === 10).length, 1);
    assert.equal(b.received.slice(globalAtB).filter(p => p.opcode === 83 && p.message.channel === 10).length, 1);
    assert.equal(a.received.find(p => p.message.channel === 10)!.recipient, 1951);
    assert.equal(b.received.find(p => p.message.channel === 10)!.recipient, 1952);
    const blockedGlobal = a.received.length, globalPeerMark = b.received.length;
    a.send(15005, { channel: 5, encode_msg: "Não vazar guilda" });
    await a.wait(83, blockedGlobal, m => m.channel === 3);
    b.send(15044, { friend_id: 1952, op_type: 0 }); await b.wait(4386, globalPeerMark);
    assert.equal(b.received.slice(globalPeerMark).filter(p => [83,111].includes(p.opcode)).length, 0);
    const receipt = (m: Message) => String(m.encode_msg).includes("pelo consumo de");
    const feedback = (rows: typeof a.received) => rows.filter(p => [83,111].includes(p.opcode));
    const aStart = a.received.length, bStart = b.received.length;
    a.send(5006, { bag_type: 1, pos: 91, count: 1 });
    const first = await a.wait(111, aStart, receipt);
    assert.match(String(first.encode_msg), /500000 de ouro/);
    b.send(15044, { friend_id: 1952, op_type: 0 });
    await b.wait(4386, bStart);
    assert.deepEqual(feedback(a.received.slice(aStart)).filter(p => receipt(p.message)).map(p => p.opcode), [83,111]);
    assert.equal(feedback(b.received.slice(bStart)).filter(p => receipt(p.message)).length, 0);
    const aSecond = a.received.length, bSecond = b.received.length;
    b.send(5006, { bag_type: 1, pos: 91, count: 2 });
    const second = await b.wait(111, bSecond, receipt);
    assert.match(String(second.encode_msg), /1000000 de ouro/);
    a.send(15044, { friend_id: 1951, op_type: 0 });
    await a.wait(4386, aSecond);
    assert.equal(feedback(a.received.slice(aSecond)).filter(p => receipt(p.message)).length, 0);
    for (const [client, id] of [[a,1951],[b,1952]] as const) {
      const rows = feedback(client.received).filter(p => receipt(p.message));
      assert.deepEqual(rows.map(p => p.opcode), [83,111]);
      assert.ok(rows.every(p => p.recipient === id && (p.opcode !== 83 || p.message.other_id === id)));
    }
    const failedAt = a.received.length, untouchedAt = b.received.length;
    a.send(5006, { bag_type: 1, pos: 91, count: 999 });
    await a.wait(83, failedAt, m => !receipt(m));
    b.send(15044, { friend_id: 1952, op_type: 0 });
    await b.wait(4386, untouchedAt);
    assert.equal(feedback(a.received.slice(failedAt)).filter(p => receipt(p.message)).length, 0);
    assert.equal(feedback(b.received.slice(untouchedAt)).length, 0);
    a.socket.destroy();
    const disconnectDeadline = Date.now() + 5000;
    while (s.store.onlineUsers.has(1951) && Date.now() < disconnectDeadline)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(s.store.onlineUsers.has(1951), false);
    a = await connect(1951, "AnaLocal");
    // connect waits for the city's state packet (6), after its bootstrap updates.
    assert.equal(feedback(a.received).filter(p => receipt(p.message)).length, 0);
    assert.equal(a.received.filter(p => p.opcode === 83 && p.message.channel === 10).length, 0);
    a.send(5006, { bag_type: 1, pos: 91, count: 1 });
    await a.wait(111, 0, receipt);
    assert.deepEqual(feedback(a.received).filter(p => receipt(p.message)).map(p => p.opcode), [83,111]);
    a.send(15003, { nick_name: "BetoLocal", relation: 1 });
    await b.wait(84);
    const aMark = a.received.length,
      bMark = b.received.length;
    b.send(15012, { nick_name: "AnaLocal" });
    await a.wait(78, aMark);
    await b.wait(78, bMark);
    assert.ok(new SocialFeature(s.store, 1951).canVisit(1952));
    a.send(15044, { friend_id: 1952, op_type: 0 });
    await a.wait(4386, 0, (m) => m.user_id === 1952);
    const plantMark = a.received.length;
    b.send(15044, {
      friend_id: 1952,
      op_type: 1,
      pos: 0,
      template_id: 2160003,
      bag_pos: 90,
    });
    const updated = await a.wait(
      4387,
      plantMark,
      (m) =>
        m.user_id === 1952 &&
        m.farmLandInfo.some(
          (p: Message) => p.pos === 0 && p.item_template_id === 2160003,
        ),
    );
    assert.equal(
      updated.farmLandInfo.find((p: Message) => p.pos === 0).item_template_id,
      2160003,
    );
    const treeMark = b.received.length;
    a.send(15017, { user_id: 1952 });
    await a.wait(146, 0, (m) => m.harvestMsg.length === 1);
    await b.wait(147, treeMark, (m) =>
      m.tree.some((t: Message) => t.userId === 1952 && t.waterCount === 1),
    );
    const cityA = game.world(1951).city()!;
    cityA.saved.labyrinth = { version: 1, floor: 1, cleared: [], entered: false };
    cityA.persist();
    const mazeMark = a.received.length;
    a.send(8296, { choose_index: 1, campaign_id: 8001, is_double: 1 });
    await a.wait(125, mazeMark);
    const prepareMark = a.received.length;
    a.raw(5125, protoInt(1, 800102));
    const battlePrepare = await a.wait(157, prepareMark);
    assert.equal(battlePrepare.battle_id, cityA.saved.battle!.id);
    a.raw(10007, protoString(2, battlePrepare.battle_id));
    await a.wait(153, prepareMark);
    assert.equal(cityA.saved.battle!.ready, true);
    const offlineMark = a.received.length;
    b.socket.destroy();
    await a.wait(161, offlineMark, (m) => m.other_id === 1952);
    assert.equal(s.store.onlineUsers.has(1952), false);
    assert.deepEqual(errors, []);
  } finally {
    for (const socket of sockets) socket.destroy();
    if (game) await game.close();
    s.cleanup();
  }
});

test("colheita da árvore entrega três mensagens visuais e recompensa apenas uma vez", () => {
  const s = setup();
  try {
    s.level(s.a, 11);
    for (let i = 0; i < 40 && !s.farm(1951).model.tree_info.fruitCount; i++) {
      s.send(s.a, 15017, { user_id: 1951 });
      s.advance(600000);
    }
    assert.equal(s.farm(1951).model.tree_info.fruitCount, 1);
    const result = s.send(s.a, 5178, { user_id: 1951, index: 0 });
    assert.equal(s.message(result, 106).pickMsg.length, 3);
    assert.equal(result.some(p => [83,111].includes(Buffer.from(p.frame, "base64").readUInt16BE(6))), false);
    const xp = s.a.state.player.totalGp;
    s.message(s.send(s.a, 5178, { user_id: 1951, index: 0 }), 83);
    assert.equal(s.a.state.player.totalGp, xp);
  } finally {
    s.cleanup();
  }
});

function systemFeedback(result: { frame: string }[]) {
  return result.map(p => Buffer.from(p.frame, "base64")).filter(p => [83,111].includes(p.readUInt16BE(6)));
}

test("colheita informa somente o crédito real no chat, sem popup duplicado, produção passiva ou reenvio", () => {
  const s = setup();
  try {
    s.seed(s.a); s.plant(s.a, 0); s.advance(3600000);
    s.send(s.a, 15044, { friend_id: 1951, op_type: 0 });
    s.care(s.a, 1951, 0);
    const amount = s.farm(1951).model.farmLandInfo.find((p: Message) => p.pos === 0).reward_count;
    const result = s.send(s.a, 15044, { friend_id: 1951, op_type: 6, pos: 0 });
    assert.equal(systemFeedback(result).length, 1);
    const chat = s.message(result, 83);
    assert.equal(chat.is_centerTip, 0);
    assert.equal(chat.other_id, 1951);
    assert.equal(chat.encode_msg, `Você recebeu ${amount} de ouro pela colheita da fazenda.`);
    const balance = s.a.state.economy.gold_total_count;
    const retry = s.send(s.a, 15044, { friend_id: 1951, op_type: 6, pos: 0 });
    assert.equal(s.a.state.economy.gold_total_count, balance);
    assert.equal(String(s.message(retry, 83).encode_msg).startsWith("Você recebeu"), false);
    assert.equal(s.message(retry, 4387).farmLandInfo[0].result, 1);
    assert.equal(s.message(retry, 83).is_centerTip, 0);
    assert.equal(s.reload(1951).bootstrap().some(p => {
      const f = Buffer.from(p.frame, "base64");
      return f.readUInt16BE(6) === 83 && String(decodeMessage(s.a.scenario.incoming[83], f.subarray(20)).encode_msg).includes("pela colheita da fazenda");
    }), false);
  } finally { s.cleanup(); }
});

test("falha de save na colheita desfaz o crédito e não entrega mensagem de sucesso", () => {
  const s = setup();
  try {
    s.seed(s.a); s.plant(s.a, 0); s.advance(3600000);
    s.send(s.a, 15044, { friend_id: 1951, op_type: 0 }); s.care(s.a, 1951, 0);
    const before = structuredClone(s.a.state), plot = structuredClone(s.farm(1951));
    s.store.db.exec("CREATE TRIGGER harvest_message_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'harvest message rollback'); END");
    assert.throws(() => s.send(s.a, 15044, { friend_id: 1951, op_type: 6, pos: 0 }), /harvest message rollback/);
    assert.deepEqual(s.a.state, before); assert.deepEqual(s.farm(1951), plot);
    s.store.db.exec("DROP TRIGGER harvest_message_fail");
    const result = s.send(s.a, 15044, { friend_id: 1951, op_type: 6, pos: 0 });
    assert.equal(systemFeedback(result).length, 1);
    assert.match(String(s.message(result, 83).encode_msg), /pela colheita da fazenda/);
  } finally { s.cleanup(); }
});

test("cuidados e compra de sementes preservam apenas retorno nativo, sem mensagem central redundante", () => {
  const s = setup();
  try {
    s.seed(s.a); s.plant(s.a, 0);
    const data = s.farm(1951);
    data.model.grades = 2; // Native shop gate for offer 60002 is the farm level.
    data.model.farmLandInfo.find((p: Message) => p.pos === 0).is_worm = 1;
    delete data.care?.[0];
    s.store.db.prepare("UPDATE local_farms SET state=? WHERE user_id=?").run(JSON.stringify(data), 1951);
    const result = s.send(s.a, 15044, { friend_id: 1951, op_type: 2, pos: 0 });
    assert.equal(s.message(result, 4387).farmLandInfo[0].result, 0);
    assert.equal(systemFeedback(result).length, 0);
    const sync = s.send(s.a, 15044, { friend_id: 1951, op_type: 0 });
    assert.ok(s.message(sync, 4386).farmLandInfo.every((p: Message) => p.result === undefined && p.op_type === undefined));
    const bought = s.send(s.a, 5154, { buyInfo: { good_id: 60002, count: 1, receive_id: 1951, type: 6 }, pay_type: 0 });
    assert.equal(s.message(bought, 90).buyInfo.result, 1);
    assert.equal(systemFeedback(bought).length, 0);
  } finally { s.cleanup(); }
});

test("roubo informa ganhos apenas ao visitante; dono recebe atualização nativa e nenhum anúncio de recompensa", () => {
  const s = setup();
  try {
    s.befriend(); s.seed(s.b); s.plant(s.b, 0); s.advance(3600000);
    s.send(s.b, 15044, { friend_id: 1952, op_type: 0 }); s.care(s.b, 1952, 0);
    s.a.tick(); s.b.tick();
    const result = s.send(s.a, 15044, { friend_id: 1952, op_type: 14, pos: 0 });
    assert.equal(systemFeedback(result).length, 1);
    assert.equal(s.message(result, 83).other_id, 1951);
    assert.equal(s.message(result, 83).is_centerTip, 0);
    assert.match(String(s.message(result, 83).encode_msg), /pela colheita na fazenda de um amigo/);
    assert.equal(systemFeedback(s.b.tick()).length, 0);
  } finally { s.cleanup(); }
});

test("energização nativa não recebe um segundo aviso e erros sem retorno de terreno mantêm destaque", () => {
  const s = setup();
  try {
    s.level(s.a, 11);
    const water = s.send(s.a, 15017, { user_id: 1951 });
    assert.equal(s.message(water, 146).harvestMsg.length, 1);
    assert.equal(systemFeedback(water).length, 0);
    const error = s.send(s.a, 15044, { friend_id: 1951, op_type: 11 });
    assert.equal(s.message(error, 83).is_centerTip, 1);
  } finally { s.cleanup(); }
});


test("X-Clique colhe plantas elegíveis uma vez sem comprar sementes nem gastar diamantes",()=>{
 const s=setup();try{
  s.seed(s.a,3);s.plant(s.a,0);s.plant(s.a,1);
  const before=s.a.state.player.point,seedCount=s.a.state.items["1:0:90"]!.count;
  s.advance(3600000);s.send(s.a,15044,{op_type:25});
  const f=s.farm(1951).model;
  assert.equal(f.farmLandInfo.filter((p:Message)=>p.pos<2&&p.item_template_id).length,0);
  assert.equal(s.a.state.items["1:0:90"]!.count,seedCount);
  assert.equal(s.a.state.player.point,before);
  const gold=s.a.state.economy.gold_total_count;
  s.send(s.a,15044,{op_type:25});assert.equal(s.a.state.economy.gold_total_count,gold);
 }finally{s.cleanup();}
});
test("X-Clique da pastagem ignora falta de alimento e ainda cuida dos outros animais",()=>{
 const s=setup();try{
  s.level(s.a,30);s.seed(s.a,2,2131261);s.plant(s.a,1000);s.plant(s.a,1001);
  const f=s.farm(1951);f.model.land_grades=10;
  const a=f.model.farmLandInfo.find((p:Message)=>p.pos===1001);a.is_ill=1;
  s.store.db.prepare("UPDATE local_farms SET state=? WHERE user_id=1951").run(JSON.stringify(f));
  s.send(s.a,15044,{op_type:26});
  const after=s.farm(1951).model.farmLandInfo.find((p:Message)=>p.pos===1001);
  assert.equal(after.is_hunger,1);assert.equal(after.is_ill,0);
  s.seed(s.a,10,2131250);s.send(s.a,15044,{op_type:26});
  const fed=s.farm(1951).model.farmLandInfo.find((p:Message)=>p.pos===1001);
  assert.equal(fed.is_hunger,0);assert.equal(fed.reward_count,30);
  assert.equal(Date.parse(fed.mature_time)-Date.parse(fed.feed_time),8*3600000);
  s.advance(8*3600000);s.send(s.a,15044,{op_type:26});
  assert.ok(Object.values(s.a.state.items).some(i=>i.template_id===2131264&&i.count>0));
  const count=Object.values(s.a.state.items).filter(i=>i.template_id===2131264).reduce((n,i)=>n+i.count,0);
  s.send(s.a,15044,{op_type:26});
  assert.equal(Object.values(s.a.state.items).filter(i=>i.template_id===2131264).reduce((n,i)=>n+i.count,0),count);
 }finally{s.cleanup();}
});


test("CityWorld entrega os modelos reais da Navegação no login e roteia 9600 sem captura prévia",()=>{
 const s=setup();try{
  s.level(s.a,50);s.a.state.player.point=500;s.a.persist();const reply=s.a.bootstrap();
  const decode=(packets:Message[])=>{const packet=packets.map(p=>Buffer.from(p.frame,"base64")).find(p=>p.readUInt16BE(6)===342)!;assert.ok(packet);return decodeMessage(typeName("pet.NavigationMsg"),packet.subarray(20));};
  assert.equal(decode(reply).boat.length,1);assert.equal(decode(reply).port.length,3);
  const points=s.a.state.player.point;
  const packet=frame(9600,1951,encodeMessage(typeName("pet.NavigationOpMsg"),{op:8}));
  const update=s.a.handle(packet);assert.equal(decode(update).strength,200);assert.equal(s.a.state.player.point,points-100);
  const reloaded=s.reload(1951);assert.equal(decode(reloaded.bootstrap()).strength,200);
 }finally{s.cleanup();}
});


test("moradia consulta sem cobrar, compra por 10 milhões uma vez, decora e coleta renda offline",()=>{
 const s=setup();try{s.level(s.a,11);s.a.state.economy.gold_total_count=100000000;s.a.state.player.gift_token=1000;s.a.persist();
 const home=(packets:Message[])=>{const wire=packets.map(p=>Buffer.from(p.frame,"base64")).find(p=>p.readUInt16BE(6)===4753);assert.ok(wire);return decodeMessage(typeName("children.HomeMsg"),wire.subarray(20));};
 const before=s.a.state.economy.gold_total_count;s.send(s.a,8873,{op_type:1005,property1:1951});assert.equal(s.a.state.economy.gold_total_count,before);assert.equal(s.a.saved.residence!.owned,false);
 const entered=s.send(s.a,8873,{op_type:1003,property1:1951});assert.equal(s.a.saved.map,5601);assert.equal(s.a.state.economy.gold_total_count,before-10000000);assert.equal(home(entered).furniture.length,2);
 s.send(s.a,8873,{op_type:1003,property1:1951});assert.equal(s.a.state.economy.gold_total_count,before-10000000);
 const bought=s.send(s.a,8873,{op_type:2,property1:303001,pay_type:0});assert.equal(home(bought).furniture.length,3);assert.equal(s.a.state.player.gift_token,900);assert.ok(s.a.saved.residence!.rate>100000);
 s.advance(3600000);const row=Object.values(s.a.saved.residence!.layout!).find(r=>r.templateId===303001)!;
 s.send(s.a,8873,{op_type:3,furniture:[{id:row.id,pos_x:2,pos_y:3,rotation:0}]});const produced=s.a.saved.residence!.accrued;assert.ok(produced>=100000);
 const reloaded=s.reload(1951);assert.equal(home(reloaded.bootstrap()).furniture.length,3);assert.equal(reloaded.saved.residence!.layout![row.id]!.pos_x,2);
 s.send(reloaded,8873,{op_type:7});assert.equal(reloaded.saved.residence!.accrued,0);
 const credits=()=>s.store.db.prepare("SELECT COALESCE(SUM(delta),0) n FROM currency_transactions WHERE user_id=1951 AND reason='residence:collect'").get()!.n;
 assert.equal(credits(),produced);s.send(reloaded,8873,{op_type:7});assert.equal(credits(),produced);
 s.send(reloaded,5120,{});assert.equal(reloaded.saved.map,1);
 }finally{s.cleanup();}
});
test("moradia nega compra sem saldo e reverte todas as mudanças se a gravação falhar",()=>{
 const s=setup();try{s.level(s.a,11);s.a.state.economy.gold_total_count=100;s.a.persist();s.message(s.send(s.a,8873,{op_type:1003}),83);assert.equal(s.a.saved.residence!.owned,false);assert.equal(s.a.saved.map,1);
 s.a.state.economy.gold_total_count=100000000;s.a.persist();s.store.db.exec("CREATE TRIGGER fail_house BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'house-save-failure'); END");
 const balance=s.a.state.economy.gold_total_count;assert.throws(()=>s.send(s.a,8873,{op_type:1003}),/house-save-failure/);assert.equal(s.a.saved.residence!.owned,false);assert.equal(s.a.saved.map,1);assert.equal(s.a.state.economy.gold_total_count,balance);
 }finally{s.cleanup();}
});

test("convite de navegação chega ao amigo, auxílio acelera uma vez sem movimento e premia só o ajudante",()=>{
 const s=setup();try{s.level(s.a,50);s.level(s.b,50);s.befriend();const nav=(id:number)=>JSON.parse(String(s.store.db.prepare("SELECT state FROM local_navigation WHERE user_id=?").get(id)!.state));
 const send=(w:CityWorld,r:Message)=>w.handle(frame(9600,w.userId,encodeMessage(typeName("pet.NavigationOpMsg"),r)));
 s.a.bootstrap();s.b.bootstrap();setCurrencyBalance(s.a.state,"navigationCoin",1000);
 send(s.a,{op:3,param1:"1"});const before=nav(1951).boats[0].cd;send(s.a,{op:4,param1:"1",param5:[1952]});const invited=nav(1951),token=Object.keys(invited.invitations)[0]!;
 assert.ok(new SocialFeature(s.store,1952).drain().some(p=>p.opcode===343));const movement=nav(1952).strength;
 send(s.b,{op:5,param1:"1",param2:token,param3:1951});assert.equal(nav(1951).boats[0].cd,before-600000);assert.equal(nav(1952).strength,movement);assert.equal(nav(1952).assists,1);
 send(s.b,{op:5,param1:"1",param2:token,param3:1951});assert.equal(nav(1951).boats[0].cd,before-600000);assert.equal(nav(1952).assists,1);
 assert.equal(s.store.db.prepare("SELECT SUM(delta) n FROM currency_transactions WHERE user_id=1952 AND reason='navigation:assist'").get()!.n,40);
 }finally{s.cleanup();}
});

test("carregamento da moradia não reinicia a cena ao receber o callback 5038",()=>{
 const s=setup();try{s.level(s.a,11);s.a.state.economy.gold_total_count=100000000;s.a.persist();
 const opcodes=(packets:Message[])=>packets.map(p=>Buffer.from(p.frame,"base64").readUInt16BE(6));
 assert.equal(opcodes(s.send(s.a,8873,{op_type:1003,property1:1951})).filter(op=>op===125).length,1);
 for(let i=0;i<5;i++)assert.deepEqual(opcodes(s.send(s.a,5038,{para_int1:5601})),[]);
 const reloaded=s.reload(1951);assert.equal(opcodes(reloaded.bootstrap()).filter(op=>op===125).length,1);
 assert.deepEqual(opcodes(s.send(reloaded,5038,{para_int1:5601})),[]);assert.equal(reloaded.saved.map,5601);
 assert.equal(reloaded.state.economy.gold_total_count,90000000);
 }finally{s.cleanup();}
});

test("relógio enviado no login e em capturas antigas usa o mesmo epoch das recargas",()=>{
 const s=setup();try{s.level(s.a,50);const time=s.message(s.a.bootstrap(),4234);assert.equal(time.sys_millisecond,s.now());
 const stale=s.a.packet({opcode:4234,message:{sys_curtime:"2000-01-01 00:00:00",sys_millisecond:1}});assert.equal(s.message([stale],4234).sys_millisecond,s.now());
 const reply=s.a.handle(frame(9600,s.a.userId,encodeMessage(typeName("pet.NavigationOpMsg"),{op:10,param1:"1"}))),wire=reply.map(p=>Buffer.from(p.frame,"base64")).find(p=>p.readUInt16BE(6)===342)!;
 const model=decodeMessage(typeName("pet.NavigationMsg"),wire.subarray(20));assert.equal(model.port.find((p:Message)=>p.id==="1").cd/1000-time.sys_millisecond/1000,1200);
 s.advance(60000);assert.equal(s.message(s.a.bootstrap(),4234).sys_millisecond,s.now());
 }finally{s.cleanup();}
});

test("compras nativas 8970 da fazenda/pastagem entregam itens e debitam ouro com rollback integral",()=>{
 const s=setup();try{s.level(s.a,30);s.a.state.economy.gold_total_count=100000000;s.a.persist();const before=s.a.state.economy.gold_total_count;
 const reply=s.send(s.a,8970,{receiveUserId:1951,discountTempId:0,carItemInfo:[{shopId:60005,counts:3,payType:1,isDiscountShop:0}]});assert.equal(s.message(reply,4783).result,0);assert.equal(s.a.state.economy.gold_total_count,before-1500);assert.equal(Object.values(s.a.state.items).filter(i=>i.template_id===2160006).reduce((n,i)=>n+i.count,0),3);
 s.store.db.prepare("UPDATE local_farms SET state=json_set(state,'$.model.grades',11) WHERE user_id=1951").run();
 s.send(s.a,8970,{receiveUserId:1951,discountTempId:0,carItemInfo:[{shopId:61001,counts:1,payType:1,isDiscountShop:0}]});assert.ok(Object.values(s.a.state.items).some(i=>i.template_id===2131250));
 const items=structuredClone(s.a.state.items),gold=s.a.state.economy.gold_total_count;const invalid=s.send(s.a,8970,{receiveUserId:1952,discountTempId:0,carItemInfo:[{shopId:60005,counts:1,payType:1,isDiscountShop:0}]});s.message(invalid,83);assert.deepEqual(s.a.state.items,items);assert.equal(s.a.state.economy.gold_total_count,gold);
 s.store.db.exec("CREATE TRIGGER fail_farm_cart BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'cart-save-failure'); END");assert.throws(()=>s.send(s.a,8970,{receiveUserId:1951,discountTempId:0,carItemInfo:[{shopId:60005,counts:1,payType:1,isDiscountShop:0}]}),/cart-save-failure/);assert.deepEqual(s.a.state.items,items);assert.equal(s.a.state.economy.gold_total_count,gold);
 }finally{s.cleanup();}
});

test("moradia compartilha jogadores, movimento e layout somente entre visitantes da mesma casa",()=>{
 const s=setup();try{for(const w of [s.a,s.b]){s.level(w,30);w.state.economy.gold_total_count=100000000;w.persist();}s.befriend();s.send(s.a,8873,{op_type:1003,property1:1951});
 const visitor=s.send(s.b,8873,{op_type:1003,property1:1951});assert.ok(s.message(visitor,21).player.some((p:Message)=>p.player_id===1951));assert.ok(s.message(s.a.tick(),21).player.some((p:Message)=>p.player_id===1952));
 const routes=[{x:500,y:720},{x:520,y:720}];const moved=s.b.handle(frame(5124,1952,encodeMessage(typeName("worldmap.PosMoveMsg"),{map_id:5601,army_id:1952,routes})));assert.ok(!moved.some(p=>Buffer.from(p.frame,'base64').readUInt16BE(6)===4185));assert.equal(s.message(s.a.tick(),4185).army_id,1952);assert.equal(s.b.state.army.cur_pos_x,26);
 const denial=s.send(s.b,8873,{op_type:3,furniture:[]});s.message(denial,83);assert.ok(Object.values(s.a.saved.residence!.layout!).some(i=>i.pos_x===0));
 s.send(s.a,8873,{op_type:3,furniture:[]});assert.ok(s.message(s.b.tick(),4753).furniture.every((i:Message)=>i.pos_x<0));s.b.disconnect();assert.equal(s.message(s.a.tick(),22).player_id,1952);assert.ok(!s.a.tick().some(p=>Buffer.from(p.frame,'base64').readUInt16BE(6)===22));
 s.send(s.b,8873,{op_type:1003,property1:1952});assert.ok(!s.a.tick().some(p=>Buffer.from(p.frame,"base64").readUInt16BE(6)===21));s.a.disconnect();s.b.disconnect();
 }finally{s.cleanup();}
});
