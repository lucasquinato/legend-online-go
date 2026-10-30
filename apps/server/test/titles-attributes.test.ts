import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { AttributeCalculator, calculateAttributes, type AttributeState } from "../src/attributes.js";
import { projectRoot } from "../src/config.js";
import { CityWorld } from "../src/city-world.js";
import { Store } from "../src/store.js";
import { titleCatalog, TitleCatalog, titleAttributeSources, synchronizeTitleAttributes, initialTitleSave, recordTitleAcquisition, recordTitleAttributeUnlock, revokeTitle, selectTitle, type TitleCatalogInput, type TitleSave } from "../src/features/titles/index.js";

const context = (job: 1 | 2 | 3 = 3, now = 2000, level = 45) => ({ job, now, level });
function owned(ids: number[], unlock = true): TitleSave {
  const save = initialTitleSave();
  for (const id of ids) recordTitleAcquisition(save, titleCatalog, id, 1000, null, { system: "test", reference: `grant:${id}` });
  if (unlock) recordTitleAttributeUnlock(save, 1000, { system: "test", reference: "quest:936" });
  return save;
}

test("atributos de títulos: soma todos os possuídos e seleção visual não altera o bônus", () => {
  const save = owned([26, 27, 85, 431]);
  const sources = titleAttributeSources(save, titleCatalog, context());
  assert.deepEqual(Object.keys(sources).sort(), ["titles:26", "titles:27", "titles:85"]);
  assert.deepEqual(sources["titles:85"]!.values, { total_phy_attack: 1200, total_magic_attack: 1200, total_live: 6000 });
  const panel = calculateAttributes({ version: 1, sources });
  assert.equal(panel.total_magic_attack, 1240); assert.equal(panel.total_force_hit, 95);
  assert.equal(panel.total_live, 6000);
  selectTitle(save, titleCatalog, 26, 3, 2000);
  assert.deepEqual(titleAttributeSources(save, titleCatalog, context()), sources);
  selectTitle(save, titleCatalog, 85, 3, 2000);
  assert.deepEqual(titleAttributeSources(save, titleCatalog, context()), sources);
  sources["titles:85"]!.values.total_live = 1;
  assert.equal(titleAttributeSources(save, titleCatalog, context())["titles:85"]!.values.total_live, 6000);
});

test("atributos de títulos: desbloqueio, classe e datas filtram fontes sem remover histórico", () => {
  const locked = owned([26], false);
  assert.deepEqual(titleAttributeSources(locked, titleCatalog, context()), {});
  recordTitleAttributeUnlock(locked, 3000, { system: "test", reference: "later" });
  assert.deepEqual(titleAttributeSources(locked, titleCatalog, context()), {});
  assert.ok(titleAttributeSources(locked, titleCatalog, context(3, 3000))["titles:26"]);
  assert.deepEqual(titleAttributeSources(locked, titleCatalog, context(3, 3000, 13)), {});
  const save = owned([3, 4, 5, 26, 27, 85]);
  save.entries[26]!.ownership!.expiresAt = 2000;
  revokeTitle(save, 27, 1500, { system: "test", reference: "revoked" });
  save.entries[85]!.ownership!.firstObtainedAt = 3000; save.entries[85]!.ownership!.obtainedAt = 3000;
  const before = structuredClone(save);
  for (const [job, id] of [[1, 4], [2, 3], [3, 5]] as const)
    assert.deepEqual(Object.keys(titleAttributeSources(save, titleCatalog, context(job))), [`titles:${id}`]);
  assert.deepEqual(save, before);
  assert.ok(titleAttributeSources(save, titleCatalog, context(3, 1999))["titles:26"]);
  assert.throws(() => titleAttributeSources(save, titleCatalog, context(3, NaN)), /inválido/);
});

test("atributos de títulos: sincronização substitui fontes antigas sem acumular ou afetar outros sistemas", () => {
  const save = owned([26]), state: AttributeState = { version: 1, sources: {
    other: { kind: "other", evidence: "local-balance", values: { total_magic_attack: 100 } },
    "titles:99999": { kind: "permanent", evidence: "recovered-table", values: { total_magic_attack: 999999 } },
  } };
  const other = state.sources.other;
  synchronizeTitleAttributes(state.sources, save, titleCatalog, context());
  assert.equal(calculateAttributes(state).total_magic_attack, 140);
  assert.equal(state.sources["titles:99999"], undefined);
  synchronizeTitleAttributes(state.sources, save, titleCatalog, context());
  assert.equal(calculateAttributes(state).total_magic_attack, 140);
  revokeTitle(save, 26, 2000, { system: "test", reference: "removed" });
  synchronizeTitleAttributes(state.sources, save, titleCatalog, context());
  assert.equal(calculateAttributes(state).total_magic_attack, 100);
  assert.equal(state.sources.other, other);
});

