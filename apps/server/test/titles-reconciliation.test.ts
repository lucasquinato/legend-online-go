import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { titleCatalog, initialTitleSave, TitleReconciler, localTitleFactReader, recordTitleAcquisition, revokeTitle, validateTitleSave, type TitleReconciliationContext, type TitleLocalSnapshot } from "../src/features/titles/index.js";

function context(snapshot: TitleLocalSnapshot, now = 1000, reason: "login" | "gameplay" = "login"): TitleReconciliationContext {
  return { subjectId: 19, job: 3, now, reason, attributeUnlock: { level: 80, questClaimed: false }, readFact: localTitleFactReader(snapshot, 19, now) };
}

test("concessão: login reconhece conquistas comprovadas e separa posse, visual e atributos", () => {
  const reconciler = new TitleReconciler(titleCatalog), original = initialTitleSave();
  const result = reconciler.prepare(original, context({ fashion: { level: 100 }, labyrinth: { record: 100, abyss: { record: 30 } } }));
  assert.deepEqual(result.grantedIds.slice().sort((a, b) => a - b), [26, 27, 85]);
  assert.deepEqual(original, initialTitleSave(), "preparação não modifica o save antes da transação");
  for (const id of [26, 27, 85]) {
    assert.equal(result.state.entries[id]!.progress!.status, "completed");
    assert.equal(result.state.entries[id]!.ownership!.expiresAt, null);
    assert.equal(result.state.entries[id]!.acquisitionKeys.length, 1);
  }
  assert.equal(result.state.entries[86]!.progress!.status, "tracking");
  assert.equal(result.state.entries[66], undefined, "não inventa histórico de fazenda");
  assert.equal(result.state.selectedId, 0);
  assert.equal(result.state.attributeAccess.unlocked, false);
  assert.equal(result.state.pendingAcquisitions!.length, 3);
  assert.ok(result.state.pendingAcquisitions!.every(n => n.retroactive));
  validateTitleSave(JSON.parse(JSON.stringify(result.state)));
});

test("concessão: cache, reconexão e repetição não duplicam nem reescrevem progresso", () => {
  const reconciler = new TitleReconciler(titleCatalog), facts = { fashion: { level: 100 } };
  const first = reconciler.prepare(initialTitleSave(), context(facts)); reconciler.accept(first);
  const cached = reconciler.prepare(first.state, context(facts, 2000));
  assert.equal(cached.state, first.state); assert.equal(cached.changed, false);
  const reconnected = new TitleReconciler(titleCatalog).prepare(JSON.parse(JSON.stringify(first.state)), context(facts, 3000));
  assert.equal(reconnected.changed, false);
  assert.deepEqual(reconnected.grantedIds, []);
  assert.equal(reconnected.state.entries[85]!.ownership!.obtainedAt, 1000);
  assert.equal(reconnected.state.entries[86]!.progress!.updatedAt, 1000);
  assert.equal(reconnected.state.pendingAcquisitions!.length, 1);
  const advanced = reconciler.prepare(first.state, context({ fashion: { level: 200 } }, 4000, "gameplay"));
  assert.deepEqual(advanced.grantedIds.slice().sort((a, b) => a - b), [86, 87]);
  assert.ok(advanced.state.pendingAcquisitions!.filter(n => n.obtainedAt === 4000).every(n => !n.retroactive));
  assert.equal(first.state.entries[86]!.ownership, undefined);
});

test("concessão: coleções exigem todas as peças ativas e a montaria exata", () => {
  const set = titleCatalog.get(1015)!, ids = set.requirement.groups[0]!.map(Number);
  const fashions = Object.fromEntries(ids.map(id => [id, { temp_id: id, is_switch: 1 }]));
  const mountId = Number(titleCatalog.get(1008)!.requirement.groups[0]![0]);
  const mounts = { owned: { [mountId]: { id: mountId, activatedAt: 10, expiresAt: null, origin: "test" } } } as any;
  const reconciler = new TitleReconciler(titleCatalog);
  const partial = reconciler.prepare(initialTitleSave(), context({ mounts, state: { fashions: { ...fashions, [ids[0]!]: { temp_id: ids[0]!, is_switch: 0 } } } }));
  assert.ok(partial.grantedIds.includes(1008)); assert.ok(!partial.grantedIds.includes(1015));
  const full = reconciler.prepare(partial.state, context({ mounts, state: { fashions } }, 2000, "gameplay"));
  assert.ok(full.grantedIds.includes(1015)); assert.ok(!full.grantedIds.includes(1008));
  assert.equal(full.state.entries[1015]!.ownership!.origin.system, "titles.conditions");
});

