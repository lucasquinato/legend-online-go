import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame } from "../src/protocol.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import { titleCatalog, TitleCatalog, initialTitleSave, recordTitleAcquisition, selectTitle, titleOwned, expireTitles, nextTitleDeadline, TitleMaintenance, titleSchemas, validateTitleSave, type TitleCatalogInput, type TitleMaintenanceSnapshot, type TitleLifecycleContext } from "../src/features/titles/index.js";

const context = (now = 2000, reason: "login" | "gameplay" = "gameplay"): TitleLifecycleContext => ({ subjectId: 19, job: 3, now, reason });
const snapshot = (revision: number, awards: TitleMaintenanceSnapshot["awards"] = [{ titleId: 1, awardKey: "season:1", expiresAt: 5000 }], publishedAt = 1500): TitleMaintenanceSnapshot => ({ subjectId: 19, policyKey: "ranking.combat-power", revision, publishedAt, complete: true, awards });

test("ciclo de títulos: prazo absoluto expira uma vez, limpa seleção e conserva recibos e primeira obtenção", () => {
  const save = initialTitleSave();
  recordTitleAcquisition(save, titleCatalog, 26, 1000, 2000, { system: "test", reference: "temporary" });
  recordTitleAcquisition(save, titleCatalog, 85, 1000, null, { system: "test", reference: "permanent" });
  selectTitle(save, titleCatalog, 26, 3, 1000);
  assert.equal(nextTitleDeadline(save), 2000);
  assert.equal(expireTitles(save, titleCatalog, context(1999)).state, save);
  const result = expireTitles(save, titleCatalog, context(2000));
  assert.deepEqual(result.expiredIds, [26]); assert.equal(result.state.selectedId, 0);
  assert.equal(result.state.entries[26]!.ownership!.revokedAt, 2000);
  assert.equal(result.state.entries[26]!.ownership!.firstObtainedAt, 1000);
  assert.deepEqual(result.state.entries[26]!.acquisitionKeys, save.entries[26]!.acquisitionKeys);
  assert.equal(save.entries[26]!.ownership!.revokedAt, null, "copy-on-write");
  assert.equal(nextTitleDeadline(result.state), Infinity);
  assert.equal(expireTitles(result.state, titleCatalog, context(3000)).changed, false);
  assert.equal(result.state.pendingRemovals!.length, 1);
  assert.equal(titleOwned(result.state, titleCatalog, 85, 3000), true);
  assert.equal(expireTitles(save, titleCatalog, context(9000, "login")).state.pendingRemovals![0]!.retroactive, true);
  assert.equal(expireTitles(save, titleCatalog, context(9000, "login")).state.entries[26]!.ownership!.revokedAt, 2000);
  validateTitleSave(JSON.parse(JSON.stringify(result.state)));
});

test("ciclo de títulos: perda da classe limpa apenas a seleção, sem revogar conquista histórica", () => {
  const save = initialTitleSave();
  recordTitleAcquisition(save, titleCatalog, 5, 1000, null, { system: "test", reference: "class" }); selectTitle(save, titleCatalog, 5, 3, 1000);
  const result = expireTitles(save, titleCatalog, { ...context(), job: 1 });
  assert.equal(result.state.selectedId, 0); assert.equal(result.state.entries[5]!.ownership!.revokedAt, null);
  assert.deepEqual(result.expiredIds, []); assert.equal(result.state.pendingRemovals, undefined);
});

test("ciclo de títulos: ranking completo concede e revoga por revisão, sem confundir Time=0 com permanência", () => {
  const maintenance = new TitleMaintenance(titleCatalog), save = initialTitleSave();
  const first = maintenance.prepare(save, snapshot(1), context());
  assert.equal(first.status, "applied"); assert.deepEqual(first.grantedIds, [1]);
  assert.deepEqual(save.entries, {});
  const lost = maintenance.prepare(first.state, snapshot(2, [], 2100), context(2200));
  assert.deepEqual(lost.revokedIds, [1]); assert.equal(lost.state.entries[1]!.ownership!.revokedAt, 2200);
  assert.equal(lost.state.pendingRemovals![0]!.reason, "condition-lost");
  const sameAward = maintenance.prepare(lost.state, snapshot(3, undefined, 2300), context(2400));
  assert.deepEqual(sameAward.grantedIds, []); assert.equal(titleOwned(sameAward.state, titleCatalog, 1, 2400), false);
  const returned = maintenance.prepare(sameAward.state, snapshot(4, [{ titleId: 1, awardKey: "season:2", expiresAt: 6000 }], 2500), context(2600));
  assert.deepEqual(returned.grantedIds, [1]); assert.equal(returned.state.entries[1]!.ownership!.firstObtainedAt, 2000);
  assert.equal(returned.state.entries[1]!.ownership!.obtainedAt, 2600);
  assert.equal(returned.state.entries[1]!.acquisitionKeys.length, 2);
  validateTitleSave(JSON.parse(JSON.stringify(returned.state)));
});

