import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import { Store } from "../src/store.js";
import { CityWorld } from "../src/city-world.js";
import { frame, protoInt, protoString } from "../src/protocol.js";
import { encodeMessage, decodeMessage, typeName, type Message } from "../src/messages.js";
import { skySchemas } from "../src/features/sky-realm/protocol.js";
import { skyHub } from "../src/features/sky-realm/hub.js";
import { skyMap, walkable, nearestGround, clearSegment } from "../src/features/sky-realm/map.js";
import { mounts } from "../src/features/mounts/content.js";
import { GlobalChat } from "../src/features/messaging/global-chat.js";
import type { TutorialResponse } from "../src/tutorial.js";

const outgoing: Record<number, string> = { 8688: "simple.PropertyMsg", 8689: "simple.PropertyMsg", 8747: "simple.PropertyMsg",
  8690: "campaign.SpacePlayerMoveMsg", 8701: "campaign.SpacePlayerArmyInfoReqMsg", 8700: "simple.PropertyMsg", 8692: "simple.PropertyMsg",
  15038: "simple.InfoReqMsg", 8200: "simple.InfoReqMsg", 8199: "simple.DetailReqMsg", 5035: "player.PlayerStateMsg",
  9547: "campaign.HangupAttackMsg", 10020: "battle.AttackModeMsg", 10499: "battle.BattleItemMsg" };
const opcode = (p: TutorialResponse) => Buffer.from(p.frame, "base64").readUInt16BE(6);
const message = (p: TutorialResponse) => decodeMessage(typeName(skySchemas[opcode(p)]!), Buffer.from(p.frame, "base64").subarray(20));

test("duelo: automático independente nos dois lados, comando autenticado e habilidades reais", async t=>{
  let now=1900000000000;t.mock.method(Date,"now",()=>now);
  const s=await setup();try {
    for(let i=0;i<2;i++)s.send(i,8688,{param1:10000});
    s.worlds.forEach(w=>w.tick());s.send(0,9547,{attack_id:1901,defence_id:1902,op:1});s.worlds[1]!.tick();
    const p=message(s.send(1,9547,{attack_id:1901,defence_id:1902,op:2}).find(p=>opcode(p)===157)!);
    s.worlds[0]!.tick();
    const toggle=(i:number,mode:number,extra={})=>s.send(i,10020,{battle_id:p.battle_id,mode,...extra});
    assert.equal(toggle(0,1,{userId:1902}).some(p=>opcode(p)===77),false);
    assert.equal(toggle(0,1,{battle_id:"old"}).some(p=>opcode(p)===77),false);
    assert.ok(toggle(0,1).some(p=>opcode(p)===77));
    const remote=message(s.worlds[1]!.tick().find(p=>opcode(p)===77)!);assert.equal(remote.userId,1901);assert.equal(remote.mode,1);
    assert.ok(toggle(1,1).some(p=>opcode(p)===77));
    const other=message(s.worlds[0]!.tick().find(p=>opcode(p)===77)!);assert.equal(other.userId,1902);assert.equal(other.mode,1);
    for(let i=0;i<2;i++)s.worlds[i]!.handle(frame(10007,s.worlds[i]!.userId,protoString(2,p.battle_id)));
    const actions:Message[]=[];
    for(let n=0;n<6;n++) {
      now+=5000;const events=s.worlds[0]!.tick();s.worlds[1]!.tick();
      actions.push(...events.filter(p=>opcode(p)===153).map(message));
      if(events.some(p=>opcode(p)===4103))break;
    }
    assert.ok(actions.some(a=>a.living_id===3&&a.order_id!==30000));
    assert.ok(actions.some(a=>a.living_id===6&&a.order_id!==20000));
  }finally{s.cleanup();}
});
async function setup() {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const dir = mkdtempSync(join(projectRoot, ".test-data", "sky-realm-")); mkdirSync(join(dir, "city"));
  copyFileSync(join(projectRoot, "data/city/scenario.json"), join(dir, "city/scenario.json"));
  const store = new Store(dir), worlds: CityWorld[] = [];
  for (const [uid, icon] of [[1901, 3], [1902, 5], [1903, 1]]) {
    await store.createUser("sky" + uid, "test-password", uid); store.initTutorialProfile(uid!);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,sex=?,nickname=?,process=36000 WHERE user_id=?").run(icon!, icon! <= 3 ? 1 : 0, "Player" + uid, uid!);
    const city = new CityWorld(store, uid!, () => 1900000000000);
    city.saved.map = 1; delete city.saved.battle; city.state.player.grades = 80; city.persist(); worlds.push(city);
  }
  const send = (n: number, op: number, m: Message = {}) => worlds[n]!.handle(frame(op, worlds[n]!.userId, op === 5035 ? Buffer.alloc(0) : encodeMessage(typeName(outgoing[op]!), m)));
  return { store, worlds, send, cleanup() { for (const w of worlds) w.disconnect(); store.close(); rmSync(dir, { force: true, recursive: true }); } };
}

