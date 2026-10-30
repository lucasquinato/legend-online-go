import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { inflateSync, deflateSync } from "node:zlib";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoInt } from "../src/protocol.js";
import { encodeMessage } from "../src/messages.js";
import { currencyBalance } from "../src/features/currencies/index.js";
import { grantExperience } from "../src/progression.js";
import { localMountTutorialTables, mountTutorialQuests, mountTutorialAction } from "../src/features/mounts/tutorial-quests.js";
import { emptyCity } from "../src/city-state.js";
import { mountButtonLabel, mountButtonIndex } from "../src/features/mounts/button-label.js";

test("missões nível 16 exigem um clique em Montar, resgate e dez pedras reais com prêmios únicos", async () => {
  const root = join(projectRoot, ".test-data"); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "mount-tutorial-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir), uid = 1963, now = () => 1900000000000;
  await store.createUser("mount_tutorial", "local-test-password", uid); store.initTutorialProfile(uid);
  store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=3,nickname='MountTutorial',sex=0,process=25000 WHERE user_id=?").run(uid);
  let city = new CityWorld(store, uid, now);
  const command = (op: number, amount: number, property = 0) => city.handle(frame(8529, uid, Buffer.concat([protoInt(1, property), protoInt(2, 0), protoInt(3, amount), protoInt(5, op)])));
  const claim = (id: number) => city.handle(frame(5014, uid, encodeMessage(city.scenario.outgoing[5014]!, { template_id: id, reward_item_id: 0 })));
  const stones = () => Object.values(city.state.items).filter(i => i.template_id === 208017).reduce((sum, i) => sum + i.count, 0);
  try {
    city.state.player.grades = 15; city.persist(); city = new CityWorld(store, uid, now);
    assert.equal(city.state.quests[2800], undefined);
    city.state.player.grades = 16; city.persist(); city = new CityWorld(store, uid, now);
    assert.equal(city.state.quests[2800]!.is_accept, 1); assert.equal(city.state.quests[753], undefined);
    command(3, 0); assert.equal(city.state.quests[2800]!.condition_1, 0);
    command(3, 1); assert.equal(city.state.quests[2800]!.condition_1, 1); assert.equal(city.state.quests[2800]!.is_complete, 1);
    city = new CityWorld(store, uid, now);
    assert.equal(city.state.quests[2800]!.condition_1, 1);
    assert.equal(city.state.quests[2800]!.is_complete, 1); assert.equal(city.saved.mounts!.mounted, true, "conclui sem desmontar");
    assert.equal(city.state.quests[753], undefined, "sucessora aguarda o resgate");
    const beforeGold = currencyBalance(city.state, "gold"), beforeStones = stones(), expected = structuredClone(city.state.player);
    grantExperience(expected, 10000);
    const pending = structuredClone(city.saved);
    store.db.exec("CREATE TRIGGER fail_mount_quest BEFORE UPDATE ON city_worlds BEGIN SELECT RAISE(ABORT,'fail mount tutorial'); END");
    assert.throws(() => claim(2800), /fail mount tutorial/); assert.deepEqual(city.saved, pending);
    store.db.exec("DROP TRIGGER fail_mount_quest");
    claim(2800);
    assert.equal(currencyBalance(city.state, "gold"), beforeGold + 10000);
    assert.equal(stones(), beforeStones + 10);
    assert.equal(city.state.player.grades, expected.grades); assert.equal(city.state.player.gp, expected.gp);
    assert.equal(city.state.quests[753]!.is_accept, 1); assert.equal(city.state.quests[753]!.condition_1, 0);
    claim(2800); assert.equal(stones(), beforeStones + 10);
    // Controlled material fixture: the second objective counts real stones only.
    for (const [key, item] of Object.entries(city.state.items)) if (item.template_id === 208017) delete city.state.items[key];
    city.state.player.point = 1000; command(1, 2);
    assert.equal(city.state.quests[753]!.condition_1, 0, "diamantes não contam como pedras");
    city.state.items["1:0:0"] = { id: 998899, template_id: 208017, count: 10, bag_type: 1, object_id: 0, pos: 0, exist: 1 };
    command(1, 4); assert.equal(city.state.quests[753]!.condition_1, 4);
    city = new CityWorld(store, uid, now); assert.equal(city.state.quests[753]!.condition_1, 4);
    command(1, 6, 2); assert.equal(city.state.quests[753]!.is_complete, 1); assert.equal(stones(), 0);
    const gold = currencyBalance(city.state, "gold"), xp = structuredClone(city.state.player); grantExperience(xp, 10000);
    claim(753); assert.equal(currencyBalance(city.state, "gold"), gold + 10000);
    assert.equal(city.state.player.grades, xp.grades); assert.equal(city.state.player.gp, xp.gp); assert.equal(stones(), 0);
    claim(753); assert.equal(currencyBalance(city.state, "gold"), gold + 10000);
    city = new CityWorld(store, uid, now);
    assert.equal(city.state.quests[753]!.is_accept, 0); assert.equal(city.state.hero.tempate_id, 3);
  } finally { store.close(); assert.ok(dir.startsWith(root)); rmSync(dir, { recursive: true, force: true }); }
});

