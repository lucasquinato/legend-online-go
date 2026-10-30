import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoInt } from "../src/protocol.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import { growthRows, primaries } from "../src/features/mounts/content.js";
import { questClaimed } from "../src/features/quests/index.js";

test("despertamento respeita nível 70, graus 5–8, sequência, rollback e recompensa única", async () => {
  const root = join(projectRoot, ".test-data"); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "mount-quests-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir), id = 1961;
  await store.createUser("mount_quest_test", "local-test-password", id);
  store.initTutorialProfile(id);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='MountQuest',sex=0,process=25000 WHERE user_id=?").run(id);
  let city = new CityWorld(store, id);
  const count = (template: number) => Object.values(city.state.items).filter(item => item.template_id === template).reduce((sum, item) => sum + item.count, 0);
  const claim = (quest: number) => city.handle(frame(5014, id, encodeMessage(city.scenario.outgoing[5014]!, { template_id: quest, reward_item_id: 0 })));
  const mount = (op: number, amount: number, param2 = 0) => city.handle(frame(8529, id, Buffer.concat([protoInt(1, 0), protoInt(2, 0), protoInt(3, amount), protoInt(4, param2), protoInt(5, op)])));
  const setGrowth = (total: number) => { for (const [index, name] of primaries.entries()) city.saved.mounts!.xp[name] = Math.floor(total / 4) + (index < total % 4 ? 1 : 0); };
  try {
    city.state.player.grades = 69; setGrowth(740000); city.persist(); city = new CityWorld(store, id);
    assert.equal(city.state.quests[1902], undefined, "grau alto não elimina requisito de nível do personagem");
    city.state.player.grades = 70; setGrowth(289990); city.persist(); city = new CityWorld(store, id);
    assert.equal(city.state.quests[1902]!.is_accept, 1);
    assert.equal(city.state.quests[1902]!.is_complete, 0);
    assert.equal(city.state.quests[1903], undefined);
    claim(1902); assert.equal(count(2131500), 0);
    city.state.items["1:0:0"] = { id: 998877, template_id: 208017, count: 100, bag_type: 1, object_id: 0, pos: 0, exist: 1 };
    const originalFashion = structuredClone({ fashion: city.saved.fashion, fashions: city.state.fashions });
    for (let grade = 5; grade <= 8; grade++) {
      const quest = 1897 + grade;
      setGrowth(Number(growthRows.find(row => Number(row.Grades) === grade)!.Data) - 10);
      city.persist();
      const response = mount(1, 1);
      assert.equal(city.state.quests[quest]!.is_complete, 1);
      const update = response.find(packet => Buffer.from(packet.frame, "base64").readUInt16BE(6) === 112)!;
      assert.ok(update, "adestramento envia atualização do quadro");
      assert.ok(decodeMessage(city.scenario.incoming[112]!, Buffer.from(update.frame, "base64").subarray(20)).quest.some((q: any) => q.template_id === quest && q.is_complete));
      if (grade === 5) {
        const before = structuredClone({ quests: city.state.quests, items: city.state.items });
        store.db.exec("CREATE TRIGGER fail_awaken BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail awaken save'); END");
        assert.throws(() => claim(quest), /fail awaken save/);
        assert.deepEqual({ quests: city.state.quests, items: city.state.items }, before);
        store.db.exec("DROP TRIGGER fail_awaken");
      }
      claim(quest); assert.ok(questClaimed(city.state, quest));
      assert.equal(count(2131500), grade - 4);
      claim(quest); assert.equal(count(2131500), grade - 4, "resgate repetido não duplica item");
      if (grade < 8) { assert.equal(city.state.quests[quest + 1]!.is_accept, 1); assert.equal(city.state.quests[quest + 1]!.is_complete, 0); }
      city = new CityWorld(store, id); assert.ok(questClaimed(city.state, quest));
    }
    for (const king of [9001, 9002, 9003, 9004]) mount(4, king);
    assert.equal(count(2131500), 0);
    for (const king of [9001, 9002, 9003, 9004]) assert.ok(city.saved.mounts!.owned[king]);
    mount(7, 9001, 10);
    assert.deepEqual(city.saved.mounts!.kings[9001], { level: 1, xp: 0 });
    city = new CityWorld(store, id);
    assert.deepEqual(city.saved.mounts!.kings[9001], { level: 1, xp: 0 });
    assert.deepEqual({ fashion: city.saved.fashion, fashions: city.state.fashions }, originalFashion);
    assert.equal(city.state.hero.tempate_id, 3);
  } finally { store.close(); assert.ok(dir.startsWith(root)); rmSync(dir, { recursive: true, force: true }); }
});