test("grade original limita caminhada e voo aos limites físicos do mapa", () => {
  const start = nearestGround(skyMap.spawn); assert.ok(walkable(start));
  let ground = 0; for (let y = 0; y < skyMap.height; y++) for (let x = 0; x < skyMap.width; x++) if (walkable({ x, y })) ground++;
  assert.equal(ground, 35814); assert.equal(clearSegment(start, { x: -1, y: 0 }, true), false);
  assert.equal(clearSegment(start, { x: 0, y: 0 }, false), false);
  assert.equal(clearSegment(start, { x: 0, y: 0 }, true), true);
});

test("entrada, consulta e presença usam três identidades locais, sem jogadores herdados", async () => {
  const s = await setup(); try {
    const first = s.send(0, 8688, { param1: 10000 });
    assert.deepEqual(first.filter(p => [4595, 4606, 4597].includes(opcode(p))).map(opcode), [4595, 4606, 4597]);
    const self = message(first[0]!).player[0]; assert.equal(self.player_id, 1901); assert.equal(self.template_id, 3); assert.equal(self.nick_name, "Player1901");
    s.send(1, 8688, { param1: 10000 });
    const notice = s.worlds[0]!.tick().find(p => opcode(p) === 4592)!; assert.equal(message(notice).player[0].player_id, 1902);
    s.send(2, 8688, { param1: 10000 });
    const response = s.send(0, 8701, { userList: [1901, 1902, 1903, 1265, 999999, 1902] }).find(p => opcode(p) === 4597)!;
    assert.deepEqual(message(response).player.map((p: Message) => [p.player_id, p.template_id]), [[1901, 3], [1902, 5], [1903, 1]]);
    assert.equal(s.worlds[0]!.saved.map, 10000);
    const before = structuredClone(s.worlds[0]!.saved.skyRealm);
    assert.deepEqual(s.send(0, 8692, { param1: 2 }).filter(p => opcode(p) === 4601), []);
    s.send(0, 5035); assert.deepEqual(s.worlds[0]!.saved.skyRealm, before);
  } finally { s.cleanup(); }
});

test("trajetos são difundidos uma vez, recusam paredes, limites e identidade forjada", async () => {
  const s = await setup(); try {
    s.send(0, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 }); s.worlds[0]!.tick();
    const start = s.worlds[0]!.saved.skyRealm!.position;
    const end = [{ x: start.x + 1, y: start.y }, { x: start.x, y: start.y + 1 }, { x: start.x - 1, y: start.y }].find(p => clearSegment(start, p, false))!;
    assert.ok(end);
    const move = s.send(0, 8690, { players: [{ playerId: 1901, path: [start, end] }] });
    assert.equal(move.filter(p => [4594, 4126].includes(opcode(p))).length, 0);
    const peer = s.worlds[1]!.tick().filter(p => opcode(p) === 4594); assert.equal(peer.length, 1);
    assert.deepEqual(message(peer[0]!).players[0].path, [start, end]);
    assert.equal(s.worlds[1]!.tick().some(p => opcode(p) === 4594), false);
    const bad = s.send(0, 8690, { players: [{ playerId: 1901, path: [{ x: 0, y: 0 }] }] });
    assert.ok(bad.some(p => opcode(p) === 4126)); assert.deepEqual(s.worlds[0]!.saved.skyRealm!.position, end);
    const forged = s.send(0, 8690, { players: [{ playerId: 1902, path: [end] }] });
    assert.ok(forged.some(p => opcode(p) === 83)); assert.deepEqual(s.worlds[0]!.saved.skyRealm!.position, end);
    assert.ok(s.send(0, 8690, { players: [{ playerId: 1901, path: [{ x: 450, y: 0 }] }] }).some(p => opcode(p) === 4126));
  } finally { s.cleanup(); }
});