test("ciclo de títulos: parcial, ausente, antigo e duplicado não retiram nem renovam posse", () => {
  const maintenance = new TitleMaintenance(titleCatalog), first = maintenance.prepare(initialTitleSave(), snapshot(2), context());
  const duplicate = maintenance.prepare(first.state, { ...snapshot(2), awards: [{ expiresAt: 5000, awardKey: "season:1", titleId: 1 }] }, context(2100));
  assert.equal(duplicate.status, "duplicate"); assert.equal(duplicate.state, first.state);
  assert.equal(maintenance.prepare(first.state, snapshot(1, []), context(2100)).status, "stale");
  const partial = maintenance.prepare(first.state, { ...snapshot(3, []), complete: false }, context(2100));
  assert.equal(partial.status, "pending-integration"); assert.equal(partial.changed, false);
  const unknown = maintenance.prepare(first.state, { ...snapshot(3, []), policyKey: "future.unimplemented" }, context(2100));
  assert.equal(unknown.status, "pending-integration"); assert.equal(unknown.changed, false);
  assert.equal(maintenance.prepare(first.state, snapshot(3, [], 1400), context(2100)).status, "stale");
  assert.throws(() => maintenance.prepare(first.state, snapshot(2, []), context(2100)), /reutilizada/);
  assert.throws(() => maintenance.prepare(first.state, { ...snapshot(3), subjectId: 20 }, context(2100)), /inválido/);
  assert.equal(first.state.entries[1]!.ownership!.expiresAt, 5000);
});

test("ciclo de títulos: renovar exige nova referência e consulta ou replay nunca estendem prazo", () => {
  const maintenance = new TitleMaintenance(titleCatalog), first = maintenance.prepare(initialTitleSave(), snapshot(1), context());
  assert.throws(() => maintenance.prepare(first.state, snapshot(2, [{ titleId: 1, awardKey: "season:1", expiresAt: 9000 }]), context(2100)), /nova referência/);
  const renewal = maintenance.prepare(first.state, snapshot(2, [{ titleId: 1, awardKey: "renewal:1", expiresAt: 9000 }], 2200), context(2300));
  assert.equal(renewal.state.entries[1]!.ownership!.expiresAt, 9000);
  assert.equal(renewal.state.entries[1]!.ownership!.firstObtainedAt, 2000);
  assert.equal(renewal.state.entries[1]!.acquisitionKeys.length, 2);
  const replay = maintenance.prepare(renewal.state, snapshot(3, undefined, 2400), context(2500));
  assert.deepEqual(replay.grantedIds, []); assert.equal(replay.state.entries[1]!.ownership!.expiresAt, 9000);
  const expired = maintenance.prepare(first.state, snapshot(1), context(5000));
  assert.equal(expired.status, "duplicate"); assert.deepEqual(expired.expiredIds, [1]);
  assert.equal(expired.state.entries[1]!.ownership!.revokedAt, 5000);
});

test("ciclo de títulos: escopo e validade explícita impedem premiações erradas; perdas não atingem títulos de outra origem", () => {
  const maintenance = new TitleMaintenance(titleCatalog), save = initialTitleSave();
  recordTitleAcquisition(save, titleCatalog, 26, 1000, null, { system: "test", reference: "historical" });
  const first = maintenance.prepare(save, snapshot(1), context());
  recordTitleAcquisition(first.state, titleCatalog, 1, 2100, null, { system: "admin", reference: "separate" });
  const lost = maintenance.prepare(first.state, snapshot(2, [], 2200), context(2300));
  assert.deepEqual(lost.revokedIds, []); assert.equal(titleOwned(lost.state, titleCatalog, 26, 2300), true);
  assert.equal(titleOwned(lost.state, titleCatalog, 1, 2300), true);
  for (const awards of [[{ titleId: 26, awardKey: "wrong", expiresAt: null }], [{ titleId: 1, awardKey: "invalid", expiresAt: 1500 }], [...snapshot(1).awards, ...snapshot(1).awards]])
    assert.throws(() => maintenance.prepare(save, snapshot(1, awards), context()), /incompatível/);
  assert.throws(() => new TitleMaintenance(titleCatalog, [{ key: "fashion.level", conditionType: 102, allows: () => true }]), /permanentes/);
  const overdue = maintenance.prepare(initialTitleSave(), snapshot(1, [{ titleId: 1, awardKey: "already-expired", expiresAt: 1800 }]), context());
  assert.deepEqual(overdue.grantedIds, []); assert.deepEqual(overdue.state.entries, {});
});

