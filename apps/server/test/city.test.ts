import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld, type CityCase } from "../src/city-world.js";
import { cityDiff } from "../src/city-state.js";
import {
  campaignDefinitions,
  campaignBattleIndices,
} from "../src/features/campaign/index.js";
import {
  frame,
  protoString,
  protoInt,
  FrameReader,
  crypt,
  INITIAL_KEY,
} from "../src/protocol.js";
import { createConnection, type Socket, type AddressInfo } from "node:net";
import { decodeMessage, encodeMessage } from "../src/messages.js";
import { ReplayAuth } from "../src/store.js";
import { loadConfig } from "../src/config.js";
import { GameServer } from "../src/game.js";
import { buildHttp } from "../src/http.js";
import { publicEncrypt, createPublicKey, constants } from "node:crypto";
import { inflateSync } from "node:zlib";
import { characterLevels } from "../src/features/fashion/index.js";
import {
  currencies,
  currencyBalance,
  type Currency,
} from "../src/features/currencies/index.js";
const source = JSON.parse(
  readFileSync(join(projectRoot, "data/city/scenario.json"), "utf8"),
);
function setup() {
  const base = join(projectRoot, ".test-data");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "city-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(
    join(projectRoot, "data/city/scenario.json"),
    join(dir, "city/scenario.json"),
  );
  const store = new Store(dir);
  store.initTutorialProfile(1901);
  store.db
    .prepare(
      "UPDATE tutorial_profiles SET active=1,icon=4,sex=0,nickname='CidadeLocal',process=19500 WHERE user_id=1901",
    )
    .run();
  let now = 1900000000000;
  const city = new CityWorld(store, 1901, () => now);
  const request = (op: number, r: any) =>
    frame(op, 1901, encodeMessage(source.outgoing[op], r));
  const send = (op: number, r: any) => city.handle(request(op, r));
  const cleanup = () => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return {
    store,
    city,
    send,
    request,
    advance: (ms = 10000) => (now += ms),
    now: () => now,
    cleanup,
  };
}
const cases = (op: number) =>
  source.cases.filter((c: CityCase) => c.opcode === op) as CityCase[];