test("montaria voadora atravessa obstáculos; desmontar restaura terreno e sincroniza visual", async () => {
  const s = await setup(); try {
    const w = s.worlds[0]!, flying = [...mounts.values()].find(m => Number(m.IsFly) === 1)!; assert.ok(flying);
    const id = Number(flying.TemplateId);
    Object.assign(w.saved.mounts!, { selected: id, mounted: true });
    w.saved.mounts!.owned[id] = { id, activatedAt: 1, expiresAt: null, stars: 0, blessing: 0, flightUnlocked: false }; w.persist();
    assert.equal(w.saved.mounts!.mobility.mode, "air-capable");
    s.send(0, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 });
    const response = s.send(0, 8690, { players: [{ playerId: 1901, path: [{ x: 0, y: 0 }] }] });
    assert.equal(response.some(p => [4594, 4126].includes(opcode(p))), false); assert.deepEqual(w.saved.skyRealm!.position, { x: 0, y: 0 });
    w.saved.mounts!.mounted = false; w.persist();
    const landing = w.tick(); assert.ok(landing.some(p => opcode(p) === 4126)); assert.ok(walkable(w.saved.skyRealm!.position));
    const peer = s.worlds[1]!.tick().filter(p => opcode(p) === 4597).at(-1)!; assert.equal(message(peer).player[0].mount_tempId, 0);
  } finally { s.cleanup(); }
});

test("alterar o destino durante uma rota curva aceita a posição intermediária do cliente", async () => {
  const s = await setup(); try {
    s.send(0, 8688, { param1: 10000 }); const w = s.worlds[0]!, origin = w.saved.skyRealm!.position;
    const queue = [origin], parents = new Map<string, typeof origin | undefined>([[`${origin.x},${origin.y}`, undefined]]);
    let end: typeof origin | undefined;
    for (let i = 0; i < queue.length && i < 20000 && !end; i++) {
      const from = queue[i]!;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const p = { x: from.x + dx!, y: from.y + dy! }, key = `${p.x},${p.y}`;
        if (parents.has(key) || !walkable(p)) continue;
        parents.set(key, from); queue.push(p); if (!clearSegment(origin, p, false)) { end = p; break; }
      }
    }
    assert.ok(end); const route = [end!]; let p = parents.get(`${end!.x},${end!.y}`);
    while (p) { route.unshift(p); p = parents.get(`${p.x},${p.y}`); }
    assert.equal(s.send(0, 8690, { players: [{ playerId: 1901, path: route }] }).some(p => [4594, 4126].includes(opcode(p))), false);
    assert.equal(s.send(0, 8690, { players: [{ playerId: 1901, path: [origin] }] }).some(p => [4594, 4126].includes(opcode(p))), false);
    assert.deepEqual(w.saved.skyRealm!.position, origin);
  } finally { s.cleanup(); }
});

test("saída, desconexão e reconexão conservam posição e não deixam fantasmas", async () => {
  const s = await setup(); try {
    s.send(0, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 });
    const position = structuredClone(s.worlds[0]!.saved.skyRealm!.position);
    s.worlds[0]!.disconnect();
    assert.ok(s.worlds[1]!.tick().some(p => opcode(p) === 4607 && message(p).players[0].playerId === 1901));
    s.worlds[0] = new CityWorld(s.store, 1901, () => 1900000000000);
    const reconnect = s.worlds[0]!.bootstrap();
    assert.ok(reconnect.some(p => opcode(p) === 4595)); assert.deepEqual(s.worlds[0]!.saved.skyRealm!.position, position);
    s.send(0, 8747, { param7: 1 }); assert.equal(s.worlds[0]!.saved.map, 1); assert.equal(skyHub(s.store).members.has(1901), false);
    s.send(0, 8688, { param1: 10000 }); assert.deepEqual(s.worlds[0]!.saved.skyRealm!.position, position);
    s.send(0, 8689, { param1: 0 }); assert.equal(s.worlds[0]!.saved.map, 1);
  } finally { s.cleanup(); }
});

