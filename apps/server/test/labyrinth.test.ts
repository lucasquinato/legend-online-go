import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoInt, protoString } from "../src/protocol.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import { labyrinthFloors, LabyrinthFeature } from "../src/features/labyrinth/index.js";
import { currencyBalance } from "../src/features/currencies/index.js";
import { applyAttributes } from "../src/attributes.js";
import { itemTemplate } from "../src/inventory.js";

async function setup(icon = 3, strong = false) {
  const root = join(projectRoot, ".test-data");
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "labyrinth-"));
  mkdirSync(join(dir, "city"));
  copyFileSync(
    join(projectRoot, "data/city/scenario.json"),
    join(dir, "city/scenario.json"),
  );
  const store = new Store(dir);
  await store.createUser("maze", "test-password-123", 1960);
  store.initTutorialProfile(1960);
  store.db
    .prepare(
      "UPDATE tutorial_profiles SET active=1,icon=?,sex=?,nickname='Maze',process=26000 WHERE user_id=1960",
    )
    .run(icon, icon > 3 ? 1 : 0);
  let time = 1900000000000,
    city = new CityWorld(store, 1960, () => time);
  city.saved.labyrinth = { version: 1, floor: 1, cleared: [], entered: false };
  city.state.tower = {};
  if (strong) {
    // An isolated high-level fixture verifies all transitions without weakening enemies.
    city.state.player.grades = 80;
    city.state.player.bag_count = 100;
    city.saved.attributes!.sources.labyrinthTest = {
      kind: "other",
      evidence: "local-balance",
      values: {
        total_phy_attack: 10000000,
        total_magic_attack: 10000000,
        total_phy_defence: 10000000,
        total_magic_defence: 10000000,
        total_live: 100000000,
      },
    };
    applyAttributes(city.saved.attributes!, city.state.hero);
  }
  city.persist();
  return {
    store,
    get city() {
      return city;
    },
    send: (op: number, m: any) =>
      city.handle(
        frame(op, 1960, encodeMessage(city.scenario.outgoing[op]!, m)),
      ),
    click: (node: number) => city.handle(frame(5125, 1960, protoInt(1, node))),
    reload: () => (city = new CityWorld(store, 1960, () => time)),
    advance: (milliseconds = 10000) => (time += milliseconds),
    win: () => {
      const b = city.saved.battle!;
      city.handle(frame(10007, 1960, protoString(2, b.id)));
      const replies = [];
      for (let i = 0; i < 100 && !b.finished; i++) {
        time += 10000;
        replies.push(...city.tick());
      }
      assert.equal(
        b.won,
        true,
        JSON.stringify({
          map: city.saved.map,
          hero: b.fighters.find((f) => f.living_id === b.hero),
          stats: b.stats,
          turn: b.turn,
        }),
      );
      return replies;
    },
    message: (replies: any[], op: number) => {
      const p = replies.find(
        (p) => Buffer.from(p.frame, "base64").readUInt16BE(6) === op,
      );
      assert.ok(p, `Missing ${op}`);
      return decodeMessage(
        city.scenario.incoming[op]!,
        Buffer.from(p.frame, "base64").subarray(20),
      );
    },
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const opcode = (p: any) => Buffer.from(p.frame, "base64").readUInt16BE(6);

test("missão do labirinto conclui no primeiro piso imediatamente após vitória, sem portal", async () => {
  for (const icon of [1, 3, 5]) {
    const s = await setup(icon, true);
    try {
      s.city.state.quests[1840] = { ...s.city.scenario.questCatalog[1840],
        template_id: 1840, is_accept: 1, is_complete: 0, condition_1: 0 };
      s.city.persist();
      s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
      assert.equal(s.city.state.quests[1840]!.is_complete, 0);
      s.click(800102);
      assert.equal(s.city.state.quests[1840]!.is_complete, 0);
      const packets = s.win();
      assert.equal(s.city.saved.map, 8001);
      assert.equal(s.city.saved.labyrinth!.floor, 1);
      assert.equal(s.city.state.quests[1840]!.is_complete, 1);
      const quest = s.message(packets, 112).quest.find((q: any) => q.template_id === 1840);
      assert.equal(quest.is_complete, 1);
      assert.equal(quest.condition_1, 1);
      s.reload();
      assert.equal(s.city.state.quests[1840]!.is_complete, 1);
    } finally { s.cleanup(); }
  }
});

test("rodada concluída renova no dia seguinte, aceita manual e bot até 100 e conserva o recorde", async () => {
  const s = await setup(3, true);
  try {
    s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
    s.city.saved.map = 1;
    Object.assign(s.city.saved.labyrinth!, { record: 100, floor: 100, completed: true, cleared: Array.from({ length: 100 }, (_, i) => i + 1) });
    s.city.persist();
    const oldRun = s.city.saved.labyrinth!.runId;
    assert.ok(s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 }).some(p => opcode(p) === 83));
    s.advance(86400000); s.reload();
    const available = s.message(s.city.bootstrap(), 4373).towerInfo.find((t: any) => t.campaign_id === 8001);
    assert.equal(available.enter_count, 0);
    assert.equal(available.max_index, 100);
    s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
    assert.equal(s.city.saved.map, 8001);
    assert.equal(s.city.saved.labyrinth!.floor, 1);
    assert.equal(s.city.saved.labyrinth!.record, 100);
    assert.notEqual(s.city.saved.labyrinth!.runId, oldRun);
    assert.deepEqual(s.city.saved.labyrinth!.cleared, []);
    assert.deepEqual(s.city.saved.labyrinth!.claimed, []);
    s.click(800102); s.win();
    assert.deepEqual(s.city.saved.labyrinth!.cleared, [1]);
    s.send(5025, { msg: "" });
    Object.assign(s.city.saved.labyrinth!, { completed: true, floor: 100 });
    s.city.persist();
    s.advance(86400000); s.reload();
    s.city.state.economy.gold_total_count = 1000000;
    s.city.state.player.gift_token = 100;
    assert.equal(s.message(startMazeBot(s, 100), 4425).status, 1);
    assert.equal(s.city.saved.labyrinth!.bot!.start, 1);
    assert.equal(s.city.saved.labyrinth!.bot!.end, 100);
    s.send(8528, { sweep_type: 2, op_type: 2, pay_type: 2 });
    assert.equal(s.city.saved.labyrinth!.cleared.length, 100);
    assert.equal(s.city.saved.labyrinth!.completed, true);
    assert.equal(s.city.saved.labyrinth!.record, 100);
    assert.equal(s.message(s.city.bootstrap(), 4373).towerInfo[0].enter_count, 1);
  } finally { s.cleanup(); }
});

