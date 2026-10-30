import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createPublicKey, publicEncrypt, constants } from "node:crypto";
import { createConnection } from "node:net";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import { Store, ReplayAuth } from "../src/store.js";
import { GameServer } from "../src/game.js";
import { CityWorld } from "../src/city-world.js";
import { loadConfig, projectRoot } from "../src/config.js";
import { FrameReader, INITIAL_KEY, frame, crypt, protoString, protoInt } from "../src/protocol.js";
import { encodeMessage, decodeMessage, typeName, type Message } from "../src/messages.js";
import { skyMap, nearestGround, clearSegment } from "../src/features/sky-realm/map.js";
import { skills } from "../src/features/battle/content.js";

test("duas sessões TCP autenticadas veem entrada, caminhada, chat, saída e reconexão sem reiniciar", { timeout: 20000 }, async () => {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true }); const dir = mkdtempSync(join(projectRoot, ".test-data", "sky-tcp-"));
  for (const folder of ["city", "tutorial"]) { mkdirSync(join(dir, folder)); copyFileSync(join(projectRoot, "data", folder, "scenario.json"), join(dir, folder, "scenario.json")); }
  const store = new Store(dir), auth = new ReplayAuth(store), errors: string[] = [];
  for (const uid of [1981, 1982]) {
    await store.createUser("tcp" + uid, "test-password", uid); store.initTutorialProfile(uid);
    store.db.prepare("UPDATE tutorial_profiles SET active=1,icon=?,sex=1,nickname=?,process=36000 WHERE user_id=?").run(uid === 1981 ? 3 : 2, "TCP" + uid, uid);
    store.db.prepare("INSERT INTO tutorial_worlds(user_id,state) VALUES(?,?)").run(uid, JSON.stringify({ version: 1, wins: [0, 1, 2], process: 36000, cityEntered: true, complete: true, rewardCount: 3 }));
    const city = new CityWorld(store, uid); city.saved.map = 1; delete city.saved.battle; city.state.player.grades = 80; city.persist();
  }
  const config = { ...loadConfig(), dataDir: dir, mode: "tutorial" as const, tutorialEngine: "dynamic" as const, gamePort: 0, capturePackets: false };
  const game = new GameServer(config, store, auth, event => { if (event.includes("error")) errors.push(event); });
  const sockets: ReturnType<typeof createConnection>[] = [];
  try {
    await game.listen(); const port = (game.server.address() as { port: number }).port;
    async function client(uid: number) {
      const temporary = uid.toString(), ticket = store.issue(uid);
      const encrypted = publicEncrypt({ key: createPublicKey({ key: auth.jwk, format: "jwk" }), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(`tcp${uid}|${ticket}|${temporary}|${uid}`)).toString("base64");
      const login = auth.login(encrypted), key = Buffer.from([31, 42, 53, 64, 75, 86, 97, 108]), reader = new FrameReader(); reader.key = Buffer.from(key);
      const packets: Buffer[] = [], socket = createConnection({ host: "127.0.0.1", port }); sockets.push(socket);
      socket.on("data", chunk => reader.push(chunk, packet => packets.push(packet)));
      socket.on("error", () => {});
      const wait = async (opcode: number, after = 0) => {
        for (let n = 0; n < 150; n++) { const p = packets.slice(after).find(p => p.readUInt16BE(6) === opcode); if (p) return p; await pause(20); }
        throw Error(`Pacote ${opcode} ausente para ${uid}; recebidos ${packets.map(p => p.readUInt16BE(6)).join(",")}`);
      };
      await once(socket, "connect");
      socket.write(crypt(frame(20001, uid, Buffer.concat([protoString(2, login.proof), ...[...key].map(n => protoInt(3, n))])), Buffer.from(INITIAL_KEY)));
      await wait(3);
      return { uid, socket, packets, wait, raw(opcode: number, body: Buffer) { socket.write(crypt(frame(opcode, uid, body), key)); },
        send(opcode: number, schema: string, message: Message) { const after = packets.length; socket.write(crypt(frame(opcode, uid, encodeMessage(typeName(schema), message)), key)); return after; } };
    }
    const a = await client(1981), b = await client(1982);
    a.send(8688, "simple.PropertyMsg", { param1: 10000 }); await a.wait(4606);
    const mark = a.packets.length;
    b.send(8688, "simple.PropertyMsg", { param1: 10000 }); await b.wait(4606);
    const appearance = decodeMessage(typeName("room.RoomEnterMsg"), (await a.wait(4592, mark)).subarray(20));
    assert.equal(appearance.player[0].player_id, 1982); assert.equal(appearance.player[0].template_id, 2);
    const origin = nearestGround(skyMap.spawn), end = [{ x: origin.x + 1, y: origin.y }, { x: origin.x, y: origin.y + 1 }].find(p => clearSegment(origin, p, false))!;
    const moveMark = b.packets.length;
    a.send(8690, "campaign.SpacePlayerMoveMsg", { players: [{ playerId: 1981, path: [origin, end] }] });
    const movement = decodeMessage(typeName("campaign.SpacePlayerMoveMsg"), (await b.wait(4594, moveMark)).subarray(20));
    assert.equal(movement.players[0].playerId, 1981); assert.deepEqual(movement.players[0].path, [origin, end]);
    const chatMark = b.packets.length;
    a.send(15005, "chat.ChatChannelMsg", { channel: 8, encode_msg: "Teste local" });
    const chat = decodeMessage(typeName("chat.ChatChannelMsg"), (await b.wait(83, chatMark)).subarray(20)); assert.equal(chat.name, "TCP1981"); assert.equal(chat.channel, 8);
    assert.equal(a.packets.some(p => p.readUInt16BE(6) === 4594), false, "O autor não recebe eco da própria rota");
    const inspectMark = a.send(8200, "simple.InfoReqMsg", { other_id: 1982 });
    const inspected = decodeMessage(typeName("simple.InfoRspMsg"), (await a.wait(4128, inspectMark)).subarray(20)); assert.equal(inspected.info.userId, 1982);
    const inviteMark = b.packets.length;
    a.send(9547, "campaign.HangupAttackMsg", { attack_id: 1981, defence_id: 1982, op: 1 }); await b.wait(4421, inviteMark);
    const prepareMark = a.packets.length;
    const acceptMark = b.send(9547, "campaign.HangupAttackMsg", { attack_id: 1981, defence_id: 1982, op: 2 });
    const prepA = decodeMessage(typeName("battle.BattlePrepareMsg"), (await a.wait(157, prepareMark)).subarray(20));
    const prepB = decodeMessage(typeName("battle.BattlePrepareMsg"), (await b.wait(157, acceptMark)).subarray(20));
    assert.equal(prepA.battle_id, prepB.battle_id); assert.equal(prepB.side, 2);
    assert.deepEqual(prepA.heros.map((h: Message) => [h.user_id, h.temp_id]), [[1981, 3], [1982, 2]]);
    for (const mode of [1,2]) {
      const remoteMark=b.packets.length;
      const localMark=a.send(10020,"battle.AttackModeMsg",{battle_id:prepA.battle_id,mode});
      const local=decodeMessage(typeName("battle.AttackModeMsg"),(await a.wait(77,localMark)).subarray(20));
      const remote=decodeMessage(typeName("battle.AttackModeMsg"),(await b.wait(77,remoteMark)).subarray(20));
      assert.equal(local.userId,1981);assert.equal(local.mode,mode);assert.deepEqual(local,remote);
    }
    for (const c of [a, b]) c.raw(10007, protoString(2, prepA.battle_id));
    const battleMarkA = a.packets.length, battleMarkB = b.packets.length;
    for (const c of [a, b]) {
      const hero = prepA.heros.find((h: Message) => h.user_id === c.uid)!;
      const skill = hero.skillId.find((id: number) => Number(skills.get(id)?.UseWay) === 1)!;
      c.raw(10008, Buffer.concat([protoString(1, prepA.battle_id), protoInt(2, hero.living_id), protoInt(3, skill)]));
    }
    const actionA = decodeMessage(typeName("battle.AttackOrderMsg"), (await a.wait(153, battleMarkA)).subarray(20));
    const actionB = decodeMessage(typeName("battle.AttackOrderMsg"), (await b.wait(153, battleMarkB)).subarray(20));
    assert.deepEqual(actionA, actionB);
    const closeMark = b.packets.length, closed = once(a.socket, "close"); a.socket.end(); await closed;
    const leave = decodeMessage(typeName("campaign.SpacePlayerMoveMsg"), (await b.wait(4607, closeMark)).subarray(20)); assert.equal(leave.players[0].playerId, 1981);
    const result = decodeMessage(typeName("battle.BattleReportMsg"), (await b.wait(4103, closeMark)).subarray(20)); assert.equal(result.battle_result, 1); assert.equal(result.gp_bonus, 0);
    const resumed = await client(1981); resumed.send(8271, "simple.PropertyMsg", {});
    const entry = decodeMessage(typeName("room.RoomEnterMsg"), (await resumed.wait(4595)).subarray(20)); assert.equal(entry.player[0].cur_pos_x, end.x); assert.equal(entry.player[0].cur_pos_y, end.y);
    const exitMark = b.packets.length; resumed.send(8747, "simple.PropertyMsg", { param7: 1 }); await b.wait(4607, exitMark);
    assert.equal(game.server.listening, true); assert.deepEqual(errors, []);
  } finally {
    for (const s of sockets) s.destroy(); await game.close(); store.close(); rmSync(dir, { recursive: true, force: true });
  }
});
