import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import {
  titleCatalog, initialTitleSave, initializeTitleSave, validateTitleSave,
  recordTitleAcquisition, recordTitleProgress, titleOwned, selectedTitle, selectTitle,
  revokeTitle, recordTitleAttributeUnlock, type TitleSave, type TitleProgress,
} from "../src/features/titles/index.js";

const source = (reference = "grant:26") => ({ system: "test", reference });
const grant = (save: TitleSave, id = 26, at = 1000, expiresAt: number | null = null, reference = `grant:${id}`) => recordTitleAcquisition(save, titleCatalog, id, at, expiresAt, source(reference));
const roundtrip = (save: TitleSave): TitleSave => { const reloaded = JSON.parse(JSON.stringify(save)); validateTitleSave(reloaded); return reloaded; };
function progress(id: number, at = 1000): TitleProgress {
  const row = titleCatalog.get(id)!;
  return { conditionType: row.requirement.conditionType, requirementKey: row.requirement.key, status: "tracking", values: { weeds: 25, worms: 80, observed: ["field:1", "field:2"] }, wireValue: "1,80|2,25", updatedAt: at, origin: source("farm:state") };
}

test("títulos: conta antiga inicializa coleção vazia e evidência capturada não concede nem libera", () => {
  const host: { titles?: TitleSave } = {};
  const save = initializeTitleSave(host, 1000, { selectedId: 26, attributesUnlocked: 1 });
  assert.deepEqual(save.entries, {}); assert.equal(save.selectedId, 0);
  assert.equal(save.attributeAccess.unlocked, false);
  assert.deepEqual(save.legacy, { observedAt: 1000, selectedId: 26, attributesUnlocked: true, policy: "unverified-not-imported" });
  assert.equal(initializeTitleSave(host, 2000, { selectedId: 27, attributesUnlocked: true }), save);
  assert.equal(save.legacy!.selectedId, 26);
  assert.deepEqual(roundtrip(save), save);
  const other = initialTitleSave(); other.entries[66] = { id: 66, acquisitionKeys: [] };
  assert.deepEqual(initialTitleSave().entries, {}, "contas não compartilham referências");
});

test("títulos: progresso composto persiste isolado da posse, seleção e desbloqueio", () => {
  const save = initialTitleSave(), update = progress(66);
  assert.equal(recordTitleProgress(save, titleCatalog, 66, update), true);
  update.values.weeds = 999;
  assert.equal(save.entries[66]!.progress!.values.weeds, 25);
  const completed = { ...progress(66, 2000), status: "completed" as const };
  recordTitleProgress(save, titleCatalog, 66, completed);
  assert.equal(titleOwned(save, titleCatalog, 66, 2000), false);
  assert.equal(save.attributeAccess.unlocked, false);
  assert.throws(() => selectTitle(save, titleCatalog, 66, 3, 2000), /indisponível/);
  assert.deepEqual(roundtrip(save), save);
  assert.throws(() => recordTitleProgress(save, titleCatalog, 66, progress(66, 1000)), /antiga/);
  assert.throws(() => recordTitleProgress(save, titleCatalog, 66, progress(26, 2001)), /incompatível/);
});

test("títulos: recibos impedem duplicação e replay após revogar ou readquirir", () => {
  let save = initialTitleSave();
  assert.equal(grant(save), true);
  assert.equal(grant(save, 26, 2000, 5000), false, "repetição não renova validade");
  assert.equal(save.entries[26]!.ownership!.expiresAt, null);
  assert.equal(selectTitle(save, titleCatalog, 26, 3, 2000), true);
  assert.equal(revokeTitle(save, 26, 3000, source("rank:lost")), true);
  assert.equal(save.selectedId, 0);
  save = roundtrip(save);
  assert.equal(grant(save, 26, 4000), false, "evento antigo não ressuscita um título");
  assert.equal(grant(save, 26, 4000, 9000, "second-award"), true);
  assert.equal(save.entries[26]!.ownership!.firstObtainedAt, 1000);
  assert.equal(save.entries[26]!.ownership!.obtainedAt, 4000);
  assert.equal(save.entries[26]!.acquisitionKeys.length, 2);
  assert.equal(grant(roundtrip(save), 26, 5000, null), false);
  assert.throws(() => grant(save, 26, 3500, null, "stale-new-event"), /antiga/);
  assert.deepEqual(roundtrip(save), save);
});