test("rodada parcial permanece no piso antigo; redefinir permite usar a chance diária e bot até o recorde", async () => {
  const s = await setup();
  try {
    s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
    s.city.saved.map = 1;
    Object.assign(s.city.saved.labyrinth!, { record: 79, floor: 80, completed: false, cleared: Array.from({ length: 79 }, (_, i) => i + 1) });
    s.city.persist();
    s.advance(86400000); s.reload();
    s.city.state.economy.gold_total_count = 1000000;
    const before = structuredClone(s.city.saved.labyrinth);
    assert.ok(startMazeBot(s, 80).some(p => opcode(p) === 83));
    assert.deepEqual(s.city.saved.labyrinth, before);
    const listing = s.message(s.city.bootstrap(), 4373).towerInfo[0];
    assert.equal(listing.tower_index, 80);
    assert.equal(listing.enter_count, 0);
    s.send(8299, { index: 0 });
    assert.equal(s.message(startMazeBot(s, 79), 4425).status, 1);
    assert.equal(s.city.saved.labyrinth!.bot!.start, 1);
    assert.equal(s.city.saved.labyrinth!.bot!.end, 79);
    assert.equal(s.city.saved.labyrinth!.record, 79);
    assert.deepEqual(s.city.saved.labyrinth!.cleared, []);
  } finally { s.cleanup(); }
});

test("virada preserva o piso 50 e a chance não acumula; concluir ou redefinir permite uma única rodada nova", async () => {
  for (const finish of [false, true]) {
    const s = await setup();
    try {
      s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
      s.city.saved.map = 1;
      Object.assign(s.city.saved.labyrinth!, { floor: 50, record: 100, cleared: Array.from({ length: 49 }, (_, i) => i + 1) });
      s.city.persist();
      const originalRun = s.city.saved.labyrinth!.runId;
      const oldDay = s.city.saved.labyrinth!.lastEntryDay;
      s.advance(3 * 86400000); s.reload();
      const info = s.message(s.city.bootstrap(), 4373).towerInfo[0];
      assert.equal(info.tower_index, 50);
      assert.equal(info.enter_count, 0);
      assert.equal(info.max_enterCount, 1);
      s.send(8296, { campaign_id: 8001, choose_index: 0, is_double: 1 });
      assert.equal(s.city.saved.map, 8050);
      assert.equal(s.city.saved.labyrinth!.runId, originalRun);
      assert.equal(s.city.saved.labyrinth!.lastEntryDay, oldDay);
      s.send(5025, { msg: "" });
      if (finish) {
        Object.assign(s.city.saved.labyrinth!, { completed: true, floor: 100 });
        s.city.persist();
      } else s.send(8299, { index: 0 });
      s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
      assert.equal(s.city.saved.map, 8001);
      assert.notEqual(s.city.saved.labyrinth!.runId, originalRun);
      assert.equal(s.message(s.city.bootstrap(), 4373).towerInfo[0].enter_count, 1);
      s.send(5025, { msg: "" }); s.send(8299, { index: 0 });
      assert.ok(s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 }).some(p => opcode(p) === 83));
      assert.equal(s.city.saved.map, 1);
    } finally { s.cleanup(); }
  }
});

