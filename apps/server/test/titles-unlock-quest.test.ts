import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame } from "../src/protocol.js";
import { encodeMessage, decodeMessage } from "../src/messages.js";
import { questClaimed } from "../src/features/quests/index.js";
import { titleUnlockQuest, localTitleQuestTables } from "../src/features/titles/quest.js";
import { recordTitleAcquisition, titleCatalog } from "../src/features/titles/index.js";

function fixture() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "titles-unlock-")); mkdirSync(join(dir, "city")); copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); store.initTutorialProfile(1939); store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=6,sex=1,nickname='TitleUnlock',process=19500 WHERE user_id=1939").run();
  const now = () => 1900000000000, city = new CityWorld(store, 1939, now);
  const claim = () => city.handle(frame(5014, 1939, encodeMessage(city.scenario.outgoing[5014]!, { template_id: 936 })));
  return { store, city, now, claim, cleanup() { store.close(); assert.ok(resolve(dir).startsWith(resolve(base) + sep)); rmSync(dir, { recursive: true, force: true }); } };
}
test("missão de títulos: nível 14 libera objetivo local sem cadeia 935 e resgate ativa atributos e ícone", () => {
  const f = fixture();
  try {
    const c = f.city;
    recordTitleAcquisition(c.saved.titles!, titleCatalog, 26, f.now(), null, { system: "test", reference: "unlock-quest" });
    c.state.player.grades = 13; c.persist(); assert.equal(c.state.quests[936], undefined);
    assert.equal(c.saved.attributes!.sources["titles:26"], undefined);
    c.state.player.grades = 14; c.persist();
    assert.equal(c.state.quests[936]!.is_accept, 1); assert.equal(c.state.quests[936]!.is_complete, 1);
    assert.equal(c.state.quests[935], undefined); assert.equal(c.state.player.applle_property_Open, 0);
    assert.equal(questClaimed(c.state, 936), false);
    const result = f.claim(); assert.ok(result.length); assert.equal(questClaimed(c.state, 936), true);
    assert.equal(c.saved.titles!.attributeAccess.unlocked, true); assert.equal(c.state.player.applle_property_Open, 1);
    assert.ok(c.saved.attributes!.sources["titles:26"]);
    const packet = c.packet({ opcode: 3, message: {} }, true);
    assert.equal(decodeMessage(c.scenario.incoming[3]!, Buffer.from(packet.frame, "base64").subarray(20)).applle_property_Open, 1);
    const xp = c.state.player.totalGp;
    f.claim(); assert.equal(c.state.player.totalGp, xp, "recompensa única");
    const loaded = new CityWorld(f.store, 1939, f.now);
    assert.equal(questClaimed(loaded.state, 936), true); assert.equal(loaded.state.player.applle_property_Open, 1);
  } finally { f.cleanup(); }
});
test("missão de títulos: conta antiga de nível alto recebe missão ao carregar e falha de resgate não libera atributos", () => {
  const f = fixture();
  try {
    f.city.state.player.grades = 45; f.city.persist();
    const c = new CityWorld(f.store, 1939, f.now);
    assert.equal(c.state.quests[936]!.is_complete, 1);
    f.store.db.exec("CREATE TRIGGER fail_title_quest BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'forced quest failure'); END");
    assert.throws(() => c.handle(frame(5014, 1939, encodeMessage(c.scenario.outgoing[5014]!, { template_id: 936 }))), /forced quest failure/);
    assert.equal(questClaimed(c.state, 936), false); assert.equal(c.saved.titles!.attributeAccess.unlocked, false);
    f.store.db.exec("DROP TRIGGER fail_title_quest");
  } finally { f.cleanup(); }
});
function tables(raw: Buffer): Map<string, Buffer> {
  const data = inflateSync(raw.subarray(4)), rows = new Map<string, Buffer>(); let offset = 4;
  while (offset < data.length) { const n = data[offset++]!, name = data.subarray(offset, offset + n).toString(); offset += n; const size = data.readUInt32BE(offset); offset += 4; rows.set(name, data.subarray(offset, offset + size)); offset += size; }
  return rows;
}
test("missão de títulos: tabela entregue ao cliente usa nível 14, conserva recompensa original e altera somente a missão 936", () => {
  const raw = readFileSync(join(projectRoot, "reference/quests/tempinfos.original.bin")), before = tables(raw), patched = localTitleQuestTables(raw), after = tables(patched);
  assert.equal(titleUnlockQuest.template.RewardPlayGP, "150000");
  assert.equal(after.size, before.size);
  for (const [name, bytes] of before) {
    if (!["QuestTemps", "QuestCondictionInfos"].includes(name)) { assert.deepEqual(after.get(name), bytes, name); continue; }
    const remove = (text: string) => text.replace(/<\w+\s+[^>]*\bTemplateId="936"[^>]*\/>/g, "");
    assert.equal(remove(after.get(name)!.toString()), remove(bytes.toString()));
  }
  const quest = after.get("QuestTemps")!.toString().match(/<\w+\s+[^>]*\bTemplateId="936"[^>]*\/>/)![0];
  assert.match(quest, /NeedMinLevel="14"/); assert.match(quest, /PreQuestId=""/);
  assert.match(after.get("QuestCondictionInfos")!.toString(), /TemplateId="936" CondictionType="1"[^>]*Para2="14"/);
  assert.deepEqual(localTitleQuestTables(patched), patched, "override idempotente");
});