test("atributos de títulos: catálogo completo contribui por posse válida, nunca apenas por progresso", () => {
  const save = owned(titleCatalog.all.map(t => t.id));
  for (const job of [1, 2, 3] as const) {
    const sources = titleAttributeSources(save, titleCatalog, context(job));
    const expected = titleCatalog.list({ job }).filter(t => t.effects.some(e => Object.keys(e.values).length));
    assert.equal(Object.keys(sources).length, expected.length);
    for (const title of expected) {
      const values: Record<string, number> = {};
      for (const effect of title.effects) for (const [key, n] of Object.entries(effect.values)) values[key] = (values[key] ?? 0) + n;
      assert.deepEqual(sources[`titles:${title.id}`]!.values, values);
    }
  }
  const progressOnly = owned([26]); delete progressOnly.entries[26]!.ownership;
  progressOnly.entries[26]!.acquisitionKeys = [];
  progressOnly.entries[26]!.progress = { conditionType: 8, requirementKey: "labyrinth.floor", status: "completed", values: { current: 100 }, wireValue: "100", updatedAt: 1000, origin: { system: "test", reference: "progress" } };
  assert.deepEqual(titleAttributeSources(progressOnly, titleCatalog, context()), {});
});

test("atributos de títulos: mesma propriedade em títulos diferentes conta por título; primários e percentuais ficam na central", () => {
  const input = JSON.parse(readFileSync(join(projectRoot, "reference/titles/content.json"), "utf8")) as TitleCatalogInput;
  const a = input.titles.find(t => Number(t.TemplateId) === 26)!, b = input.titles.find(t => Number(t.TemplateId) === 85)!;
  const primary = input.properties.find(p => Number(p.TemplateId) === titleCatalog.get(26)!.skillIds[0])!;
  const percentage = input.properties.find(p => Number(p.TemplateId) === titleCatalog.get(85)!.skillIds[0])!;
  for (const row of [primary, percentage]) for (const key of Object.keys(row)) if (!["TemplateId", "AddType"].includes(key)) (row as any)[key] = "0";
  (primary as any).Intellect = "10";
  (percentage as any).AddType = "0"; (percentage as any).MagicAttack = "25";
  const catalog = new TitleCatalog({ ...input, titles: [a, b, { ...a, TemplateId: "902626" }] });
  const save = initialTitleSave();
  for (const id of [26, 85, 902626]) recordTitleAcquisition(save, catalog, id, 1000, null, { system: "test", reference: `grant:${id}` });
  recordTitleAttributeUnlock(save, 1000, { system: "test", reference: "quest" });
  const sources = titleAttributeSources(save, catalog, context());
  assert.deepEqual(sources["titles:26"]!.values, { total_intellect: 10 });
  assert.deepEqual(sources["titles:85"]!.percentages, { total_magic_attack: 25 });
  assert.equal(sources["titles:26"]!.values.total_magic_attack, undefined);
  const result = AttributeCalculator.calculate({ version: 1, sources: { ...sources,
    natural: { kind: "natural", evidence: "local-balance", values: { total_magic_attack: 100 } },
    passive: { kind: "permanent", evidence: "recovered-table", values: {}, percentages: { total_magic_attack: 15 } },
  } });
  assert.equal(result.total_intellect, 20);
  assert.equal(result.total_magic_attack, Math.floor((100 + 20 * 4) * 1.4));
  assert.equal(result.total_magic_defence, 20);
});