test("baú e portal bloqueiam sem conceder prêmios ou avançar; avisos aparecem na tela e no chat", async () => {
  for (const [mode, floor] of [[8001, 5], [8001, 100], [8101, 5], [8101, 30]] as const) {
    const s = await setup(3, true);
    try {
      s.city.saved.labyrinth!.mode = mode;
      if (mode === 8101) s.city.saved.labyrinth!.record = 100;
      const progress = mode === 8001 ? s.city.saved.labyrinth! : s.city.saved.labyrinth!.abyss!;
      Object.assign(progress, { floor, entered: true, cleared: [], claimed: [], multiplier: 1 });
      s.city.persist();
      s.send(8296, { campaign_id: mode, choose_index: 0, is_double: 1 });
      const map = mode + floor - 1;
      const before = structuredClone(s.city.saved);
      const blockedChest = s.click(map * 100 + 3);
      assert.equal(s.message(blockedChest, 83).encode_msg, "Derrote o monstro antes de coletar o baú.");
      assert.equal(s.message(blockedChest, 111).encode_msg, s.message(blockedChest, 83).encode_msg);
      assert.deepEqual(s.city.saved, before);
      s.click(map * 100 + 2); s.win();
      const afterWin = structuredClone(s.city.saved);
      const blockedPortal = s.click(map * 100 + 4);
      assert.equal(s.message(blockedPortal, 83).encode_msg, "Colete o baú deste piso antes de usar o portal.");
      assert.equal(s.message(blockedPortal, 111).encode_msg, s.message(blockedPortal, 83).encode_msg);
      assert.ok(!blockedPortal.some(p => [125, 21, 22, 115, 4725].includes(opcode(p))));
      assert.deepEqual(s.city.saved, afterWin);
      s.reload();
      s.send(8296, { campaign_id: mode, choose_index: 0, is_double: 1 });
      assert.equal(s.message(s.click(map * 100 + 4), 111).encode_msg, "Colete o baú deste piso antes de usar o portal.");
      const collected = s.click(map * 100 + 3);
      assert.ok(s.message(collected, 111).encode_msg.startsWith("Obteve:"));
      assert.deepEqual((mode === 8001 ? s.city.saved.labyrinth! : s.city.saved.labyrinth!.abyss!).claimed, [floor]);
      const exited = s.click(map * 100 + 4);
      assert.equal(s.city.saved.map, floor === (mode === 8001 ? 100 : 30) ? 1 : map + 1);
      if (floor === (mode === 8001 ? 100 : 30)) {
        const summary = s.message(exited, 4425);
        assert.equal(summary.status, 10);
        assert.equal(summary.sweep_type, 3);
        const finalProgress = mode === 8001 ? s.city.saved.labyrinth! : s.city.saved.labyrinth!.abyss!;
        assert.equal(summary.total_gp, finalProgress.totalGp);
        assert.deepEqual(summary.result[0].items.map((i: any) => [i.template_id, i.count]),
          Object.entries(finalProgress.items!).map(([id, count]) => [Number(id), count]));
        const towers = s.message(s.city.bootstrap(), 4373).towerInfo;
        assert.equal(towers.find((t: any) => t.campaign_id === mode).max_index, floor);
      }
    } finally { s.cleanup(); }
  }
});

test("sorteio de gemas usa os oito atributos, conserva nível e quantidade e não sorteia duas vezes na coleta", async () => {
  const s = await setup();
  try {
    let calls = 0;
    const maze = new LabyrinthFeature(s.city.saved, structuredClone(s.city.scenario), Date.now, size => {
      assert.equal(size, 8); return calls++ % size;
    });
    const seen = new Set<number>();
    for (const floor of labyrinthFloors.values()) {
      const sourceGem = floor.drops.find(d => itemTemplate(d.templateId)?.SonType === "205");
      if (!sourceGem) continue;
      maze.selectMode(8001);
      s.city.state.player.grades = 80;
      maze.progress(8001).record = 100;
      maze.selectMode(floor.mode);
      const p = maze.progress();
      Object.assign(p, { floor: floor.floor, cleared: [floor.floor], claimed: [], entered: true });
      for (const multiplier of [1, 2] as const) {
        p.multiplier = multiplier;
        for (let attribute = 0; attribute < 8; attribute++) {
          p.chestLoot = {};
          const before = calls;
          const drops = maze.chestDrops(floor.map * 100 + 3);
          const gem = drops.find(d => itemTemplate(d.templateId)?.SonType === "205")!;
          seen.add(Number(itemTemplate(gem.templateId)!.Property1));
          assert.equal(itemTemplate(gem.templateId)!.Property6, itemTemplate(sourceGem.templateId)!.Property6);
          assert.equal(gem.count, multiplier * 2);
          assert.equal(gem.model!.template_id, gem.templateId);
          assert.deepEqual(maze.chestDrops(floor.map * 100 + 3), drops);
          assert.equal(calls, before + 1);
        }
      }
    }
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  } finally { s.cleanup(); }
});

test("Abismo exige simultaneamente nível 80 e recorde 100, na entrada e no bot", async () => {
  for (const [level, record, allowed] of [[79, 100, false], [80, 99, false], [80, 100, true]] as const) {
    const s = await setup();
    try {
      s.city.state.player.grades = level;
      s.city.state.economy.gold_total_count = 1000000;
      s.city.saved.labyrinth!.record = record;
      // A previous abyss record must not bypass either prerequisite.
      s.city.saved.labyrinth!.abyss!.record = 1;
      s.city.persist();
      const before = structuredClone(s.city.saved);
      const bot = s.send(8528, { sweep_type: 2, op_type: 1, campaign_id: 8101, e_index: 1, enter_type: 1 });
      if (allowed) {
        assert.equal(s.message(bot, 4425).status, 1);
        s.advance(6000); s.city.tick();
        assert.deepEqual(s.city.saved.labyrinth!.abyss!.cleared, [1]);
      } else {
        assert.equal(s.message(bot, 83).encode_msg, level < 80
          ? "O Abismo é liberado somente no nível 80."
          : "Conclua os 100 pisos do Labirinto antes de acessar o Abismo.");
        assert.deepEqual(s.city.saved, before);
      }
      const entry = s.send(8296, { campaign_id: 8101, choose_index: allowed ? 0 : 1, is_double: allowed ? 1 : 2 });
      if (allowed) {
        assert.ok(entry.some(p => opcode(p) === 125));
        assert.equal(s.city.saved.map, 8102);
      } else {
        assert.ok(entry.some(p => opcode(p) === 83));
        assert.deepEqual(s.city.saved, before);
      }
    } finally { s.cleanup(); }
  }
});

