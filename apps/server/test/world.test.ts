import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { TutorialWorld } from "../src/world.js";
import { type TutorialScenario, matchRequest } from "../src/tutorial.js";
import { frame, protoInt, protoString } from "../src/protocol.js";
import {
  PACKET_MESSAGES,
  decodeMessage,
  encodeMessage,
  typeName,
} from "../src/messages.js";
import {
  createBattle,
  advanceBattle,
  selectSkill,
  heroStats,
  combatReference,
  classForIcon,
} from "../src/combat.js";
import { itemTemplate } from "../src/inventory.js";
import { GameServer } from "../src/game.js";
import { ReplayAuth } from "../src/store.js";
import { buildHttp } from "../src/http.js";
import { type Config } from "../src/config.js";
import { createConnection, type AddressInfo } from "node:net";
import {
  publicEncrypt,
  createPublicKey,
  constants,
  createHash,
} from "node:crypto";
import { crypt, FrameReader, INITIAL_KEY } from "../src/protocol.js";

const scenario = JSON.parse(
  readFileSync(join(projectRoot, "data/tutorial/scenario.json"), "utf8"),
) as TutorialScenario;
function setup(icon = 6) {
  const base = join(projectRoot, ".test-data");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "world-"));
  const store = new Store(dir);
  store.initTutorialProfile(1901);
  store.db
    .prepare(
      "UPDATE tutorial_profiles SET active=1,icon=?,sex=?,nickname='Livre' WHERE user_id=1901",
    )
    .run(icon, icon < 4 ? 1 : 0);
  let now = 1900000000000;
  const world = new TutorialWorld(store, scenario, 1901, () => now);
  return {
    store,
    world,
    advance: () => (now += 5000),
    now: () => now,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const action = (b: string, hero: number, skill: number) =>
  frame(
    10008,
    1901,
    Buffer.concat([protoString(1, b), protoInt(2, hero), protoInt(3, skill)]),
  );

test("reset de ciclo reinicia todas as contas, invalida sessões e reutiliza a conta padrão", async () => {
  const s = setup();
  try {
    await s.store.createUser("conta_antiga", "original-password-123", 1901);
    await s.store.createUser("outra_conta", "second-password-123", 1902);
    const ticket = s.store.issue(1901);
    s.world.state.wins = [0, 1, 2];
    s.world.save();
    s.store.db
      .prepare(
        "UPDATE tutorial_profiles SET active=1,process=19500 WHERE user_id=1901",
      )
      .run();
    s.store.dependency("/cdn/preserved.swf", 200, 123, "sample-hash");
    s.store.tutorialEvent("world-victory", 1901, { encounter: 2 });
    const first = await s.store.resetTutorialAccounts(
      "pirata_teste",
      "new-test-password-123",
    );
    assert.equal(first.accounts, 3);
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) AS n FROM tutorial_worlds").get()!.n,
      0,
    );
    for (const r of s.store.db
      .prepare("SELECT * FROM tutorial_profiles")
      .all()) {
      assert.equal(r.active, 0);
      assert.equal(r.process, 0);
      assert.equal(r.nickname, "");
    }
    assert.equal(s.store.validate(ticket, "conta_antiga"), undefined);
    assert.ok(
      await s.store.authenticate("conta_antiga", "original-password-123"),
    );
    assert.ok(await s.store.authenticate("outra_conta", "second-password-123"));
    assert.ok(
      await s.store.authenticate("pirata_teste", "new-test-password-123"),
    );
    const second = await s.store.resetTutorialAccounts(
      "pirata_teste",
      "rotated-test-password-123",
    );
    assert.equal(second.userId, first.userId);
    assert.equal(second.accounts, 3);
    assert.equal(
      await s.store.authenticate("pirata_teste", "new-test-password-123"),
      undefined,
    );
    assert.ok(
      await s.store.authenticate("pirata_teste", "rotated-test-password-123"),
    );
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) AS n FROM dependencies").get()!.n,
      1,
    );
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) AS n FROM tutorial_events").get()!.n,
      1,
    );
  } finally {
    s.cleanup();
  }
});

