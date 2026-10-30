import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { AttributeCalculator } from "../src/attributes.js";
import { createEngine, makeActor, initializePassives, execute } from "../src/features/battle/engine.js";
import * as mechanics from "../src/features/battle/mechanics.js";
import { CityWorld } from "../src/city-world.js";
import { Store } from "../src/store.js";
import { projectRoot } from "../src/config.js";

const inputPath = join(projectRoot, "data/dynamic-defense-inputs.json");
const capturing = process.argv.includes("--capture");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
if (capturing) {
  const db = new DatabaseSync(join(projectRoot, "data/state.sqlite"), { readOnly: true });
  const characters = db.prepare("SELECT u.id,u.username,p.icon,c.state FROM users u JOIN tutorial_profiles p ON p.user_id=u.id JOIN city_worlds c ON c.user_id=u.id ORDER BY u.id").all().map(row => {
    const save = JSON.parse(String(row.state)), snapshot = AttributeCalculator.snapshot(save.attributes);
    return { id: row.id, username: row.username, icon: row.icon, level: save.state.player.grades,
      nickname: save.state.hero.nick_name, stats: snapshot.attributes, modifiers: snapshot.combatModifiers,
      learned: String(save.state.hero.skill_script).split(",").map(Number).filter(Boolean), saveHash: hash(String(row.state)) };
  });
  db.close();
  // Isolated new-account projections use the same CityWorld constructor as gameplay.
  // Keep these evidence databases; never reset or write the real account database.
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const early = [];
  for (const icon of [1, 2, 3]) {
    const dir = mkdtempSync(join(projectRoot, ".test-data/dynamic-defense-early-"));
    mkdirSync(join(dir, "city"));
    copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
    const store = new Store(dir);
    try {
      store.db.prepare("INSERT INTO users(id,username,salt,hash) VALUES(?,?,?,?)").run(1987, "defense_audit", "fixture", "fixture");
      store.initTutorialProfile(1987);
      store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,nickname='DefenseAudit',process=26000 WHERE user_id=1987").run(icon);
      const city = new CityWorld(store, 1987, () => 1900000000000);
      for (const level of [11, 12, 20]) {
        city.state.player.grades = level; city.persist();
        early.push({ icon, level, attributes: AttributeCalculator.calculate(city.saved.attributes!), evidenceDirectory: dir });
      }
    } finally { store.close(); }
  }
  writeFileSync(inputPath, JSON.stringify({ characters, early }, null, 2));
}
const inputs = JSON.parse(readFileSync(inputPath, "utf8"));
function actor(c: any, id: number) {
  const h = c.stats;
  const a = makeActor({ living_id: id, temp_id: c.icon, side: id, pos: id === 1 ? 6 : 2, hp: h.total_live, max_hp: h.total_live, grade: c.level, sp: 100, skillId: c.learned },
    { attack: h.total_phy_attack, magicAttack: h.total_magic_attack, defence: h.total_phy_defence, magicDefence: h.total_magic_defence, critical: h.total_force_hit, block: h.total_parry, penetration: h.total_penetrate, level: c.level }, ((c.icon - 1) % 3 + 1) * 10000);
  a.permanentModifiers = c.modifiers;
  return a;
}
const cases = [["pirata_teste", "pirata_teste_2", 30941], ["pirata_teste_2", "pirata_teste", 21421], ["pirata_teste_3", "pirata_teste", 11121]] as const;
const comparisons = cases.map(([attackerName, defenderName, skill]) => {
  const attacker = inputs.characters.find((c: any) => c.username === attackerName), defender = inputs.characters.find((c: any) => c.username === defenderName);
  if (!attacker || !defender) throw new Error(`Missing audit account: ${attackerName}/${defenderName}`);
  for (let i = 1; i <= 1000; i++) {
    const seed = Math.imul(i, 0x9e3779b9) >>> 0;
    const a = actor(attacker, 1), b = actor(defender, 2), e = createEngine([a, b], 1, seed); initializePassives(e);
    const result = execute(e, { actor: 1, skill, targets: [2], sequence: 1, automatic: false }, 0, { hits: 1 });
    const hit = result.damages[0];
    if (!hit || !hit.extra_data || hit.parry || hit.damage_value <= 1) continue;
    const magic = attacker.icon === 3, attack = magic ? a.stats.magicAttack : a.stats.attack, defence = magic ? b.stats.magicDefence : b.stats.defence;
    return { attacker: attackerName, defender: defenderName, skill, seed, attack, defence,
      coefficient: "defenseEffectiveness" in mechanics ? (mechanics as any).defenseEffectiveness(defence) : mechanics.DEFENSE_EFFECTIVENESS,
      base: mechanics.baseDamage(attack, defence), damage: hit.damage_value, critical: hit.extra_data, blocked: hit.parry,
      initialStats: [a.stats, b.stats], rngAfter: e.rng };
  }
  throw new Error("No comparable critical impact found");
});
const earlyComparisons = inputs.early.map((entry: any) => {
  const h = entry.attributes;
  return { icon: entry.icon, level: entry.level, physicalDefence: h.total_phy_defence, magicalDefence: h.total_magic_defence,
    physicalK: "defenseEffectiveness" in mechanics ? (mechanics as any).defenseEffectiveness(h.total_phy_defence) : mechanics.DEFENSE_EFFECTIVENESS,
    magicalK: "defenseEffectiveness" in mechanics ? (mechanics as any).defenseEffectiveness(h.total_magic_defence) : mechanics.DEFENSE_EFFECTIVENESS,
    physicalDamage: mechanics.baseDamage(h.total_phy_attack, h.total_phy_defence), magicalDamage: mechanics.baseDamage(h.total_magic_attack, h.total_magic_defence) };
});
const output = { comparisons, earlyComparisons };
const outputPath = join(projectRoot, capturing ? "data/dynamic-defense-before.json" : "data/dynamic-defense-after.json");
writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
