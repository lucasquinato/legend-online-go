import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoString, protoInt } from "../src/protocol.js";
import { decodeMessage, encodeMessage } from "../src/messages.js";
import {
  campaignBattleIndices,
  campaignDefinitions,
  grantChapterRewards,
  campaignRank,
  campaignRules,
} from "../src/features/campaign/index.js";
import { localCampaignConfig } from "../src/features/campaign/config-overrides.js";
import {
  energyDialogResource,
  energyDialogIndex,
} from "../src/features/campaign/ui-resource.js";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { adventureSkill } from "../src/adventure-combat.js";

async function setup(icon = 3) {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const dir = mkdtempSync(join(projectRoot, ".test-data", "campaign-rules-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(
    join(projectRoot, "data/city/scenario.json"),
    join(dir, "city/scenario.json"),
  );
  const store = new Store(dir);
  await store.createUser("campaign_rules", "test-password-123", 1959);
  store.initTutorialProfile(1959);
  store.db
    .prepare(
      "UPDATE tutorial_profiles SET active=1,icon=?,nickname='Local',sex=?,process=25000 WHERE user_id=1959",
    )
    .run(icon, icon > 3 ? 1 : 0);
  let time = 1900000000000,
    city = new CityWorld(store, 1959, () => time);
  city.state.player.grades = 11;
  city.persist();
  const send = (op: number, r: any = {}) =>
    city.handle(frame(op, 1959, encodeMessage(city.scenario.outgoing[op]!, r)));
  const msg = (responses: any[], op: number) => {
    const p = (op === 112 ? [...responses].reverse() : responses).find(
      (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === op,
    );
    assert.ok(p, `opcode ${op} absent`);
    return decodeMessage(
      city.scenario.incoming[op]!,
      Buffer.from(p.frame, "base64").subarray(20),
    );
  };
  return {
    store,
    get city() {
      return city;
    },
    send,
    msg,
    advance: (ms: number) => (time += ms),
    now: () => time,
    reload: () => (city = new CityWorld(store, 1959, () => time)),
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("as seis identidades recebem a base da classe e concluem a Toca dos Lobos com inimigos intactos", async () => {
  for (const icon of [1, 2, 3, 4, 5, 6]) {
    const s = await setup(icon);
    try {
      const job = ((icon - 1) % 3) + 1;
      assert.equal(s.city.saved.attributes!.naturalProgression!.classJob, job);
      const own = s.city.state.hero;
      assert.ok(
        job === 3
          ? own.total_magic_attack > own.total_phy_attack
          : own.total_phy_attack > own.total_magic_attack,
      );
      const before = structuredClone(s.city.saved.attributes!.sources.natural);
      s.reload();
      assert.deepEqual(s.city.saved.attributes!.sources.natural, before);
      const troopCount = Math.min(202, own.total_conat_army);
      s.send(5155, { tempate_id: 10101, own_pawns: troopCount });
      s.send(5156, { tempate_id: 10101, own_pawns: troopCount, sites: 0 });
      assert.equal(s.city.state.army.armyPawn[0].own_pawns, troopCount);
      s.send(5039, { para_int1: 1, para_int2: 1001 });
      s.send(5038, { para_int1: 1021 });
      for (const index of [0, 1]) {
        s.city.handle(frame(8666, 1959));
        const b = s.city.saved.battle!;
        assert.equal(b.reference, index);
        s.city.handle(frame(10007, 1959, protoString(2, b.id)));
        for (let i = 0; i < 100 && !b.finished; i++) {
          s.advance(10000);
          adventureSkill(b, job * 10000 + (i % 2 ? 711 : 811), s.now());
          s.city.tick();
        }
        assert.equal(
          b.won,
          true,
          `classe ${job}, ícone ${icon}, encontro ${index}: ${JSON.stringify({ hero: b.hero, turns: b.turn, scales: [b.attackScale, b.defenceScale], skill: s.city.state.hero.skill_script, fighters: b.fighters.map((f) => ({ id: f.living_id, side: f.side, hp: f.hp, max: f.max_hp, skill: f.skillId })) })}`,
        );
      }
      s.send(5038, { para_int1: 1021 });
      assert.ok(s.city.saved.completedCampaigns!.includes(1001));
      s.send(5122, { para_int1: 1959, para_int2: 0, para_bool1: 0 });
      s.send(5025, { msg: "" });
      assert.equal(s.city.saved.map, 1);
    } finally {
      s.cleanup();
    }
  }
});
test("modelos de seis personagens nunca reenviam a guerreira de nível 12 nas trocas de cena", async () => {
  for (const icon of [1, 2, 3, 4, 5, 6]) {
    const s = await setup(icon);
    try {
      s.city.state.player.grades = 27;
      s.city.persist();
      const snapshot = structuredClone(s.city.state.hero);
      const packets = s
        .send(5039, { para_int1: 1, para_int2: 1001 })
        .concat(s.send(5038, { para_int1: 1021 }));
      for (const op of [3, 113, 150]) {
        const models = packets.filter(
          (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === op,
        );
        if (!models.length) continue;
        for (const p of models) {
          const m = s.msg([p], op),
            h = op === 150 ? m.simple_hero_info : m;
          assert.equal(op === 3 ? h.grades : h.grade, 27);
          assert.equal(op === 3 ? h.pic : h.tempate_id, icon);
          assert.equal(h.fighting_capacity, snapshot.fighting_capacity);
        }
      }
      const player = s
        .msg(packets, 21)
        .player.find((p: any) => p.player_id === 1959);
      assert.equal(player.template_id, icon);
      assert.equal(player.grades, 27);
      const stale = s.city.scenario.queries
        .flatMap((q) => q.responses)
        .find((p) => p.opcode === 150)!;
      const army = s.msg([s.city.packet(stale)], 150);
      assert.equal(army.simple_hero_info.grade, 27);
      assert.equal(army.simple_hero_info.tempate_id, icon);
      s.send(5180, { para_int1: 1 });
      s.reload();
      assert.equal(s.city.state.hero.tempate_id, icon);
      assert.equal(s.city.state.hero.grade, 27);
      assert.equal(
        s.city.state.player.totalGp,
        snapshot.totalGp ?? s.city.state.player.totalGp,
      );
    } finally {
      s.cleanup();
    }
  }
});
test("sem energia conclui encontros e fase sem XP, espírito, drops ou cartas e preserva conclusão geral", async () => {
  const s = await setup();
  try {
    s.city.state.player.weary = 0;
    s.city.persist();
    const before = {
      xp: s.city.state.player.totalGp,
      spirit: s.city.state.player.strategy,
      items: structuredClone(s.city.state.items),
    };
    s.send(5039, { para_int1: 1, para_int2: 1001 });
    s.send(5038, { para_int1: 1021 });
    assert.equal(s.city.saved.campaignRun!.rewarded, false);
    assert.equal(s.city.state.player.weary, 0);
    for (const index of [0, 1]) {
      s.city.startBattle(index);
      const b = s.city.saved.battle!;
      for (const f of b.fighters.filter((f) => f.side === 2)) f.hp = 1;
      s.city.handle(frame(10007, 1959, protoString(2, b.id)));
      for (let i = 0; i < 100 && !b.finished; i++) {
        s.advance(10000);
        s.city.tick();
      }
      assert.equal(b.won, true);
    }
    const result = s.send(5038, { para_int1: 1021 });
    assert.equal(s.msg(result, 137).total_gp, 0);
    assert.ok(
      !result.some((p) =>
        [135, 26].includes(Buffer.from(p.frame, "base64").readUInt16BE(6)),
      ),
    );
    assert.equal(s.city.state.player.totalGp, before.xp);
    assert.equal(s.city.state.player.strategy, before.spirit);
    assert.deepEqual(s.city.state.items, before.items);
    assert.equal(s.city.saved.map, 1);
    assert.ok(s.city.saved.completedCampaigns!.includes(1001));
    s.reload();
    assert.ok(s.city.saved.completedCampaigns!.includes(1001));
  } finally {
    s.cleanup();
  }
});
test("prêmios de capítulo são emails únicos, normal separado de SsS, persistindo retirada e reinício", async () => {
  const s = await setup();
  try {
    const first = [1001, 1002, 1003, 1004, 1005, 1006, 1007];
    assert.equal(
      grantChapterRewards(s.store, 1959, first.slice(0, -1)).length,
      0,
    );
    const mail = grantChapterRewards(s.store, 1959, first)[0]!;
    assert.equal(grantChapterRewards(s.store, 1959, first).length, 0);
    const detail = JSON.parse(
      String(
        s.store.db
          .prepare("SELECT detail FROM local_mail WHERE mail_id=?")
          .get(mail)!.detail,
      ),
    );
    assert.equal(detail.annex1Name, -100);
    assert.equal(detail.annex1Count, 500000);
    s.city.saved.completedCampaigns = first;
    s.city.persist();
    const gold = s.city.state.economy.gold_total_count;
    s.send(5022, { mailsIdArray: [mail], position: [0] });
    assert.equal(s.city.state.economy.gold_total_count, gold + 500000);
    s.reload();
    assert.equal(grantChapterRewards(s.store, 1959, first).length, 0);
    const normal = [...first, 1101, 1102, 1103, 1104, 1105, 1106, 1107];
    assert.equal(grantChapterRewards(s.store, 1959, normal).length, 1);
    const all = [...normal, 11101, 11102, 11103, 11104, 11105, 11106, 11107];
    assert.equal(grantChapterRewards(s.store, 1959, all).length, 1);
    assert.equal(grantChapterRewards(s.store, 1959, all).length, 0);
    assert.equal(campaignRank(1101), 5);
    assert.equal(campaignRank(11101), 7);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT COUNT(*) n FROM account_grants WHERE grant_key LIKE 'campaign:chapter:%'",
        )
        .get()!.n,
      3,
    );
  } finally {
    s.cleanup();
  }
});
test("poção respeita limite 200, descarta excedente e loja cobra diamantes sem alterar ouro", async () => {
  const s = await setup();
  try {
    const mail = Number(
      s.store.db
        .prepare("SELECT mail_id FROM account_grants WHERE user_id=1959")
        .get()!.mail_id,
    );
    s.send(5022, { mailsIdArray: [mail], position: [0] });
    const potion = Object.values(s.city.state.items).find(
      (i) => i.template_id === 2030503,
    )!;
    s.city.state.player.weary = 180;
    s.city.persist();
    s.send(5006, { bag_type: 1, pos: potion.pos, count: 2 });
    assert.equal(s.city.state.player.weary, 200);
    assert.equal(potion.count, 9997);
    s.send(5006, { bag_type: 1, pos: potion.pos, count: 1 });
    assert.equal(s.city.state.player.weary, 200);
    assert.equal(potion.count, 9996);
    s.city.state.player.point = 100;
    s.city.state.player.gift_token = 100;
    s.city.persist();
    const gold = s.city.state.economy.gold_total_count;
    const buy = {
      buyInfo: { good_id: 3, count: 2, type: 1, receive_id: 1959 },
      pay_type: 1,
    };
    assert.equal(s.msg(s.send(5154, buy), 90).buyInfo.result, 1);
    assert.equal(s.city.state.player.point, 50);
    assert.equal(s.city.state.player.gift_token, 100);
    assert.equal(s.city.state.economy.gold_total_count, gold);
    s.store.db.exec(
      "CREATE TRIGGER fail_shop BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'falha compra'); END",
    );
    const before = structuredClone(s.city.saved);
    assert.throws(() => s.send(5154, buy), /falha compra/);
    assert.deepEqual(s.city.saved, before);
  } finally {
    s.cleanup();
  }
});
test("emails de capítulo usam nome original e textos pedidos, sem reenviar ou alterar anexos", async () => {
  const s = await setup();
  try {
    const completed = campaignRules.campaigns.filter(c=>c.DungeonId==="102").map(c=>Number(c.CampaignId));
    const ids = grantChapterRewards(s.store,1959,completed);
    assert.equal(ids.length,2);
    const mails = ids.map(id=>JSON.parse(String(s.store.db.prepare("SELECT detail FROM local_mail WHERE mail_id=?").get(id)!.detail)));
    assert.deepEqual(mails.map(m=>m.title),["Conclusão de campanha","Conclusão de campanha SsS"]);
    assert.ok(mails.every(m=>m.sendNickName==="Email do sistema"));
    assert.deepEqual(mails.map(m=>m.contents),["Recompensa pela conclusão do mapa Floresta Nebulosa","Recompensa pela conclusão do mapa Floresta Nebulosa SsS"]);
    const before = JSON.stringify(mails);
    assert.deepEqual(grantChapterRewards(s.store,1959,completed),[]);
    assert.equal(JSON.stringify(ids.map(id=>JSON.parse(String(s.store.db.prepare("SELECT detail FROM local_mail WHERE mail_id=?").get(id)!.detail)))),before);
  } finally {s.cleanup();}
});

test("bot cobra custos, conclui a cada 15s, persiste offline e polls não repetem recompensa", async () => {
  const s = await setup();
  try {
    s.city.state.player.grades = 27;
    s.city.state.player.weary = 200;
    s.city.saved.completedCampaigns = [1001];
    s.city.persist();
    const xp = s.city.state.player.totalGp,
      gold = s.city.state.economy.gold_total_count;
    const start = { sweep_type: 1, op_type: 1, campaign_id: 1001, count: 2 };
    const result = s.send(8528, start);
    assert.equal(s.msg(result, 4425).result[0].time, 30);
    assert.equal(s.city.state.player.weary, 160);
    assert.equal(s.city.state.economy.gold_total_count, gold - 10000);
    s.send(8528, start);
    assert.equal(s.city.state.player.weary, 160);
    s.advance(14999);
    s.city.tick();
    assert.equal(s.city.state.player.totalGp, xp);
    s.advance(1);
    const firstPackets = s.city.tick();
    assert.equal(firstPackets.some(p => [83,111].includes(Buffer.from(p.frame, "base64").readUInt16BE(6))), false);
    assert.equal(s.city.saved.sweep!.completed, 1);
    const firstUpdate = s.msg(firstPackets, 4425);
    assert.equal(firstUpdate.status, 7);
    assert.deepEqual(firstUpdate.result.map((r: any) => r.type), [1, 2]);
    assert.equal(firstUpdate.result[0].finishCount, 1);
    assert.equal(firstUpdate.result[1].time, 15);
    assert.ok(s.city.state.player.totalGp > xp);
    const first = s.city.state.player.totalGp;
    s.send(8528, { sweep_type: 1, op_type: 3, campaign_id: 1001 });
    assert.equal(s.city.state.player.totalGp, first);
    s.advance(15000);
    s.reload();
    const finalPackets = s.city.tick();
    assert.equal(finalPackets.some(p => [83,111].includes(Buffer.from(p.frame, "base64").readUInt16BE(6))), false);
    assert.equal(s.city.saved.sweep!.completed, 2);
    const finalUpdate = s.msg(finalPackets, 4425);
    assert.equal(finalUpdate.status, 11);
    assert.equal(finalUpdate.result.length, 1);
    assert.equal(finalUpdate.result[0].finishCount, 2);
    assert.equal(s.city.state.player.totalGp - xp, 2 * (first - xp));
    const saved = structuredClone(s.city.saved);
    s.send(8528, { sweep_type: 1, op_type: 3 });
    assert.deepEqual(s.city.saved, saved);
    s.send(8528, { sweep_type: 1, op_type: 4 });
    s.reload();
    assert.ok(
      !s.city
        .bootstrap()
        .some((p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 4425),
    );
  } finally {
    s.cleanup();
  }
});
test("cancelar bot devolve somente tentativas pendentes e falha de save desfaz custos e prêmios", async () => {
  const s = await setup();
  try {
    s.city.state.player.grades = 27;
    s.city.saved.completedCampaigns = [1001];
    s.city.state.player.weary = 200;
    s.city.persist();
    const start = { sweep_type: 1, op_type: 1, campaign_id: 1001, count: 3 },
      before = structuredClone(s.city.saved);
    s.store.db.exec(
      "CREATE TRIGGER fail_bot BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'falha bot'); END",
    );
    assert.throws(() => s.send(8528, start), /falha bot/);
    assert.deepEqual(s.city.saved, before);
    s.store.db.exec("DROP TRIGGER fail_bot");
    s.send(8528, start);
    s.advance(15000);
    s.store.db.exec(
      "CREATE TRIGGER fail_bot BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'falha bot'); END",
    );
    const pending = structuredClone(s.city.saved);
    assert.throws(() => s.city.tick(), /falha bot/);
    assert.deepEqual(s.city.saved, pending);
    s.store.db.exec("DROP TRIGGER fail_bot");
    s.city.tick();
    s.send(8528, { sweep_type: 1, op_type: 4 });
    assert.equal(s.city.saved.sweep!.completed, 1);
    assert.equal(s.city.state.player.weary, 180);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT SUM(delta) n FROM currency_transactions WHERE currency='gold' AND reason LIKE 'campaign:bot:%'",
        )
        .get()!.n,
      -5000,
    );
    const after = structuredClone(s.city.saved);
    s.send(8528, { sweep_type: 1, op_type: 4 });
    assert.deepEqual(s.city.saved, after);
  } finally {
    s.cleanup();
  }
});
test("herói usa inimigos originais da tabela, libera após normal e preserva índices antigos de combate", async () => {
  const s = await setup();
  try {
    s.city.state.player.grades = 27;
    s.city.persist();
    assert.match(
      s.msg(s.send(5039, { para_int1: 1, para_int2: 11101 }), 83).encode_msg,
      /modo normal/,
    );
    s.city.saved.completedCampaigns = [1101];
    s.city.persist();
    const d = campaignDefinitions.get(11101)!;
    assert.equal(
      s.msg(s.send(5039, { para_int1: 1, para_int2: 11101 }), 125).room
        .campaignId,
      d.map,
    );
    s.send(5038, { para_int1: d.map });
    const battle = s.msg(s.city.handle(frame(8666, 1959)), 157);
    const enemy = (battle.soldiers ?? [])
      .filter((s: any) => s.side === 2)
      .map((s: any) => s.temp_id);
    assert.deepEqual(enemy, [12081, 12081, 12082]);
    assert.equal(battle.heros.find((h: any) => h.side === 1).temp_id, 3);
    assert.ok(
      campaignBattleIndices(11101)[0]! > campaignBattleIndices(11107).at(-1)!,
    );
  } finally {
    s.cleanup();
  }
});
test("tabela servida muda só o tempo do bot e mantém intactas as demais tabelas e o original", () => {
  const original = readFileSync(
      join(projectRoot, "reference/quests/tempinfos.original.bin"),
    ),
    snapshot = Buffer.from(original);
  const local = localCampaignConfig(original),
    a = inflateSync(original.subarray(4)),
    b = inflateSync(local.subarray(4));
  assert.deepEqual(original, snapshot);
  assert.equal(a.length, b.length);
  const changes = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changes.push(i);
  assert.equal(changes.length, 2);
  assert.equal(b.subarray(changes[0]!, changes[0]! + 2).toString(), "15");
});
test("aviso local usa módulo versionado atual, é aceito pelo ModuleLoader e altera apenas as duas telas da campanha", () => {
  const manifest = JSON.parse(
    readFileSync(
      join(projectRoot, "reference/campaign/local-ui/manifest.json"),
      "utf8",
    ),
  );
  const bytes = energyDialogResource(manifest.sourceSha256)!;
  assert.equal(manifest.sourcePath, "/cdn/13_2b946fcf.png");
  assert.equal(
    manifest.sourceSha256,
    "680ddc63363643b285211bfd3e61911293130695f918ef2c33c9ec0602f2857a",
  );
  const swf = bytes;
  assert.equal(swf.subarray(0, 3).toString(), "CWS");
  const body = inflateSync(swf.subarray(8));
  assert.equal(body.length + 8, swf.readUInt32LE(4));
  assert.equal(manifest.unchangedScripts, 70);
  const loader = readFileSync(
    join(
      projectRoot,
      "reference/campaign/evidence/loading/scripts/com/pickgliss/loader/ModuleLoader.as",
    ),
    "utf8",
  );
  assert.ok(
    loader.includes(
      "if(param1[0] != 67 || param1[1] != 87 || param1[2] != 83)",
    ),
  );
  const settings = readFileSync(
    join(
      projectRoot,
      "reference/campaign/evidence/loading/scripts/com/pickgliss/ui/ComponentSetting.as",
    ),
    "utf8",
  );
  assert.ok(settings.includes("MD5_OBJECT:Array = []"));
  for (const name of ["CampaignInfoView", "CampaignPointView"]) {
    const text = readFileSync(
      join(
        projectRoot,
        "reference/campaign/local-ui/verify-local/scripts/selectcampaign/view",
        name + ".as",
      ),
      "utf8",
    );
    assert.ok(text.includes("local-energy-use"));
    assert.ok(text.includes("local-energy-buy"));
    assert.ok(text.includes("checkWearyCanGet"));
    assert.ok(text.includes("200 - playerInfo.weary"));
  }
  assert.equal(energyDialogResource("different-version"), undefined);
});
test("compra atual pelo carrinho usa moeda escolhida, mistura saldos vinculados e recusa crédito parcial", async () => {
  const s = await setup();
  try {
    s.city.state.player.point = 100;
    s.city.state.player.gift_token = 10;
    s.city.persist();
    const buy = {
      receiveUserId: 1959,
      carItemInfo: [{ shopId: 3, counts: 2, payType: 2, isDiscountShop: 0 }],
    };
    assert.equal(s.msg(s.send(8970, buy), 4783).result, 1);
    assert.equal(s.city.state.player.gift_token, 0);
    assert.equal(s.city.state.player.point, 60);
    assert.equal(
      Object.values(s.city.state.items)
        .filter((i) => i.template_id === 2030503)
        .reduce((n, i) => n + i.count, 0),
      2,
    );
    const before = structuredClone(s.city.saved);
    const failed = s.send(8970, {
      ...buy,
      carItemInfo: [
        ...buy.carItemInfo,
        { shopId: 999999, counts: 1, payType: 2 },
      ],
    });
    assert.equal(s.msg(failed, 4783).result, 2);
    assert.deepEqual(s.city.saved, before);
  } finally {
    s.cleanup();
  }
});
test("contador heróico original fornece três entradas remuneradas e confirma passagem sem recompensa após esgotar", async () => {
  const s = await setup();
  try {
    s.city.state.player.grades = 27;
    s.city.saved.completedCampaigns = [1101];
    s.city.saved.heroEntries = { day: "2030-03-17", used: 3 };
    // Use the actual fixture date, so the existing usage cannot reset accidentally.
    s.city.saved.heroEntries.day = new Date(1900000000000)
      .toISOString()
      .slice(0, 10);
    s.city.persist();
    assert.equal(s.msg(s.city.login(), 4948).count, 0);
    const energy = s.city.state.player.weary,
      d = campaignDefinitions.get(11101)!;
    s.send(5039, { para_int1: 1, para_int2: 11101 });
    s.send(5038, { para_int1: d.map });
    assert.equal(s.city.saved.campaignRun!.rewarded, false);
    assert.equal(s.city.state.player.weary, energy);
    s.advance(86400000);
    assert.equal(s.msg(s.city.login(), 4948).count, 3);
  } finally {
    s.cleanup();
  }
});

test("manifestos do Flash invalidam o módulo de energia em cache e anunciam tamanho e checksum locais", () => {
  const db = new DatabaseSync(join(projectRoot, "data/state.sqlite"), {
    readOnly: true,
  });
  try {
    const manifest = JSON.parse(
      readFileSync(
        join(projectRoot, "reference/campaign/local-ui/manifest.json"),
        "utf8",
      ),
    );
    const bytes = energyDialogResource(manifest.sourceSha256)!;
    for (const path of ["/client/code_md5.dat", "/client/size.xml"]) {
      const row = db
        .prepare("SELECT sha256 FROM assets WHERE path=?")
        .get(path)!;
      const raw = readFileSync(
        join(projectRoot, "data/assets/objects", row.sha256 + ".bin"),
      );
      const local = energyDialogIndex(path, raw)!;
      const unpack = (b: Buffer) =>
        (path.endsWith(".dat") ? inflateSync(inflateSync(b)) : b).toString();
      const old = unpack(raw),
        next = unpack(local),
        item = next.match(/<Item\b[^>]*name="13\.png"[^>]*\/>/)![0];
      assert.ok(item.includes(`size="${bytes.length}"`));
      if (path.endsWith(".dat")) {
        assert.ok(
          item.includes(
            `md5="${createHash("md5").update(bytes).digest("hex").slice(8, 16)}"`,
          ),
        );
        assert.notEqual(
          old.match(/<Item\b[^>]*name="13\.png"[^>]*\/>/)![0],
          item,
        );
      }
      assert.equal(
        old.replace(/<Item\b[^>]*name="13\.png"[^>]*\/>/, "MODULE"),
        next.replace(/<Item\b[^>]*name="13\.png"[^>]*\/>/, "MODULE"),
      );
      assert.equal(createHash("sha256").update(raw).digest("hex"), row.sha256);
    }
  } finally {
    db.close();
  }
});

test("missão 1840 concluída sem captura de resgate fornece XP uma vez e libera sucessoras", async () => {
  const s = await setup();
  try {
    s.city.saved.labyrinth = {
      version: 1,
      floor: 2,
      cleared: [1],
      entered: true,
    };
    s.city.state.quests[1840] = {
      ...s.city.scenario.questCatalog[1840],
      template_id: 1840,
      is_accept: 1,
      is_complete: 1,
      condition_1: 2,
    };
    s.city.persist();
    const xp = s.city.state.player.totalGp;
    const result = s.send(5014, {
      template_id: 1840,
      reward_item_id: 0,
      is_pass: 0,
    });
    assert.equal(s.msg(result, 52).template_id, 1840);
    assert.equal(s.city.state.player.totalGp, xp + 20000);
    assert.equal(s.city.state.quests[1840]!.is_accept, 0);
    s.reload();
    s.send(5014, { template_id: 1840, reward_item_id: 0, is_pass: 0 });
    assert.equal(s.city.state.player.totalGp, xp + 20000);
  } finally {
    s.cleanup();
  }
});

test("resgatar Byron libera apenas a sucessora vigente, com progresso e recompensas únicas", async () => {
  const s = await setup(5);
  try {
    s.city.state.player.grades = 14;
    s.city.state.player.strategy = 1000000;
    s.city.state.player.quest_site = { bytes: "" };
    s.city.state.quests = {
      1840: { template_id: 1840, is_accept: 0, is_complete: 1 },
      1841: { ...s.city.scenario.questCatalog[1841], template_id: 1841, is_accept: 1, is_complete: 1, condition_1: 1 },
    };
    s.city.saved.completedCampaigns = [1002];
    s.city.state.pawnStock!.find(p => p.son_type === 101)!.tempate_id = 10101;
    s.city.state.army.armyPawn = [];
    s.city.persist();
    const claimed = s.send(5014, { template_id: 1841, reward_item_id: 0, is_pass: 0 });
    assert.equal(s.msg(claimed, 52).template_id, 1841);
    const quests = s.msg(claimed, 112).quest;
    assert.equal(quests.find((q: any) => q.template_id === 1838).condition_1, 1);
    assert.equal(quests.find((q: any) => q.template_id === 1842), undefined);
    for (let level = 1; level < 10; level++) {
      const result = s.send(5158, { tempate_id: 10100 + level, own_pawns: 0 });
      const q = s.msg(result, 112).quest.find((q: any) => q.template_id === 1838);
      assert.equal(q.condition_1, level + 1);
      assert.equal(q.is_complete, level === 9 ? 1 : 0);
    }
    const spirit = s.city.state.player.strategy, xp = s.city.state.player.totalGp;
    s.send(5014, { template_id: 1838, reward_item_id: 0, is_pass: 0 });
    assert.equal(s.city.state.player.strategy, spirit + 2000);
    assert.equal(s.city.state.player.totalGp, xp + 4000);
    assert.equal(s.city.state.quests[1835], undefined);
    assert.equal(s.city.state.quests[1843]!.is_accept, 1);
    assert.equal(s.city.state.quests[1843]!.is_complete, 0);
    const finalXp = s.city.state.player.totalGp, finalSpirit = s.city.state.player.strategy;
    s.reload();
    assert.equal(s.city.state.quests[1843]!.is_accept, 1);
    s.send(5014, { template_id: 1838, reward_item_id: 0, is_pass: 0 });
    assert.equal(s.city.state.player.totalGp, finalXp);
    assert.equal(s.city.state.player.strategy, finalSpirit);
  } finally { s.cleanup(); }
});

test("histórico binário restaura sucessoras ausentes sem recriar missões já premiadas", async () => {
  const s = await setup();
  try {
    const bits = Buffer.alloc(Math.ceil(1841 / 8));
    for (const id of [1832, 1834, 1836, 1839, 1840, 1841])
      bits[Math.floor((id - 1) / 8)]! |= 1 << ((id - 1) % 8);
    s.city.state.player.quest_site = { bytes: bits.toString("base64") };
    s.city.state.player.quest_site_len = bits.length;
    s.city.state.quests = {};
    s.city.state.player.grades = 28;
    s.city.state.pawnStock!.find(p => p.son_type === 101)!.tempate_id = 10110;
    s.city.persist();
    const xp = s.city.state.player.totalGp;
    s.reload();
    for (const id of [1832, 1834, 1836, 1839, 1840, 1841]) assert.equal(s.city.state.quests[id], undefined);
    assert.equal(s.city.state.quests[1838]!.is_accept, 1);
    assert.equal(s.city.state.quests[1838]!.is_complete, 1);
    assert.equal(s.city.state.quests[1842], undefined);
    assert.equal(s.city.state.quests[1833], undefined);
    assert.equal(s.city.state.player.totalGp, xp);
  } finally { s.cleanup(); }
});

test("resgate envia histórico antes de 52 e nunca recoloca a missão no quadro ao atualizar ou reconectar", async () => {
  const s = await setup();
  try {
    s.city.state.player.quest_site = { bytes: "" };
    s.city.state.quests = { 1841: { template_id: 1841, is_accept: 1, is_complete: 1, condition_1: 1 } };
    s.city.saved.completedCampaigns = [1002];
    s.city.persist();
    const result = s.send(5014, { template_id: 1841, reward_item_id: 0, is_pass: 0 });
    const wire = result.map(p => Buffer.from(p.frame, "base64")).filter(p => [52, 112].includes(p.readUInt16BE(6)));
    assert.deepEqual(wire.slice(0, 3).map(p => p.readUInt16BE(6)), [112, 52, 112]);
    const history = decodeMessage(s.city.scenario.incoming[112]!, wire[0]!.subarray(20));
    const bits = Buffer.from(history.states.bytes, "base64");
    assert.ok(bits[Math.floor(1840 / 8)]! & (1 << (1840 % 8)));
    assert.ok(Math.floor(1840 / 8) < history.states_length - 1);
    assert.equal(history.quest[0].repeat_finish, 1);
    const current = decodeMessage(s.city.scenario.incoming[112]!, wire[2]!.subarray(20));
    assert.equal(current.quest.some((q: any) => q.template_id === 1841), false);
    assert.ok(current.quest.some((q: any) => q.template_id === 1838));
    s.reload();
    for (const p of s.city.bootstrap().filter(p => Buffer.from(p.frame, "base64").readUInt16BE(6) === 112))
      assert.equal(s.msg([p], 112).quest.some((q: any) => q.template_id === 1841), false);
  } finally { s.cleanup(); }
});

test("resgate capturado preserva bits de missões posteriores e recusa repetir um prêmio com modelo ativo antigo", async () => {
  const s = await setup();
  try {
    s.city.state.quests = { 1838: { template_id: 1838, is_accept: 1, is_complete: 1, condition_1: 10 } };
    s.city.state.player.quest_site = { bytes: "" };
    const pawn = s.city.state.pawnStock!.find(p => p.son_type === 101)!;
    pawn.tempate_id = 10110;
    pawn.own_pawns = 200;
    s.city.persist();
    s.send(5014, { template_id: 1838, reward_item_id: 0, is_pass: 0 });
    s.city.state.quests[1834] = { template_id: 1834, is_accept: 1, is_complete: 1, condition_1: 200 };
    s.send(5014, { template_id: 1834, reward_item_id: 0, is_pass: 0 });
    const bits = Buffer.from(s.city.state.player.quest_site.bytes, "base64");
    for (const id of [1834, 1838]) assert.ok(bits[Math.floor((id - 1) / 8)]! & (1 << ((id - 1) % 8)));
    const xp = s.city.state.player.totalGp, spirit = s.city.state.player.strategy;
    s.city.state.quests[1838]!.is_accept = 1;
    s.send(5014, { template_id: 1838, reward_item_id: 0, is_pass: 0 });
    assert.equal(s.city.state.player.totalGp, xp);
    assert.equal(s.city.state.player.strategy, spirit);
  } finally { s.cleanup(); }
});

test("ramificação exige todas as predecessoras e não aceita missões aposentadas por data", async () => {
  const s = await setup();
  try {
    s.city.state.player.quest_site = { bytes: "" };
    s.city.state.quests = {
      660: { template_id: 660, is_accept: 0, is_complete: 1 },
      670: { template_id: 670, is_accept: 1, is_complete: 0 },
      1842: { template_id: 1842, is_accept: 1, is_complete: 1 },
    };
    s.city.persist();
    s.reload();
    assert.equal(s.city.state.quests[720], undefined);
    assert.equal(s.city.state.quests[1842], undefined);
    s.send(5012, { questId: [1842, 720] });
    assert.equal(s.city.state.quests[1842], undefined);
    assert.equal(s.city.state.quests[720], undefined);
    s.city.state.quests[670]!.is_complete = 1;
    s.city.state.quests[670]!.is_accept = 0;
    s.city.persist();
    s.reload();
    assert.equal(s.city.state.quests[720]!.is_accept, 1);
  } finally { s.cleanup(); }
});

test("ouro do resgate de amizade usa os 2000 da tabela, sem repetir os 20 de renda capturados", async () => {
  const s = await setup();
  try {
    s.city.state.quests[1854] = { template_id: 1854, is_accept: 1, is_complete: 1, condition_1: 1 };
    s.city.saved.friends = [{ user_id: 1902, relation: 1 }];
    s.city.persist();
    const gold = s.city.state.economy.gold_total_count;
    const xp = s.city.state.player.totalGp;
    s.send(5014, { template_id: 1854, reward_item_id: 0, is_pass: 0 });
    assert.equal(s.city.state.economy.gold_total_count, gold + 2000);
    assert.equal(s.city.state.player.totalGp, xp + 1000);
    const row = s.store.db.prepare("SELECT delta FROM gold_transactions WHERE reason='mission:1854'").get()!;
    assert.equal(row.delta, 2000);
  } finally { s.cleanup(); }
});

test("missões respeitam nível mínimo e chefes vencidos antes da aceitação", async () => {
  const s = await setup();
  try {
    s.city.state.player.quest_site = { bytes: "" };
    s.city.state.quests = {
      1848: { template_id: 1848, is_accept: 0, is_complete: 1 },
      1843: { template_id: 1843, is_accept: 0, is_complete: 1 },
    };
    s.city.state.player.grades = 14;
    s.city.saved.won.push(campaignBattleIndices(1004).at(-1)!);
    s.city.persist();
    s.reload();
    assert.equal(s.city.state.quests[1847], undefined);
    assert.equal(s.city.state.quests[1844]!.is_complete, 1);
    s.city.state.player.grades = 15;
    s.city.persist();
    s.reload();
    assert.equal(s.city.state.quests[1847]!.is_accept, 1);
    assert.equal(s.city.state.quests[1847]!.is_complete, 0);
  } finally { s.cleanup(); }
});

test("falha no save do resgate reverte prêmio, conclusão e sucessoras", async () => {
  const s = await setup();
  try {
    s.city.state.player.quest_site = { bytes: "" };
    s.city.state.quests = { 1838: { template_id: 1838, is_accept: 1, is_complete: 1, condition_1: 10 } };
    s.city.state.pawnStock!.find(p => p.son_type === 101)!.tempate_id = 10110;
    s.city.persist();
    s.store.db.exec("CREATE TRIGGER fail_quest BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'falha missão'); END");
    const before = structuredClone(s.city.saved);
    assert.throws(() => s.send(5014, { template_id: 1838, reward_item_id: 0, is_pass: 0 }), /falha missão/);
    assert.deepEqual(s.city.saved, before);
  } finally { s.cleanup(); }
});

test("labirinto no segundo piso usa tropa original e mantém identidade, vitória e portal após reconectar", async () => {
  const s = await setup();
  try {
    s.city.state.player.grades = 27;
    s.city.saved.labyrinth = {
      version: 1,
      floor: 2,
      cleared: [1],
      entered: true,
    };
    s.city.persist();
    const enter = s.send(8296, {
      campaign_id: 8001,
      choose_index: 0,
      is_double: 1,
    });
    assert.ok(
      enter.some((p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 127),
    );
    const army = s.msg(enter, 131);
    assert.equal(army.map_id, 8002);
    assert.equal(army.simple_hero_info.tempate_id, 3);
    assert.equal(army.simple_hero_info.grade, 27);
    const start = s.city.handle(frame(5125, 1959, protoInt(1, 800202)));
    const prepare = s.msg(start, 157),
      own = prepare.heros.find((h: any) => h.user_id === 1959);
    assert.equal(own.user_pics, 3);
    assert.equal(own.temp_id, 3);
    assert.equal(own.nick_name, "Local");
    assert.ok(
      prepare.soldiers
        .filter((f: any) => f.side === 2)
        .every((f: any) => f.temp_id === 7002 && f.hp === 220),
    );
    s.reload();
    const b = s.city.saved.battle!;
    s.city.handle(frame(10007, 1959, protoString(2, b.id)));
    for (const f of b.fighters.filter((f) => f.side === 2)) f.hp = 1;
    for (let i = 0; i < 100 && !b.finished; i++) {
      s.advance(10000);
      s.city.tick();
    }
    assert.equal(b.won, true);
    assert.deepEqual(s.city.saved.labyrinth!.cleared, [1, 2]);
    s.send(5025, { msg: "" });
    s.reload();
    const again = s.send(8296, {
      campaign_id: 8001,
      choose_index: 0,
      is_double: 1,
    });
    const nodes = s.msg(again, 127).node;
    assert.equal(nodes.find((n: any) => n.node_id === 800202).state, 8);
    assert.equal(nodes.find((n: any) => n.node_id === 800204).state, 1);
    assert.equal(s.city.saved.labyrinth!.floor, 2);
    assert.equal(s.city.state.hero.tempate_id, 3);
  } finally {
    s.cleanup();
  }
});

test("tela heroica protege o contador ausente no núcleo atual e consulta 9536 sem consumir tentativas", async () => {
  const currentPlayer = readFileSync(join(projectRoot, "reference/campaign/evidence/version2/scripts/yishi/datas/playerinfo/PlayerInfo.as"), "utf8");
  assert.ok(!/\bvar singleHeroCount\b/.test(currentPlayer));
  const view = readFileSync(join(projectRoot, "reference/campaign/local-ui/verify-local/scripts/selectcampaign/view/CampaignInfoView.as"), "utf8");
  assert.ok(view.includes('"singleHeroCount" in playerModel.playerInfo'));
  assert.ok(!view.includes("playerModel.playerInfo.singleHeroCount"));
  const s = await setup();
  try {
    s.city.state.player.grades = 27;
    s.city.state.player.weary = 200;
    s.city.saved.completedCampaigns = [1101];
    s.city.persist();
    const query = () => s.send(9536, { $1: { wire: 0, value: "1" }, pay_type: 1 });
    for (let i = 0; i < 3; i++) assert.equal(s.msg(query(), 4948).count, 3);
    const definition = campaignDefinitions.get(11101)!;
    assert.equal(s.msg(s.send(5039, { para_int1: 1, para_int2: 11101 }), 125).room.campaignId, definition.map);
    s.send(5038, { para_int1: definition.map });
    assert.equal(s.msg(query(), 4948).count, 2);
    assert.equal(s.city.state.player.weary, 180);
    s.send(5038, { para_int1: definition.map });
    assert.equal(s.msg(query(), 4948).count, 2);
    assert.equal(s.city.state.player.weary, 180);
  } finally { s.cleanup(); }
});

test("herói gerado encerra cada batalha e reconecta com personagem e pedestal corretos até conclusão gratuita", async () => {
  const s = await setup();
  try {
    s.city.state.player.grades = 27;
    s.city.state.player.weary = 0;
    s.city.saved.completedCampaigns = [1101, 1102, 1103, 1104, 1105, 1106];
    s.city.persist();
    const d = campaignDefinitions.get(11106)!;
    s.send(5039, { para_int1: 1, para_int2: 11106 });
    s.send(5038, { para_int1: d.map });
    const indices = campaignBattleIndices(11106);
    for (const [n, index] of indices.entries()) {
      s.city.handle(frame(8666, 1959));
      const b = s.city.saved.battle!;
      assert.equal(b.reference, index);
      s.city.handle(frame(10007, 1959, protoString(2, b.id)));
      for (const f of b.fighters.filter((f) => f.side === 2)) f.hp = 1;
      let result: any[] = [];
      for (let i = 0; i < 100 && !b.finished; i++) {
        s.advance(10000);
        result.push(...s.city.tick());
      }
      assert.equal(b.won, true);
      const report = s.msg(result, 4103);
      assert.equal(report.battle_result, 1);
      assert.equal(report.battle_scene, 3);
      assert.equal(report.gp_bonus, 0);
      s.reload();
      const load = s.send(5038, { para_int1: d.map });
      if (n < indices.length - 1) {
        const p = s.msg(load, 21).player.find((p: any) => p.player_id === 1959);
        assert.equal(p.template_id, 3);
        assert.equal(p.campaign_id, d.map);
        assert.equal(p.grades, 27);
        const progress = load.find(
          (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === 4282,
        )!;
        assert.equal(
          Buffer.from(progress.frame, "base64")[21],
          d.stages![n + 1]!.nodeIndex,
        );
      } else {
        assert.equal(s.msg(load, 137).total_appraisal, 7);
        assert.equal(s.city.saved.map, 1);
        assert.ok(s.city.saved.completedCampaigns!.includes(11106));
      }
    }
  } finally {
    s.cleanup();
  }
});

test("labirinto envia um único ator por piso, vitória só atualiza estados e reconexão não revive o inimigo", async () => {
  const s = await setup(5);
  const opcode = (p: any) => Buffer.from(p.frame, "base64").readUInt16BE(6);
  const snapshots = (packets: any[]) =>
    packets.filter((p) => opcode(p) === 127);
  const stateOf = (packets: any[], node: number) =>
    packets
      .filter((p) => opcode(p) === 128)
      .map((p) => s.msg([p], 128))
      .find((p) => p.node_id === node)?.node_state;
  const click = (node: number) =>
    s.city.handle(frame(5125, 1959, protoInt(1, node)));
  try {
    // A captured ticket is required for the first visit; use the normal inventory path.
    const entry = s.city.scenario.cases.find(
      (c) => c.opcode === 8296 && c.request?.choose_index === 1,
    )!;
    const consumed = entry.patches.find(
      (p) => p.path[0] === "items" && p.before && !p.after,
    )!.before;
    s.city.state.player.grades = 27;
    s.city.state.items["1:0:80"] = {
      ...structuredClone(consumed),
      id: 900080,
      bag_type: 1,
      object_id: 0,
      pos: 80,
      count: 1,
      exist: 1,
    };
    s.city.persist();
    let entered = s.send(8296, {
      choose_index: 1,
      campaign_id: 8001,
      is_double: 2,
    });
    for (const floor of [1, 2]) {
      const map = 8000 + floor;
      // The view needs its player and nodes before enterOver() requests 5038.
      assert.equal(snapshots(entered).length, 1);
      const nodes = s.msg(entered, 127).node;
      const player = s.msg(entered, 21).player[0];
      assert.equal(player.player_id, 1959);
      assert.equal(player.template_id, 5);
      assert.equal(player.campaign_id, map);
      const creation = entered.find((p) => opcode(p) === 125)!;
        assert.equal(snapshots(entered)[0].delayMs, creation.delayMs);
        assert.equal(entered.find((p) => opcode(p) === 21)!.delayMs, creation.delayMs);
      const loaded = s.send(5038, { para_int1: map });
      assert.equal(snapshots(loaded).length, 0);
      assert.ok(!loaded.some((p) => opcode(p) === 21));
      const enemies = s.msg(loaded, 20).soldierTemplated;
      assert.ok(enemies.length > 0);
      if (floor === 2) assert.deepEqual(enemies, [7002]);
      assert.equal(nodes.filter((n: any) => n.master_type === 42).length, 1);
      assert.equal(
        nodes.find((n: any) => n.master_type === 42).node_id,
        map * 100 + 2,
      );
      for (let i = 0; i < 3; i++) {
        const load = s.send(5038, { para_int1: map });
        assert.equal(snapshots(load).length, 0);
        assert.ok(!load.some((p) => opcode(p) === 21));
          assert.deepEqual(load.map(opcode), [20]);
      }
      const start = click(
        nodes.find((n: any) => n.master_type === 42).camp_data_id,
      );
      assert.equal(snapshots(start).length, 0);
      const b = s.city.saved.battle!;
      s.city.handle(frame(10007, 1959, protoString(2, b.id)));
      for (const f of b.fighters.filter((f) => f.side === 2)) f.hp = 1;
      let result: any[] = [];
      for (let i = 0; i < 100 && !b.finished; i++) {
        s.advance(10000);
        result.push(...s.city.tick());
      }
      assert.equal(b.won, true);
      assert.equal(snapshots(result).length, 0);
      assert.equal(stateOf(result, map * 100 + 2), 8);
      assert.equal(stateOf(result, map * 100 + 4), 1);
      const oldBattle = b.id;
      assert.ok(click(map * 100 + 2).some((p) => opcode(p) === 83));
      assert.equal(s.city.saved.battle!.id, oldBattle);
      assert.equal(snapshots(s.send(5038, { para_int1: map })).length, 0);
      s.reload();
      const bootstrap = s.city.bootstrap();
      assert.equal(snapshots(bootstrap).length, 1);
      assert.equal(s.msg(bootstrap, 21).player[0].campaign_id, map);
      const reconnectLoad = s.send(5038, { para_int1: map });
      assert.equal(snapshots(reconnectLoad).length, 0);
      assert.ok(s.msg(reconnectLoad, 20).soldierTemplated.length > 0);
      const restored = s.msg(bootstrap, 127).node;
      assert.equal(
        restored.filter((n: any) => n.master_type === 42 && n.state !== 8)
          .length,
        0,
      );
      assert.equal(
        restored.find((n: any) => n.node_id === map * 100 + 4).state,
        1,
      );
      assert.equal(snapshots(s.send(5038, { para_int1: map })).length, 0);
      assert.equal(s.city.saved.labyrinth!.floor, floor);
      if (floor === 1) entered = click(800104);
    }
  } finally {
    s.cleanup();
  }
});
