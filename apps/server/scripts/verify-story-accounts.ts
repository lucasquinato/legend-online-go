import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { storyQuests } from "../src/features/quests/index.js";

// Validate production saves on an isolated SQLite snapshot. Never write to the
// live database while a game session may have it loaded in memory.
mkdirSync(".test-data", { recursive: true });
const validationRoot = resolve(".test-data");
const directory = mkdtempSync(join(validationRoot, "story-accounts-"));
const live = new DatabaseSync("data/state.sqlite", { readOnly: true });
try { live.prepare("VACUUM INTO ?").run(join(directory, "state.sqlite")); }
finally { live.close(); }
mkdirSync(join(directory, "city"));
copyFileSync("data/city/scenario.json", join(directory, "city/scenario.json"));
const store = new Store(directory);
try {
  const report = [];
  for (const row of store.db.prepare("SELECT user_id,state FROM city_worlds ORDER BY user_id").all() as { user_id: number; state: string }[]) {
    const before = JSON.parse(row.state);
    const world = new CityWorld(store, row.user_id);
    assert.equal(world.state.player.grades, before.state.player.grades);
    assert.equal(world.state.hero.tempate_id, before.state.hero.tempate_id);
    assert.deepEqual(world.state.fashions, before.state.fashions);
    assert.equal(world.state.player.totalGp, before.state.player.totalGp);
    for (const [id, quest] of Object.entries(before.state.quests) as [string, any][])
      if (quest.is_complete && !quest.is_accept) assert.deepEqual(world.state.quests[id], quest);
    report.push({ userId: row.user_id, level: world.state.player.grades,
      removedExpired: Object.values(before.state.quests).filter((q: any) => q.is_accept && !world.state.quests[q.template_id]).map((q: any) => q.template_id),
      restored: Object.values(world.state.quests).filter(q => q.is_accept && !before.state.quests[q.template_id]).map(q => ({
        id: q.template_id, title: storyQuests.find(d => Number(d.template.TemplateId) === q.template_id)?.template.Title,
        completed: !!q.is_complete, progress: q.condition_1,
      })),
    });
  }
  writeFileSync("data/story-quests-validation.json", JSON.stringify({ at: new Date().toISOString(), accounts: report }, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  store.close();
  assert.ok(relative(validationRoot, directory).startsWith("story-accounts-"));
  rmSync(directory, { recursive: true, force: true });
}
