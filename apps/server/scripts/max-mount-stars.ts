// Account maintenance only. Stop the game server before running this script.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CurrencyLedger } from "../src/features/currencies/index.js";
import { MountFeature } from "../src/features/mounts/feature.js";
import { mounts } from "../src/features/mounts/content.js";

const store = new Store(loadConfig().dataDir);
try {
  const user = store.user(process.argv[2] ?? "pirata_teste");
  assert.ok(user, "Conta inexistente.");
  const row = store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(user.id)!;
  assert.ok(row, "Conta sem estado na cidade.");
  const saved = JSON.parse(String(row.state));
  assert.ok(saved.mounts && saved.attributes, "Estado de montarias/atributos ausente.");
  const before = structuredClone(saved);
  const changed: { id: number; name: string; before: number; after: number }[] = [];
  let eligible = 0;
  for (const owned of Object.values(saved.mounts.owned) as any[]) {
    const definition = mounts.get(owned.id);
    if (!definition || owned.expiresAt !== null || [3, 4, 5].includes(Number(definition.MountType)) || !Number(definition.GradeType)) continue;
    const bonuses = String(definition.StarAddition).split(",").map(Number);
    assert.ok(bonuses.length && bonuses.every(Number.isFinite), "Tabela de estrelas inválida: " + owned.id);
    const maximum = bonuses.length;
    assert.ok(owned.stars <= maximum, "Estrelas fora do limite da tabela: " + owned.id);
    eligible++;
    if (owned.stars < maximum || owned.blessing !== 0) {
      changed.push({ id: owned.id, name: String(definition.TemplateName), before: owned.stars, after: maximum });
      owned.stars = maximum; owned.blessing = 0;
    }
  }
  const feature = new MountFeature({ state: saved.state, saved, userId: user.id, ledger: new CurrencyLedger(store.db), now: Date.now,
    inventory: () => { throw new Error("Manutenção não deve consumir itens."); }, persist: () => {}, atomic: action => action() });
  feature.synchronize();
  saved.state.player.fighting_capacity = saved.state.hero.fighting_capacity;
  saved.state.army.fightingCapacity = saved.state.hero.fighting_capacity;
  saved.state.army.simple_hero_info = structuredClone(saved.state.hero);
  assert.deepEqual(saved.state.items, before.state.items);
  assert.deepEqual(Object.keys(saved.mounts.owned), Object.keys(before.mounts.owned));
  assert.equal(saved.mounts.selected, before.mounts.selected);
  assert.equal(saved.mounts.mounted, before.mounts.mounted);
  for (const name of ["total_power", "total_intellect", "total_physique", "total_agility"])
    assert.ok(saved.state.hero[name] >= before.state.hero[name], "Atributo diminuiu: " + name);
  // Validate the entire save outside the exact fields authorized by this grant.
  const protectedState = (value: any) => {
    const copy = structuredClone(value);
    for (const owned of Object.values(copy.mounts.owned) as any[]) { delete owned.stars; delete owned.blessing; }
    delete copy.attributes.sources.mounts;
    delete copy.state.hero;
    delete copy.state.army.simple_hero_info;
    delete copy.state.army.fightingCapacity;
    delete copy.state.player.fighting_capacity;
    return copy;
  };
  assert.deepEqual(protectedState(saved), protectedState(before), "Alteração fora das estrelas/atributos.");
  const backup = join(store.dir, "backups", "max-mount-stars-" + new Date().toISOString().replaceAll(":", "-"));
  mkdirSync(backup, { recursive: true }); store.db.prepare("VACUUM INTO ?").run(join(backup, "state.sqlite"));
  store.db.exec("BEGIN IMMEDIATE");
  try {
    store.db.prepare("UPDATE city_worlds SET state=? WHERE user_id=?").run(JSON.stringify(saved), user.id);
    assert.deepEqual(JSON.parse(String(store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(user.id)!.state)), saved);
    store.db.exec("COMMIT");
  } catch (error) { store.db.exec("ROLLBACK"); throw error; }
  const report = { at: new Date().toISOString(), username: user.username, userId: user.id, eligible, changed: changed.length, details: changed, backup,
    attributes: Object.fromEntries(["total_power", "total_intellect", "total_physique", "total_agility", "fighting_capacity"].map(name => [name, { before: before.state.hero[name], after: saved.state.hero[name] }])) };
  writeFileSync(join(projectRoot, "reports/montarias/max-stars.json"), JSON.stringify(report, null, 2));
  const { details, ...summary } = report; console.log(JSON.stringify(summary));
} finally { store.close(); }