function fixture(icon = 6) {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "titles-attributes-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); let now = 1900000000000;
  store.initTutorialProfile(1921);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,sex=1,nickname='TitleStats',process=19500 WHERE user_id=1921").run(icon);
  const city = new CityWorld(store, 1921, () => now);
  return { store, city, now: () => now, advance: () => now += 5000, read: () => JSON.parse(String(store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1921").get()!.state)), cleanup() {
    store.close(); const target = resolve(dir); assert.ok(target.startsWith(resolve(base) + sep)); rmSync(target, { recursive: true, force: true });
  } };
}
function claimUnlock(city: CityWorld) { city.state.quests[936] = { template_id: 936, is_accept: 0, is_complete: 1 }; }

test("atributos de títulos: CityWorld aplica obtenção e desbloqueio na mesma gravação, persiste painel e usa-o na batalha", () => {
  for (const icon of [4, 5, 6]) {
    const f = fixture(icon);
    try {
      const city = f.city;
      city.state.player.grades = 45; city.persist();
      assert.equal(city.saved.titles!.attributeAccess.unlocked, false);
      assert.deepEqual(Object.keys(city.saved.attributes!.sources).filter(k => k.startsWith("titles:")), []);
      const before = structuredClone(city.state.hero), fashion = structuredClone(city.saved.fashion);
      claimUnlock(city); city.saved.labyrinth!.record = 100; city.persist();
      assert.equal(city.saved.titles!.attributeAccess.unlocked, true);
      assert.ok(city.saved.attributes!.sources["titles:26"]);
      const without = structuredClone(city.saved.attributes!); delete without.sources["titles:26"];
      assert.equal(calculateAttributes(without).total_magic_attack, before.total_magic_attack);
      assert.equal(calculateAttributes(without).total_phy_attack, before.total_phy_attack);
      assert.deepEqual(city.state.hero.total_magic_attack, calculateAttributes(city.saved.attributes!).total_magic_attack);
      assert.ok(city.state.hero.total_magic_attack > before.total_magic_attack);
      assert.ok(city.state.hero.total_phy_attack > before.total_phy_attack);
      assert.equal(city.state.hero.total_live, before.total_live);
      assert.deepEqual(city.saved.fashion, fashion);
      assert.equal(city.state.player.fighting_capacity, city.state.hero.fighting_capacity);
      assert.equal(city.state.army.simple_hero_info.total_magic_attack, city.state.hero.total_magic_attack);
      assert.deepEqual(f.read().state.hero, city.state.hero);
      f.advance(); const loaded = new CityWorld(f.store, 1921, f.now);
      assert.deepEqual(loaded.saved.attributes, city.saved.attributes);
      assert.deepEqual(loaded.state.hero, city.state.hero);
      loaded.startBattle(0);
      const battle = loaded.saved.battle!;
      assert.equal(battle.stats![battle.hero]!.attack, loaded.state.hero.total_phy_attack);
      assert.equal(battle.stats![battle.hero]!.magicAttack, loaded.state.hero.total_magic_attack);
    } finally { f.cleanup(); }
  }
});

test("atributos de títulos: remoção por validade e rollback SQLite restauram fontes e projeções", () => {
  const f = fixture();
  try {
    const city = f.city; city.state.player.grades = 45; claimUnlock(city); city.persist();
    const before = structuredClone({ titles: city.saved.titles, attributes: city.saved.attributes, hero: city.state.hero, army: city.state.army, power: city.state.player.fighting_capacity });
    city.saved.labyrinth!.record = 100;
    f.store.db.exec("CREATE TRIGGER fail_title_stats BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'forced attribute rollback'); END");
    assert.throws(() => city.persist(), /forced attribute rollback/);
    assert.deepEqual(city.saved.titles, before.titles); assert.deepEqual(city.saved.attributes, before.attributes);
    assert.deepEqual(city.state.hero, before.hero); assert.deepEqual(city.state.army, before.army);
    assert.equal(city.state.player.fighting_capacity, before.power);
    assert.deepEqual(f.read().attributes, before.attributes);
    f.store.db.exec("DROP TRIGGER fail_title_stats"); city.persist();
    assert.ok(city.saved.attributes!.sources["titles:26"]);
    city.saved.titles!.entries[26]!.ownership!.expiresAt = f.now() + 1000; city.persist();
    f.advance(); city.persist();
    assert.equal(city.saved.attributes!.sources["titles:26"], undefined);
    assert.equal(city.state.hero.total_magic_attack, before.hero.total_magic_attack);
    assert.ok(city.saved.titles!.entries[26]!.ownership, "expiração não apaga o histórico");
    assert.deepEqual(f.read().state.hero, city.state.hero);
  } finally { f.cleanup(); }
});