test("ciclo de títulos: tabela temporal não vira permanente, recibos de manutenção são validados e renovação simultânea não duplica aviso", () => {
  const maintenance = new TitleMaintenance(titleCatalog), first = maintenance.prepare(initialTitleSave(), snapshot(1), context());
  const input = JSON.parse(readFileSync(join(projectRoot, "reference/titles/content.json"), "utf8")) as TitleCatalogInput;
  const catalog = new TitleCatalog({ ...input, titles: [{ ...input.titles.find(t => Number(t.TemplateId) === 1)!, Time: "3" }] });
  const timed = new TitleMaintenance(catalog), data = snapshot(1, [{ titleId: 1, awardKey: "timed", expiresAt: null }]);
  assert.throws(() => timed.prepare(initialTitleSave(), data, context()), /validade absoluta/);
  assert.deepEqual(timed.prepare(initialTitleSave(), { ...data, awards: [{ ...data.awards[0]!, expiresAt: 5000 }] }, context()).grantedIds, [1]);
  const renewed = maintenance.prepare(first.state, snapshot(2, [{ titleId: 1, awardKey: "second", expiresAt: 7000 }]), context());
  assert.equal(renewed.state.entries[1]!.acquisitionKeys.length, 2);
  assert.equal(renewed.state.pendingAcquisitions!.length, 1);
  const corrupt = structuredClone(renewed.state); corrupt.maintenance!["ranking.combat-power"]!.managed[1]!.reference = "tampered";
  assert.throws(() => validateTitleSave(corrupt), /recibo/);
});

function fixture() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "titles-lifecycle-")); mkdirSync(join(dir, "city")); copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); let now = 1900000000000;
  store.initTutorialProfile(1941); store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=6,sex=1,nickname='TitleLifecycle',process=19500 WHERE user_id=1941").run();
  const city = new CityWorld(store, 1941, () => now); city.state.player.grades = 45;
  city.state.quests[936] = { template_id: 936, is_accept: 0, is_complete: 1 }; city.persist();
  const request = (id = 0, look = 1) => city.handle(frame(8597, 1941, encodeMessage(titleSchemas.request, { appellId: id, look })));
  const local = (revision: number, awards: TitleMaintenanceSnapshot["awards"] = [{ titleId: 1, awardKey: "season:1", expiresAt: now + 1000 }]) => ({ subjectId: 1941, policyKey: "ranking.combat-power", revision, publishedAt: now, complete: true, awards });
  return { store, city, now: () => now, advance: (ms = 5000) => now += ms, request, local,
    read: () => JSON.parse(String(store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1941").get()!.state)), cleanup() {
      store.close(); const target = resolve(dir); assert.ok(target.startsWith(resolve(base) + sep)); rmSync(target, { recursive: true, force: true });
    } };
}
const opcode = (p: { frame: string }) => Buffer.from(p.frame, "base64").readUInt16BE(6);

test("ciclo de títulos: pulso expira sem cliques, retira bônus/visual e notifica uma vez; reconexão não ressuscita", () => {
  const f = fixture();
  try {
    const c = f.city; f.request(); const before = structuredClone(c.state.hero);
    c.applyTitleMaintenanceSnapshot(f.local(1)); f.request(1, 0);
    assert.ok(c.saved.attributes!.sources["titles:1"]); assert.equal(c.currentTitleIdentity().id, 1);
    f.advance(999); assert.ok(!c.tick().some(p => opcode(p) === 4484));
    f.advance(1); const expired = c.tick();
    assert.equal(c.saved.titles!.selectedId, 0); assert.equal(c.currentTitleIdentity().id, 0);
    assert.equal(c.saved.attributes!.sources["titles:1"], undefined);
    assert.equal(c.state.hero.total_magic_attack, before.total_magic_attack);
    const list = expired.find(p => opcode(p) === 4484)!; assert.ok(list);
    assert.equal(decodeMessage(titleSchemas.list, Buffer.from(list.frame, "base64").subarray(20)).appells.find((t: any) => t.appellId === 1).isGet, 0);
    assert.ok(expired.some(p => opcode(p) === 111));
    assert.ok(!c.tick().some(p => [4484, 111].includes(opcode(p))));
    assert.equal(f.read().titles.entries[1].ownership.revokedAt, f.now());
    const loaded = new CityWorld(f.store, 1941, f.now); assert.equal(loaded.saved.titles!.selectedId, 0);
    assert.equal(loaded.saved.attributes!.sources["titles:1"], undefined);
    assert.ok(!loaded.bootstrap().some(p => opcode(p) === 111 && Buffer.from(p.frame, "base64").includes(Buffer.from("deixou de estar ativo"))));
  } finally { f.cleanup(); }
});