test("callback com mapa em cache não antecipa atores e vitória segue a ordem do Flash", async () => {
  for (const icon of [3, 5]) {
    const s = await setup(icon, true);
    try {
      let entered = s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
      for (const map of [8001, 8002, 8003]) {
        // The Flash sends 5035 on scene entry and battle return. Its historical
        // response contains floor 1 nodes and must never overwrite this map.
        assert.deepEqual(s.send(5035, { state: 4 }), []);
        // enterOver may fire while the delayed scene snapshot is still queued.
        const callback = s.send(5038, { para_int1: map });
        assert.deepEqual(callback.map(opcode), [20]);
        const scene = entered.filter(p => [125, 127, 21, 131].includes(opcode(p)));
        assert.deepEqual(scene.map(opcode), [125, 127, 21, 131]);
        assert.ok(scene.every(p => p.delayMs === scene[0]!.delayMs));
        assert.equal(s.message(scene, 125).room.campaignId, map);
        assert.equal(s.message(scene, 21).player[0].template_id, icon);
        assert.equal(s.message(scene, 131).player_id, 1960);
        assert.equal(s.message(scene, 131).state, 0);
        const nodes = s.message(scene, 127).node;
        assert.ok(nodes.every((n: any) => Math.floor(n.node_id / 100) === map));
        const started = s.click(map * 100 + 2);
        assert.deepEqual(started.map(opcode), [128, 157]);
        assert.equal(s.message(started, 128).node_state, 4);
        const battleId = s.city.saved.battle!.id;
        assert.deepEqual(s.click(map * 100 + 2), []);
        assert.equal(s.city.saved.battle!.id, battleId);
        const replies = s.win();
        const returned = s.send(5035, { state: 4 });
        assert.ok(!returned.some(p => [125, 127, 157].includes(opcode(p))));
        assert.equal(s.message(returned, 128).node_state, 8);
        assert.equal(s.message(returned, 131).state, 0);
        const transition = replies.filter(p => [4103, 4373, 131, 128].includes(opcode(p)));
        assert.deepEqual(transition.map(opcode), [4103, 4373, 128, 128, 131]);
        assert.ok(transition.every((p, i) => i === 0 || p.delayMs >= transition[i - 1]!.delayMs));
        const updates = transition.filter(p => opcode(p) === 128).map(p => s.message([p], 128));
        assert.deepEqual(updates.map(u => [u.node_id, u.node_state, u.sonType, u.param1]), [
          [map * 100 + 2, 8, 2116, 0],
          [map * 100 + 4, 1, 2336, map + 1],
        ]);
        assert.ok(updates.every(u => u.uu_id));
        assert.deepEqual(s.send(5038, { para_int1: map }).map(opcode), [20]);
        const gp = s.city.state.player.totalGp;
        const repeated = s.click(map * 100 + 2);
        assert.ok(!repeated.some(p => [153, 154, 157, 4103].includes(opcode(p))));
        assert.equal(s.message(repeated, 128).node_state, 8);
        assert.equal(s.city.saved.battle!.id, battleId);
        assert.equal(s.city.state.player.totalGp, gp);
        s.send(5025, { msg: "" });
        s.reload();
        entered = s.send(8296, { campaign_id: 8001, choose_index: 0, is_double: 1 });
        assert.deepEqual(s.send(5038, { para_int1: map }).map(opcode), [20]);
        assert.equal(s.message(entered, 127).node.find((n: any) => n.master_type === 42).state, 8);
        assert.equal(s.message(entered, 127).node.find((n: any) => n.son_type === 2336).state, 1);
        assert.equal(s.city.saved.map, map);
        assert.equal(s.city.state.player.totalGp, gp);
        entered = s.click(map * 100 + 4);
        assert.equal(s.city.saved.map, map + 1);
        assert.equal(s.message(entered, 125).created_type, 3);
        assert.ok(s.click(map * 100 + 2).some(p => opcode(p) === 83));
      }
    } finally {
      s.cleanup();
    }
  }
});