test("títulos: validade usa milissegundos absolutos e continua correndo após sair", () => {
  let save = initialTitleSave(); grant(save, 26, 1000, 3000);
  selectTitle(save, titleCatalog, 26, 3, 1500);
  save = roundtrip(save);
  assert.equal(titleOwned(save, titleCatalog, 26, 2999), true);
  assert.equal(titleOwned(save, titleCatalog, 26, 3000), false);
  assert.equal(selectedTitle(save, titleCatalog, 3, 3000), 0);
  assert.equal(save.selectedId, 26, "consulta não apaga histórico ou executa o serviço de expiração da etapa 7");
  assert.throws(() => selectTitle(save, titleCatalog, 26, 3, 3000), /indisponível/);
  assert.throws(() => grant(save, 27, 1000, 1000), /validade/);
  assert.equal(save.entries[27], undefined, "validação falha antes de modificar o save");
  assert.equal(grant(save, 26, 4000, 6000, "renewal"), true);
  assert.equal(titleOwned(save, titleCatalog, 26, 5000), true);
});

test("títulos: escolha visual única respeita posse, classe e seleção vazia interna", () => {
  const save = initialTitleSave(); grant(save, 5); grant(save, 26);
  assert.throws(() => selectTitle(save, titleCatalog, 5, 1, 2000), /indisponível/);
  assert.equal(selectTitle(save, titleCatalog, 5, 3, 2000), true);
  assert.equal(selectTitle(save, titleCatalog, 5, 3, 2000), false);
  assert.equal(selectTitle(save, titleCatalog, 26, 3, 2000), true);
  assert.equal(save.selectedId, 26);
  assert.equal(titleOwned(save, titleCatalog, 5, 2000), true);
  assert.equal(selectTitle(save, titleCatalog, 0, 3, 2000), true);
  assert.equal(save.selectedId, 0);
  assert.throws(() => grant(save, 999999), /não encontrado/);
  assert.throws(() => selectedTitle(save, titleCatalog, 3, -1), /consulta/);
  assert.deepEqual(roundtrip(save), save);
});

test("títulos: liberação possui origem própria e não é consequência da posse", () => {
  const save = initialTitleSave(); grant(save);
  assert.equal(save.attributeAccess.unlocked, false);
  assert.equal(recordTitleAttributeUnlock(save, 2000, source("quest:936")), true);
  assert.equal(recordTitleAttributeUnlock(save, 3000, source("quest:936-retry")), false);
  assert.equal(roundtrip(save).attributeAccess.unlockedAt, 2000);
});

test("títulos: catálogo reduzido conserva registros desconhecidos sem permitir seu uso", () => {
  const save = initialTitleSave(); grant(save);
  const entry = save.entries[26]!; delete save.entries[26];
  entry.id = 999999; save.entries[999999] = entry; save.selectedId = 999999;
  const reloaded = roundtrip(save);
  assert.ok(reloaded.entries[999999]!.ownership);
  assert.equal(titleOwned(reloaded, titleCatalog, 999999, 2000), false);
  assert.equal(selectedTitle(reloaded, titleCatalog, 3, 2000), 0);
});

test("títulos: save inválido ou versão futura não é apagado; progresso precisa sobreviver ao JSON", () => {
  const future: any = { titles: { version: 2, entries: { future: "preserve" } } };
  const before = structuredClone(future);
  assert.throws(() => initializeTitleSave(future, 1000), /versão/); assert.deepEqual(future, before);
  const save = initialTitleSave();
  const cycle: any = {}; cycle.next = cycle;
  for (const value of [NaN, Infinity, undefined, 1n, new Date(), cycle, [undefined]]) {
    const p = progress(66); p.values.bad = value as any;
    assert.throws(() => recordTitleProgress(save, titleCatalog, 66, p), /inválido/);
    assert.deepEqual(save.entries, {});
  }
  grant(save); save.entries[26]!.ownership!.origin.reference = "modified";
  assert.throws(() => validateTitleSave(save), /recibo/);
});