function selectCapturedCard(
  s: ReturnType<typeof setup>,
  city = s.city,
  index = 2,
) {
  // Controlled hand keeps pre-existing reward assertions deterministic.
  city.saved.campaignRun!.cards!.deck[index] = {
    templateId: 2129006,
    count: 40,
    bind: 1,
  };
  city.persist();
  return city.handle(
    s.request(5122, { para_int1: 1901, para_int2: index, para_bool1: 0 }),
  );
}
test("coleção remove Novo sem equipar ou consumir e continua funcional após rollback e reconexão", () => {
  const s = setup();
  try {
    s.city.state.fashions[1110801] = {
      temp_id: 1110801,
      is_switch: 0,
      appraisal_skill: 0,
    };
    s.city.persist();
    const untouched = () =>
      structuredClone({
        items: s.city.state.items,
        economy: s.city.state.economy,
        hero: s.city.state.hero,
        army: s.city.state.army,
        fashion: s.city.saved.fashion,
        refinement: s.city.saved.refinement,
      });
    const before = untouched();
    const packet = frame(
      8631,
      1901,
      encodeMessage(s.city.scenario.outgoing[8631]!, { template_id: 1110801 }),
    );
    const seen = s.city.handle(packet);
    assert.equal(Buffer.from(seen[0]!.frame, "base64").readUInt16BE(6), 4542);
    assert.equal(s.city.state.fashions[1110801]!.is_switch, 1);
    assert.deepEqual(untouched(), before);
    assert.equal(
      new CityWorld(s.store, 1901, s.now).state.fashions[1110801]!.is_switch,
      1,
    );

    s.city.state.fashions[1110801]!.is_switch = 0;
    s.city.persist();
    s.store.db.exec(
      "CREATE TRIGGER fail_fashion_seen BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail fashion seen'); END",
    );
    assert.throws(() => s.city.handle(packet), /fail fashion seen/);
    assert.equal(s.city.state.fashions[1110801]!.is_switch, 0);
    assert.deepEqual(untouched(), before);
    s.store.db.exec("DROP TRIGGER fail_fashion_seen");
    s.city.handle(packet);
    assert.equal(s.city.state.fashions[1110801]!.is_switch, 1);
    assert.deepEqual(untouched(), before);
  } finally {
    s.cleanup();
  }
});
test("refinação local atualiza 408, atributos e pedras atomicamente sem alterar absorção 200", () => {
  const s = setup();
  try {
    s.city.saved.fashion = {
      level: 200,
      xp: 0,
      fields: { "1": 0, "2": 200 },
      baselineLevel: 0,
    };
    s.city.state.fashions[1110801] = {
      temp_id: 1110801,
      is_switch: 0,
      appraisal_skill: 5204,
    };
    s.city.state.items["1:0:12"] = {
      id: 2000250,
      template_id: 2131521,
      count: 10,
      bag_type: 1,
      object_id: 0,
      pos: 12,
      exist: 1,
    };
    s.city.persist();
    const before = structuredClone(s.city.state.hero),
      gold = s.city.state.economy.gold_total_count;
    const packet = frame(
      9635,
      1901,
      Buffer.concat([protoInt(1, 2), protoInt(2, 111), protoInt(3, 1)]),
    );
    const result = s.city
      .handle(packet)
      .map((p) => Buffer.from(p.frame, "base64").readUInt16BE(6));
    assert.ok(result.includes(408));
    assert.ok(result.includes(115));
    assert.deepEqual(s.city.saved.refinement![111], { level: 5, xp: 25 });
    assert.equal(s.city.state.items["1:0:12"]!.count, 9);
    assert.equal(s.city.saved.fashion.level, 200);
    assert.equal(s.city.state.economy.gold_total_count, gold);
    assert.equal(
      s.city.state.hero.total_phy_attack,
      before.total_phy_attack + 2310,
    );
    assert.equal(
      s.city.state.hero.total_magic_attack,
      before.total_magic_attack + 2310,
    );
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(
      restored.state.hero.total_phy_attack,
      s.city.state.hero.total_phy_attack,
    );
    assert.equal(restored.state.items["1:0:12"]!.count, 9);
    s.store.db.exec(
      "CREATE TRIGGER fail_refine BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail refine'); END",
    );
    const saved = structuredClone(restored.saved);
    assert.throws(() => restored.handle(packet), /fail refine/);
    assert.deepEqual(restored.saved, saved);
    s.store.db.exec("DROP TRIGGER fail_refine");
    delete restored.state.items["1:0:12"];
    const noStone = structuredClone(restored.saved);
    restored.handle(packet);
    assert.deepEqual(restored.saved, noStone);
  } finally {
    s.cleanup();
  }
});
test("avaliação drena os primeiros slots e migra bônus antigos para combate uma única vez", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 27;
    s.city.persist();
    s.city.state.fashions[1110801] = {
      temp_id: 1110801,
      is_switch: 0,
      appraisal_skill: 5200,
    };
    const primary = s.city.state.hero.total_power,
      attack = s.city.state.hero.total_phy_attack,
      defence = s.city.state.hero.total_phy_defence;
    s.city.saved.attributes!.sources["fashion:appraisal"] = {
      kind: "permanent",
      evidence: "observed-delta",
      values: { total_power: 20 },
    };
    s.city.state.hero.total_power += 20;
    s.city.persist();
    assert.equal(s.city.state.hero.total_phy_attack, attack + 80);
    assert.equal(s.city.state.hero.total_phy_defence, defence + 20);
    for (const [key, item] of Object.entries(s.city.state.items))
      if (item.template_id === 208020) delete s.city.state.items[key];
    s.city.state.items["1:0:20"] = {
      id: 2000202,
      template_id: 208020,
      count: 9931,
      bag_type: 1,
      object_id: 0,
      pos: 20,
      exist: 1,
    };
    s.city.state.items["1:0:8"] = {
      id: 2000201,
      template_id: 208020,
      count: 9984,
      bag_type: 1,
      object_id: 0,
      pos: 8,
      exist: 1,
    };
    s.city.state.items["1:0:7"] = {
      id: 2000200,
      template_id: 208020,
      count: 3,
      bag_type: 1,
      object_id: 0,
      pos: 7,
      exist: 1,
    };
    s.city.handle(
      frame(
        8781,
        1901,
        encodeMessage("com.road.yishi.proto.fashion.FashionMsg", {
          template_id: 1110801,
        }),
      ),
    );
    assert.equal(s.city.state.items["1:0:7"], undefined);
    assert.equal(s.city.state.items["1:0:8"]!.count, 9982);
    assert.equal(s.city.state.items["1:0:20"]!.count, 9931);
    assert.equal(s.city.state.hero.total_power, primary + 40);
    assert.equal(s.city.state.hero.total_phy_attack, attack + 160);
    assert.equal(s.city.state.hero.total_phy_defence, defence + 40);
    const restored = new CityWorld(s.store, 1901, s.now);
    restored.persist();
    assert.equal(restored.state.hero.total_phy_attack, attack + 160);
    assert.equal(restored.state.hero.total_phy_defence, defence + 40);
  } finally {
    s.cleanup();
  }
});
test("Experiência do email alcança 27 sem ocupar mochila ou repetir prêmio", async () => {
  const s = setup();
  try {
    await s.store.createUser("teste_xp", "local-experience-password", 1901);
    s.city.state.player.grades = 11;
    s.city.state.player.gp = 0;
    const amount = Array.from({ length: 16 }, (_, i) =>
      characterLevels.get(i + 12)!,
    ).reduce((a, b) => a + b, 0);
    const id = s.store.sendLocalItems(1901, "Experiência até 27", [
      { template: -700, count: amount },
    ]);
    s.city.persist();
    const inventory = structuredClone(s.city.state.items);
    s.send(5022, { mailsIdArray: [id], position: [0] });
    assert.equal(s.city.state.player.grades, 27);
    assert.equal(s.city.state.player.gp, 0);
    assert.deepEqual(s.city.state.items, inventory);
    const total = s.city.state.player.totalGp;
    s.send(5022, { mailsIdArray: [id], position: [0] });
    assert.equal(s.city.state.player.totalGp, total);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.player.grades, 27);
    assert.equal(restored.state.mails[id]!.isAnnex1, 1);
  } finally {
    s.cleanup();
  }
});
test("falha no save desfaz ouro e skill da avaliação", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 27;
    s.city.state.economy.gold_total_count = 2000000;
    s.city.state.fashions[1110801] = {
      temp_id: 1110801,
      is_switch: 0,
      appraisal_skill: 0,
    };
    s.city.persist();
    const before = structuredClone(s.city.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_appraisal BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail appraisal'); END",
    );
    assert.throws(
      () =>
        s.city.handle(
          frame(
            8781,
            1901,
            encodeMessage("com.road.yishi.proto.fashion.FashionMsg", {
              template_id: 1110801,
            }),
          ),
        ),
      /fail appraisal/,
    );
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db
        .prepare("SELECT COUNT(*) n FROM gold_transactions WHERE user_id=1901")
        .get()!.n,
      0,
    );
  } finally {
    s.cleanup();
  }
});
test("bolsa de ouro credita pelo ledger e avaliação cobra uma vez, persiste e respeita nível e máximo", () => {
  const s = setup();
  try {
    s.city.state.items["1:0:0"] = {
      id: 2000199,
      template_id: 2030102,
      count: 10,
      bag_type: 1,
      object_id: 0,
      pos: 0,
      exist: 1,
    };
    s.city.state.items["1:0:1"] = {
      id: 2000200,
      template_id: 208020,
      count: 20,
      bag_type: 1,
      object_id: 0,
      pos: 1,
      exist: 1,
    };
    s.city.state.fashions[1110801] = {
      temp_id: 1110801,
      is_switch: 0,
      appraisal_skill: 0,
    };
    s.city.persist();
    const startingGold = s.city.state.economy.gold_total_count;
    s.send(5006, { bag_type: 1, pos: 0, count: 10 });
    assert.equal(s.city.state.economy.gold_total_count, startingGold + 5000000);
    assert.equal(s.city.state.items["1:0:0"], undefined);
    const useAgain = s.city.state.economy.gold_total_count;
    s.send(5006, { bag_type: 1, pos: 0, count: 10 });
    assert.equal(s.city.state.economy.gold_total_count, useAgain);
    const evalPacket = frame(
      8781,
      1901,
      encodeMessage("com.road.yishi.proto.fashion.FashionMsg", {
        template_id: 1110801,
      }),
    );
    s.city.handle(evalPacket);
    assert.equal(s.city.state.fashions[1110801].appraisal_skill, 0);
    s.city.state.player.grades = 27;
    s.city.persist();
    const power = s.city.state.hero.total_power;
    s.city.handle(evalPacket);
    assert.equal(s.city.state.economy.gold_total_count, useAgain - 1000000);
    assert.ok(s.city.state.hero.total_power > power);
    for (let n = 0; n < 5; n++) s.city.handle(evalPacket);
    assert.equal(s.city.state.fashions[1110801].appraisal_skill, 5204);
    assert.equal(s.city.state.hero.total_power, power + 100);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.hero.total_power, power + 100);
    const before = structuredClone(restored.saved);
    restored.handle(evalPacket);
    assert.deepEqual(restored.saved, before);
    assert.equal(
      s.store.db
        .prepare("SELECT COUNT(*) n FROM gold_transactions WHERE user_id=1901")
        .get()!.n,
      2,
    );
  } finally {
    s.cleanup();
  }
});
test("comando atual salva visuais e oculta somente a asa sem alterar XP, recursos ou atributos", () => {
  const s = setup();
  try {
    const templates = [1090603, 1100801, 1110801, 1120801];
    for (const template of templates)
      s.city.state.fashions[template] = {
        temp_id: template,
        is_switch: 0,
        appraisal_skill: 0,
      };
    s.city.saved.fashion = {
      level: 200,
      xp: 0,
      fields: { "1": 0, "2": 200 },
      baselineLevel: 0,
    };
    s.city.persist();
    const hero = structuredClone(s.city.state.hero),
      items = structuredClone(s.city.state.items),
      gold = s.city.state.player.gold;
    const hide = Buffer.from(
      "CAAQyAEYq8hCIIGYQyiR5kMwobREOAFAAEgAUACYAQA=",
      "base64",
    );
    s.city.handle(frame(9582, 1901, hide));
    assert.equal(s.city.state.army.wing, "");
    assert.ok(s.city.state.army.hat);
    assert.ok(s.city.state.army.fashion_arm);
    assert.ok(s.city.state.army.fashion_cloth);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.army.wing, "");
    restored.handle(
      frame(
        9582,
        1901,
        Buffer.from("CAAQyAEYq8hCIIGYQyiR5kMwobREOABAAEgAUACYAQA=", "base64"),
      ),
    );
    assert.ok(restored.state.army.wing);
    restored.handle(
      frame(
        9582,
        1901,
        Buffer.concat([protoInt(1, 9999), protoInt(2, 1), protoInt(3, 0)]),
      ),
    );
    assert.equal(restored.saved.fashion!.level, 200);
    assert.equal(restored.saved.fashion!.xp, 0);
    assert.equal(restored.state.army.wing, "");
    const before = structuredClone(restored.saved.fashion);
    restored.handle(
      frame(9582, 1901, Buffer.concat([protoInt(7, 1), protoInt(3, 1099999)])),
    );
    assert.deepEqual(restored.saved.fashion, before);
    assert.deepEqual(restored.state.hero, hero);
    assert.deepEqual(restored.state.items, items);
    assert.equal(restored.state.player.gold, gold);
  } finally {
    s.cleanup();
  }
});
test("moda consumida no 200 desbloqueia e equipa aparência sem XP, atributos ou item físico duplicado", () => {
  const s = setup();
  try {
    s.city.saved.fashion = {
      level: 200,
      xp: 0,
      fields: { "1": 0, "2": 200 },
      baselineLevel: 0,
    };
    s.city.state.items["0:0:0"] = {
      id: 2000100,
      template_id: 1110801,
      bag_type: 0,
      object_id: 0,
      pos: 0,
      exist: 1,
      count: 1,
      user_id: 1901,
      bind: 1,
    };
    s.city.persist();
    const hero = structuredClone(s.city.state.hero);
    const response = s
      .send(8594, { count: 1 })
      .map((p) => Buffer.from(p.frame, "base64"));
    assert.equal(s.city.state.items["0:0:0"], undefined);
    assert.equal(s.city.saved.fashion.xp, 0);
    assert.equal(s.city.saved.fashion.level, 200);
    assert.deepEqual(s.city.state.hero, hero);
    const result = decodeMessage(
      source.incoming[4487],
      response.find((p) => p.readUInt16BE(6) === 4487)!.subarray(20),
    );
    assert.equal(result.compose_result, 1);
    assert.equal(Number(result.$9.value), 0);
    assert.ok(s.city.state.fashions[1110801]);
    const projected = response
      .filter((p) => p.readUInt16BE(6) === 115)
      .flatMap((p) => decodeMessage(source.incoming[115], p.subarray(20)).moved)
      .find((m) => m.item?.template_id === 1110801);
    assert.equal(projected.item.pos, 11);
    assert.equal(projected.item.bag_type, 4);
    assert.equal(projected.item.object_id, 1901);
    const id = projected.item.id;
    const restored = new CityWorld(s.store, 1901, s.now);
    const bootstrap = restored
      .bootstrap()
      .map((p) => Buffer.from(p.frame, "base64"))
      .filter((p) => p.readUInt16BE(6) === 115)
      .flatMap(
        (p) => decodeMessage(source.incoming[115], p.subarray(20)).moved,
      );
    assert.equal(
      bootstrap.find((m) => m.item?.template_id === 1110801).item.id,
      id,
    );
    const physical = structuredClone(restored.state.items);
    restored.handle(
      s.request(5005, {
        begin_bag_type: 4,
        begin_obj_id: 1901,
        begin_pos: 11,
        end_bag_type: 1,
        end_obj_id: 0,
        end_pos: 1,
        count: 1,
      }),
    );
    assert.equal(restored.state.army.fashion_arm, "");
    assert.deepEqual(restored.state.items, physical);
    assert.deepEqual(restored.state.hero, hero);
    const equip = frame(
      8595,
      1901,
      encodeMessage("com.road.yishi.proto.fashion.FashionMsg", {
        template_id: 1110801,
      }),
    );
    restored.handle(equip);
    assert.ok(restored.state.army.fashion_arm);
    assert.deepEqual(restored.state.hero, hero);
    const snapshot = structuredClone(restored.saved);
    restored.handle(
      frame(
        8595,
        1901,
        encodeMessage("com.road.yishi.proto.fashion.FashionMsg", {
          template_id: 1119999,
        }),
      ),
    );
    assert.deepEqual(restored.saved, snapshot);
  } finally {
    s.cleanup();
  }
});
test("reset exclusivo mantém uma conta e o correio libera 5 x 9999 de cada material no nível 11", async () => {
  const s = setup();
  try {
    await s.store.createUser("outro_teste", "local-materials-password", 1902);
    await s.store.createUser("unico_teste", "local-materials-password", 1901);
    const reset = await s.store.resetTutorialAccounts(
      "unico_teste",
      "local-materials-password",
      true,
    );
    assert.equal(reset.accounts, 1);
    assert.equal(s.store.user("outro_teste"), undefined);
    assert.equal(s.store.tutorialProfile(1901)!.process, 0);
    for (const template of [208020, 208021])
      s.store.sendLocalItems(
        1901,
        "Materiais",
        Array.from({ length: 5 }, () => ({ template, count: 9999 })),
        11,
      );
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM city_worlds").get()!.n,
      0,
    );
    s.store.db
      .prepare(
        "UPDATE tutorial_profiles SET active=1,icon=4,nickname='Teste',process=25000 WHERE user_id=1901",
      )
      .run();
    const city = new CityWorld(s.store, 1901, s.now);
    city.state.player.grades = 10;
    city.persist();
    city.tick(); // Notifications of the existing BETA grants.
    assert.equal(
      Object.values(city.state.mails).filter((m) => m.id >= 1000000).length,
      1, // The default energy supply is available before level 11.
    );
    assert.match(city.mailXml(), /ReadDate="2999-/);
    city.state.player.grades = 11;
    city.persist();
    const mails = Object.values(city.state.mails).filter(
      (m) => m.id >= 1000000 && m.title === "Materiais",
    );
    assert.equal(mails.length, 2);
    const notices = city
      .tick()
      .map((p) => Buffer.from(p.frame, "base64"))
      .filter((p) => p.readUInt16BE(6) === 148)
      .map((p) => decodeMessage(source.incoming[148], p.subarray(20)).mail_id);
    assert.deepEqual(new Set(notices), new Set(mails.map((m) => m.id)));
    assert.equal(city.tick().length, 0);
    const first = mails[0]!;
    assert.match(city.mailXml(String(first.id), 0), /ReadDate="2999-/);
    assert.doesNotMatch(city.mailXml(String(first.id), 1), /ReadDate="2999-/);
    const readDate = first.readDate;
    s.advance();
    city.mailXml(String(first.id), 1);
    assert.equal(first.readDate, readDate);
    assert.match(city.mailXml(String(mails[1]!.id)), /ReadDate="2999-/);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.mails[first.id]!.readDate, readDate);
    assert.equal(restored.tick().length, 0);
    for (const mail of mails)
      restored.handle(
        s.request(5022, { mailsIdArray: [mail.id], position: [0] }),
      );
    for (const template of [208020, 208021]) {
      const stacks = Object.values(restored.state.items).filter(
        (i) => i.template_id === template,
      );
      assert.equal(stacks.length, 5);
      assert.ok(stacks.every((i) => i.count === 9999));
      assert.equal(
        stacks.reduce((n, i) => n + i.count, 0),
        49995,
      );
    }
  } finally {
    s.cleanup();
  }
});
test("almas e amuletos movem para absorção, sobem níveis em lote e persistem sem repetir XP", () => {
  const s = setup();
  try {
    s.city.state.items["1:0:20"] = {
      id: 2000010,
      template_id: 208020,
      bag_type: 1,
      object_id: 0,
      pos: 20,
      exist: 1,
      count: 9999,
      user_id: 1901,
      bind: 1,
    };
    s.city.persist();
    s.send(5005, {
      begin_bag_type: 1,
      begin_obj_id: 0,
      begin_pos: 20,
      end_bag_type: 0,
      end_obj_id: 0,
      end_pos: 0,
      count: 9999,
    });
    assert.equal(s.city.state.items["0:0:0"]!.count, 9999);
    s.send(8594, { count: 1 });
    assert.deepEqual(
      [s.city.saved.fashion!.level, s.city.saved.fashion!.xp],
      [0, 200],
    );
    s.send(8594, { count: 9998 });
    const expected = structuredClone(s.city.saved.fashion);
    assert.ok(expected!.level > 100);
    assert.ok(s.city.state.fashions[1090401]);
    assert.equal(s.city.state.items["0:0:0"], undefined);
    s.send(8594, { count: 9998 });
    assert.deepEqual(s.city.saved.fashion, expected);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.deepEqual(restored.saved.fashion, expected);
    assert.ok(
      restored
        .bootstrap()
        .some((p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 301),
    );
    restored.state.items["1:0:20"] = {
      id: 2000011,
      template_id: 208021,
      bag_type: 1,
      object_id: 0,
      pos: 20,
      exist: 1,
      count: 9999,
      user_id: 1901,
      bind: 1,
    };
    restored.persist();
    restored.handle(
      s.request(5005, {
        begin_bag_type: 1,
        begin_obj_id: 0,
        begin_pos: 20,
        end_bag_type: 0,
        end_obj_id: 0,
        end_pos: 0,
        count: 9999,
      }),
    );
    const before = structuredClone(restored.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_fashion BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'falha moda'); END",
    );
    assert.throws(
      () => restored.handle(s.request(8594, { count: 9999 })),
      /falha moda/,
    );
    assert.deepEqual(restored.saved, before);
    s.store.db.exec("DROP TRIGGER fail_fashion");
    restored.handle(s.request(8594, { count: 9999 }));
    restored.state.items["0:0:0"] = {
      id: 2000012,
      template_id: 208021,
      bag_type: 0,
      object_id: 0,
      pos: 0,
      exist: 1,
      count: 9999,
      user_id: 1901,
      bind: 1,
    };
    restored.persist();
    restored.handle(s.request(8594, { count: 9999 }));
    assert.equal(restored.saved.fashion!.level, 200);
    const max = structuredClone(restored.saved);
    restored.state.items["0:0:0"] = {
      id: 2000013,
      template_id: 208020,
      bag_type: 0,
      object_id: 0,
      pos: 0,
      exist: 1,
      count: 1,
      user_id: 1901,
      bind: 1,
    };
    restored.persist();
    restored.handle(s.request(8594, { count: 1 }));
    assert.equal(restored.state.items["0:0:0"]!.count, 1);
    assert.deepEqual(restored.saved.fashion, max.fashion);
  } finally {
    s.cleanup();
  }
});
test("reset mantém a conta no tutorial zero e prepara cinco anexos de cada material sem antecipar a cidade", async () => {
  const s = setup();
  try {
    await s.store.createUser(
      "mail_materials",
      "local-materials-password",
      1901,
    );
    const reset = await s.store.resetTutorialAccounts(
      "mail_materials",
      "local-materials-password",
    );
    const first = s.store.sendLocalItems(
      reset.userId,
      "Almas",
      Array.from({ length: 5 }, () => ({ template: 208020, count: 999 })),
    );
    const second = s.store.sendLocalItems(
      reset.userId,
      "Amuletos",
      Array.from({ length: 5 }, () => ({ template: 208021, count: 999 })),
    );
    assert.equal(s.store.tutorialProfile(1901)!.process, 0);
    assert.equal(s.store.tutorialProfile(1901)!.active, 0);
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM city_worlds").get()!.n,
      0,
    );
    s.store.db
      .prepare(
        "UPDATE tutorial_profiles SET active=1,icon=4,nickname='Materiais',process=25000 WHERE user_id=1901",
      )
      .run();
    const city = new CityWorld(s.store, 1901, s.now);
    assert.ok(city.mailXml().includes('Title="Almas"'));
    const mail = city.state.mails[first]!;
    assert.equal(mail.readDate, "2999-01-01 00:00:00");
    assert.equal(mail.isExist, 1);
    const xml = city.mailXml();
    for (const row of xml.match(/<Info [^>]*\/>/g) ?? [])
      assert.equal((row.match(/IsExist=/g) ?? []).length, 1);
    assert.ok(
      city.itemXml(String(mail.annex1)).includes('templateId="208020"'),
    );
    assert.ok(city.itemXml(String(mail.annex1)).includes('count="999"'));
    const body = encodeMessage(source.outgoing[5022], {
      mailsIdArray: [first, second],
      position: [0, 0],
    });
    const response = city.handle(frame(5022, 1901, body));
    assert.equal(
      message(response, 4131).mailInfos.find((m: any) => m.id === first)
        .isExist,
      1,
    );
    assert.ok(message(response, 115).moved.length);
    const count = (world: CityWorld, id: number) =>
      Object.values(world.state.items)
        .filter((i) => i.template_id === id)
        .reduce((n, i) => n + i.count, 0);
    assert.equal(count(city, 208020), 4995);
    assert.equal(count(city, 208021), 4995);
    const restored = new CityWorld(s.store, 1901, s.now);
    restored.handle(frame(5022, 1901, body));
    assert.equal(count(restored, 208020), 4995);
    assert.equal(count(restored, 208021), 4995);
    for (let n = 1; n <= 5; n++)
      assert.equal(restored.state.mails[first]![`isAnnex${n}`], 1);
  } finally {
    s.cleanup();
  }
});
test("correio local antigo com data de leitura expirada é reparado sem recriar anexos ou progresso", async () => {
  const s = setup();
  try {
    await s.store.createUser("mail_expired", "local-materials-password", 1901);
    const id = s.store.sendLocalItems(1901, "Materiais", [
      { template: 208020, count: 999 },
    ]);
    const city = new CityWorld(s.store, 1901, s.now);
    city.state.mails[id]!.readDate = "2000-01-01 00:00:00";
    city.state.mails[id]!.isAnnex1 = 1;
    delete city.state.mails[id]!.isExist;
    city.persist();
    const beforeItems = structuredClone(city.state.items),
      progress = city.state.player.novice_process;
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.mails[id]!.readDate, "2999-01-01 00:00:00");
    assert.equal(restored.state.mails[id]!.isExist, 1);
    assert.equal(restored.state.mails[id]!.isAnnex1, 1);
    assert.deepEqual(restored.state.items, beforeItems);
    assert.equal(restored.state.player.novice_process, progress);
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM local_mail").get()!.n,
      2, // Existing material mail plus the default energy supply.
    );
  } finally {
    s.cleanup();
  }
});
test("correio de materiais não perde anexos quando a mochila está cheia nem quando o save falha", async () => {
  const s = setup();
  try {
    await s.store.createUser("mail_failure", "local-materials-password", 1901);
    const id = s.store.sendLocalItems(1901, "Materiais", [
      { template: 208020, count: 999 },
    ]);
    const city = new CityWorld(s.store, 1901, s.now);
    const packet = frame(
      5022,
      1901,
      encodeMessage(source.outgoing[5022], {
        mailsIdArray: [id],
        position: [0],
      }),
    );
    for (let pos = 0; pos < 42; pos++)
      city.state.items[`1:0:${pos}`] = {
        id: 6000000 + pos,
        template_id: 2129006,
        bag_type: 1,
        object_id: 0,
        pos,
        count: 9999,
        exist: 1,
        bind: 0,
      };
    city.persist();
    const before = structuredClone(city.saved);
    assert.match(message(city.handle(packet), 83).encode_msg, /espaço/);
    assert.deepEqual(city.saved, before);
    delete city.state.items["1:0:41"];
    city.persist();
    const emptySlot = structuredClone(city.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_mail BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'falha correio'); END",
    );
    assert.throws(() => city.handle(packet), /falha correio/);
    assert.deepEqual(city.saved, emptySlot);
    assert.equal(city.state.mails[id]!.isAnnex1, 0);
    s.store.db.exec("DROP TRIGGER fail_mail");
    city.handle(packet);
    assert.equal(city.state.mails[id]!.isAnnex1, 1);
    assert.equal(
      Object.values(city.state.items)
        .filter((i) => i.template_id === 208020)
        .reduce((n, i) => n + i.count, 0),
      999,
    );
  } finally {
    s.cleanup();
  }
});
test("venda simples remove a pilha, credita ouro, responde ao Flash e persiste sem duplicar", () => {
  const s = setup();
  try {
    s.city.state.items["1:0:30"] = {
      id: 5555555,
      template_id: 2129006,
      bag_type: 1,
      object_id: 0,
      pos: 30,
      count: 3,
      exist: 1,
      bind: 0,
    };
    s.city.persist();
    const gold = s.city.state.economy.gold_total_count;
    const response = s.send(5007, { begin_pos: 30 });
    const update = message(response, 115);
    assert.ok(update.moved.some((i: any) => i.change_pos === 30 && !i.item));
    assert.equal(message(response, 109).gold_total_count, gold + 24000);
    assert.equal(s.city.state.items["1:0:30"], undefined);
    const restored = new CityWorld(s.store, 1901, s.now);
    restored.handle(s.request(5007, { begin_pos: 30 }));
    assert.equal(restored.state.economy.gold_total_count, gold + 24000);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT count(*) AS n FROM gold_transactions WHERE reason='inventory-sale'",
        )
        .get()!.n,
      1,
    );
  } finally {
    s.cleanup();
  }
});
test("venda em lote é atômica, aceita quantidade parcial e recusa posições repetidas", () => {
  const s = setup();
  try {
    const sell = (rows: any[]) =>
      s.city.handle(
        frame(
          8624,
          1901,
          encodeMessage("com.road.yishi.proto.item.ItemSellReqMsg", {
            selledItemInfos: rows,
          }),
        ),
      );
    s.city.state.items["1:0:30"] = {
      id: 5555555,
      template_id: 2129006,
      bag_type: 1,
      object_id: 0,
      pos: 30,
      count: 3,
      exist: 1,
      bind: 0,
    };
    s.city.persist();
    const before = structuredClone(s.city.saved);
    assert.match(
      message(
        sell([
          { pos: 30, count: 1 },
          { pos: 30, count: 1 },
        ]),
        83,
      ).encode_msg,
      /repetida/,
    );
    assert.deepEqual(s.city.saved, before);
    s.store.db.exec(
      "CREATE TRIGGER fail_sell BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'falha venda'); END",
    );
    assert.throws(() => sell([{ pos: 30, count: 1 }]), /falha venda/);
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT count(*) AS n FROM gold_transactions WHERE reason='inventory-sale'",
        )
        .get()!.n,
      0,
    );
    s.store.db.exec("DROP TRIGGER fail_sell");
    sell([{ pos: 30, count: 1 }]);
    assert.equal(s.city.state.items["1:0:30"]!.count, 2);
    assert.equal(
      s.city.state.economy.gold_total_count,
      before.state.economy.gold_total_count + 8000,
    );
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.items["1:0:30"]!.count, 2);
    s.city.state.economy.gold_total_count = 2147483647;
    s.city.persist();
    const fullBalance = structuredClone(s.city.saved);
    assert.match(
      message(sell([{ pos: 30, count: 1 }]), 83).encode_msg,
      /Limite/,
    );
    assert.deepEqual(s.city.saved, fullBalance);
  } finally {
    s.cleanup();
  }
});
test("mochila cheia impede a recompensa inteira sem perder ouro, missão ou outros itens", () => {
  const s = setup();
  try {
    const c = s.city.scenario.cases.find((c) => c.opcode === 5014)!;
    c.patches.push({
      path: ["items", "1:0:0"],
      after: {
        id: 9999999,
        template_id: 2129006,
        bag_type: 1,
        object_id: 0,
        pos: 0,
        count: 1,
        exist: 1,
        bind: 0,
      },
    });
    for (let pos = 0; pos < 42; pos++)
      s.city.state.items[`1:0:${pos}`] = {
        id: 6000000 + pos,
        template_id: 2129006,
        bag_type: 1,
        object_id: 0,
        pos,
        count: 9999,
        exist: 1,
        bind: 0,
      };
    s.city.persist();
    const before = structuredClone(s.city.saved);
    assert.match(message(s.send(5014, c.request!), 83).encode_msg, /espaço/);
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!
        .n,
      0,
    );
  } finally {
    s.cleanup();
  }
});
test("ouro da missão é registrado uma vez e falha no save desfaz saldo, prêmio e lançamento", () => {
  const s = setup();
  try {
    const c = cases(5014)[0]!;
    const request = { ...c.request, is_pass: 0 };
    const before = structuredClone(s.city.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_gold_save BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT, 'falha de ouro'); END",
    );
    assert.throws(() => s.send(5014, request), /falha de ouro/);
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!
        .n,
      0,
    );
    s.store.db.exec("DROP TRIGGER fail_gold_save");
    assert.ok(s.send(5014, request).length);
    const balance = s.city.state.economy.gold_total_count;
    const row = s.store.db
      .prepare(
        "SELECT reason,delta,balance_before,balance_after FROM gold_transactions",
      )
      .get()!;
    assert.equal(row.reason, `mission:${request.template_id}`);
    assert.equal(row.balance_before, before.state.economy.gold_total_count);
    assert.equal(row.balance_after, balance);
    const restored = new CityWorld(s.store, 1901, s.now);
    restored.handle(s.request(5014, request));
    assert.equal(restored.state.economy.gold_total_count, balance);
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!
        .n,
      1,
    );
  } finally {
    s.cleanup();
  }
});