test("mensagens recuperadas preservam campos desconhecidos e valores assinados das capturas", () => {
  for (const r of scenario.steps.flatMap((s) => s.responses)) {
    const packet = Buffer.from(r.frame, "base64"),
      op = packet.readUInt16BE(6),
      name = PACKET_MESSAGES[op];
    if (!name) continue;
    const decoded = decodeMessage(name, packet.subarray(20));
    assert.ok(
      matchRequest(packet, frame(op, 1901, encodeMessage(name, decoded))),
      `roundtrip opcode ${op}`,
    );
  }
});
test("status do tutorial usam a base da classe e os mesmos bônus iniciais persistidos na mochila", () => {
  for (let icon = 1; icon <= 6; icon++) {
    const s = setup(icon);
    try {
      const readHero = () => {
        const r = s.world
          .login()
          .find((r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 113)!;
        return decodeMessage(
          typeName("army.SimpleHeroInfoMsg"),
          Buffer.from(r.frame, "base64").subarray(20),
        );
      };
      for (const [wins, city, grade] of [
        [[], false, 1],
        [[0], false, 2],
        [[0, 1], false, 10],
        [[0, 1], true, 10],
      ] as [number[], boolean, number][]) {
        s.world.state.wins = wins;
        s.world.state.cityEntered = city;
        const hero = readHero(),
          stats = heroStats(icon, grade, Object.values(s.world.state.initialEquipment!));
        assert.equal(hero.grade, grade);
        assert.equal(hero.total_phy_attack, stats.phy_attack);
        assert.equal(hero.total_magic_attack, stats.magic_attack);
        assert.equal(hero.base_live, stats.base.live);
        assert.equal(hero.total_live, stats.live);
        if (icon === 6 && grade === 10) {
          assert.equal(hero.base_magic_attack, Math.floor(147 * 1.05));
          assert.ok(hero.total_magic_attack >= hero.base_magic_attack);
          assert.ok(hero.total_live >= 490);
          assert.equal(hero.base_live, 490);
        }
      }
      s.world.start(2);
      const b = s.world.state.battle!,
        stats = heroStats(icon, 10, Object.values(s.world.state.initialEquipment!)),
        player = b.fighters.find((f) => f.id === b.hero)!;
      assert.equal(player.attack, stats.primaryAttack);
      assert.equal(player.maxHp, readHero().total_live);
      player.hp -= 30;
      assert.equal(readHero().hp, player.hp);
    } finally {
      s.cleanup();
    }
  }
});
test("sequência original da maga conserva atores, habilidades, impactos, fúria e roteiro", () => {
  const s = setup(6);
  try {
    for (let encounter = 0; encounter < 3; encounter++) {
      const ref = combatReference.encounters[encounter]!;
      const b = createBattle(ref.prepare, encounter, 6, 1901, "Livre");
      const heroHpDifference = b.fighters.find(f => f.id === b.hero)!.maxHp - ref.prepare.heros.find((h: any) => h.living_id === b.hero)!.init_hp;
      b.ready = true;
      const actual: Record<string, any>[] = [];
      let finish: Record<string, any> | undefined;
      let now = s.now();
      for (let i = 0; i < 100 && !b.finished; i++) {
        const expected = ref.actions[actual.length];
        if (expected?.living_id === b.hero)
          selectSkill(b, b.id, b.hero, expected.order_id, now);
        const events = advanceBattle(b, now);
        for (const e of events) {
          if (e.opcode === 154) finish = e.message;
          if (e.opcode === 153) {
            actual.push(e.message);
            assert.doesNotThrow(() =>
              encodeMessage(typeName("battle.AttackOrderMsg"), e.message),
            );
          }
        }
        now = Math.max(now + 1, b.nextTurnAt);
      }
      assert.equal(b.won, true);
      assert.deepEqual(finish, ref.finish);
      assert.equal(actual.length, ref.actions.length);
      for (let i = 0; i < actual.length; i++) {
        const original = ref.actions[i]!;
        const m = actual[i]!;
        assert.equal(m.living_id, original.living_id);
        assert.equal(m.order_id, original.order_id);
        assert.equal(m.frame, original.frame);
        assert.equal(m.sp, original.sp);
        assert.deepEqual(
          m.damages.map((d: any) => [
            d.living_id,
            d.damage_type,
            d.damage_value,
            d.left_value - (d.living_id === b.hero && d.damage_type === 6 ? heroHpDifference : 0),
          ]),
          original.damages.map((d: any) => [
            d.living_id,
            d.damage_type,
            d.damage_value,
            d.left_value,
          ]),
        );
      }
    }
  } finally {
    s.cleanup();
  }
});

test("todos os personagens concluem sem escolhas, com escolhas diferentes e mesmo com vida crítica", () => {
  for (let icon = 1; icon <= 6; icon++)
    for (let encounter = 0; encounter < 3; encounter++) {
      for (const choice of ["basic", "alternate", "strongest"]) {
        const b = createBattle(
          combatReference.encounters[encounter]!.prepare,
          encounter,
          icon,
          1901,
          "Livre",
        );
        b.ready = true;
        for (const f of b.fighters.filter((f) => f.side === 1)) f.hp = 1;
        let now = 1900000000000;
        const events: Record<string, any>[] = [];
        for (let i = 0; i < 250 && !b.finished; i++) {
          if (choice !== "basic") {
            const skill =
              choice === "strongest"
                ? b.skills.at(-1)!
                : b.skills[i % b.skills.length]!;
            selectSkill(b, b.id, b.hero, skill, now);
          }
          for (const e of advanceBattle(b, now))
            if (e.opcode === 153) events.push(e.message);
          assert.ok(
            b.fighters.filter((f) => f.side === 1).every((f) => f.hp >= 1),
          );
          now = Math.max(now + 1, b.nextTurnAt);
        }
        assert.equal(
          b.won,
          true,
          `icon=${icon}, encounter=${encounter}, choice=${choice}`,
        );
        if (encounter === 1) {
          assert.equal(
            events.filter((e) => e.awakenSoldiers?.length).length,
            1,
          );
          assert.ok(
            events.some((e) => e.living_id === 3 && e.order_id === 60458),
          );
        }
        if (encounter === 2) {
          assert.ok(events.some((e) => e.order_id === 40183));
          assert.ok(events.some((e) => e.order_id === 40213));
        }
      }
    }
});

test("pausa e retomada depois da entrada de Janick preservam a fase e não duplicam atores", () => {
  const s = setup(6);
  try {
    s.world.state.wins = [0];
    s.world.start(1);
    const b = s.world.state.battle!;
    b.ready = true;
    for (let i = 0; i < 20 && !b.reinforcementsSpawned; i++) {
      s.world.tick();
      s.advance();
    }
    assert.equal(b.reinforcementsSpawned, true);
    assert.deepEqual(
      b.prepare.soldiers.map((x: any) => x.living_id),
      [3, 4, 5],
    );
    s.world.handle(frame(10010, 1901, protoString(2, b.id)));
    const before = structuredClone(b);
    s.advance();
    assert.deepEqual(s.world.tick(), []);
    assert.equal(b.turn, before.turn);
    assert.equal(b.actionIndex, before.actionIndex);
    const restored = new TutorialWorld(s.store, scenario, 1901, s.now);
    const resumed = restored.state.battle!;
    const preparation = restored
      .start(1)
      .find((r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 157)!;
    const prepared = decodeMessage(
      typeName("battle.BattlePrepareMsg"),
      Buffer.from(preparation.frame, "base64").subarray(20),
    );
    assert.deepEqual(
      prepared.soldiers.map((x: any) => x.living_id),
      [3, 4, 5],
    );
    restored.handle(frame(10007, 1901, protoString(2, resumed.id)));
    let summonCount = 0;
    for (let i = 0; i < 100 && !resumed.finished; i++) {
      s.advance();
      for (const r of restored.tick()) {
        const p = Buffer.from(r.frame, "base64");
        if (
          p.readUInt16BE(6) === 153 &&
          decodeMessage(typeName("battle.AttackOrderMsg"), p.subarray(20))
            .awakenSoldiers?.length
        )
          summonCount++;
      }
    }
    assert.equal(resumed.won, true);
    assert.equal(summonCount, 0);
    assert.equal(restored.state.rewardCount, 1);
  } finally {
    s.cleanup();
  }
});

test("saída da região depois de movimento mantém o formato válido e não repete a transição", () => {
  const s = setup();
  try {
    s.world.state.wins = [0, 1];
    s.world.state.position = { x: 65, y: 17 };
    const packets = s.world.handle(frame(5025, 1901));
    const exit = packets.find(
      (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 22,
    )!;
    const m = decodeMessage(
      typeName("campaign.CampaignExitMsg"),
      Buffer.from(exit.frame, "base64").subarray(20),
    );
    assert.equal(m.army_id, 1901);
    assert.equal(m.cur_pos_x, undefined);
    assert.equal(s.world.state.cityEntered, true);
    assert.deepEqual(s.world.handle(frame(5025, 1901)), []);
    const repeated = s.world.handle(frame(5017, 1901, protoInt(1, 19000)));
    assert.ok(
      repeated.every(
        (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) !== 22,
      ),
    );
  } finally {
    s.cleanup();
  }
});
test("seis personagens vencem os três encontros com escolhas distintas, persistência e recompensa única", () => {
  for (let icon = 1; icon <= 6; icon++) {
    const s = setup(icon);
    try {
      const starters = new Set<number>();
      const checkEquipment = (responses: { frame: string }[]) => {
        for (const r of responses) {
          const p = Buffer.from(r.frame, "base64");
          if (p.readUInt16BE(6) !== 115) continue;
          const moved =
            decodeMessage(typeName("item.ItemMovedListMsg"), p.subarray(20))
              .moved ?? [];
          for (const row of moved) {
            const item = row.item;
            if (!item?.exist || item.bag_type !== 4) continue;
            assert.equal(
              Number(itemTemplate(item.template_id)?.Job),
              classForIcon(icon),
              `Starter ${item.template_id}, icon ${icon}`,
            );
            assert.equal(item.object_id, 1901);
            starters.add(item.template_id);
          }
        }
      };
      const bootstrap = s.world.bootstrap();
      checkEquipment(bootstrap);
      assert.ok(bootstrap.length > 50);
      const player = bootstrap.find(
        (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 3,
      )!;
      assert.equal(
        decodeMessage(
          typeName("player.PlayerMsg"),
          Buffer.from(player.frame, "base64").subarray(20),
        ).pic,
        icon,
      );
      assert.equal(s.world.setProgress(19000), false);
      for (let encounter = 0; encounter < 3; encounter++) {
        if (encounter === 2) s.world.handle(frame(5025, 1901));
        const responses = s.world.start(encounter);
        checkEquipment(responses);
        assert.ok(
          responses.some(
            (r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 157,
          ),
        );
        const battle = s.world.state.battle!;
        s.world.handle(frame(10007, 1901, protoString(2, battle.id)));
        s.advance();
        // Alternate basic / area / ultimate in another order than the recording.
        for (let turn = 0; turn < 150 && !battle.finished; turn++) {
          const choice = battle.skills[(turn + icon) % battle.skills.length]!;
          const ack = s.world.handle(action(battle.id, battle.hero, choice));
          assert.equal(ack.length, 1);
          const events = s.world.tick();
          checkEquipment(events);
          for (const r of events)
            assert.ok(Buffer.from(r.frame, "base64").length >= 20);
          s.advance();
        }
        assert.equal(battle.won, true, `icon=${icon}, encounter=${encounter}`);
        assert.equal(s.world.state.rewardCount, encounter + 1);
        assert.deepEqual(s.world.start(encounter), []);
      }
      assert.equal(s.world.state.complete, true);
      assert.equal(starters.size, 2, `Weapon and armor, icon ${icon}`);
      assert.equal(s.world.handle(frame(8281, 1901)).length, 3);
      const restored = new TutorialWorld(s.store, scenario, 1901, s.now);
      assert.equal(restored.state.complete, true);
      assert.equal(restored.state.rewardCount, 3);
    } finally {
      s.cleanup();
    }
  }
});
test("habilidade inválida, falta de fúria e pausa não avançam o roteiro; dano não causa derrota", () => {
  const s = setup();
  try {
    s.world.start(0);
    const b = s.world.state.battle!;
    b.ready = true;
    assert.equal(
      selectSkill(b, b.id, b.hero, 31011, s.now()).message.result,
      1,
    );
    assert.equal(
      selectSkill(b, b.id, b.hero, 30811, s.now()).message.result,
      1,
    );
    assert.equal(
      selectSkill(b, "wrong", b.hero, 30711, s.now()).message.result,
      1,
    );
    assert.equal(
      selectSkill(b, b.id, b.hero, 30711, s.now()).message.result,
      0,
    );
    b.paused = true;
    assert.deepEqual(advanceBattle(b, s.now()), []);
    b.paused = false;
    b.fighters.find((f) => f.id === b.hero)!.hp = 1;
    b.fighters.filter((f) => f.side === 2).forEach((f) => (f.hp = 10000));
    s.world.tick();
    assert.equal(b.fighters.find((f) => f.id === b.hero)!.hp, 1);
    assert.equal(b.finished, false);
    assert.equal(s.world.state.rewardCount, 0);
    assert.equal(s.world.setProgress(12500), false);
    assert.ok(s.world.start(0).length);
    assert.equal(s.world.state.battle!.id, b.id);
  } finally {
    s.cleanup();
  }
});
test("batalha retomada preserva vida, fúria, recarga e escolhas não dependem de cursor", () => {
  const s = setup(1);
  try {
    s.world.start(0);
    const b = s.world.state.battle!;
    b.ready = true;
    b.fighters.filter((f) => f.side === 2).forEach((f) => (f.hp = 1000));
    s.world.handle(action(b.id, b.hero, 10711));
    for (let i = 0; i < 3; i++) {
      s.world.tick();
      if (i < 2) s.advance();
    }
    assert.equal(
      selectSkill(b, b.id, b.hero, 10711, s.now()).message.result,
      1,
    );
    const restored = new TutorialWorld(s.store, scenario, 1901, s.now);
    assert.equal(restored.state.battle!.sp, b.sp);
    assert.deepEqual(restored.state.battle!.fighters, b.fighters);
    assert.equal(restored.state.battle!.ready, false);
    assert.ok(
      restored
        .bootstrap()
        .some((r) => Buffer.from(r.frame, "base64").readUInt16BE(6) === 157),
    );
    assert.doesNotThrow(() => restored.handle(frame(65500, 1901)));
  } finally {
    s.cleanup();
  }
});
test("launcher HTTP/RSA e TCP negociado aceitam outra classe e habilidade fora da captura", async () => {
  const s = setup(2);
  s.store.db
    .prepare("UPDATE tutorial_profiles SET active=0 WHERE user_id=1901")
    .run();
  await s.store.createUser("livre_test", "a-local-test-password", 1901);
  const config: Config = {
    mode: "tutorial",
    tutorialEngine: "dynamic",
    httpHost: "127.0.0.1",
    httpPort: 0,
    publicOrigin: "http://127.0.0.1:8080",
    gameHost: "127.0.0.1",
    gamePort: 0,
    advertisedGameHost: "127.0.0.1",
    upstreamOrigin: "https://servidor.legendremake.com",
    upstreamGameHost: "127.0.0.1",
    upstreamGamePort: 1,
    upstreamTimeoutMs: 1000,
    dataDir: s.store.dir,
    fixturePath: "",
    capturePackets: false,
    resourceMode: "offline",
  };
  mkdirSync(join(s.store.dir, "tutorial"), { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    join(s.store.dir, "tutorial/scenario.json"),
    JSON.stringify(scenario),
  );
  const auth = new ReplayAuth(s.store),
    game = new GameServer(config, s.store, auth),
    app = buildHttp(config, s.store, auth, game);
  const temporary = "1234567",
    proof = createHash("md5").update(temporary).digest("hex");
  const p = publicEncrypt(
    {
      key: createPublicKey({ key: auth.jwk, format: "jwk" }),
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(`livre_test|${s.store.issue(1901)}|${temporary}|1901`),
  ).toString("base64");
  let socket: ReturnType<typeof createConnection> | undefined;
  try {
    assert.match(
      (
        await app.inject({
          method: "POST",
          url: "/login",
          payload: new URLSearchParams({ p }).toString(),
          headers: { "content-type": "application/x-www-form-urlencoded" },
        })
      ).body,
      /value="true"/,
    );
    const register = await app.inject({
      method: "POST",
      url: "/visualizeregister",
      payload: new URLSearchParams({
        userid: "1901",
        key: proof,
        nickname: "ArqueiroLivre",
        icon: "2",
        sex: "1",
        camp: "1",
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    assert.match(register.body, /value="true"/);
    await game.listen();
    socket = createConnection({
      host: "127.0.0.1",
      port: (game.server.address() as AddressInfo).port,
    });
    await new Promise<void>((resolve, reject) => {
      socket!.once("connect", resolve);
      socket!.once("error", reject);
    });
    const reader = new FrameReader(),
      key = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
    reader.key = Buffer.from(key);
    const sendKey = Buffer.from(key),
      received: Buffer[] = [];
    socket.on("data", (chunk) =>
      reader.push(chunk, (packet) => received.push(packet)),
    );
    const login = frame(
      20001,
      1901,
      Buffer.concat([
        protoString(2, proof),
        ...Array.from(key, (k) => protoInt(3, k)),
      ]),
    );
    socket.write(crypt(login, Buffer.from(INITIAL_KEY)));
    const awaitPacket = async (op: number) => {
      const end = Date.now() + 4000;
      while (Date.now() < end) {
        const i = received.findIndex((p) => p.readUInt16BE(6) === op);
        if (i >= 0) return received.splice(i, 1)[0]!;
        if (socket!.destroyed) throw new Error("Sessão TCP encerrada");
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`Timeout opcode ${op}`);
    };
    socket.write(crypt(frame(8271, 1901), sendKey));
    const player = await awaitPacket(3);
    assert.equal(
      decodeMessage(typeName("player.PlayerMsg"), player.subarray(20)).pic,
      2,
    );
    socket.write(crypt(frame(5032, 1901, protoInt(2, 1000206)), sendKey));
    const prepared = decodeMessage(
      typeName("battle.BattlePrepareMsg"),
      (await awaitPacket(157)).subarray(20),
    );
    assert.equal(prepared.heros[0].temp_id, 2);
    assert.deepEqual(prepared.heros[0].skillId, [20711, 20811]);
    socket.write(
      crypt(frame(10007, 1901, protoString(2, prepared.battle_id)), sendKey),
    );
    socket.write(crypt(action(prepared.battle_id, 1, 20711), sendKey));
    assert.equal(
      decodeMessage(
        typeName("battle.HeroOrderMsg"),
        (await awaitPacket(75)).subarray(20),
      ).result,
      0,
    );
    assert.ok((await awaitPacket(153)).length > 20);
    assert.equal(socket.destroyed, false);
  } finally {
    socket?.destroy();
    await game.close();
    await app.close();
    s.cleanup();
  }
});