test("inspeção entrega apenas o personagem solicitado e seus equipamentos equipados", async () => {
  const s = await setup(); try {
    s.send(0, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 });
    const simple = s.send(0, 15038, { other_id: 1902, from: 1 }).find(p => opcode(p) === 4256)!;
    assert.equal(message(simple).player.userId, 1902); assert.equal(message(simple).player.pics, 5);
    const details = s.send(0, 8199, { other_id: 1902, item_info: 1, hero_info: 1, army_info: 1 }).find(p => opcode(p) === 4125)!;
    const m = message(details); assert.equal(m.other_id, 1902); assert.equal(m.army.simple_hero.tempate_id, 5);
    assert.ok(m.item.every((i: Message) => i.bag_type === 4 && i.user_id === 1902));
    const missing = s.send(0, 15038, { other_id: 9999 }).find(p => opcode(p) === 4256)!;
    assert.equal(message(missing).player.isExist, 0);
  } finally { s.cleanup(); }
});

test("link do chat consulta 8200, relação e equipamentos mesmo fora do Reino e com o alvo offline", async () => {
  const s = await setup(); try {
    const before = JSON.stringify(s.worlds[1]!.saved);
    const simple = s.send(0, 8200, { other_id: 1902, from: 0 }).find(p => opcode(p) === 4128)!;
    assert.equal(message(simple).info.userId, 1902); assert.equal(message(simple).info.pics, 5); assert.equal(message(simple).from, 0);
    const detail = message(s.send(0, 8199, { other_id: 1902, item_info: 1, hero_info: 1 }).find(p => opcode(p) === 4125)!);
    assert.equal(detail.army.simple_hero.player_id, 1902); assert.equal(detail.army.simple_hero.tempate_id, 5);
    assert.equal(detail.army.simple_hero.total_magic_attack, s.worlds[1]!.state.hero.total_magic_attack);
    assert.ok(detail.item.every((i: Message) => i.bag_type === 4 && i.user_id === 1902));
    assert.equal(JSON.stringify(s.worlds[1]!.saved), before);
    const missing = message(s.send(0, 8200, { other_id: 99999 }).find(p => opcode(p) === 4128)!);
    assert.equal(missing.info.isExist, 0);
  } finally { s.cleanup(); }
});