test("falha ao salvar recrutamento não consome ouro nem mantém soldados na memória", () => {
  const s = setup();
  try {
    const before = structuredClone(s.city.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_recruit_save BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT, 'falha recrutamento'); END",
    );
    assert.throws(
      () => s.send(5155, { tempate_id: 10101, own_pawns: 10 }),
      /falha recrutamento/,
    );
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!
        .n,
      0,
    );
    s.store.db.exec("DROP TRIGGER fail_recruit_save");
    assert.ok(s.send(5155, { tempate_id: 10101, own_pawns: 10 }).length);
    assert.equal(
      s.city.state.economy.gold_total_count,
      before.state.economy.gold_total_count - 20,
    );
    const entry = s.store.db
      .prepare("SELECT reason,delta FROM gold_transactions")
      .get()!;
    assert.equal(entry.reason, "recruit:10101");
    assert.equal(entry.delta, -20);
  } finally {
    s.cleanup();
  }
});
test("save de cidade e progresso são atômicos quando a gravação do perfil falha", () => {
  const s = setup();
  try {
    const previous = s.store.db
      .prepare("SELECT state FROM city_worlds WHERE user_id=1901")
      .get()!.state;
    s.store.db.exec(
      "CREATE TRIGGER fail_profile BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT, 'falha simulada'); END",
    );
    s.city.state.economy.gold_total_count += 123;
    s.city.state.player.novice_process = 35000;
    assert.throws(() => s.city.persist(), /falha simulada/);
    assert.equal(
      s.store.db
        .prepare("SELECT state FROM city_worlds WHERE user_id=1901")
        .get()!.state,
      previous,
    );
    s.store.db.exec("DROP TRIGGER fail_profile");
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.notEqual(restored.state.player.novice_process, 35000);
  } finally {
    s.cleanup();
  }
});

