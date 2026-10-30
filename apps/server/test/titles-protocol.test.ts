import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { projectRoot } from "../src/config.js";
import { CityWorld } from "../src/city-world.js";
import { Store } from "../src/store.js";
import { frame, protoInt } from "../src/protocol.js";
import { encodeMessage, decodeMessage, typeName } from "../src/messages.js";
import { titleCatalog, initialTitleSave, recordTitleAcquisition, titleSchemas, titleRequest, titleList, titleListPacket, pendingTitleNotifications, titleIdentity } from "../src/features/titles/index.js";
import type { TutorialResponse } from "../src/tutorial.js";

const ctx = { job: 3 as const, level: 45, now: 2000 };
const op = (p: TutorialResponse) => Buffer.from(p.frame, "base64").readUInt16BE(6);
const request = (id: number, look = 0) => encodeMessage(titleSchemas.request, { appellId: id, look });

test("títulos protocolo: contrato recuperado aceita consulta/seleção e rejeita campos ambíguos ou forjados", () => {
  assert.deepEqual(titleRequest(request(0, 1)), { appellId: 0, look: true });
  assert.deepEqual(titleRequest(request(26)), { appellId: 26, look: false });
  assert.deepEqual(titleRequest(request(0)), { appellId: 0, look: false });
  for (const body of [Buffer.alloc(0), request(26, 1), request(-1), request(26, 2), Buffer.concat([request(26), protoInt(3, 1)]), Buffer.concat([request(26), protoInt(1, 85)])])
    assert.throws(() => titleRequest(body), /inválida/);
});

test("títulos protocolo: lista completa é por classe; posse, progresso e datas são explícitos e sobrevivem ao protobuf", () => {
  const save = initialTitleSave();
  recordTitleAcquisition(save, titleCatalog, 26, 1000, 3000, { system: "test", reference: "grant" });
  save.entries[26]!.progress = { conditionType: 8, requirementKey: "labyrinth.floor", status: "completed", values: { current: 100 }, wireValue: "100", updatedAt: 1000, origin: { system: "test", reference: "floor" } };
  const wire = titleListPacket(save, titleCatalog, ctx);
  const list = decodeMessage(titleSchemas.list, Buffer.from(wire.body!, "base64")).appells;
  assert.equal(list.length, titleCatalog.list({ job: 3 }).length);
  assert.ok(list.some((t: any) => t.appellId === 5)); assert.ok(!list.some((t: any) => [3, 4].includes(t.appellId)));
  assert.equal(list.find((t: any) => t.appellId === 26).isGet, 1);
  assert.equal(list.find((t: any) => t.appellId === 26).value, "100");
  assert.equal(list.find((t: any) => t.appellId === 26).validDate, "1970-01-01 00:00:03");
  const expired = titleList(save, titleCatalog, { ...ctx, now: 3000 }).appells.find((t: any) => t.appellId === 26);
  assert.equal(expired.isGet, 0); assert.equal(expired.validDate, "2000-01-01 00:00:00");
  assert.equal(list.find((t: any) => t.appellId === 85).isGet, 0);
});