test("concessão: integração ou política ausente nunca concede por suposição", () => {
  const none = new TitleReconciler(titleCatalog).prepare(initialTitleSave(), context({}));
  assert.equal(none.changed, false); assert.deepEqual(none.grantedIds, []);
  const noPolicy = new TitleReconciler(titleCatalog, undefined, []).prepare(initialTitleSave(), context({ fashion: { level: 200 } }));
  assert.deepEqual(noPolicy.grantedIds, []);
  assert.deepEqual(noPolicy.deferredGrantIds.slice().sort((a, b) => a - b), [85, 86, 87]);
  assert.equal(noPolicy.state.entries[85]!.progress!.status, "completed");
  assert.equal(noPolicy.state.entries[85]!.ownership, undefined);
  assert.equal(noPolicy.state.pendingAcquisitions, undefined);
  const stale = context({ fashion: { level: 200 } }); stale.now++;
  assert.equal(new TitleReconciler(titleCatalog).prepare(initialTitleSave(), stale).changed, false);
});

test("concessão: cache percebe provedor novo e alterações externas sem apagar progresso na ausência de fatos", () => {
  const reconciler = new TitleReconciler(titleCatalog);
  const empty = reconciler.prepare(initialTitleSave(), context({})); reconciler.accept(empty);
  const available = reconciler.prepare(empty.state, context({ fashion: { level: 100 } }, 2000));
  assert.deepEqual(available.grantedIds, [85]); reconciler.accept(available);
  const missing = reconciler.prepare(available.state, context({}, 3000));
  assert.equal(missing.changed, false); assert.equal(missing.state.entries[86]!.progress!.values.current, 100);
  available.state.entries[85]!.progress!.values.current = 99;
  const repaired = reconciler.prepare(available.state, context({ fashion: { level: 100 } }, 4000));
  assert.equal(repaired.changed, true); assert.equal(repaired.state.entries[85]!.progress!.values.current, 100);
  assert.deepEqual(repaired.grantedIds, []); assert.equal(repaired.state.pendingAcquisitions!.length, 1);
});

test("concessão: histórico não é revogado nem readquirido automaticamente", () => {
  const reconciler = new TitleReconciler(titleCatalog), first = reconciler.prepare(initialTitleSave(), context({ labyrinth: { record: 100 } }));
  const lostFact = reconciler.prepare(first.state, context({ labyrinth: { record: 0 } }, 2000));
  assert.equal(lostFact.changed, false); assert.equal(lostFact.state.entries[26]!.progress!.status, "completed");
  const revoked = structuredClone(first.state);
  revokeTitle(revoked, 26, 2000, { system: "test", reference: "manual" });
  const retry = reconciler.prepare(revoked, context({ labyrinth: { record: 100 } }, 3000));
  assert.deepEqual(retry.grantedIds, []); assert.equal(retry.state.entries[26]!.ownership!.revokedAt, 2000);
  const temporary = initialTitleSave();
  recordTitleAcquisition(temporary, titleCatalog, 26, 100, 200, { system: "test", reference: "temporary" });
  const expired = reconciler.prepare(temporary, context({ labyrinth: { record: 100 } }, 3000));
  assert.deepEqual(expired.grantedIds, []); assert.equal(expired.state.entries[26]!.ownership!.expiresAt, 200);
});