test("conta anterior sem separação de atributos conserva os totais e recupera o bônus permanente uma vez", () => {
  const s = setup();
  try {
    const first = cases(8203)[0]!;
    const patch = first.patches.find(
      (p) => p.path[0] === "buildings" && p.path.at(-1) === "template_id",
    )!;
    s.city.state.buildings["181001441"] = {
      ...first.responses.find((p) => p.opcode === 4130)!.message!.building[0],
      template_id: patch.before,
    };
    s.city.state.economy.gold_total_count = 1000000;
    s.city.state.economy.crystals_count = 1000000;
    assert.ok(s.send(8203, { building_id: 190101441 }).length);
    const hero = structuredClone(s.city.state.hero);
    const old = structuredClone(s.city.saved);
    delete old.attributes;
    s.store.db
      .prepare("UPDATE city_worlds SET state=? WHERE user_id=1901")
      .run(JSON.stringify(old));
    const migrated = new CityWorld(s.store, 1901, s.now);
    assert.deepEqual(migrated.state.hero, hero);
    assert.equal(
      migrated.saved.attributes!.sources["sanctuary"]!.values.total_phy_attack,
      125,
    );
    const again = new CityWorld(s.store, 1901, s.now);
    assert.deepEqual(again.saved.attributes, migrated.saved.attributes);
    assert.deepEqual(again.state.hero, hero);
  } finally {
    s.cleanup();
  }
});
function assertRejected(responses: any[], expected: RegExp) {
  assert.deepEqual(responses.map(r => Buffer.from(r.frame, "base64").readUInt16BE(6)), [83]);
  const notice = message(responses, 83);
  assert.match(notice.encode_msg, expected);
  assert.equal(notice.channel, 3);
  assert.equal(notice.is_centerTip, 1);
}
function message(responses: any[], opcode: number) {
  const r = (opcode === 112 ? [...responses].reverse() : responses).find(
    (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === opcode,
  );
  assert.ok(r, `opcode ${opcode} ausente`);
  return decodeMessage(
    opcode === 4282
      ? "com.road.yishi.proto.simple.PropertyMsg"
      : source.incoming[opcode],
    Buffer.from(r.frame, "base64").subarray(20),
  );
}
test("login TCP e reconexão entregam o callback da cidade após os modelos, mantendo progresso salvo", async () => {
  const s = setup();
  let socket: Socket | undefined, game: GameServer | undefined;
  try {
    await s.store.createUser("city_login", "city-local-test-password", 1901);
    mkdirSync(join(s.store.dir, "tutorial"));
    copyFileSync(
      join(projectRoot, "data/tutorial/scenario.json"),
      join(s.store.dir, "tutorial/scenario.json"),
    );
    s.city.setProgress(25000);
    s.city.state.items["1:0:30"] = {
      id: 5555555,
      template_id: 2129006,
      bag_type: 1,
      object_id: 0,
      pos: 30,
      count: 3,
      exist: 1,
      bind: 0,
    };
    s.city.persist();
    let expectedGold = s.city.state.economy.gold_total_count;
    s.store.db
      .prepare("INSERT INTO tutorial_worlds(user_id,state) VALUES(?,?)")
      .run(
        1901,
        JSON.stringify({
          version: 1,
          wins: [0, 1, 2],
          process: 25000,
          cityEntered: true,
          complete: true,
          rewardCount: 3,
        }),
      );
    const config = {
      ...loadConfig(),
      dataDir: s.store.dir,
      mode: "tutorial" as const,
      resourceMode: "offline" as const,
      capturePackets: false,
      gamePort: 0,
    };
    const auth = new ReplayAuth(s.store);
    game = new GameServer(config, s.store, auth);
    await game.listen();
    const encrypted = publicEncrypt(
      {
        key: createPublicKey({ key: auth.jwk, format: "jwk" }),
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(`city_login|${s.store.issue(1901)}|1234567|1901`),
    ).toString("base64");
    const { proof } = auth.login(encrypted);
    for (let attempt = 0; attempt < 2; attempt++) {
      socket = createConnection({
        host: "127.0.0.1",
        port: (game.server.address() as AddressInfo).port,
      });
      await new Promise<void>((resolve, reject) => {
        socket!.once("connect", resolve);
        socket!.once("error", reject);
      });
      const received: Buffer[] = [],
        key = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]),
        reader = new FrameReader();
      reader.key = Buffer.from(key);
      const sendKey = Buffer.from(key);
      let saleResolve: (p: Buffer) => void = () => {};
      let readyResolve: (p: Buffer) => void = () => {},
        readyReject: (e: Error) => void = () => {};
      const ready = new Promise<Buffer>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      const deadline = setTimeout(
        () => readyReject(new Error("Não recebeu estado de login da cidade")),
        3000,
      );
      socket.on("data", (chunk) => {
        try {
          reader.push(chunk, (p) => {
            received.push(p);
            if (p.readUInt16BE(6) === 6) readyResolve(p);
            if (
              p.readUInt16BE(6) === 109 &&
              decodeMessage(source.incoming[109], p.subarray(20))
                .gold_total_count ===
                expectedGold + 24000
            )
              saleResolve(p);
          });
        } catch (e) {
          readyReject(e as Error);
        }
      });
      try {
        socket.write(
          crypt(
            frame(
              20001,
              1901,
              Buffer.concat([
                protoString(2, proof),
                ...Array.from(key, (k) => protoInt(3, k)),
              ]),
            ),
            Buffer.from(INITIAL_KEY),
          ),
        );
        socket.write(crypt(frame(8271, 1901), sendKey));
        const callback = await ready;
        assert.equal(
          decodeMessage(source.incoming[6], callback.subarray(20)).state,
          1,
        );
        assert.equal(
          decodeMessage(source.incoming[6], callback.subarray(20)).player_id,
          1901,
        );
        const before = received.slice(0, received.indexOf(callback));
        for (const op of [3, 109, 113, 150, 112, 4130])
          assert.ok(
            before.some((p) => p.readUInt16BE(6) === op),
            `modelo ${op} antes do callback`,
          );
        const player = before.filter((p) => p.readUInt16BE(6) === 3).at(-1)!;
        const economy = before.filter((p) => p.readUInt16BE(6) === 109).at(-1)!;
        assert.equal(
          decodeMessage(source.incoming[109], economy.subarray(20))
            .gold_total_count,
          expectedGold,
        );
        assert.equal(
          decodeMessage(source.incoming[3], player.subarray(20)).novice_process,
          25000,
        );
        if (attempt === 0) {
          let timeout: ReturnType<typeof setTimeout>;
          const sale = new Promise<Buffer>((resolve, reject) => {
            saleResolve = resolve;
            timeout = setTimeout(
              () =>
                reject(new Error("Venda TCP não retornou saldo atualizado")),
              3000,
            );
          });
          socket.write(crypt(s.request(5007, { begin_pos: 30 }), sendKey));
          try {
            await sale;
          } finally {
            clearTimeout(timeout!);
          }
          expectedGold += 24000;
          assert.ok(
            received.some(
              (p) =>
                p.readUInt16BE(6) === 115 &&
                decodeMessage(source.incoming[115], p.subarray(20)).moved?.some(
                  (m: any) => m.change_pos === 30 && !m.item,
                ),
            ),
          );
        }
      } finally {
        clearTimeout(deadline);
        socket.end();
        await new Promise<void>((resolve) =>
          socket!.once("close", () => resolve()),
        );
        socket = undefined;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }
    const saved = JSON.parse(
      String(
        s.store.db
          .prepare("SELECT state FROM tutorial_worlds WHERE user_id=1901")
          .get()!.state,
      ),
    );
    assert.equal(saved.process, 25000);
    assert.equal(saved.complete, true);
    assert.ok(
      !s.city
        .handle(frame(8281, 1901))
        .some((r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 6),
    );
  } finally {
    socket?.destroy();
    await game?.close();
    s.cleanup();
  }
});

test("progresso enviado ao Flash alcança 200 recrutas e a entrega normal libera a próxima missão", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.send(5012, { questId: [99999, 1834] });
    let result = s.send(5155, { tempate_id: 10101, own_pawns: 100 });
    let q = message(result, 112).quest.find((q: any) => q.template_id === 1834);
    assert.equal(q.condition_1, 100);
    assert.equal(q.is_complete, 0);
    result = s.send(5155, { tempate_id: 10101, own_pawns: 100 });
    q = message(result, 112).quest.find((q: any) => q.template_id === 1834);
    assert.equal(q.condition_1, 200);
    assert.equal(q.is_complete, 1);
    result = s.send(5014, { template_id: 1834, reward_item_id: 0, is_pass: 0 });
    assert.equal(message(result, 52).template_id, 1834);
    assert.equal(message(result, 52).isJump, 0);
    assert.ok(
      message(result, 112).quest.some(
        (q: any) => q.template_id === 1836 && q.is_accept,
      ),
    );
    const gp = s.city.state.player.totalGp;
    assertRejected(s.send(5014, { template_id: 1834, reward_item_id: 0, is_pass: 0 }), /já foi resgatada/);
    assert.equal(s.city.state.player.totalGp, gp);
  } finally {
    s.cleanup();
  }
});

test("clique real da Toca dos Lobos abre sala, vence dois encontros e conclui com recompensas únicas", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.send(5012, { questId: [1834] });
    s.send(5155, { tempate_id: 10101, own_pawns: 300 });
    s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 200 });
    s.send(5014, { template_id: 1834, reward_item_id: 0, is_pass: 0 });
    const initialXp = s.city.state.player.totalGp;
    const initialStrategy = s.city.state.player.strategy;
    const initialWeary = s.city.state.player.weary;
    const fashions = structuredClone(s.city.saved.fashion);
    let responses = s.send(5039, { para_int1: 1, para_int2: 1001 });
    assert.equal(message(responses, 125).created_type, 1);
    assert.equal(message(responses, 125).room.campaignId, 1021);
    assert.equal(s.city.state.player.weary, initialWeary);
    responses = s.send(5038, { para_int1: 1021 });
    assert.equal(message(responses, 21).result, 1);
    assert.equal(s.city.saved.map, 1021);
    assert.equal(s.city.state.player.weary, initialWeary - 20);
    s.send(5038, { para_int1: 1021 });
    assert.equal(s.city.state.player.weary, initialWeary - 20);
    const battleRequest = frame(
      8666,
      1901,
      Buffer.from(
        source.queries.find((c: CityCase) => c.opcode === 8666).body,
        "base64",
      ),
    );
    for (const index of [0, 1]) {
      const prepare = s.city.handle(battleRequest);
      const battle = s.city.saved.battle!;
      assert.equal(battle.reference, index);
      assert.equal(message(prepare, 157).battle_id, battle.id);
      s.city.handle(frame(10007, 1901, protoString(2, battle.id)));
      const packets = [];
      for (let turn = 0; turn < 100 && !battle.finished; turn++) {
        s.advance();
        packets.push(...s.city.tick());
      }
      assert.equal(battle.won, true);
      assert.equal(message(packets, 4103).battle_result, 1);
      responses = s.send(5038, { para_int1: 1021 });
      if (index === 0) {
        assert.ok(
          responses.some(
            (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 4382,
          ),
        );
        assert.ok(
          !responses.some(
            (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 135,
          ),
        );
        const reconnected = new CityWorld(s.store, 1901, s.now);
        assert.deepEqual(reconnected.saved.won, [0]);
        assert.ok(
          reconnected
            .bootstrap()
            .some(
              (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 4382,
            ),
        );
      } else {
        assert.equal(message(responses, 135).card_count, 5);
        assert.ok(
          responses.some(
            (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 137,
          ),
        );
      }
    }
    assert.equal(s.city.state.player.totalGp, initialXp + 70 + 1210);
    assert.equal(s.city.state.player.strategy, initialStrategy + 32 + 155);
    assert.ok(
      !Object.values(s.city.state.items).some((i) => i.template_id === 2129006),
    );
    assert.equal(message(selectCapturedCard(s), 26).index, 2);
    assert.ok(
      Object.values(s.city.state.items).some(
        (i) => i.template_id === 2040103 && i.count === 5,
      ),
    );
    assert.ok(
      Object.values(s.city.state.items).some(
        (i) => i.template_id === 2129006 && i.count === 40,
      ),
    );
    assert.equal(s.city.state.quests[1836]!.condition_1, 1);
    const items = structuredClone(s.city.state.items);
    s.send(5038, { para_int1: 1021 });
    responses = s.send(5180, { para_int1: 1 });
    assert.ok(
      responses.some(
        (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 134,
      ),
    );
    assert.equal(s.city.saved.map, 1);
    s.send(5180, { para_int1: 1 });
    assert.equal(s.city.state.player.totalGp, initialXp + 1280);
    assert.deepEqual(s.city.state.items, items);
    assert.deepEqual(s.city.saved.fashion, fashions);
    responses = s.send(5039, { para_int1: 1, para_int2: 1001 });
    assert.equal(message(responses, 125).room.campaignId, 1021);
    assert.deepEqual(s.city.saved.campaignRun!.won, []);
    assert.equal(s.city.saved.campaignRun!.paid, false);
  } finally {
    s.cleanup();
  }
});

test("campanha pode repetir com novos custos e prêmios, mantendo missão e reconexão sem cobrança dupla", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.send(5155, { tempate_id: 10101, own_pawns: 300 });
    s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 212 });
    const startXp = s.city.state.player.totalGp;
    const startWeary = s.city.state.player.weary;
    const runIds = new Set<string>();
    for (const attempt of [1, 2]) {
      s.send(5039, { para_int1: 1, para_int2: 1001 });
      s.send(5038, { para_int1: 1021 });
      runIds.add(s.city.saved.campaignRun!.id);
      assert.deepEqual(s.city.saved.campaignRun!.won, []);
      assert.equal(s.city.state.player.weary, startWeary - attempt * 20);
      s.send(5038, { para_int1: 1021 });
      const restored = new CityWorld(s.store, 1901, s.now);
      restored.handle(s.request(5038, { para_int1: 1021 }));
      assert.equal(restored.state.player.weary, startWeary - attempt * 20);
      win(s, 0);
      win(s, 1);
      s.send(5038, { para_int1: 1021 });
      s.send(5038, { para_int1: 1021 });
      selectCapturedCard(s);
      s.send(5180, { para_int1: 1 });
      assert.equal(s.city.state.player.totalGp, startXp + 1280 * attempt);
      assert.deepEqual(s.city.saved.won, [0, 1]);
      assert.equal(s.city.saved.campaignRun!.completed, true);
    }
    assert.equal(runIds.size, 2);
    const count = (template: number) =>
      Object.values(s.city.state.items)
        .filter((i) => i.template_id === template)
        .reduce((n, i) => n + i.count, 0);
    assert.equal(count(2129006), 80);
    assert.equal(count(2040103), 10);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT count(*) AS n FROM currency_transactions WHERE currency='energy'",
        )
        .get()!.n,
      2,
    );
    assert.equal(s.city.saved.used.filter((i) => i === 14).length, 1);
    s.city.state.player.weary = 19;
    const before = structuredClone(s.city.saved.campaignRun);
    assert.equal(
      message(s.send(5039, { para_int1: 1, para_int2: 1001 }), 125).room
        .campaignId,
      1021,
    );
    assert.equal(s.city.saved.campaignRun!.rewarded, false);
    assert.notEqual(s.city.saved.campaignRun!.id, before!.id);
  } finally {
    s.cleanup();
  }
});

test("sair da campanha parcial reinicia os encontros e cobra outra entrada; save falho não consome energia", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.send(5039, { para_int1: 1, para_int2: 1001 });
    s.store.db.exec(
      "CREATE TRIGGER fail_energy BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail energy'); END",
    );
    const before = structuredClone(s.city.saved);
    assert.throws(() => s.send(5038, { para_int1: 1021 }), /fail energy/);
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT count(*) AS n FROM currency_transactions WHERE currency='energy'",
        )
        .get()!.n,
      0,
    );
    s.store.db.exec("DROP TRIGGER fail_energy");
    s.send(5038, { para_int1: 1021 });
    s.city.saved.campaignRun!.won = [0];
    s.city.saved.won = [0];
    const previous = s.city.saved.campaignRun!.id;
    s.send(5180, { para_int1: 1 });
    s.send(5039, { para_int1: 1, para_int2: 1001 });
    s.send(5038, { para_int1: 1021 });
    assert.notEqual(s.city.saved.campaignRun!.id, previous);
    assert.deepEqual(s.city.saved.campaignRun!.won, []);
    assert.deepEqual(s.city.saved.won, [0]);
    assert.equal(s.city.state.player.weary, 160);
    s.city.startBattle(0);
    assert.equal(s.city.saved.battle!.finished, false);
    const xp = s.city.state.player.totalGp;
    s.send(5025, { msg: "" });
    assert.equal(s.city.saved.battle, undefined);
    s.advance();
    s.city.tick();
    assert.equal(s.city.state.player.totalGp, xp);
    s.send(5039, { para_int1: 1, para_int2: 1001 });
    s.send(5038, { para_int1: 1021 });
    assert.equal(s.city.state.player.weary, 140);
    assert.ok(s.city.startBattle(0).length);
  } finally {
    s.cleanup();
  }
});