function fixture() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "titles-state-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); let now = 1900000000000;
  for (const id of [1901, 1902]) {
    store.initTutorialProfile(id);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=6,sex=0,nickname=?,process=19500 WHERE user_id=?").run(`Titles${id}`, id);
  }
  return { store, now: () => now, advance: () => now += 5000, cleanup() {
    store.close(); const target = resolve(dir);
    assert.ok(target.startsWith(resolve(base) + sep)); rmSync(target, { recursive: true, force: true });
  } };
}

test("títulos: CityWorld persiste coleção e progresso por conta e preserva gameplay ao reconectar", () => {
  const f = fixture();
  try {
    const city = new CityWorld(f.store, 1901, f.now), other = new CityWorld(f.store, 1902, f.now);
    const before = structuredClone({ attributes: city.saved.attributes, fashion: city.saved.fashion, items: city.state.items, selected: city.state.player.appell_id, unlocked: city.state.player.applle_property_Open });
    grant(city.saved.titles!, 26, f.now());
    recordTitleProgress(city.saved.titles!, titleCatalog, 66, progress(66, f.now()));
    selectTitle(city.saved.titles!, titleCatalog, 26, 3, f.now());
    recordTitleAttributeUnlock(city.saved.titles!, f.now(), source("verified-quest:936"));
    city.persist(); f.advance();
    const reloaded = new CityWorld(f.store, 1901, f.now);
    assert.deepEqual(reloaded.saved.titles, city.saved.titles);
    assert.deepEqual(new CityWorld(f.store, 1902, f.now).saved.titles!.entries, {});
    assert.deepEqual(other.saved.titles!.entries, {});
    assert.deepEqual({ attributes: reloaded.saved.attributes, fashion: reloaded.saved.fashion, items: reloaded.state.items, selected: reloaded.state.player.appell_id, unlocked: reloaded.state.player.applle_property_Open }, { ...before, selected: 26 });
  } finally { f.cleanup(); }
});

test("títulos: migração de save antigo é idempotente e nunca importa propriedade de captura", () => {
  const f = fixture();
  try {
    const city = new CityWorld(f.store, 1901, f.now), raw = structuredClone(city.saved);
    delete raw.titles;
    raw.state.player.appell_id = 26; raw.state.player.applle_property_Open = true;
    f.store.db.prepare("UPDATE city_worlds SET state=? WHERE user_id=1901").run(JSON.stringify(raw));
    const migrated = new CityWorld(f.store, 1901, f.now);
    assert.deepEqual(migrated.saved.titles!.entries, {});
    assert.equal(migrated.saved.titles!.selectedId, 0);
    assert.equal(migrated.saved.titles!.attributeAccess.unlocked, false);
    assert.equal(migrated.saved.titles!.legacy!.selectedId, 26);
    f.advance();
    assert.deepEqual(new CityWorld(f.store, 1901, f.now).saved.titles, migrated.saved.titles);
  } finally { f.cleanup(); }
});

test("títulos: rollback da cidade desfaz estado em memória e no SQLite", () => {
  const f = fixture();
  try {
    const city = new CityWorld(f.store, 1901, f.now), before = structuredClone(city.saved.titles);
    assert.throws(() => (city as any).atomicMutation(() => {
      grant(city.saved.titles!, 26, f.now());
      selectTitle(city.saved.titles!, titleCatalog, 26, 3, f.now());
      city.persist(); throw new Error("forced rollback");
    }), /forced rollback/);
    assert.deepEqual(city.saved.titles, before);
    assert.deepEqual(JSON.parse(String(f.store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1901").get()!.state)).titles, before);
    assert.deepEqual(new CityWorld(f.store, 1901, f.now).saved.titles, before);
  } finally { f.cleanup(); }
});