test("as duas classes percorrem os 130 pisos reais com baús, reconexão, prêmios únicos e saída final", async () => {
  for (const icon of [3, 5]) {
    const s = await setup(icon, true);
    try {
      const listing = s.message(s.city.bootstrap(), 4373).towerInfo;
      assert.deepEqual(
        listing.map((t: any) => [t.campaign_id, t.tower_index, t.max_index]),
        [
          [8001, 0, 0],
          [8101, 0, 0],
        ],
      );
      for (const mode of [8001, 8101]) {
        let entry = s.send(8296, {
          campaign_id: mode,
          choose_index: 1,
          is_double: 1,
        });
        const end = mode === 8001 ? 8100 : 8130;
        let expectedGp = 0;
        for (let map = mode; map <= end; map++) {
          const definition = labyrinthFloors.get(map)!;
          assert.equal(s.city.saved.map, map);
          assert.equal(entry.filter((p) => opcode(p) === 127).length, 1);
          const nodes = s.message(entry, 127).node;
          assert.equal(
            nodes.filter((n: any) => n.master_type === 42).length,
            1,
          );
          assert.equal(s.message(entry, 21).player[0].template_id, icon);
          const preloads = s.send(5038, { para_int1: map });
          assert.ok(!preloads.some((p) => [21, 127].includes(opcode(p))));
          assert.ok(s.message(preloads, 20));
          assert.ok(s.click(map * 100 + 4).some((p) => opcode(p) === 83));
          const started = s.click(map * 100 + 2),
            prepare = s.message(started, 157);
          assert.equal(prepare.map_temp_id, map);
          assert.equal(
            prepare.heros.find((h: any) => h.side === 1 && h.type === 1)
              .temp_id,
            icon,
          );
          const originalEnemies = [
            ...definition.reference.prepare.heros,
            ...definition.reference.prepare.soldiers,
          ].filter((f: any) => f.side === 2);
          const enemies = [
            ...prepare.heros,
            ...(prepare.soldiers ?? []),
          ].filter((f: any) => f.side === 2);
          assert.deepEqual(
            enemies.map((f: any) => [f.temp_id, f.hp, f.pos]),
            originalEnemies.map((f: any) => [f.temp_id, f.hp, f.pos]),
          );
          const rewards = s.win(),
            report = s.message(rewards, 4103);
          const xp =
            Number(
              definition.reference.rewards.find((p) => p.opcode === 4103)!
                .message!.gp_bonus,
            ) / 2;
          expectedGp += xp;
          assert.equal(report.gp_bonus, xp);
          const xpChat = s.message(rewards, 83);
          assert.equal(xpChat.channel, 3);
          assert.equal(xpChat.is_centerTip, 0);
          assert.equal(xpChat.encode_msg, `Você recebeu ${xp} de XP pelo piso ${map - mode + 1} do ${mode === 8001 ? "Labirinto" : "Abismo"}.`);
          assert.equal(rewards.filter(p => opcode(p) === 83).length, 1);
          const nextTickMessages = s.city.tick().filter(p => opcode(p) === 83).map(p => s.message([p], 83));
          // A completed floor may also unlock a title; only the XP notice must not repeat.
          assert.ok(!nextTickMessages.some(message => message.encode_msg === xpChat.encode_msg));
          assert.ok(!rewards.some((p) => opcode(p) === 127));
          assert.ok(s.click(map * 100 + 2).some((p) => opcode(p) === 83));
          assert.equal(s.city.saved.map, map); // Victory alone must not advance a floor.
          if (map % 5 === 0 || map === 8002 || map === 8101) {
            s.send(5025, { msg: "" });
            s.reload();
            const resumed = s.send(8296, {
              campaign_id: mode,
              choose_index: 0,
              is_double: 1,
            });
            assert.equal(s.city.saved.map, map);
            assert.equal(
              s
                .message(resumed, 127)
                .node.find((n: any) => n.node_id === map * 100 + 2).state,
              8,
            );
            const gp = s.city.state.player.totalGp;
            s.reload();
            const reconnect = s.city.bootstrap();
            assert.equal(s.message(reconnect, 21).player[0].template_id, icon);
            assert.equal(
              s
                .message(reconnect, 127)
                .node.find((n: any) => n.node_id === map * 100 + 4).state,
              1,
            );
            assert.equal(s.city.state.player.totalGp, gp);
          }
          if (definition.drops.length) {
            const countInBag = (template: number) => Object.values(s.city.state.items)
              .filter(item => item.template_id === template && item.bag_type === 1)
              .reduce((total, item) => total + item.count, 0);
            const previousCounts = new Map(Object.values(s.city.state.items).map(item => [item.template_id, countInBag(item.template_id)]));
            const collected = s.click(map * 100 + 3);
            assert.equal(s.message(collected, 83).channel, 3);
            assert.equal(s.message(collected, 83).is_centerTip, 0);
            assert.equal(s.message(collected, 83).encode_msg, s.message(collected, 111).encode_msg);
            assert.equal(s.message(collected, 111).channel, 7);
            const actualDrops = s.city.saved.labyrinth!.mode === 8001 ? s.city.saved.labyrinth!.chestLoot![map - mode + 1]! : s.city.saved.labyrinth!.abyss!.chestLoot![map - mode + 1]!;
            for (const drop of actualDrops) {
              const quantity = drop.count;
              assert.ok(s.message(collected, 111).encode_msg.includes(`${itemTemplate(drop.templateId)!.TemplateName} x${quantity}`));
              if (drop.templateId !== 208009)
                assert.equal(countInBag(drop.templateId), (previousCounts.get(drop.templateId) ?? 0) + quantity);
            }
            const delta = s.message(collected, 115).moved;
            assert.ok(delta.every((m: any) => m.change_type === 1 && m.change_obj_id === 0));
            assert.ok(!Object.values(s.city.state.items).some(item => item.bag_type === 34));
            const items = structuredClone(s.city.state.items),
              coins = currencyBalance(s.city.state, "labyrinthCoin");
            assert.ok(s.click(map * 100 + 3).some((p) => opcode(p) === 83));
            assert.deepEqual(s.city.state.items, items);
            assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), coins);
          }
          entry = s.click(map * 100 + 4);
          if (map === end) {
            assert.ok(entry.some((p) => opcode(p) === 22));
            assert.equal(s.city.saved.map, 1);
          }
        }
        const progress =
          mode === 8001
            ? s.city.saved.labyrinth!
            : s.city.saved.labyrinth!.abyss!;
        assert.equal(progress.cleared.length, mode === 8001 ? 100 : 30);
        assert.equal(progress.claimed!.length, mode === 8001 ? 20 : 6);
        assert.equal(progress.completed, true);
        assert.equal(progress.totalGp, expectedGp);
        assert.ok(
          s
            .send(8296, { campaign_id: mode, choose_index: 0, is_double: 1 })
            .some((p) => opcode(p) === 83),
        );
      }
      assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 160);
      assert.equal(s.city.saved.labyrinth!.totalGp, 1010000);
      assert.equal(s.city.saved.labyrinth!.abyss!.totalGp, 15300000);
    } finally {
      s.cleanup();
    }
  }
});