test("missão da campanha não rebaixa nível 27 e save com XP negativo recupera o acumulado", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 27;
    s.city.state.player.gp = 1000;
    s.city.state.player.totalGp = 2003060;
    s.city.state.quests[1836] = {
      ...source.questCatalog[1836],
      is_accept: 1,
      is_complete: 1,
      condition_1: 1,
    };
    s.city.saved.won = [0, 1];
    s.city.saved.used.push(14);
    s.city.persist();
    const hero = structuredClone(s.city.state.hero);
    const result = s.send(5014, {
      template_id: 1836,
      reward_item_id: 0,
      is_pass: 0,
    });
    assert.equal(message(result, 3).grades, 27);
    assert.equal(s.city.state.player.gp, 16000);
    assert.equal(s.city.state.player.totalGp, 2018060);
    assert.equal(s.city.state.hero.total_live, hero.total_live);
    assert.equal(s.city.state.hero.base_power, hero.base_power);
    s.city.state.player.grades = 12;
    s.city.state.player.gp = -4720;
    s.city.state.player.totalGp = 2019340;
    s.city.persist();
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.player.grades, 27);
    assert.equal(restored.state.player.gp, 17280);
    assert.equal(restored.state.player.totalGp, 2019340);
  } finally {
    s.cleanup();
  }
});

test("Planície de Byron usa tropas e boss originais, libera rank, repete prêmios e retoma sem cobrar energia", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.city.state.player.grades = 12;
    assert.match(
      message(s.send(5039, { para_int1: 1, para_int2: 1002 }), 83).encode_msg,
      /anterior/,
    );
    s.city.saved.won = [0, 1];
    s.city.saved.used.push(14);
    const xp = s.city.state.player.totalGp,
      spirit = s.city.state.player.strategy;
    for (const attempt of [1, 2]) {
      assert.equal(
        message(s.send(5039, { para_int1: 1, para_int2: 1002 }), 125).room
          .campaignId,
        1141,
      );
      const first = s.send(5038, { para_int1: 1141 });
      assert.equal(
        message(first, 21).player[0].grades,
        s.city.state.player.grades,
      );
      assert.equal(message(first, 21).player[0].mount_tempId, 0);
      assert.equal(s.city.state.player.weary, 200 - attempt * 20);
      const resumed = new CityWorld(s.store, 1901, s.now);
      resumed.handle(s.request(5038, { para_int1: 1141 }));
      assert.equal(resumed.state.player.weary, s.city.state.player.weary);
      for (const [stage, index] of campaignBattleIndices(1002).entries()) {
        const prepare = s.city.handle(frame(8666, 1901));
        const p = message(prepare, 157);
        assert.equal(
          p.heros.find((h: any) => h.side === 1).max_hp,
          s.city.state.hero.total_live,
        );
        assert.deepEqual(p.pets, undefined);
        if (stage === 0)
          assert.deepEqual(
            p.soldiers
              .filter((h: any) => h.side === 2)
              .map((h: any) => h.temp_id),
            [2022, 2022],
          );
        else
          assert.deepEqual(
            p.heros.filter((h: any) => h.side === 2).map((h: any) => h.temp_id),
            [1023, 1022, 1021],
          );
        const b = s.city.saved.battle!;
        s.city.handle(frame(10007, 1901, protoString(2, b.id)));
        for (let i = 0; i < 150 && !s.city.saved.battle!.finished; i++) {
          s.advance();
          s.city.tick();
        }
        assert.equal(s.city.saved.battle!.won, true, `stage ${index}`);
        const replies = s.send(5038, { para_int1: 1141 });
        assert.ok(
          replies.some(
            (r) =>
              Buffer.from(r.frame, "base64").readUInt16BE(6) ===
              (stage === 0 ? 4382 : 135),
          ),
        );
      }
      assert.equal(s.city.state.player.totalGp, xp + 2602 * attempt);
      assert.equal(s.city.state.player.strategy, spirit + 312 * attempt);
      assert.ok(
        message(s.city.bootstrap(), 4151).rankInfo.some(
          (r: any) => r.campaign_id === 1002,
        ),
      );
      s.send(5038, { para_int1: 1141 });
      selectCapturedCard(s);
      s.send(5180, { para_int1: 1 });
      assert.equal(s.city.state.player.totalGp, xp + 2602 * attempt);
    }
    assert.equal(
      Object.values(s.city.state.items)
        .filter((i) => i.template_id === 2129006)
        .reduce((n, i) => n + i.count, 0),
      80,
    );
  } finally {
    s.cleanup();
  }
});

test("fases anteriores à expansão concluem na ordem, inclusive três encontros, com três classes e retomada do resultado", () => {
  for (const icon of [1, 2, 3]) {
    const s = setup();
    try {
      s.store.db
        .prepare("UPDATE tutorial_profiles SET icon=? WHERE user_id=1901")
        .run(icon);
      const city = new CityWorld(s.store, 1901, s.now);
      const send = (op: number, r: any) => city.handle(s.request(op, r));
      // Isolated high-level fixture exercises every captured room, not live-account balance.
      city.state.player.grades = 30;
      city.state.hero.tempate_id = icon;
      city.saved.attributes!.sources["test:campaign"] = {
        kind: "other",
        evidence: "observed-delta",
        values: {
          total_phy_attack: 100000,
          total_magic_attack: 100000,
          total_phy_defence: 100000,
          total_magic_defence: 100000,
          total_live: 100000,
        },
      };
      for (const [key, value] of Object.entries(
        city.saved.attributes!.sources["test:campaign"]!.values,
      ))
        city.state.hero[key] += value;
      city.saved.won = [0, 1];
      city.saved.used.push(14);
      city.changeCurrency("energy", 1000, "test:campaign", "test:campaign");
      city.persist();
      for (const definition of campaignDefinitions.values()) {
        // This level-30 fixture covers the deployed catalog; higher chapters
        // have their own expansion tests at the original entry level.
        if (definition.legacy || definition.battleIndices) continue;
        // Each content fixture has a fresh day's hero attempts; daily limits
        // are covered separately from actor/progression validation.
        city.saved.heroEntries = {
          day: new Date(s.now()).toISOString().slice(0, 10),
          used: 0,
        };
        const xp = city.state.player.totalGp,
          energy = city.state.player.weary;
        assert.equal(
          message(send(5039, { para_int1: 1, para_int2: definition.id }), 125)
            .room.campaignId,
          definition.map,
        );
        assert.equal(
          message(send(5038, { para_int1: definition.map }), 4282).param1,
          definition.stages![0]!.nodeIndex,
        );
        assert.equal(city.state.player.weary, energy - 20);
        const indices = campaignBattleIndices(definition.id);
        for (const [stage, index] of indices.entries()) {
          const p = message(city.handle(frame(8666, 1901)), 157);
          assert.equal(city.saved.battle!.reference, index);
          const hero = p.heros.find((h: any) => h.side === 1 && h.type === 1);
          assert.equal(hero.temp_id, icon);
          assert.equal(hero.init_hp, city.state.hero.total_live);
          const expected = definition.stages![stage]!.reference.prepare;
          const enemies = (p: any) =>
            [...p.heros, ...(p.soldiers ?? [])]
              .filter((h) => h.side === 2)
              .map((h) => [h.temp_id, h.init_hp]);
          assert.deepEqual(enemies(p), enemies(expected));
          city.handle(
            frame(10007, 1901, protoString(2, city.saved.battle!.id)),
          );
          for (
            let tick = 0;
            tick < 100 && !city.saved.battle!.finished;
            tick++
          ) {
            s.advance();
            city.tick();
          }
          assert.equal(
            city.saved.battle!.won,
            true,
            `${definition.id}:${index}:${icon}`,
          );
          const responses = send(5038, { para_int1: definition.map });
          if (stage < indices.length - 1)
            assert.equal(
              message(responses, 4282).param1,
              definition.stages![stage + 1]!.nodeIndex,
            );
          else assert.equal(message(responses, 4282).param1, 5);
          if (stage < indices.length - 1) {
            assert.equal(city.saved.campaignRun!.completed, false);
            assert.ok(
              !responses.some(
                (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 135,
              ),
            );
          } else
            assert.ok(
              responses.some(
                (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 135,
              ),
            );
        }
        const earned =
          definition.completionXp! +
          definition.stages!.reduce((n, s) => n + s.xp, 0);
        assert.equal(city.state.player.totalGp, xp + earned);
        const resumed = new CityWorld(s.store, 1901, s.now);
        const bootstrap = resumed.bootstrap();
        assert.ok(
          bootstrap.some(
            (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 135,
          ),
        );
        assert.equal(
          message(bootstrap, 21).player[0].grades,
          resumed.state.player.grades,
        );
        resumed.handle(s.request(5038, { para_int1: definition.map }));
        assert.equal(resumed.state.player.totalGp, xp + earned);
        selectCapturedCard(s, city);
        send(5180, { para_int1: 1 });
      }
    } finally {
      s.cleanup();
    }
  }
});

test("missão de Byron exige vitória e concede XP, ouro e item uma vez; falha de save desfaz a entrega", () => {
  const s = setup();
  try {
    s.city.state.quests[1841] = {
      ...s.city.scenario.questCatalog[1836],
      template_id: 1841,
      is_accept: 1,
      is_complete: 0,
      condition_1: 0,
    };
    s.city.persist();
    const claim = { template_id: 1841, is_pass: 0, reward_item_id: 0 };
    const xp = s.city.state.player.totalGp,
      gold = s.city.state.economy.gold_total_count;
    assertRejected(s.send(5014, claim), /Missão ainda não concluída/);
    assert.equal(s.city.state.player.totalGp, xp);
    s.city.saved.completedCampaigns = [1002];
    s.city.persist();
    const before = structuredClone(s.city.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_campaign_quest BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail quest'); END",
    );
    assert.throws(() => s.send(5014, claim), /fail quest/);
    assert.deepEqual(s.city.saved, before);
    s.store.db.exec("DROP TRIGGER fail_campaign_quest");
    assert.equal(message(s.send(5014, claim), 52).template_id, 1841);
    assert.equal(s.city.state.player.totalGp, xp + 37000);
    assert.equal(s.city.state.economy.gold_total_count, gold + 2000);
    assert.equal(s.city.state.quests[1841]!.is_accept, 0);
    const resumed = new CityWorld(s.store, 1901, s.now);
    const bit = 1840,
      bits = Buffer.from(resumed.state.player.quest_site.bytes, "base64");
    assert.ok(bits[Math.floor(bit / 8)]! & (1 << (bit % 8)));
    resumed.handle(s.request(5014, claim));
    assert.equal(resumed.state.player.totalGp, xp + 37000);
    assert.equal(resumed.state.economy.gold_total_count, gold + 2000);
  } finally {
    s.cleanup();
  }
});

test("derrota na fase nova não libera boss nem prêmios e permite repetir o encontro sem outra cobrança", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 12;
    s.city.saved.won = [0, 1];
    s.city.persist();
    s.send(5039, { para_int1: 1, para_int2: 1002 });
    s.send(5038, { para_int1: 1141 });
    s.city.handle(frame(8666, 1901));
    const battle = s.city.saved.battle!,
      xp = s.city.state.player.totalGp,
      spirit = s.city.state.player.strategy,
      items = structuredClone(s.city.state.items);
    battle.fighters.find((f) => f.living_id === battle.hero)!.hp = 1;
    battle.stats![battle.hero]!.attack = 1;
    battle.stats![battle.hero]!.magicAttack = 1;
    s.city.handle(frame(10007, 1901, protoString(2, battle.id)));
    for (let i = 0; i < 10 && !s.city.saved.battle!.finished; i++) {
      s.advance();
      s.city.tick();
    }
    assert.equal(s.city.saved.battle!.won, false);
    assert.deepEqual(s.city.saved.campaignRun!.won, []);
    assert.equal(s.city.state.player.totalGp, xp);
    assert.equal(s.city.state.player.strategy, spirit);
    assert.deepEqual(s.city.state.items, items);
    const resumed = new CityWorld(s.store, 1901, s.now);
    resumed.handle(s.request(5038, { para_int1: 1141 }));
    const retry = message(resumed.handle(frame(8666, 1901)), 157);
    assert.notEqual(resumed.saved.battle!.id, battle.id);
    assert.equal(
      resumed.saved.battle!.reference,
      campaignBattleIndices(1002)[0],
    );
    assert.equal(
      retry.heros.find((h: any) => h.type === 1).init_hp,
      resumed.state.hero.total_live,
    );
    assert.equal(resumed.state.player.weary, 180);
  } finally {
    s.cleanup();
  }
});

test("poção de energia consumida pelo comando real credita 50 por unidade e save falho preserva item e saldo", () => {
  const s = setup();
  try {
    s.city.state.items["1:0:25"] = {
      id: 2000250,
      template_id: 2030503,
      count: 3,
      bag_type: 1,
      object_id: 0,
      pos: 25,
      exist: 1,
    };
    s.city.state.player.weary = 30;
    s.city.persist();
    const request = frame(
      5006,
      1901,
      encodeMessage(s.city.scenario.outgoing[5006]!, {
        bag_type: 1,
        pos: 25,
        count: 2,
      }),
    );
    const before = structuredClone(s.city.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_energy_item BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail energy'); END",
    );
    assert.throws(() => s.city.handle(request), /fail energy/);
    assert.deepEqual(s.city.saved, before);
    s.store.db.exec("DROP TRIGGER fail_energy_item");
    assert.equal(message(s.city.handle(request), 3).weary, 130);
    assert.equal(s.city.state.items["1:0:25"]!.count, 1);
    s.city.handle(request);
    assert.equal(s.city.state.player.weary, 130);
    s.city.handle(
      frame(
        5006,
        1901,
        encodeMessage(s.city.scenario.outgoing[5006]!, {
          bag_type: 1,
          pos: 25,
          count: 1,
        }),
      ),
    );
    assert.equal(s.city.state.player.weary, 180);
    assert.equal(s.city.state.items["1:0:25"], undefined);
  } finally {
    s.cleanup();
  }
});

test("sete saldos chegam nos modelos corretos e não viram UID; erro de save desfaz moeda e histórico", () => {
  const s = setup();
  try {
    for (const currency of Object.keys(currencies) as Currency[]) {
      const packets = s.city.changeCurrency(
        currency,
        1810 - currencyBalance(s.city.state, currency),
        "test:currency",
        `test:${currency}`,
      );
      const model = message(packets, currencies[currency].model);
      const spec = currencies[currency];
      assert.equal(
        spec.root === "token"
          ? model.tokenInfos.find((t: any) => t.masterType === 11).amount
          : model[spec.field],
        1810,
      );
    }
    const before = structuredClone(s.city.saved);
    const entries = s.store.db
      .prepare("SELECT count(*) AS n FROM currency_transactions")
      .get()!.n;
    s.store.db.exec(
      "CREATE TRIGGER fail_currency BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail currency'); END",
    );
    assert.throws(
      () => s.city.changeCurrency("diamonds", 20, "test:save", "save:1"),
      /fail currency/,
    );
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db
        .prepare("SELECT count(*) AS n FROM currency_transactions")
        .get()!.n,
      entries,
    );
  } finally {
    s.cleanup();
  }
});