test("duelo nativo exige convite e aceite, aguarda os dois loaders e valida o ator de cada sessão", async t => {
  let now = 1900000000000; t.mock.method(Date, "now", () => now);
  const s = await setup(); try {
    for (let i = 0; i < 3; i++) s.send(i, 8688, { param1: 10000 });
    for (const w of s.worlds) w.tick();
    const snapshot = s.worlds.map(w => structuredClone(w.state));
    assert.ok(s.send(2, 9547, { attack_id: 1901, defence_id: 1902, op: 2 }).some(p => opcode(p) === 83));
    s.send(0, 9547, { attack_id: 1901, defence_id: 1902, attack_name: "forjado", op: 1 });
    const invitation = message(s.worlds[1]!.tick().find(p => opcode(p) === 4421)!);
    assert.equal(invitation.attack_name, "Player1901");
    assert.equal(s.worlds[2]!.tick().some(p => opcode(p) === 4421), false);
    const accepted = s.send(1, 9547, { attack_id: 1901, defence_id: 1902, op: 2 });
    const p2 = message(accepted.find(p => opcode(p) === 157)!);
    const p1 = message(s.worlds[0]!.tick().find(p => opcode(p) === 157)!);
    assert.equal(p1.battle_id, p2.battle_id); assert.equal(p1.side, 1); assert.equal(p2.side, 2);
    for (const p of [p1, p2]) for (const h of p.heros) {
      assert.ok(!("reject_types" in h));assert.ok(!("runes" in h));assert.ok(!("permanentModifiers" in h));
      assert.equal(h.hp2, 0, "O Flash desreferencia hp2 como Int64 mesmo sem vida secundária");
      assert.equal(h.init_hp2, 0); assert.equal(h.res, ""); assert.equal(h.cloak_path, "");
    }
    if (process.env.DUEL_PREPARE_FIXTURE) {
      const broken = structuredClone(p1); for (const h of broken.heros) delete h.hp2;
      const native = (uid: number, m: Message) => frame(157, uid, encodeMessage(typeName("battle.BattlePrepareMsg"), m)).toString("hex");
      writeFileSync(process.env.DUEL_PREPARE_FIXTURE, JSON.stringify({ broken: native(1901, broken), samples: [
        { uid: 1901, packet: native(1901, p1) }, { uid: 1902, packet: native(1902, p2) },
      ] }, null, 2));
    }
    assert.deepEqual(p1.heros.map((h: Message) => [h.user_id, h.temp_id, h.living_id]), [[1901, 3, 3], [1902, 5, 6]]);
    assert.equal(p1.map_temp_id, 10000); assert.equal(p1.battle_type, 14);
    const ready = (i: number) => s.worlds[i]!.handle(frame(10007, s.worlds[i]!.userId, protoString(2, p1.battle_id)));
    ready(0); now += 5000;
    assert.equal(s.worlds[0]!.tick().some(p => opcode(p) === 153), false);
    ready(1);
    const cast = (i: number, actor: number, skill: number) => s.worlds[i]!.handle(frame(10008, s.worlds[i]!.userId,
      Buffer.concat([protoString(1, p1.battle_id), protoInt(2, actor), protoInt(3, skill)])));
    const archerSkill = p2.heros[1].skillId.find((id: number) => id >= 20000 && id < 30000)!;
    const forged = cast(0, 6, archerSkill).find(p => opcode(p) === 75)!;
    assert.equal(message(forged).result, 1);
    const first = p1.heros[0].skillId.find((id: number) => id >= 30000 && id < 40000)!;
    const a = cast(0, 3, first).find(p => opcode(p) === 75)!;
    assert.equal(message(a).result, 0);
    const castResult = cast(1, 6, archerSkill);
    const b = castResult.find(p => opcode(p) === 75)!; assert.equal(message(b).result, 0);
    now += 5000;
    const aEvents = s.worlds[0]!.tick().filter(p => opcode(p) === 153).map(message);
    const bEvents = [...castResult, ...s.worlds[1]!.tick()].filter(p => opcode(p) === 153).map(message);
    assert.ok(aEvents.length > 0); assert.deepEqual(aEvents, bEvents);
    assert.equal(s.worlds[2]!.tick().some(p => opcode(p) === 153), false);
    s.worlds[1]!.disconnect();
    const result = message(s.worlds[0]!.tick().find(p => opcode(p) === 4103)!);
    assert.equal(result.battle_result, 1); assert.equal(result.gp_bonus, 0); assert.deepEqual(result.baseItem ?? [], []);
    for (const [i, w] of s.worlds.entries()) {
      assert.equal(w.state.hero.hp, snapshot[i]!.hero.hp);
      assert.deepEqual(w.state.items, snapshot[i]!.items); assert.deepEqual(w.state.economy, snapshot[i]!.economy);
    }
  } finally { s.cleanup(); }
});