test("entrada dupla cobra uma chave no labirinto e três no abismo, sem cobrar ao retomar; falha de save desfaz o consumo", async () => {
  const s = await setup(1);
  try {
    const source = s.city.scenario.cases.find(
      (c) => c.opcode === 8296 && c.request?.choose_index === 1,
    )!;
    const key = source.patches.find(
      (p) => p.path[0] === "items" && p.before && !p.after,
    )!.before;
    s.city.state.items["1:0:0"] = {
      ...key,
      id: 999111,
      pos: 0,
      count: 4,
      exist: 1,
    };
    s.city.persist();
    s.store.db.exec(
      "CREATE TRIGGER maze_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'maze save failure'); END",
    );
    assert.throws(
      () => s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 2 }),
      /maze save failure/,
    );
    assert.equal(s.city.state.items["1:0:0"]!.count, 4);
    assert.equal(s.city.saved.map, 1);
    s.store.db.exec("DROP TRIGGER maze_fail");
    s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 2 });
    assert.equal(s.city.state.items["1:0:0"]!.count, 3);
    s.send(5025, { msg: "" });
    s.send(8296, { campaign_id: 8001, choose_index: 0, is_double: 1 });
    assert.equal(s.city.state.items["1:0:0"]!.count, 3);
    s.send(5025, { msg: "" });
    s.city.state.player.grades = 80;
    s.city.saved.labyrinth!.record = 100;
    s.send(8296, { campaign_id: 8101, choose_index: 1, is_double: 2 });
    assert.ok(!s.city.state.items["1:0:0"]);
    assert.equal(s.city.saved.labyrinth!.multiplier, 2);
    assert.equal(s.city.saved.labyrinth!.abyss!.multiplier, 2);
  } finally {
    s.cleanup();
  }
});

test("baú exige vitória, saldo e inventário são atômicos e um pedido de outro piso não altera a cena", async () => {
  const s = await setup(3, true);
  try {
    s.city.saved.labyrinth!.floor = 5;
    s.city.saved.labyrinth!.cleared = [1, 2, 3, 4];
    s.city.saved.labyrinth!.entered = true;
    s.city.persist();
    s.send(8296, { campaign_id: 8001, choose_index: 0, is_double: 1 });
    assert.ok(s.click(800503).some((p) => opcode(p) === 83));
    assert.ok(s.send(5038, { para_int1: 8006 }).some((p) => opcode(p) === 83));
    assert.equal(s.city.saved.map, 8005);
    s.click(800502);
    s.win();
    const before = structuredClone(s.city.saved),
      transactions = s.store.db
        .prepare("SELECT count(*) n FROM currency_transactions")
        .get()!.n;
    s.store.db.exec(
      "CREATE TRIGGER maze_chest_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'chest save failure'); END",
    );
    assert.throws(() => s.click(800503), /chest save failure/);
    assert.deepEqual(s.city.saved, before);
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM currency_transactions").get()!
        .n,
      transactions,
    );
    s.store.db.exec("DROP TRIGGER maze_chest_fail");
    const collected = s.click(800503);
    const gemId = s.city.saved.labyrinth!.chestLoot![5]!.find(d => d.templateId !== 208009)!.templateId;
    assert.equal(s.message(collected, 111).encode_msg, `Obteve:${itemTemplate(gemId)!.TemplateName} x4,Moeda do Labirinto x10`);
    assert.ok(Object.values(s.city.state.items).some(item => item.template_id === gemId && item.bag_type === 1 && item.count === 4));
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 10);
    s.send(5025, { msg: "" });
    s.reload();
    const entry = s.send(8296, {
      campaign_id: 8001,
      choose_index: 0,
      is_double: 1,
    });
    assert.equal(
      s.message(entry, 127).node.find((n: any) => n.node_id === 800503).state,
      8,
    );
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 10);
  } finally {
    s.cleanup();
  }
});

test("mochila cheia mantém baú disponível e não concede moeda nem aviso de coleta", async () => {
  const s = await setup(5, true);
  try {
    Object.assign(s.city.saved.labyrinth!, { floor: 5, entered: true, cleared: [5], multiplier: 1 });
    const model = labyrinthFloors.get(8005)!.drops.find(d => d.templateId === 2050401)!.model!;
    s.city.state.player.bag_count = 0;
    s.city.state.items = Object.fromEntries(Array.from({ length: 42 }, (_, pos) => [`1:0:${pos}`, {
      ...structuredClone(model), id: 10000000 + pos, bag_type: 1, object_id: 0, pos,
      count: Number(itemTemplate(2050401)!.MaxCount), exist: 1,
    }]));
    s.city.persist();
    s.send(8296, { campaign_id: 8001, choose_index: 0, is_double: 1 });
    const before = structuredClone(s.city.saved);
    const failed = s.click(800503);
    assert.deepEqual(failed.map(opcode), [83]);
    assert.deepEqual(s.city.saved, before);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 0);
    assert.ok(!s.city.saved.labyrinth!.claimed?.includes(5));
    delete s.city.state.items["1:0:0"];
    s.city.persist();
    const collected = s.click(800503);
    const gemId = s.city.saved.labyrinth!.chestLoot![5]!.find(d => d.templateId !== 208009)!.templateId;
    assert.equal(s.message(collected, 111).encode_msg, `Obteve:${itemTemplate(gemId)!.TemplateName} x2,Moeda do Labirinto x5`);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 5);
    assert.equal(s.city.state.items["1:0:0"]!.count, 2);
  } finally {
    s.cleanup();
  }
});

test("derrota no abismo não concede XP nem abre portal, e permite outra tentativa sem nova cobrança", async () => {
  const s = await setup(5);
  try {
    s.city.state.player.grades = 80;
    s.city.saved.labyrinth!.record = 100;
    s.city.saved.labyrinth!.mode = 8101;
    s.city.saved.labyrinth!.abyss = {
      floor: 30,
      cleared: [],
      entered: true,
      multiplier: 1,
      totalGp: 0,
    };
    s.city.persist();
    s.send(8296, { campaign_id: 8101, choose_index: 0, is_double: 1 });
    const xp = s.city.state.player.totalGp;
    s.click(813002);
    const first = s.city.saved.battle!;
    s.city.handle(frame(10007, 1960, protoString(2, first.id)));
    let replies: any[] = [];
    for (let i = 0; i < 100 && !first.finished; i++) {
      s.advance();
      replies.push(...s.city.tick());
    }
    assert.equal(first.finished, true);
    assert.equal(first.won, false);
    assert.ok(!replies.some(p => opcode(p) === 83));
    assert.equal(s.message(replies, 4103).battle_scene, 10);
    assert.equal(s.city.state.player.totalGp, xp);
    assert.deepEqual(s.city.saved.labyrinth!.abyss!.cleared, []);
    assert.ok(s.click(813004).some((p) => opcode(p) === 83));
    assert.ok(s.click(813002).some((p) => opcode(p) === 157));
    assert.notEqual(s.city.saved.battle!.id, first.id);
  } finally {
    s.cleanup();
  }
});