test("snapshot de tokens preserva o saldo local do labirinto e aplica apenas o ganho observado", () => {
  const s = setup();
  try {
    s.city.changeCurrency("labyrinthCoin", 100, "test:initial", "initial");
    const before = structuredClone(s.city.state);
    before.packets[4725] = {
      opcode: 4725,
      message: { tokenInfos: [{ masterType: 11, amount: 0, expiredDate: "" }] },
    };
    const after = structuredClone(before);
    after.packets[4725]!.message!.tokenInfos = [
      { masterType: 1, amount: 7, expiredDate: "" },
      { masterType: 11, amount: 50, expiredDate: "" },
    ];
    const request = { time: 0, operate: 1 };
    s.city.scenario.cases.forEach((c, index) => {
      if (c.opcode === 5019) s.city.saved.used.push(index);
    });
    s.city.scenario.cases.push({
      opcode: 5019,
      request,
      body: "",
      at: "token-reward",
      patches: cityDiff(before, after),
      responses: [after.packets[4725]!],
    });
    const result = s.send(5019, request);
    assert.equal(
      message(result, 4725).tokenInfos.find((t: any) => t.masterType === 11)
        .amount,
      150,
    );
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 150);
    assert.equal(s.city.state.packets[4725]!.message!.tokenInfos[0].amount, 7);
    s.send(5019, request);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 150);
    assert.equal(
      currencyBalance(
        new CityWorld(s.store, 1901, s.now).state,
        "labyrinthCoin",
      ),
      150,
    );
    assert.equal(
      s.store.db
        .prepare(
          "SELECT count(*) AS n FROM currency_transactions WHERE currency='labyrinthCoin'",
        )
        .get()!.n,
      2,
    );
  } finally {
    s.cleanup();
  }
});

test("anexos de recursos usam as moedas originais sem ocupar slots ou repetir créditos", async () => {
  const s = setup();
  try {
    await s.store.createUser("currency_test", "test-currency-password", 1901);
    const mail = s.store.sendLocalItems(
      1901,
      "Recursos",
      [-100, -300, -400, -500, -600].map((template) => ({
        template,
        count: 10,
      })),
    );
    s.city.persist();
    const before = Object.fromEntries(
      (Object.keys(currencies) as Currency[]).map((c) => [
        c,
        currencyBalance(s.city.state, c),
      ]),
    );
    const items = structuredClone(s.city.state.items);
    const request = { mailsIdArray: [mail], position: [0] };
    s.send(5022, request);
    s.send(5022, request);
    for (const currency of [
      "gold",
      "spirit",
      "diamonds",
      "boundDiamonds",
      "lightCrystal",
    ] as Currency[])
      assert.equal(
        currencyBalance(s.city.state, currency),
        before[currency]! + 10,
      );
    assert.deepEqual(s.city.state.items, items);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT count(*) AS n FROM currency_transactions WHERE reason='mail:resource'",
        )
        .get()!.n,
      5,
    );
  } finally {
    s.cleanup();
  }
});

test("entrada valida mapa e permite a tentativa confirmada sem energia, sem premiar", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 11;
    const before = structuredClone(s.city.saved);
    let responses = s.send(5039, { para_int1: 1, para_int2: 9999 });
    assert.match(message(responses, 83).encode_msg, /não está disponível/);
    assert.deepEqual(s.city.saved, before);
    s.city.state.player.weary = 19;
    responses = s.send(5039, { para_int1: 1, para_int2: 1001 });
    assert.equal(message(responses, 125).room.campaignId, 1021);
    assert.equal(s.city.saved.map, 1021);
    assert.equal(s.city.saved.campaignRun!.rewarded, false);
    s.send(5038, { para_int1: 1021 });
    assert.equal(s.city.saved.campaignEntered, true);
    assert.equal(s.city.state.player.weary, 19);
  } finally {
    s.cleanup();
  }
});

test("campanha envia resultado e cartas ao vencer o boss, e encerra sem repetir prêmio", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.send(5155, { tempate_id: 10101, own_pawns: 300 });
    s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 212 });
    s.send(5038, { para_int1: 1021 });
    const weary = s.city.state.player.weary;
    win(s, 0);
    let result = s.send(5038, { para_int1: 1021 });
    assert.equal(s.city.state.player.weary, weary);
    assert.ok(
      !result.some(
        (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 135,
      ),
    );
    win(s, 1);
    const gp = s.city.state.player.totalGp;
    result = s.send(5038, { para_int1: 1021 });
    assert.ok(
      result.some(
        (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 137,
      ),
    );
    assert.equal(message(result, 135).card_count, 5);
    assert.equal(s.city.state.player.totalGp, gp + 1210);
    selectCapturedCard(s);
    assert.ok(
      Object.values(s.city.state.items).some(
        (i: any) => i.template_id === 2129006 && i.count === 40,
      ),
    );
    result = s.send(5180, { para_int1: 1 });
    assert.ok(
      result.some(
        (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 134,
      ),
    );
    assert.equal(s.city.saved.map, 1);
    s.send(5180, { para_int1: 1 });
    assert.equal(s.city.state.player.totalGp, gp + 1210);
  } finally {
    s.cleanup();
  }
});

test("pedestais seguem índices originais 1/4, 2/4 e 1/2/4, inclusive após reconectar", () => {
  for (const [id, nodes] of [
    [1001, [1, 4]],
    [1003, [2, 4]],
    [1007, [1, 2, 4]],
  ] as const) {
    const s = setup();
    try {
      s.city.state.player.grades = 30;
      s.city.saved.completedCampaigns = [1002, 1006];
      const map = campaignDefinitions.get(id)!.map;
      const entry = s.send(5039, { para_int1: 1, para_int2: id });
      if (id === 1001) assert.equal(message(entry, 4282).param1, 1);
      assert.equal(
        message(s.send(5038, { para_int1: map }), 4282).param1,
        nodes[0],
      );
      const indices = campaignBattleIndices(id);
      for (let i = 0; i < nodes.length - 1; i++) {
        // This fixture restores a legitimately saved stage win to exercise map callbacks.
        s.city.saved.campaignRun!.won.push(indices[i]!);
        s.city.persist();
        const load = s.send(5038, { para_int1: map });
        assert.equal(message(load, 4282).param1, nodes[i + 1]);
        assert.ok(
          !load.some(
            (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 21,
          ),
        );
        const restored = new CityWorld(s.store, 1901, s.now);
        const replies = restored.bootstrap();
        const updates = replies.filter(
          (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 4282,
        );
        assert.equal(message(updates.slice(-1), 4282).param1, nodes[i + 1]);
        assert.ok(
          !restored
            .handle(s.request(5035, { state: 4 }))
            .some(
              (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 127,
            ),
        );
      }
    } finally {
      s.cleanup();
    }
  }
});

test("resultado precede cartas, escolha revela o slot solicitado e crédito ocorre uma vez após save atômico", () => {
  for (const [index, templateId, count] of [
    [0, 2040103, 5],
    [4, 2129006, 40],
  ]) {
    const s = setup();
    try {
      s.send(5014, cases(5014)[0]!.request);
      s.send(5155, { tempate_id: 10101, own_pawns: 300 });
      s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 212 });
      s.send(5039, { para_int1: 1, para_int2: 1001 });
      s.send(5038, { para_int1: 1021 });
      win(s, 0);
      win(s, 1);
      const beforeItems = structuredClone(s.city.state.items);
      const result = s.send(5038, { para_int1: 1021 });
      const byOp = (op: number) =>
        result.find(
          (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === op,
        )!;
      assert.equal(byOp(135).delayMs - byOp(137).delayMs,5500);
      assert.ok(!byOp(26));
      assert.deepEqual(s.city.state.items, beforeItems);
      assert.equal(message(result, 4282).param1, 5);
      assert.ok(
        !s
          .send(5180, { para_int1: 1 })
          .some((r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 134),
      );
      assert.equal(s.city.saved.map, 1021);
      assert.ok(
        s.city.saved.campaignRun!.cards!.deck.every((c) =>
          [2040103, 2129006].includes(c.templateId),
        ),
      );
      s.city.saved.campaignRun!.cards!.deck[index!] = {
        templateId: templateId!,
        count: count!,
        bind: 1,
      };
      s.city.persist();
      const request = s.request(5122, {
        para_int1: 1901,
        para_int2: index,
        para_bool1: 0,
      });
      const before = structuredClone(s.city.saved);
      s.store.db.exec(
        "CREATE TRIGGER fail_card BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail card'); END",
      );
      assert.throws(() => s.city.handle(request), /fail card/);
      assert.deepEqual(s.city.saved, before);
      s.store.db.exec("DROP TRIGGER fail_card");
      const receipt = message(s.city.handle(request), 26);
      assert.equal(receipt.index, index);
      assert.equal(receipt.template_id, templateId);
      assert.equal(receipt.count, count);
      const items = structuredClone(s.city.state.items),
        xp = s.city.state.player.totalGp;
      const restored = new CityWorld(s.store, 1901, s.now);
      assert.equal(message(restored.handle(request), 26).index, index);
      assert.deepEqual(restored.state.items, items);
      assert.equal(restored.state.player.totalGp, xp);
      assertRejected(
        restored.handle(
          s.request(5122, {
            para_int1: 1901,
            para_int2: (index! + 1) % 5,
            para_bool1: 0,
          }),
        ),
        /já escolhida/,
      );
      assert.equal(message(restored.bootstrap(), 26).index, index);
      assert.ok(
        restored
          .handle(s.request(5180, { para_int1: 1 }))
          .some((r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 134),
      );
      assert.equal(restored.saved.map, 1);
      assertRejected(restored.handle(request), /Cartas de campanha indisponíveis/);
    } finally {
      s.cleanup();
    }
  }
});

test("mochila cheia preserva a carta pendente e rejeita identidade ou índice inválido", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.send(5155, { tempate_id: 10101, own_pawns: 300 });
    s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 212 });
    s.send(5039, { para_int1: 1, para_int2: 1001 });
    s.send(5038, { para_int1: 1021 });
    win(s, 0);
    win(s, 1);
    s.send(5038, { para_int1: 1021 });
    s.city.saved.campaignRun!.cards!.deck[1] = {
      templateId: 2040103,
      count: 5,
      bind: 1,
    };
    for (let pos = 0; pos < 42; pos++)
      s.city.state.items[`1:0:${pos}`] = {
        id: 7000000 + pos,
        template_id: 2129006,
        bag_type: 1,
        object_id: 0,
        pos,
        count: 9999,
        exist: 1,
        bind: 0,
      };
    s.city.persist();
    const before = structuredClone(s.city.saved);
    assertRejected(s.send(5122, { para_int1: 9000, para_int2: 1, para_bool1: 0 }), /Cartas de campanha indisponíveis/);
    assertRejected(s.send(5122, { para_int1: 1901, para_int2: 5, para_bool1: 0 }), /Carta inválida/);
    assert.match(
      message(
        s.send(5122, { para_int1: 1901, para_int2: 1, para_bool1: 0 }),
        83,
      ).encode_msg,
      /espaço/,
    );
    assert.deepEqual(s.city.saved, before);
    delete s.city.state.items["1:0:41"];
    s.city.persist();
    assert.equal(
      message(
        s.send(5122, { para_int1: 1901, para_int2: 1, para_bool1: 1 }),
        26,
      ).index,
      1,
    );
    assert.equal(s.city.state.items["1:0:41"]!.count, 5);
  } finally {
    s.cleanup();
  }
});

test("forja não implementada restaura o slot otimista e não altera o item ou seus atributos", () => {
  const s = setup();
  try {
    const before = structuredClone(s.city.state.items),
      hero = structuredClone(s.city.state.hero);
    const result = s.send(5005, {
      begin_bag_type: 4,
      begin_obj_id: 1901,
      begin_pos: 0,
      end_bag_type: 0,
      end_obj_id: 0,
      end_pos: 0,
      count: 1,
    });
    const moves = message(result, 115).moved;
    assert.ok(
      moves.some((v: any) => v.change_type === 4 && v.item?.id === 1088507),
    );
    assert.ok(moves.some((v: any) => v.change_type === 0 && !v.item));
    assert.deepEqual(s.city.state.items, before);
    assert.deepEqual(s.city.state.hero, hero);
    assert.match(
      message(s.send(5150, { src_itemid: 1088507 }), 83).encode_msg,
      /Nenhum item/,
    );
  } finally {
    s.cleanup();
  }
});