test("concessão: desbloqueio exige nível e missão resgatada, não apenas títulos possuídos", () => {
  const reconciler = new TitleReconciler(titleCatalog), low = context({});
  low.attributeUnlock = { level: 13, questClaimed: true };
  assert.equal(reconciler.prepare(initialTitleSave(), low).changed, false);
  const missingQuest = context({}); missingQuest.attributeUnlock.level = 45;
  assert.equal(reconciler.prepare(initialTitleSave(), missingQuest).changed, false);
  const complete = context({}); complete.attributeUnlock = { level: 45, questClaimed: true };
  const result = reconciler.prepare(initialTitleSave(), complete);
  assert.equal(result.state.attributeAccess.unlocked, true);
  assert.equal(result.state.attributeAccess.origin!.reference, "claimed:936");
  assert.deepEqual(result.state.entries, {});
  assert.equal(reconciler.prepare(result.state, { ...complete, now: 2000 }).changed, false);
});

function fixture() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "titles-reconcile-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); let now = 1900000000000;
  for (const id of [1911, 1912]) {
    store.initTutorialProfile(id);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=6,sex=0,nickname=?,process=19500 WHERE user_id=?").run(`Titles${id}`, id);
  }
  return { store, now: () => now, advance: () => now += 5000, read: (id = 1911) => JSON.parse(String(store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(id)!.state)), cleanup() {
    store.close(); const target = resolve(dir); assert.ok(target.startsWith(resolve(base) + sep)); rmSync(target, { recursive: true, force: true });
  } };
}

test("concessão: CityWorld reconhece passado ao carregar e salva novas conquistas só na conta correta", () => {
  const f = fixture();
  try {
    const city = new CityWorld(f.store, 1911, f.now), other = new CityWorld(f.store, 1912, f.now);
    const raw = structuredClone(city.saved); delete raw.titles; raw.labyrinth!.record = 100;
    f.store.db.prepare("UPDATE city_worlds SET state=? WHERE user_id=1911").run(JSON.stringify(raw));
    const logged = new CityWorld(f.store, 1911, f.now);
    assert.ok(logged.saved.titles!.entries[26]!.ownership);
    assert.equal(logged.saved.titles!.pendingAcquisitions![0]!.retroactive, true);
    assert.deepEqual(other.saved.titles!.entries, {});
    const visualBefore = { id: logged.state.player.appell_id, flag: logged.state.player.applle_property_Open };
    f.advance(); logged.saved.fashion!.level = 100; logged.persist();
    assert.ok(logged.saved.titles!.entries[85]!.ownership);
    assert.equal(logged.saved.titles!.pendingAcquisitions!.find(n => n.titleId === 85)!.retroactive, false);
    assert.deepEqual({ id: logged.state.player.appell_id, flag: logged.state.player.applle_property_Open }, visualBefore);
    assert.deepEqual(f.read().titles, logged.saved.titles);
    f.advance();
    assert.deepEqual(new CityWorld(f.store, 1911, f.now).saved.titles, logged.saved.titles);
    assert.deepEqual(new CityWorld(f.store, 1912, f.now).saved.titles!.entries, {});
  } finally { f.cleanup(); }
});

test("concessão: falha SQLite não perde concessão; retry e rollback externo não duplicam recibos", () => {
  const f = fixture();
  try {
    const city = new CityWorld(f.store, 1911, f.now), before = structuredClone(city.saved.titles);
    city.saved.labyrinth!.record = 100;
    f.store.db.exec("CREATE TRIGGER fail_titles BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'forced title save failure'); END");
    assert.throws(() => city.persist(), /forced title save failure/);
    assert.deepEqual(city.saved.titles, before); assert.deepEqual(f.read().titles, before);
    f.store.db.exec("DROP TRIGGER fail_titles"); city.persist();
    assert.equal(city.saved.titles!.entries[26]!.acquisitionKeys.length, 1);
    assert.equal(city.saved.titles!.pendingAcquisitions!.length, 1);
    const committed = structuredClone(city.saved.titles);
    assert.throws(() => (city as any).atomicMutation(() => {
      city.saved.fashion!.level = 100; city.persist(); throw new Error("outer rollback");
    }), /outer rollback/);
    assert.deepEqual(city.saved.titles, committed); assert.deepEqual(f.read().titles, committed);
    city.saved.fashion!.level = 100; city.persist(); city.persist();
    assert.equal(city.saved.titles!.entries[85]!.acquisitionKeys.length, 1);
    assert.equal(city.saved.titles!.pendingAcquisitions!.length, 2);
    assert.deepEqual(f.read().titles, city.saved.titles);
  } finally { f.cleanup(); }
});