test("redefinição conserva recorde, limita uma nova rodada por dia e separa modalidades", async () => {
  const s = await setup(3, true);
  try {
    s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
    s.click(800102); s.win();
    s.send(5037, {});
    // The normal leave request is exercised elsewhere; reset requires the city.
    s.city.saved.map = 1;
    const gold = currencyBalance(s.city.state, "gold"), xp = s.city.state.player.totalGp;
    const id = s.city.saved.labyrinth!.runId;
    assert.equal(s.message(s.send(8299, { index: 0 }), 4205).tower_index, 0);
    assert.equal(s.city.saved.labyrinth!.record, 1);
    assert.notEqual(s.city.saved.labyrinth!.runId, id);
    assert.deepEqual(s.city.saved.labyrinth!.cleared, []);
    const rejected = s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
    assert.ok(rejected.some(p => opcode(p) === 83));
    assert.equal(s.city.saved.map, 1);
    assert.equal(currencyBalance(s.city.state, "gold"), gold);
    assert.equal(s.city.state.player.totalGp, xp);
    s.reload();
    s.advance(86400000);
    s.send(8296, { campaign_id: 8001, choose_index: 1, is_double: 1 });
    assert.equal(s.city.saved.map, 8001);
    s.city.saved.map = 1;
    s.city.saved.labyrinth!.record = 100;
    s.send(8296, { campaign_id: 8101, choose_index: 1, is_double: 1 });
    assert.equal(s.city.saved.map, 8101);
    assert.equal(s.city.saved.labyrinth!.record, 100);
  } finally { s.cleanup(); }
});

function botFixture(s: Awaited<ReturnType<typeof setup>>, record = 5) {
  Object.assign(s.city.saved.labyrinth!, { floor: 1, record, entered: false, cleared: [], multiplier: 1 });
  s.city.state.economy.gold_total_count = 1000000;
  s.city.persist();
}
const startMazeBot = (s: Awaited<ReturnType<typeof setup>>, end = 5) => s.send(8528, { sweep_type: 2, op_type: 1, campaign_id: 8001, e_index: end, enter_type: 1, pay_type: 2 });

test("bot só aceita pisos vencidos, usa ouro centralizado e recebe XP e drops uma vez, inclusive offline", async () => {
  const s = await setup();
  try {
    botFixture(s);
    assert.ok(startMazeBot(s, 6).some(p => opcode(p) === 83));
    assert.equal(currencyBalance(s.city.state, "gold"), 1000000);
    const xp = s.city.state.player.totalGp;
    assert.equal(s.message(startMazeBot(s), 4425).status, 1);
    assert.equal(currencyBalance(s.city.state, "gold"), 995000);
    s.advance(5999);
    assert.equal(s.city.tick().some(p => opcode(p) === 4425), false);
    s.advance(1);
    assert.equal(s.message(s.city.tick(), 4425).status, 0);
    assert.deepEqual(s.city.saved.labyrinth!.cleared, [1]);
    s.reload(); s.advance(24000);
    const resultPackets = s.city.tick();
    assert.equal(resultPackets.some(p => [83,111].includes(opcode(p))), false);
    const result = s.message(resultPackets, 4425);
    assert.equal(result.status, 11);
    assert.equal(result.result.length, 4);
    assert.deepEqual(s.city.saved.labyrinth!.cleared, [1, 2, 3, 4, 5]);
    assert.deepEqual(s.city.saved.labyrinth!.claimed, [5]);
    assert.equal(s.city.saved.labyrinth!.floor, 6);
    assert.equal(s.city.saved.map, 1);
    assert.equal(s.city.state.player.totalGp - xp, 3000);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 5);
    const gemId = s.city.saved.labyrinth!.chestLoot![5]!.find(d => d.templateId !== 208009)!.templateId;
    const gem = Object.values(s.city.state.items).find(i => i.template_id === gemId && i.bag_type === 1);
    assert.equal(gem?.count, 2);
    s.reload();
    s.send(8528, { sweep_type: 2, op_type: 3 }); s.city.tick();
    assert.equal(s.city.state.player.totalGp - xp, 3000);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 5);
  } finally { s.cleanup(); }
});

test("pausar restitui ouro dos pisos pendentes e permite retomar a mesma rodada", async () => {
  const s = await setup();
  try {
    botFixture(s); startMazeBot(s);
    s.advance(12000); s.city.tick();
    const beforePause = currencyBalance(s.city.state, "gold");
    assert.equal(s.message(s.send(8528, { sweep_type: 2, op_type: 4 }), 4425).status, 15);
    assert.equal(currencyBalance(s.city.state, "gold"), beforePause + 3000);
    assert.equal(s.city.saved.labyrinth!.floor, 3);
    assert.equal(s.message(startMazeBot(s), 4425).status, 1);
    assert.equal(currencyBalance(s.city.state, "gold"), beforePause);
    s.advance(18000); s.city.tick();
    assert.equal(s.city.saved.labyrinth!.bot!.ended, true);
    assert.deepEqual(s.city.saved.labyrinth!.cleared, [1, 2, 3, 4, 5]);
  } finally { s.cleanup(); }
});