test("treinos anteriores à segunda missão não são herdados e a tabela local inclui os textos/prêmios", () => {
  const state = emptyCity(); mountTutorialAction(state, "stones", 10); assert.equal(state.quests[753], undefined);
  const raw = readFileSync("reference/quests/tempinfos.original.bin"), patched = localMountTutorialTables(raw);
  assert.equal(patched.readUInt32BE(0), patched.length - 4);
  const text = inflateSync(patched.subarray(4)).toString();
  assert.match(text, /Title="Sua primeira montaria"/); assert.match(text, /PreQuestId="2800"/);
  for (const q of mountTutorialQuests) {
    assert.equal(q.template.RewardGold, "10000"); assert.equal(q.template.RewardPlayGP, "10000");
    assert.equal(q.template.NeedMinLevel, "16");
  }
  assert.equal(mountTutorialQuests[0]!.items[0]!.RewardItemCount, "10"); assert.deepEqual(mountTutorialQuests[1]!.items, []);
  assert.deepEqual(localMountTutorialTables(patched), patched);
});

test("rótulo Montar altera só o botão desmontado e preserva Descansar e outros estilos", () => {
  const raw = readFileSync("data/assets/objects/f8925fb650e5e94cb4a39ca131f8baec09b9f4b2cfbb9463aebcb28616950dbc.bin");
  const unpack = (bytes: Buffer) => {
    const data = inflateSync(bytes), result = new Map<string, Buffer>(); let pos = 0;
    while (pos < data.length) { const n = data[pos++]!, name = data.subarray(pos, pos+n).toString(); pos += n; const size = data.readUInt32BE(pos); pos += 4; result.set(name, data.subarray(pos, pos+size)); pos += size; }
    return result;
  };
  const original = unpack(raw), patched = unpack(mountButtonLabel(raw));
  assert.deepEqual([...patched.keys()], [...original.keys()]);
  for (const [name, bytes] of original) if (name !== "mounts.xml") assert.deepEqual(patched.get(name), bytes, name);
  const elements = (text: string) => [...text.matchAll(/<component\s+[^>]*\/>/g)].map(m=>m[0]);
  const before = elements(original.get("mounts.xml")!.toString()), after = elements(patched.get("mounts.xml")!.toString());
  const rest = before.find(e=>e.includes('stylename="mount.dismountBtn"'))!;
  assert.ok(after.includes(rest), "botão Descansar permanece byte a byte idêntico");
  for (const component of before) if (!component.includes('stylename="mount.mountBtn"')) assert.ok(after.includes(component));
  assert.equal(after.length, before.length + 1);
  assert.match(after.find(e=>e.includes('stylename="mount.mountBtn"'))!, /iconStyle="mount.localMountLabel"/);
  assert.match(after.find(e=>e.includes('stylename="mount.localMountLabel"'))!, /text="Montar"/);
  assert.throws(()=>mountButtonLabel(Buffer.from("different release")), /Versão/);
});

test("pacote de estilos e índices anunciam o mesmo tamanho para não travar no carregamento", () => {
  const raw = readFileSync("data/assets/objects/f8925fb650e5e94cb4a39ca131f8baec09b9f4b2cfbb9463aebcb28616950dbc.bin");
  const style = mountButtonLabel(raw);
  assert.ok(Math.abs(style.length - raw.length) < 3000, "compressão compatível com o limite do carregador");
  const untouched = '<Item name="2.png" md5="unchanged" size="123" />';
  const original = Buffer.from('<md5>' + untouched + '<Item name="ui\\zh_cn\\xml\\xml.png" md5="d0a3cb68" size="932130" /></md5>');
  const index = inflateSync(inflateSync(mountButtonIndex("/client/code_md5.dat", deflateSync(deflateSync(original)), style))).toString();
  assert.ok(index.includes(untouched));
  assert.ok(index.includes(`md5="d0a3cb68" size="${style.length}"`));
  const sizes = Buffer.from('<root><Item size="932130" name="ui/zh_cn/xml/xml_d0a3cb68.png" /><Item size="567986" name="ui/zh_cn/xml/xml.png" /></root>');
  const output = mountButtonIndex("/client/size.xml", sizes, style).toString();
  assert.equal((output.match(new RegExp(`size="${style.length}"`, "g")) ?? []).length, 2);
  assert.strictEqual(mountButtonIndex("/other", original, style), original);
});