test("migração devolve arma presa na bolsa temporária, corrige poder e preserva vitórias", () => {
  const s = setup();
  try {
    const initial = cases(5014)[0]!,
      upgrade = cases(8203)[0]!;
    s.city.saved.used = [
      source.cases.indexOf(initial),
      source.cases.indexOf(upgrade),
    ];
    const item = s.city.state.items["4:1810:0"]!;
    delete s.city.state.items["4:1810:0"];
    s.city.state.items["0:0:0"] = { ...item, bag_type: 0, object_id: 0 };
    s.city.state.hero.fighting_capacity = 1042;
    s.city.saved.won = [0];
    delete s.city.saved.repairVersion;
    s.city.persist();
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.items["4:1810:0"]!.id, item.id);
    assert.equal(restored.state.items["0:0:0"], undefined);
    const h = restored.state.hero;
    const expectedCapacity = Math.floor(h.total_phy_attack + h.total_phy_defence + Math.floor(h.total_magic_attack * 1.05) + h.total_magic_defence + h.total_force_hit + h.total_live / 5 + h.total_conat_army);
    assert.equal(restored.state.hero.fighting_capacity, expectedCapacity);
    assert.equal(restored.state.player.fighting_capacity, expectedCapacity);
    assert.equal(restored.state.army.fightingCapacity, expectedCapacity);
    assert.deepEqual(restored.saved.won, [0]);
    assert.deepEqual(new CityWorld(s.store, 1901, s.now).state, restored.state);
  } finally {
    s.cleanup();
  }
});

test("campanha vencida antes de entregar recrutamento não cria missão parcial e libera o objetivo ao aceitar", () => {
  const s = setup();
  try {
    s.send(5014, cases(5014)[0]!.request);
    s.send(5155, { tempate_id: 10101, own_pawns: 300 });
    s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 212 });
    win(s, 0);
    win(s, 1);
    s.city.saved.map = 1;
    s.city.persist();
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.equal(restored.state.quests[1836], undefined);
    const claim = frame(
      5014,
      1901,
      encodeMessage(source.outgoing[5014], {
        template_id: 1834,
        reward_item_id: 0,
        is_pass: 0,
      }),
    );
    const result = restored.handle(claim),
      q = message(result, 112).quest.find((q: any) => q.template_id === 1836);
    assert.equal(q.template_id, 1836);
    assert.equal(q.condition_1, 1);
    assert.equal(q.is_complete, 1);
    assert.equal(q.is_accept, 1);
    assert.ok(
      Object.values(restored.state.quests).every((q: any) => q.template_id),
    );
  } finally {
    s.cleanup();
  }
});
function fashions(s: ReturnType<typeof setup>) {
  for (const c of cases(5022)) s.send(5022, c.request);
  for (const pos of [5, 6, 7, 8]) {
    s.send(5005, {
      begin_bag_type: 1,
      begin_obj_id: 0,
      begin_pos: pos,
      end_bag_type: 0,
      end_obj_id: 0,
      end_pos: 0,
      count: 1,
    });
    s.send(8594, { count: 1 });
  }
}
function addLocalFriend(s: ReturnType<typeof setup>): void {
  for (const id of [1901, 1902])
    s.store.db
      .prepare(
        "INSERT OR IGNORE INTO users(id,username,salt,hash) VALUES(?,?,?,?)",
      )
      .run(id, `fixture_${id}`, "fixture", "fixture");
  s.store.initTutorialProfile(1902);
  s.store.db
    .prepare(
      "UPDATE tutorial_profiles SET active=1,icon=3,nickname='AmigoLocal',process=25000 WHERE user_id=1902",
    )
    .run();
  s.send(15003, { nick_name: "AmigoLocal", relation: 1 });
  const friend = new CityWorld(s.store, 1902, s.now);
  friend.handle(
    frame(
      15012,
      1902,
      encodeMessage(source.outgoing[15012], { nick_name: "CidadeLocal" }),
    ),
  );
  s.city.tick();
}
test("missão de amizade exige aceitar outro personagem local e não avança por enviar uma mensagem", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 12;
    s.send(5012, { questId: [1854] });
    s.send(15005, { channel: 8, encode_msg: "/world" });
    assert.equal(s.city.state.quests[1854]!.is_complete, 0);
    addLocalFriend(s);
    const nick = "AmigoLocal";
    const result = s.send(15003, { nick_name: nick, relation: 1 });
    assert.equal(message(result, 78).user_id, 1902);
    const q = message(result, 112).quest.find(
      (q: any) => q.template_id === 1854,
    );
    assert.equal(q.condition_1, 1);
    assert.equal(q.is_complete, 1);
    s.send(15003, { nick_name: nick, relation: 1 });
    assert.equal(s.city.saved.friends!.length, 1);
    assert.equal(new CityWorld(s.store, 1901, s.now).saved.friends!.length, 1);
  } finally {
    s.cleanup();
  }
});
test("correio HTTP autentica o perfil e entrega XML comprimido no formato lido pelo Flash", async () => {
  const s = setup();
  let app: ReturnType<typeof buildHttp> | undefined;
  try {
    await s.store.createUser("mail_test", "local-mail-test-password", 1901);
    mkdirSync(join(s.store.dir, "tutorial"));
    copyFileSync(
      join(projectRoot, "data/tutorial/scenario.json"),
      join(s.store.dir, "tutorial/scenario.json"),
    );
    s.store.db
      .prepare("INSERT INTO tutorial_worlds(user_id,state) VALUES(?,?)")
      .run(
        1901,
        JSON.stringify({
          version: 1,
          wins: [0, 1, 2],
          process: 19500,
          cityEntered: true,
          complete: true,
          rewardCount: 3,
        }),
      );
    const config = {
      ...loadConfig(),
      dataDir: s.store.dir,
      mode: "tutorial" as const,
      resourceMode: "offline" as const,
      capturePackets: false,
    };
    const auth = new ReplayAuth(s.store),
      game = new GameServer(config, s.store, auth);
    app = buildHttp(config, s.store, auth, game);
    const p = publicEncrypt(
      {
        key: createPublicKey({ key: auth.jwk, format: "jwk" }),
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(`mail_test|${s.store.issue(1901)}|1234567|1901`),
    ).toString("base64");
    const { proof } = auth.login(p);
    const post = (url: string, body: any) =>
      app!.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams(body).toString(),
      });
    const list = await post("/maillist", { userId: "1901", key: proof });
    assert.equal(list.statusCode, 200);
    assert.match(
      inflateSync(list.rawPayload).toString(),
      /<Info .*ReceiveId="1901"/,
    );
    const items = await post("/itemlist", {
      userId: "1901",
      key: proof,
      itemId: "613338",
    });
    assert.equal(items.statusCode, 200);
    assert.match(
      inflateSync(items.rawPayload).toString(),
      /<Info id="613338" templateId="1090603"/,
    );
    assert.equal(
      (await post("/maillist", { userId: "1810", key: proof })).statusCode,
      403,
    );
    assert.equal(
      (
        await post("/itemlist", {
          userId: "1901",
          key: "bad",
          itemId: "613338",
        })
      ).statusCode,
      403,
    );
  } finally {
    await app?.close();
    s.cleanup();
  }
});
function campaignTroopFixture(s: ReturnType<typeof setup>) {
  // Campaign victory tests start with the army recruited in the preceding tutorial quest.
  if (!(s.city.state.army.armyPawn ?? []).some((p) => p.own_pawns > 0)) {
    const pawn = structuredClone(
      s.city.state.pawnStock!.find((p) => p.son_type === 101)!,
    );
    s.city.state.army.armyPawn = [
      { ...pawn, army_id: 1810, sites: 0, own_pawns: 200 },
    ];
    s.city.persist();
  }
}
function win(s: ReturnType<typeof setup>, index: number) {
  campaignTroopFixture(s);
  s.city.startBattle(index);
  const b = s.city.saved.battle!;
  s.city.handle(frame(10007, 1901, protoString(2, b.id)));
  s.advance();
  for (let i = 0; i < 100 && !b.finished; i++) {
    s.city.tick();
    s.advance();
  }
  assert.equal(b.won, true);
}
test("recrutamento aceita quantidades diferentes, desconta ouro e valida reserva e comando", () => {
  const s = setup();
  try {
    const gold = s.city.state.economy.gold_total_count;
    assert.ok(s.send(5155, { tempate_id: 10101, own_pawns: 200 }).length);
    assert.equal(s.city.state.economy.gold_total_count, gold - 400);
    assert.ok(
      s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 150 }).length,
    );
    assert.equal(
      s.city.state.pawnStock!.find((p: any) => p.tempate_id === 10101)!
        .own_pawns,
      50,
    );
    assert.equal(
      message(s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 203 }), 83)
        .is_centerTip,
      1,
    );
    assert.ok(
      s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 0 }).length,
    );
    assert.equal(
      s.city.state.pawnStock!.find((p: any) => p.tempate_id === 10101)!
        .own_pawns,
      200,
    );
    assert.equal(
      message(s.send(5155, { tempate_id: 10101, own_pawns: -1 }), 83)
        .is_centerTip,
      1,
    );
    assert.equal(
      message(s.send(5155, { tempate_id: 10101, own_pawns: 3001 }), 83)
        .is_centerTip,
      1,
    );
  } finally {
    s.cleanup();
  }
});

test("derrota fora do tutorial não concede recompensa; a luta pode ser tentada novamente", () => {
  const s = setup();
  try {
    s.city.startBattle(0);
    let b = s.city.saved.battle!;
    b.fighters.find((f) => f.living_id === b.hero)!.hp = 1;
    const gp = s.city.state.player.totalGp;
    s.city.handle(frame(10007, 1901, protoString(2, b.id)));
    // A tick now resolves one action, not the entire captured round.
    let ending: any[] = [];
    for (let i = 0; i < 100 && !b.finished; i++) { s.advance(); ending = s.city.tick(); }
    assert.equal(b.finished, true);
    assert.equal(b.won, false);
    const defeat=ending.find(p=>Buffer.from(p.frame,'base64').readUInt16BE(6)===4103)!;
    assert.ok(defeat);
    assert.ok(defeat.delayMs >= 1000 && defeat.delayMs < 1500);
    assert.ok(ending.every(p=>p.delayMs < 2000));
    assert.deepEqual(s.city.saved.won, []);
    assert.equal(s.city.state.player.totalGp, gp);
    assert.ok(s.send(5155, { tempate_id: 10101, own_pawns: 200 }).length);
    assert.ok(
      s.send(5156, { sites: 0, tempate_id: 10101, own_pawns: 200 }).length,
    );
    win(s, 0);
    assert.ok(s.city.state.player.totalGp > gp);
  } finally {
    s.cleanup();
  }
});

test("missões encadeiam recrutamento, campanha, fazenda e labirinto sem liberar prêmio antecipado", () => {
  const s = setup();
  try {
    const claim = (id: number) => {
      const c = cases(5014).find((c) => c.request?.template_id === id)!;
      return s.send(5014, c.request);
    };
    assertRejected(claim(1836), /missão/i);
    assert.ok(claim(1832).length);
    assert.ok(s.send(5012, { questId: [1834] }).length);
    assertRejected(claim(1834), /missão/i);
    for (const op of [5155, 5156])
      for (const c of cases(op)) assert.ok(s.send(op, c.request).length);
    assert.ok(claim(1834).length);
    assert.ok(s.send(5012, { questId: [1836] }).length);
    win(s, 0);
    win(s, 1);
    const end = cases(5038)
      .filter((c) => c.request?.para_int1 === 1021)
      .at(-1)!;
    assert.ok(s.send(5038, end.request).length);
    assert.ok(claim(1836).length);
    assert.equal(s.city.state.player.grades, 12);
    assert.ok(s.send(5012, { questId: [1839] }).length);
    assert.ok(s.send(5012, { questId: [1854] }).length);
    for (const c of cases(15044)
      .filter((c) => c.request?.op_type === 1)
      .reverse())
      assert.ok(s.send(15044, { ...c.request, friend_id: 1901 }).length);
    assert.ok(claim(1839).length);
    addLocalFriend(s);
    assert.ok(claim(1854).length);
    assert.equal(
      s.city.state.farms[1810]!.farmLandInfo.filter(
        (p: any) => p.item_template_id,
      ).length,
      2,
    );
    assert.ok(s.send(5012, { questId: [1840] }).length);
    const entry = cases(8296)[0]!;
    assert.ok(s.send(8296, entry.request).length);
    assert.equal(s.city.state.items["1:0:3"], undefined);
    fashions(s);
    win(s, 2);
    assert.equal(s.city.state.quests[1840]!.is_complete, 1);
    s.city.handle(frame(5125, 1901, protoInt(1, 800104)));
    assert.equal(s.city.state.quests[1840]!.is_complete, 1);
  } finally {
    s.cleanup();
  }
});

test("habilidades aprendidas e atalhos aceitam ordem alternativa e persistem", () => {
  const s = setup();
  try {
    s.city.state.player.grades = 20;
    s.city.persist();
    const learned = cases(5185);
    for (const c of learned.reverse())
      assert.ok(s.send(5185, c.request).length);
    assert.equal(s.city.state.hero.skill_point, 4);
    assert.equal(
      new Set(s.city.state.hero.skill_script.split(",").filter(Boolean)).size,
      6,
    );
    assert.equal(message(s.send(5185, learned[0]!.request), 83).is_centerTip, 1);
    assert.ok(s.send(5167, { fast_key: "113,110,108,107,-1," }).length);
    assert.equal(message(s.send(5167, { fast_key: "999,-1,-1,-1,-1," }), 83).is_centerTip, 1);
    assert.equal(
      new CityWorld(s.store, 1901, s.now).state.hero.fast_key,
      "113,110,108,107,-1,",
    );
  } finally {
    s.cleanup();
  }
});