function fixture() {
  const base = join(projectRoot, ".test-data"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "titles-protocol-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir); let now = 1900000000000;
  for (const id of [1931, 1932]) {
    store.initTutorialProfile(id);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=6,sex=1,nickname=?,process=19500 WHERE user_id=?").run(`Title${id}`, id);
  }
  const city = new CityWorld(store, 1931, () => now);
  const send = (id: number, look = 0) => city.handle(frame(8597, 1931, request(id, look)));
  const decode = (packets: TutorialResponse[], opcode: number) => {
    const found = packets.find(p => op(p) === opcode); assert.ok(found, `missing ${opcode}`);
    return decodeMessage(city.scenario.incoming[opcode]!, Buffer.from(found.frame, "base64").subarray(20));
  };
  return { store, city, send, decode, now: () => now, advance: () => now += 5000, grant: (id: number) => recordTitleAcquisition(city.saved.titles!, titleCatalog, id, now, null, { system: "test", reference: `grant:${id}` }), read: () => JSON.parse(String(store.db.prepare("SELECT state FROM city_worlds WHERE user_id=1931").get()!.state)), cleanup() {
    store.close(); const target = resolve(dir); assert.ok(target.startsWith(resolve(base) + sep)); rmSync(target, { recursive: true, force: true });
  } };
}

test("títulos protocolo: consulta é local, seleção persiste identidade e não altera atributos ou outras contas", () => {
  const f = fixture();
  try {
    const c = f.city; f.grant(26); f.grant(85); c.persist();
    const before = structuredClone(c.saved.attributes);
    const listing = f.send(0, 1);
    assert.equal(f.decode(listing, 4484).appells.find((t: any) => t.appellId === 26).isGet, 1);
    assert.equal(c.saved.titles!.selectedId, 0);
    const selected = f.send(26);
    assert.equal(f.decode(selected, 3).appell_id, 26);
    assert.equal(f.decode(selected, 150).appellid, 26);
    assert.deepEqual(c.saved.attributes, before);
    assert.equal(f.read().titles.selectedId, 26);
    const loaded = new CityWorld(f.store, 1931, f.now);
    assert.equal(loaded.currentTitleIdentity().id, 26);
    assert.equal(new CityWorld(f.store, 1932, f.now).currentTitleIdentity().id, 0);
    const scene = c.packet({ opcode: 21, message: { player: [{ player_id: 1931, appellid: 99999 }] } });
    assert.equal(f.decode([scene], 21).player[0].appellid, 26);
    assert.equal(f.decode(f.send(85), 3).appell_id, 85);
    assert.equal(f.decode(f.send(0), 3).appell_id, 0);
    assert.deepEqual(c.saved.attributes, before);
    const invalid = f.send(999999);
    assert.ok(invalid.some(p => op(p) === 83)); assert.equal(c.saved.titles!.selectedId, 0);
    f.grant(4); c.persist(); assert.ok(f.send(4).some(p => op(p) === 83));
    assert.equal(c.saved.titles!.selectedId, 0);
  } finally { f.cleanup(); }
});

test("títulos protocolo: captura não substitui coleção; flag de atributos segue desbloqueio verificado", () => {
  const f = fixture();
  try {
    const c = f.city; f.grant(26); c.persist();
    const captured = encodeMessage(titleSchemas.list, { appells: [{ appellId: 85, isGet: 1, value: "999" }] });
    const corrected = c.packet({ opcode: 4484, body: captured.toString("base64") });
    assert.equal(f.decode([corrected], 4484).appells.find((t: any) => t.appellId === 85).isGet, 0);
    assert.equal(f.decode(f.send(0, 1), 3).applle_property_Open, 0);
    c.state.player.grades = 45; c.state.quests[936] = { template_id: 936, is_complete: 1, is_accept: 0 }; c.persist();
    assert.equal(f.decode(f.send(0, 1), 3).applle_property_Open, 1);
    assert.ok(c.saved.attributes!.sources["titles:26"]);
  } finally { f.cleanup(); }
});

test("títulos protocolo: aviso novo usa nome correto sem trocar seleção; nativo somente para o título equipado", () => {
  const f = fixture();
  try {
    const c = f.city; f.send(0, 1); c.saved.labyrinth!.record = 100; c.persist();
    const updated = c.tick();
    assert.ok(updated.some(p => op(p) === 4484)); assert.ok(updated.some(p => op(p) === 111));
    assert.ok(!updated.some(p => op(p) === 4491));
    assert.ok(Buffer.from(updated.find(p => op(p) === 111)!.frame, "base64").includes(Buffer.from("Você obteve o título")));
    assert.equal(c.saved.titles!.selectedId, 0); assert.deepEqual(c.saved.titles!.pendingAcquisitions, []);
    assert.ok(!c.tick().some(p => [4484, 4491, 111].includes(op(p))));
    c.saved.titles!.pendingAcquisitions!.push({ titleId: 26, obtainedAt: f.now(), retroactive: false });
    const native = f.send(26);
    assert.equal(f.decode(native, 4491).appellId, 26);
    assert.ok(native.findIndex(p => op(p) === 3) < native.findIndex(p => op(p) === 4491));
    assert.ok(!native.some(p => op(p) === 111));
    const reloaded = new CityWorld(f.store, 1931, f.now);
    assert.ok(!reloaded.bootstrap().some(p => op(p) === 4491));
  } finally { f.cleanup(); }
});

test("títulos protocolo: pulso antes da inicialização do cliente conserva a fila de avisos", () => {
  const f = fixture();
  try {
    const c = f.city; c.saved.labyrinth!.record = 100; c.persist();
    const early = c.tick();
    assert.ok(!early.some(p => [4484, 4491].includes(op(p))));
    assert.equal(c.saved.titles!.pendingAcquisitions!.length, 1);
    const ready = f.send(0, 1);
    assert.ok(ready.some(p => op(p) === 4484));
    assert.ok(Buffer.from(ready.find(p => op(p) === 111)!.frame, "base64").includes(Buffer.from("Você obteve o título")));
    assert.deepEqual(c.saved.titles!.pendingAcquisitions, []);
  } finally { f.cleanup(); }
});

test("títulos protocolo: retroativos silenciosos, fila adiada em batalha e rollback mantém seleção e aviso pendente", () => {
  const f = fixture();
  try {
    const c = f.city; f.grant(26); c.saved.titles!.pendingAcquisitions = [{ titleId: 26, obtainedAt: f.now(), retroactive: true }]; c.persist();
    const retro = c.bootstrap();
    assert.ok(!retro.some(p => op(p) === 4491)); assert.deepEqual(c.saved.titles!.pendingAcquisitions, []);
    c.startBattle(0); f.grant(85); c.saved.titles!.pendingAcquisitions = [{ titleId: 85, obtainedAt: f.now(), retroactive: false }]; c.persist();
    assert.equal(pendingTitleNotifications(c.saved.titles!, titleCatalog, { job: 3, level: 12, now: f.now() }).text?.includes("Você obteve"), true);
    assert.ok(!c.tick().some(p => op(p) === 4491)); assert.equal(c.saved.titles!.pendingAcquisitions.length, 1);
    c.saved.battle!.finished = true;
    const before = structuredClone(c.saved.titles);
    f.store.db.exec("CREATE TRIGGER fail_title_ui BEFORE UPDATE ON tutorial_profiles BEGIN SELECT RAISE(ABORT,'forced title delivery failure'); END");
    assert.throws(() => f.send(26), /forced title delivery failure/);
    assert.deepEqual(c.saved.titles, before); assert.deepEqual(f.read().titles, before);
    f.store.db.exec("DROP TRIGGER fail_title_ui");
    const retry = f.send(26);
    assert.equal(titleIdentity(c.saved.titles!, titleCatalog, { job: 3, now: f.now(), level: 12 }).id, 26);
    assert.ok(retry.some(p => op(p) === 111)); assert.deepEqual(c.saved.titles!.pendingAcquisitions, []);
  } finally { f.cleanup(); }
});