test("aceleração cobra diamantes e redefinição/entrada não interrompem um bot ativo", async () => {
  const s = await setup();
  try {
    botFixture(s);
    s.city.state.player.gift_token = 20;
    startMazeBot(s);
    assert.ok(s.send(8299, { index: 0 }).some(p => opcode(p) === 83));
    assert.ok(s.send(8296, { campaign_id: 8001, choose_index: 0, is_double: 1 }).some(p => opcode(p) === 83));
    assert.equal(s.message(s.send(8528, { sweep_type: 2, op_type: 2, pay_type: 2 }), 4425).status, 11);
    assert.equal(currencyBalance(s.city.state, "boundDiamonds"), 19);
    assert.equal(s.city.saved.labyrinth!.bot!.completed, 5);
    assert.equal(s.city.saved.labyrinth!.record, 5);
  } finally { s.cleanup(); }
});

test("falha ao salvar bot desfaz ouro, início de rodada e progresso", async () => {
  const s = await setup();
  try {
    botFixture(s);
    const before = structuredClone(s.city.saved.labyrinth);
    s.store.db.exec("CREATE TRIGGER maze_bot_fail BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'bot save failure'); END");
    assert.throws(() => startMazeBot(s), /bot save failure/);
    assert.equal(currencyBalance(s.city.state, "gold"), 1000000);
    assert.deepEqual(s.city.saved.labyrinth, before);
    s.store.db.exec("DROP TRIGGER maze_bot_fail");
    assert.equal(s.message(startMazeBot(s), 4425).status, 1);
  } finally { s.cleanup(); }
});

test("bot percorre todos os pisos históricos de ambas as modalidades e a reconexão liquida o tempo offline", async () => {
  const s = await setup();
  try {
    botFixture(s, 100);
    s.city.state.player.gift_token = 100;
    startMazeBot(s, 100);
    s.advance(600000);
    s.reload();
    const responses = s.city.bootstrap();
    assert.ok(responses.some(p => opcode(p) === 4425));
    assert.equal(s.city.saved.labyrinth!.completed, true);
    assert.equal(s.city.saved.labyrinth!.cleared.length, 100);
    assert.equal(s.city.saved.labyrinth!.claimed!.length, 20);
    assert.equal(s.city.saved.labyrinth!.totalGp, 1010000);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 160);
    s.city.state.player.grades = 80;
    Object.assign(s.city.saved.labyrinth!.abyss!, { record: 30 });
    const started = s.send(8528, { sweep_type: 2, op_type: 1, campaign_id: 8101, e_index: 30, enter_type: 1 });
    assert.equal(s.message(started, 4425).status, 1);
    assert.equal(s.message(s.send(8528, { sweep_type: 2, op_type: 2, pay_type: 2 }), 4425).status, 11);
    assert.equal(s.city.saved.labyrinth!.abyss!.cleared.length, 30);
    assert.equal(s.city.saved.labyrinth!.abyss!.claimed!.length, 6);
    assert.equal(s.city.saved.labyrinth!.abyss!.totalGp, 15300000);
    assert.equal(s.city.saved.labyrinth!.abyss!.completed, true);
    assert.equal(s.city.saved.map, 1);
    assert.equal(s.city.saved.labyrinth!.record, 100);
  } finally { s.cleanup(); }
});

test("bot com mochila cheia conserva baú, XP e moeda; liberar espaço permite concluir sem duplicar", async () => {
  const s = await setup();
  try {
    botFixture(s);
    Object.assign(s.city.saved.labyrinth!, { floor: 5, entered: true });
    const model = labyrinthFloors.get(8005)!.drops.find(d => d.templateId === 2050401)!.model!;
    s.city.state.player.bag_count = 0;
    s.city.state.items = Object.fromEntries(Array.from({ length: 42 }, (_, pos) => [`1:0:${pos}`, {
      ...structuredClone(model), id: 10000000 + pos, bag_type: 1, object_id: 0, pos,
      count: 99999, exist: 1,
    }]));
    s.city.persist();
    const xp = s.city.state.player.totalGp;
    assert.equal(s.message(startMazeBot(s), 4425).status, 1);
    s.advance(6000);
    assert.ok(s.city.tick().some(p => opcode(p) === 83));
    assert.equal(s.city.saved.labyrinth!.bot!.completed, 0);
    assert.deepEqual(s.city.saved.labyrinth!.claimed, []);
    assert.equal(s.city.state.player.totalGp, xp);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 0);
    delete s.city.state.items["1:0:0"];
    s.city.persist(); s.advance(6000);
    assert.equal(s.message(s.city.tick(), 4425).status, 11);
    assert.equal(currencyBalance(s.city.state, "labyrinthCoin"), 5);
    assert.equal(s.city.state.player.totalGp - xp, 1000);
    assert.equal(s.city.state.items["1:0:0"]!.count, 2);
  } finally { s.cleanup(); }
});

test("bot não reserva ouro ou gasta rodada se faltar chave para entrada dupla", async () => {
  const s = await setup();
  try {
    botFixture(s);
    for (const [key, item] of Object.entries(s.city.state.items))
      if (item.template_id === 208008) delete s.city.state.items[key];
    s.city.persist();
    const result = s.send(8528, { sweep_type: 2, op_type: 1, campaign_id: 8001, e_index: 5, enter_type: 2 });
    assert.ok(result.some(p => opcode(p) === 83));
    assert.equal(currencyBalance(s.city.state, "gold"), 1000000);
    assert.equal(s.city.saved.labyrinth!.entered, false);
    assert.equal(s.city.saved.labyrinth!.lastEntryDay, undefined);
    assert.equal(s.city.saved.labyrinth!.bot, undefined);
  } finally { s.cleanup(); }
});