test("cidade serializa entrada e mantém UID local em todos os modelos conhecidos", () => {
  const s = setup();
  try {
    for (const r of [...s.city.login(), ...s.city.bootstrap()]) {
      const p = Buffer.from(r.frame, "base64");
      assert.equal(p.readUInt32BE(8), 1901);
      const name = source.incoming[p.readUInt16BE(6)];
      if (name) assert.doesNotThrow(() => decodeMessage(name, p.subarray(20)));
    }
    const p = Buffer.from(s.city.login()[0]!.frame, "base64");
    assert.equal(
      decodeMessage(source.incoming[3], p.subarray(20)).nick_name,
      "CidadeLocal",
    );
    assert.match(s.city.mailXml(), /ReceiveId="1901"/);
    assert.match(s.city.mailXml(), /IsAnnex1="false"/);
    assert.match(s.city.itemXml("613338"), /templateId="1090603"/);
  } finally {
    s.cleanup();
  }
});

test("anexos, modas e atributos persistem sem recompensa duplicada e aceitam outra ordem", () => {
  const s = setup();
  try {
    for (const c of cases(5022).reverse())
      assert.ok(s.send(5022, c.request).length);
    assert.equal(s.city.state.player.point, 10000000);
    assert.equal(s.city.state.player.gift_token, 10000000);
    const count = Object.keys(s.city.state.items).length;
    for (const c of cases(5022)) {
      const repeated = s.send(5022, c.request);
      // Identical warnings may be suppressed; no reward/model packet may repeat.
      if (repeated.length) assertRejected(repeated, /já foram recolhidos/);
    }
    assert.equal(Object.keys(s.city.state.items).length, count);
    const before = s.city.state.hero.total_live;
    for (const pos of [8, 6, 5, 7]) {
      assert.ok(
        s.send(5005, {
          begin_bag_type: 1,
          begin_obj_id: 0,
          begin_pos: pos,
          end_bag_type: 0,
          end_obj_id: 0,
          end_pos: 0,
          count: 1,
        }).length,
      );
      assert.ok(s.send(8594, { count: 1 }).length);
    }
    assert.equal(s.city.saved.fashion!.level, 5);
    assert.equal(s.city.saved.fashion!.xp, 0);
    assert.equal(
      s.city.state.hero.total_live,
      Math.floor((before + 3000) * 1.02),
    );
    assert.ok(s.city.state.army.wing);
    assert.ok(s.city.state.army.hat);
    assert.ok(s.city.state.army.fashion_arm);
    assert.ok(s.city.state.army.fashion_cloth);
    for (const t of [1090603, 1100801, 1110801, 1120801])
      assert.ok(s.city.state.fashions[t]);
    assert.equal(s.city.state.items["0:0:0"], undefined);
    const unchanged = structuredClone(s.city.saved);
    s.send(8594, { count: 1 });
    assert.deepEqual(s.city.saved, unchanged);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.deepEqual(restored.state, s.city.state);
    assert.match(restored.mailXml(), /IsAnnex1="true"/);
    const preparation = s.city
      .startBattle(2)
      .find((r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 157)!;
    const hero = decodeMessage(
      source.incoming[157],
      Buffer.from(preparation.frame, "base64").subarray(20),
    ).heros.find((h: any) => h.user_id === 1901);
    assert.equal(hero.max_hp, s.city.state.hero.total_live);
    assert.equal(hero.fashion_cloth_avata, s.city.state.army.fashion_cloth);
  } finally {
    s.cleanup();
  }
});

test("plantio e operações observadas da fazenda consomem sementes uma vez e preservam os outros lotes", () => {
  const s = setup();
  try {
    const seedCase = cases(5014).find((c) => c.request?.template_id === 1836)!;
    const seed = seedCase.responses
      .filter((p) => p.opcode === 115)
      .flatMap((p) => p.message?.moved ?? [])
      .map((v) => v.item)
      .find((v) => v?.template_id === 2160002);
    assert.ok(seed);
    s.city.state.items["1:0:2"] = structuredClone(seed);
    const before = seed.count;
    for (const c of cases(15044)
      .filter((c) => c.request?.op_type === 1)
      .reverse())
      assert.ok(s.send(15044, { ...c.request, friend_id: 1901 }).length);
    assert.equal(s.city.state.items["1:0:2"]?.count ?? 0, before - 2);
    const farm = s.city.state.farms[1810]!;
    assert.ok(farm.farmLandInfo.find((p: any) => p.pos === 1).item_template_id);
    assert.ok(farm.farmLandInfo.find((p: any) => p.pos === 2).item_template_id);
    assert.equal(
      Date.parse(farm.farmLandInfo.find((p: any) => p.pos === 1).mature_time) -
        Date.parse(farm.farmLandInfo.find((p: any) => p.pos === 1).add_time),
      3600000,
    );
    const weed = cases(15044).find((c) => c.request?.op_type === 3)!;
    assert.ok(s.send(15044, { ...weed.request, friend_id: 1901 }).length);
    assert.equal(
      s.city.state.farms[1810]!.farmLandInfo.find((p: any) => p.pos === 1)
        .is_grass,
      0,
    );
    assert.equal(
      message(s.send(15044, { ...weed.request, friend_id: 1901 }), 4387)
        .farmLandInfo[0].result,
      1,
    );
    for (const c of cases(15044).filter(
      (c) => c.request?.friend_id === 1605 && c.request?.op_type === 8,
    ))
      assert.ok(s.send(15044, c.request).length);
    const gold = s.city.state.economy.gold_total_count;
    for (const c of cases(15044).filter((c) => c.request?.op_type === 14)) {
      assert.ok(s.send(15044, c.request).length);
      assert.equal(
        message(s.send(15044, c.request), 4387).farmLandInfo[0].result,
        1,
      );
    }
    assert.equal(s.city.state.economy.gold_total_count, gold); // Foreign captured farms no longer exist locally.
  } finally {
    s.cleanup();
  }
});

test("construção segue níveis e custos observados e recusa saltos ou recursos insuficientes", () => {
  const s = setup();
  try {
    const first = cases(8203)[0]!;
    const patch = first.patches.find(
      (p) => p.path[0] === "buildings" && p.path.at(-1) === "template_id",
    )!;
    s.city.state.buildings["181001441"] = {
      ...first.responses.find((p) => p.opcode === 4130)!.message!.building[0],
      template_id: patch.before,
    };
    s.city.state.economy.gold_total_count = 1000000;
    s.city.state.economy.crystals_count = 1000000;
    let template = patch.before;
    for (let level = 1; level <= 10; level++) {
      const responses = s.send(8203, { building_id: 190101441 });
      assert.ok(responses.length);
      assert.equal(
        s.city.state.buildings["181001441"]!.template_id,
        ++template,
      );
    }
    const source = s.city.saved.attributes!.sources["sanctuary"]!;
    assert.equal(source.kind, "permanent");
    assert.equal(source.values.total_phy_attack, 1250);
    const savedHero = structuredClone(s.city.state.hero);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.deepEqual(restored.state.hero, savedHero);
    assert.deepEqual(restored.saved.attributes, s.city.saved.attributes);
    assert.equal(
      message(s.send(8203, { building_id: 190101441 }), 83).is_centerTip,
      1,
    );
    assert.ok(s.city.state.economy.crystals_count < 1000000);
  } finally {
    s.cleanup();
  }
});

test("recompensas de tempo usam relógio local e não permitem coleta antecipada ou repetida", () => {
  const s = setup();
  try {
    assertRejected(s.send(5019, { time: 5, operate: 1 }), /Aguarde o tempo indicado/);
    s.advance(300000);
    const before = s.city.state.player.strategy;
    assert.ok(s.send(5019, { time: 5, operate: 1 }).length);
    assert.equal(s.city.state.player.strategy, before + 25000);
    assertRejected(s.send(5019, { time: 5, operate: 1 }), /já foi coletada/);
    s.advance(600000);
    assert.ok(s.send(5019, { time: 10, operate: 1 }).length);
    assert.equal(s.city.state.player.strategy, before + 75000);
  } finally {
    s.cleanup();
  }
});

test("labirinto restaura personagem e portal após sair, avança somente pelo portal e conclui missão", () => {
  const s = setup();
  const click = (world: CityWorld, node: number) =>
    world.handle(frame(5125, 1901, protoInt(1, node)));
  try {
    fashions(s);
    campaignTroopFixture(s);
    s.city.state.items["1:0:80"] = {
      id: 500080,
      template_id: 208008,
      bag_type: 1,
      object_id: 0,
      pos: 80,
      count: 1,
      exist: 1,
      bind: 1,
    };
    s.city.state.quests[1840] = {
      ...source.questCatalog[1840],
      template_id: 1840,
      is_accept: 1,
      is_complete: 0,
    };
    s.city.persist();
    const firstEntry = s.send(8296, {
      choose_index: 1,
      campaign_id: 8001,
      is_double: 2,
    });
    assert.equal(
      firstEntry.filter(
        (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 127,
      ).length,
      1,
    );
    assert.equal(s.city.saved.map, 8001);
    const beforePortal = click(s.city, 800104);
    assert.ok(message(beforePortal, 83));
    assert.equal(s.city.saved.map, 8001);
    const beforeWin = s.send(5038, { para_int1: 8001 });
    assert.equal(
      message(firstEntry, 127).node.find((n: any) => n.node_id === 800104)
        .state,
      16,
    );
    assert.equal(
      beforeWin.filter(
        (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 127,
      ).length,
      0,
    );
    assert.equal(message(firstEntry, 21).player[0].player_id, 1901);
    assert.ok(message(beforeWin, 20).soldierTemplated.length > 0);
    click(s.city, 800102);
    const b = s.city.saved.battle!;
    s.city.handle(frame(10007, 1901, protoString(2, b.id)));
    const packets = [];
    for (let i = 0; i < 100 && !b.finished; i++) {
      s.advance();
      packets.push(...s.city.tick());
    }
    assert.equal(b.won, true);
    assert.equal(s.city.saved.labyrinth!.floor, 1);
    assert.equal(s.city.state.quests[1840]!.is_complete, 1);
    assert.equal(message(packets, 112).quest.find((q: any) => q.template_id === 1840).is_complete, 1);
    assert.equal(
      message(
        packets.filter((p) => {
          const f = Buffer.from(p.frame, "base64");
          return (
            f.readUInt16BE(6) === 128 &&
            decodeMessage(s.city.scenario.incoming[128], f.subarray(20))
              .node_id === 800104
          );
        }),
        128,
      ).node_state,
      1,
    );
    const xp = s.city.state.player.totalGp;
    s.send(5025, { msg: "" });
    assert.equal(s.city.saved.map, 1);
    const restored = new CityWorld(s.store, 1901, s.now);
    const enter = restored
      .handle(
        s.request(8296, { choose_index: 0, campaign_id: 8001, is_double: 1 }),
      )
      .concat(restored.handle(s.request(5038, { para_int1: 8001 })));
    assert.equal(restored.saved.map, 8001);
    assert.equal(message(enter, 125).room.campaignId, 8001);
    assert.equal(message(enter, 21).player[0].player_id, 1901);
    assert.equal(message(enter, 131).army_id, 1901);
    const nodes = message(enter, 127).node;
    assert.equal(nodes.find((n: any) => n.node_id === 800102).state, 8);
    assert.equal(nodes.find((n: any) => n.node_id === 800104).state, 1);
    assert.ok(message(click(restored, 800102), 83));
    assert.equal(restored.state.player.totalGp, xp);
    const illegal = restored.handle(s.request(5038, { para_int1: 8002 }));
    assert.ok(message(illegal, 83));
    assert.equal(restored.saved.map, 8001);
    const before = structuredClone(restored.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_portal BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'portal failure'); END",
    );
    assert.throws(() => click(restored, 800104), /portal failure/);
    assert.deepEqual(restored.saved, before);
    s.store.db.exec("DROP TRIGGER fail_portal");
    const portal = click(restored, 800104);
    assert.equal(restored.saved.map, 8002);
    assert.equal(message(portal, 125).created_type, 3);
    assert.equal(restored.state.quests[1840]!.is_complete, 1);
    assert.equal(
      message(portal, 112).quest.find((q: any) => q.template_id === 1840)
        .is_complete,
      1,
    );
    restored.handle(s.request(5025, { msg: "" }));
    const again = new CityWorld(s.store, 1901, s.now);
    again.handle(
      s.request(8296, { choose_index: 0, campaign_id: 8001, is_double: 1 }),
    );
    assert.equal(again.saved.map, 8002);
    assert.equal(again.state.player.totalGp, xp);
  } finally {
    s.cleanup();
  }
});

test("combates livres concedem recompensa única; labirinto preserva piso ao sair e entrar", () => {
  const s = setup();
  try {
    assert.ok(s.send(5014, cases(5014)[0]!.request).length);
    for (const op of [5155, 5156])
      for (const c of cases(op)) assert.ok(s.send(op, c.request).length);
    campaignTroopFixture(s);
    for (const index of [0, 1, 2]) {
      if (index === 2) fashions(s);
      const p = s.city.startBattle(index);
      assert.ok(p.length);
      const b = s.city.saved.battle!;
      s.city.handle(frame(10007, 1901, protoString(2, b.id)));
      s.advance();
      for (let i = 0; i < 100 && !b.finished; i++) {
        s.city.tick();
        s.advance();
      }
      assert.equal(b.won, true, `battle ${index}`);
      assertRejected(s.city.startBattle(index), /Encontro já concluído/);
    }
    assert.equal(s.city.state.tower.tower_index, 1);
    assert.ok(s.send(5025, { msg: "" }).length);
    assert.ok(
      s.send(8296, { choose_index: 0, campaign_id: 8001, is_double: 1 }).length,
    );
    assert.equal(s.city.saved.map, 8001);
    const restored = new CityWorld(s.store, 1901, s.now);
    assert.deepEqual(restored.saved.won, [0, 1, 2]);
  } finally {
    s.cleanup();
  }
});