test("duelo preserva runas dos dois participantes e aceita o comando nativo sem campos internos no pacote", async t => {
  let now=1900000000000;t.mock.method(Date,"now",()=>now);
  const s=await setup();try{
    for(let i=0;i<2;i++){
      const w=s.worlds[i]!;w.saved.runes={version:1,day:"2030-03-17",learned:{1:{id:101,xp:0,swallowed:0}},keys:[1,-1]};w.persist();s.send(i,8688,{param1:10000});
    }
    for(const w of s.worlds)w.tick();
    s.send(0,9547,{attack_id:1901,defence_id:1902,op:1});s.worlds[1]!.tick();
    const accepted=s.send(1,9547,{attack_id:1901,defence_id:1902,op:2});
    const p2=message(accepted.find(p=>opcode(p)===157)!),p1=message(s.worlds[0]!.tick().find(p=>opcode(p)===157)!);
    assert.equal(p1.battle_id,p2.battle_id);
    for(const p of [p1,p2])for(const h of p.heros){assert.ok(!("reject_types" in h));assert.equal(h.item[0].skillTempId,9101);assert.equal(h.item[0].userId,h.living_id);assert.equal(h.item[0].battleId,p.battle_id);}
    for(let i=0;i<2;i++)s.worlds[i]!.handle(frame(10007,s.worlds[i]!.userId,protoString(2,p1.battle_id)));
    for(let i=0;i<2;i++){
      const response=s.send(i,10499,{battleId:p1.battle_id,userId:i===0?3:6,skillTempId:9101});
      assert.equal(message(response.find(p=>opcode(p)===158)!).result,0);
    }
    const events=[...s.worlds[0]!.tick(),...s.worlds[1]!.tick()];
    for(let i=0;i<20&&!([3,6].every(living=>events.some(p=>opcode(p)===158&&message(p).living_id===living&&message(p).count===0)));i++){now+=500;events.push(...s.worlds[0]!.tick(),...s.worlds[1]!.tick());}
    for(const living of [3,6])assert.ok(events.some(p=>opcode(p)===158&&message(p).living_id===living&&message(p).count===0));
    assert.equal(message(s.send(1,10499,{battleId:p1.battle_id,userId:6,skillTempId:9101}).find(p=>opcode(p)===158)!).result,1);
  }finally{s.cleanup();}
});
test("duelo conclui com resultado oposto para cada lado; recusa e expiração não iniciam combate", async t => {
  let now = 1900000000000; t.mock.method(Date, "now", () => now);
  const s = await setup(); try {
    s.send(0, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 });
    const invite = () => s.send(0, 9547, { attack_id: 1901, defence_id: 1902, op: 1 });
    invite(); s.send(1, 9547, { attack_id: 1901, defence_id: 1902, op: 3 });
    assert.equal(s.worlds[0]!.tick().some(p => opcode(p) === 157), false);
    now += 4000; invite(); now += 11000; s.worlds[0]!.tick();
    assert.equal(s.send(1, 9547, { attack_id: 1901, defence_id: 1902, op: 2 }).some(p => opcode(p) === 157), false);
    now += 4000;
    // Fixture balance ensures a short, natural victory without modifying account sources.
    for (const w of s.worlds.slice(0, 2)) Object.assign(w.state.hero, { total_live: 1000, total_phy_attack: 500, total_magic_attack: 500,
      total_phy_defence: 0, total_magic_defence: 0 });
    invite(); const accept = s.send(1, 9547, { attack_id: 1901, defence_id: 1902, op: 2 });
    const prepare = message(accept.find(p => opcode(p) === 157)!); s.worlds[0]!.tick();
    for (const w of s.worlds.slice(0, 2)) w.handle(frame(10007, w.userId, protoString(2, prepare.battle_id)));
    const results: Message[][] = [[], []];
    for (let n = 0; n < 100 && !results[0]!.length; n++) {
      now += 5000;
      for (let i = 0; i < 2; i++) results[i]!.push(...s.worlds[i]!.tick().filter(p => opcode(p) === 4103).map(message));
    }
    assert.equal(results[0]!.length, 1); assert.equal(results[1]!.length, 1);
    assert.deepEqual(results.map(r => r[0]!.battle_result).sort(), [1, 2]);
    assert.ok(s.worlds.slice(0, 2).every(w => w.saved.map === 10000 && !w.saved.battle));
  } finally { s.cleanup(); }
});

test("guerreiro também duela; falta de carregamento cancela e libera ambos sem salvar batalha na conta", async t => {
  let now = 1900000000000; t.mock.method(Date, "now", () => now);
  const s = await setup(); try {
    s.send(2, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 });
    s.worlds[2]!.saved.attributes!.sources.duelFuryFixture = { kind: "other", evidence: "local-balance", values: { total_initial_fury: 130 } };
    s.send(2, 9547, { attack_id: 1903, defence_id: 1902, op: 1 });
    const accepted = s.send(1, 9547, { attack_id: 1903, defence_id: 1902, op: 2 });
    const prepare = message(accepted.find(p => opcode(p) === 157)!);
    assert.deepEqual(prepare.heros.map((h: Message) => [h.user_id, h.temp_id]), [[1903, 1], [1902, 5]]);
    const warrior = prepare.heros[0]; assert.equal(warrior.hp, s.worlds[2]!.state.hero.total_live);
    assert.equal(warrior.sp, 100);
    s.send(2, 8689); assert.equal(s.worlds[2]!.saved.map, 10000);
    assert.equal(skyHub(s.store).duels.busy(1903), true);
    now += 31000;
    const canceled = s.worlds[2]!.tick().find(p => opcode(p) === 4103)!;
    assert.equal(message(canceled).battle_result, 0);
    assert.equal(canceled.battleId, prepare.battle_id);
    now += 2000;
    assert.equal(skyHub(s.store).duels.busy(1903), false);
    s.send(2, 8689); assert.equal(s.worlds[2]!.saved.map, 1);
    assert.equal(s.worlds[2]!.saved.battle, undefined); assert.equal(s.worlds[1]!.saved.battle, undefined);
  } finally { s.cleanup(); }
});

