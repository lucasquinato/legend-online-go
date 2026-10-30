import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { projectRoot } from "../src/config.js";
import { MirrorContent, mirrorAccountProgress } from "../src/features/accounts/mirror.js";
import { itemTemplate } from "../src/inventory.js";
import { equipmentProperties } from "../src/features/equipment/content.js";
import { basicSkills, spent, skillBudget } from "../src/features/skills/index.js";

async function setup() {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const dir = mkdtempSync(join(projectRoot, ".test-data", "account-mirror-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir);
  for (const [uid, icon] of [[1901, 3], [1902, 5], [1903, 1]]) {
    await store.createUser("mirror" + uid, "test-password-123", uid); store.initTutorialProfile(uid!);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,process=36000,icon=?,sex=?,nickname=? WHERE user_id=?").run(icon!, icon! <= 3 ? 1 : 0, "Player" + uid, uid!);
    const w = new CityWorld(store, uid!); w.saved.map = 1; delete w.saved.battle; w.state.player.grades = 80; w.persist();
  }
  const source = new CityWorld(store, 1901); source.saved.fashion!.level = 200;
  source.state.items["4:1810:0"] = { id: 99001, template_id: 2019301, user_id: 1901, object_id: 1810, bag_type: 4, pos: 0,
    exist: 1, bind: 1, count: 1, strengthen_grade: 45, mould_grade: 160, join_1: 2283512, join_2: -1, join_3: -1, join_4: -1,
    random_skill_1: 1501000908, random_skill_2: 1501000302 };
  source.state.player.point = 123456; source.state.player.strategy = 987654;
  source.saved.cosmos!.instances[123] = { id: 123, templateId: 408, bag: 2, pos: 0, level: 10, xp: 0, locked: false };
  source.persist();
  const mailId = store.sendLocalItems(1901, "Mirror mail", [{ template: 208014, count: 111 }]);
  return { store, source, mailId, cleanup() { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test("conversão usa equipamentos, gemas, afixos e Cosmos físicos reais da mesma evolução", () => {
  for (const job of [1, 2]) {
    const content = new MirrorContent(job, job === 1 ? 1 : 0, true);
    assert.equal(content.item(2019301), job === 1 ? 2019101 : 2019201);
    const gem = itemTemplate(content.item(2283512))!; assert.equal(gem.Attack, "1404"); assert.equal(gem.ForceHit, "1188");
    const affix = equipmentProperties.get(content.affix(1501000908))!; assert.equal(affix.Attack, "2480");
    assert.equal(content.cosmos(408), 208); assert.equal(content.cosmos(1808), 1708);
    assert.equal(content.item(1170010), 1170010);
  }
});

test("espelhamento preserva origem, login, classe e nome; copia evolução e correio independente", async () => {
  const s = await setup(); try {
    const before = String(s.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1901").get()!.state);
    const results = mirrorAccountProgress(s.store, 1901, [1902, 1903]); assert.equal(results.length, 2);
    assert.equal(String(s.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1901").get()!.state), before);
    for (const [uid, icon, job] of [[1902, 5, 2], [1903, 1, 1]]) {
      assert.ok(await s.store.authenticate("mirror" + uid, "test-password-123"));
      const w = new CityWorld(s.store, uid!);
      assert.equal(w.state.player.grades, 80); assert.equal(w.state.player.point, 123456); assert.equal(w.state.player.strategy, 987654);
      assert.equal(w.state.hero.tempate_id, icon); assert.equal(w.state.hero.nick_name, "Player" + uid); assert.equal(w.state.army.job, job);
      assert.equal(w.saved.fashion!.level, 200); assert.equal(w.saved.cosmos!.instances[123]!.templateId, 208);
      const weapon = w.state.items["4:1810:0"]!; assert.equal(Number(itemTemplate(weapon.template_id)!.Job), job);
      assert.equal(weapon.user_id, uid); assert.equal(weapon.strengthen_grade, 45); assert.equal(weapon.mould_grade, 160);
      assert.equal(w.saved.skills!.job, job);
      for (const p of w.saved.skills!.pages) { assert.ok(p.learned.every(id => Number(basicSkills.get(id)!.MasterType) === job)); assert.ok(spent(p) <= skillBudget(80)); }
      const mail = s.store.db.prepare("SELECT mail_id,detail FROM local_mail WHERE user_id=? AND detail LIKE '%Mirror mail%'").get(uid!)!;
      assert.notEqual(mail.mail_id, s.mailId); assert.equal(JSON.parse(String(mail.detail)).receiveId, uid);
      assert.equal(JSON.parse(String(mail.detail)).annex1Count, 111);
      assert.ok(w.state.hero.total_phy_attack > w.state.hero.total_magic_attack);
      const first = w.state.hero.total_phy_attack; w.persist(); assert.equal(new CityWorld(s.store, uid!).state.hero.total_phy_attack, first);
    }
  } finally { s.cleanup(); }
});

test("erro no segundo destino desfaz o primeiro e não permite espelhar uma conta conectada", async () => {
  const s = await setup(); try {
    const before = String(s.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1902").get()!.state);
    assert.throws(() => mirrorAccountProgress(s.store, 1901, [1902, 9999]), /Destino/);
    assert.equal(String(s.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1902").get()!.state), before);
    s.store.onlineUsers.add(1901); assert.throws(() => mirrorAccountProgress(s.store, 1901, [1902]), /Desconecte/);
  } finally { s.cleanup(); }
});