test("ciclo de títulos: expiração offline guarda o prazo real, retira todos os bônus e não exibe avisos retroativos", () => {
  const f = fixture();
  try {
    const c = f.city; c.applyTitleMaintenanceSnapshot(f.local(1)); f.request(1, 0);
    const deadline = f.now() + 1000; f.advance();
    const loaded = new CityWorld(f.store, 1941, f.now);
    assert.equal(loaded.saved.titles!.entries[1]!.ownership!.revokedAt, deadline);
    assert.equal(loaded.saved.titles!.pendingRemovals![0]!.retroactive, true);
    const boot = loaded.bootstrap();
    assert.ok(!boot.some(p => opcode(p) === 111 && Buffer.from(p.frame, "base64").includes(Buffer.from("deixou de estar ativo"))));
    assert.deepEqual(loaded.saved.titles!.pendingRemovals, []);
  } finally { f.cleanup(); }
});

test("ciclo de títulos: falha ao expirar/revogar reverte SQL e memória; próxima tentativa e cache após rollback funcionam", () => {
  const f = fixture();
  try {
    const c = f.city; f.request(); c.applyTitleMaintenanceSnapshot(f.local(1)); f.request(1, 0);
    const before = structuredClone({ titles: c.saved.titles, attrs: c.saved.attributes, hero: c.state.hero }); f.advance();
    f.store.db.exec("CREATE TRIGGER fail_title_expiry BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'forced title expiry failure'); END");
    assert.throws(() => c.tick(), /forced title expiry failure/);
    assert.deepEqual(c.saved.titles, before.titles); assert.deepEqual(c.saved.attributes, before.attrs); assert.deepEqual(c.state.hero, before.hero);
    assert.deepEqual(f.read().titles, before.titles);
    f.store.db.exec("DROP TRIGGER fail_title_expiry"); c.tick();
    assert.equal(c.saved.titles!.entries[1]!.ownership!.revokedAt, before.titles!.entries[1]!.ownership!.expiresAt);
    const settled = structuredClone(c.saved.titles);
    assert.throws(() => (c as any).atomicMutation(() => {
      c.applyTitleMaintenanceSnapshot(f.local(2, [{ titleId: 1, awardKey: "new-season", expiresAt: f.now() + 1000 }])); throw new Error("outer lifecycle rollback");
    }), /outer lifecycle rollback/);
    assert.deepEqual(c.saved.titles, settled);
    c.applyTitleMaintenanceSnapshot(f.local(2, [{ titleId: 1, awardKey: "new-season", expiresAt: f.now() + 1000 }]));
    f.advance(); c.tick(); assert.equal(c.saved.attributes!.sources["titles:1"], undefined);
    assert.equal(c.saved.titles!.entries[1]!.acquisitionKeys.length, 2);
  } finally { f.cleanup(); }
});

test("ciclo de títulos: manutenção condicional é atômica e pulso durante batalha não altera o snapshot de combate", () => {
  const f = fixture();
  try {
    const c = f.city; f.request(); c.applyTitleMaintenanceSnapshot(f.local(1)); f.request(1, 0); c.startBattle(0);
    const battle = structuredClone(c.saved.battle); f.advance(); c.tick();
    assert.deepEqual(c.saved.battle, battle); assert.equal(c.saved.attributes!.sources["titles:1"], undefined);
    assert.equal(c.saved.titles!.pendingRemovals!.length, 1);
    c.saved.battle!.finished = true; assert.ok(c.tick().some(p => opcode(p) === 4484));
    c.applyTitleMaintenanceSnapshot(f.local(2, [{ titleId: 1, awardKey: "renewal", expiresAt: null }]));
    const before = structuredClone(c.saved.titles);
    f.store.db.exec("CREATE TRIGGER fail_title_maintenance BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'forced maintenance failure'); END");
    assert.throws(() => c.applyTitleMaintenanceSnapshot(f.local(3, [])), /forced maintenance failure/);
    assert.deepEqual(c.saved.titles, before); assert.ok(c.saved.attributes!.sources["titles:1"]);
    f.store.db.exec("DROP TRIGGER fail_title_maintenance"); c.applyTitleMaintenanceSnapshot(f.local(3, []));
    assert.equal(c.saved.attributes!.sources["titles:1"], undefined); assert.equal(c.saved.titles!.entries[1]!.ownership!.revocationOrigin!.system, "titles.maintenance");
  } finally { f.cleanup(); }
});