test("falha de save não anuncia entrada nem movimento e preserva o estado anterior", async () => {
  const s = await setup(); try {
    const w = s.worlds[0]!, persist = w.persist.bind(w); w.persist = () => { throw Error("save failed"); };
    assert.throws(() => s.send(0, 8688, { param1: 10000 }), /save failed/);
    assert.equal(w.saved.map, 1); assert.equal(skyHub(s.store).members.size, 0);
    w.persist = persist; s.send(0, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 });
    s.worlds[1]!.tick(); const before = structuredClone(w.saved.skyRealm);
    w.persist = () => { throw Error("save failed"); };
    assert.throws(() => s.send(0, 8690, { players: [{ playerId: 1901, path: [before!.position] }] }), /save failed/);
    assert.deepEqual(w.saved.skyRealm, before); assert.equal(s.worlds[1]!.tick().some(p => opcode(p) === 4594), false);
    w.persist = persist;
  } finally { s.cleanup(); }
});

test("chat local e privado respeitam presença; amizade usa a solicitação e aceitação existentes", async () => {
  const s = await setup(); try {
    s.send(0, 8688, { param1: 10000 }); s.send(1, 8688, { param1: 10000 });
    let now = 100000; const chat = new GlobalChat(s.store, () => now), inbox = new Map<number, TutorialResponse[]>();
    for (const w of s.worlds) { inbox.set(w.userId, []); chat.attach(w.userId, p => inbox.get(w.userId)!.push(...p)); }
    const sendChat = (channel: number, other_id = 0) => chat.handle(1901, frame(15005, 1901, encodeMessage(typeName("chat.ChatChannelMsg"), { channel, other_id, name: "forged", encode_msg: "Olá" })));
    sendChat(8); assert.equal(inbox.get(1901)!.length, 1); assert.equal(inbox.get(1902)!.length, 1); assert.equal(inbox.get(1903)!.length, 0);
    now += 2000; sendChat(20, 1902); assert.equal(inbox.get(1902)!.length, 2); assert.equal(inbox.get(1903)!.length, 0);
    const privateMsg = decodeMessage(typeName("chat.ChatChannelMsg"), Buffer.from(inbox.get(1902)![1]!.frame, "base64").subarray(20));
    assert.equal(privateMsg.name, "Player1901"); assert.equal(privateMsg.receive_name, "Player1902");
    now += 2000; sendChat(20, 1903); assert.equal(inbox.get(1903)!.length, 1);
    now += 2000;
    const im = (target: number) => chat.handle(1901, frame(15023, 1901, encodeMessage(typeName("im.ChatFriendMsg"), { from_id: 1903, from_nick: "forged", to_id: target, encode_msg: "Mensagem privada" })));
    const receivedBefore = inbox.get(1902)!.length;
    im(1902);
    const received = inbox.get(1902)!.slice(receivedBefore); assert.equal(received.length, 1); assert.equal(opcode(received[0]!), 4231);
    const imMessage = decodeMessage(typeName("im.ChatFriendMsg"), Buffer.from(received[0]!.frame, "base64").subarray(20));
    assert.equal(imMessage.from_id, 1901); assert.equal(imMessage.from_nick, "Player1901");
    now += 2000; im(1903); assert.equal(inbox.get(1903)!.length, 2);
    const failure = inbox.get(1901)!.at(-1)!; assert.equal(opcode(failure), 4236);
    assert.equal(decodeMessage(typeName("im.ChatFriendMsg"), Buffer.from(failure.frame, "base64").subarray(20)).result, 1);
    for (const [caller, other] of [[0, 1902], [1, 1901]]) {
      const w = s.worlds[caller!]!; const request = encodeMessage(w.scenario.outgoing[15003]!, { other_id: other, relation: 1 });
      w.handle(frame(15003, w.userId, request));
    }
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM local_friends WHERE owner_id IN (1901,1902)").get()!.n, 2);
  } finally { s.cleanup(); }
});
