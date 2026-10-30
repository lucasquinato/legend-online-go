import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./config.js";
import { decodeMessage, PACKET_MESSAGES } from "./messages.js";
import {
  emptyCity,
  ingestCity,
  cityDiff,
  type CityPacket,
  type CityState,
} from "./city-state.js";
const mapping = JSON.parse(
  readFileSync(join(projectRoot, "reference/postcity-protocols.json"), "utf8"),
);
const selected = new Set([
  "d3163dc8-2781-4ac4-8435-e0e00f87c193",
  "98ff02b3-94a3-45ba-98c7-743338514876",
]);
const rows = readFileSync(
  join(projectRoot, "data/packets-2026-10-11.jsonl"),
  "utf8",
)
  .trim()
  .split("\n")
  .map((s) => JSON.parse(s))
  .filter((p) => selected.has(p.connection));
const incoming = { ...mapping.incoming, ...PACKET_MESSAGES };
const parse = (p: any): CityPacket => {
  const b = Buffer.from(p.frame, "base64"),
    name = incoming[p.opcode];
  try {
    return name
      ? { opcode: p.opcode, message: decodeMessage(name, b.subarray(20)) }
      : { opcode: p.opcode, body: b.subarray(20).toString("base64") };
  } catch {
    delete incoming[p.opcode];
    return { opcode: p.opcode, body: b.subarray(20).toString("base64") };
  }
};
const firstQuest = rows.findIndex(
  (p) => p.direction === "out" && p.opcode === 5014,
);
const state = emptyCity();
const initialPackets: Record<string, CityPacket> = {};
const transient = new Set([
  1, 6, 20, 21, 22, 52, 75, 83, 111, 125, 127, 128, 131, 134, 135, 137, 140,
  147, 153, 154, 156, 157, 4103, 4165, 4208, 4234,
]);
for (const p of rows.slice(0, firstQuest))
  if (p.direction === "in") {
    const packet = parse(p);
    ingestCity(state, packet);
    if (!transient.has(p.opcode)) initialPackets[p.opcode] = packet;
  }
const initial = structuredClone(state);
initial.packets = initialPackets;
const cases: any[] = [];
const battles: any[] = [];
const queries: any[] = [];
let query: any;
let current: any;
let before: CityState = structuredClone(state);
let activeBattle: any;
function close() {
  if (current) {
    current.patches = cityDiff(before, state).filter(
      (p) =>
        p.path[0] !== "packets" &&
        (current.opcode !== 15044 ||
          p.path[0] !== "farms" ||
          p.path[1] === String(current.request.friend_id)),
    );
    if (current.responses.length) cases.push(current);
  }
  current = undefined;
}
for (const p of rows.slice(firstQuest)) {
  if (p.direction === "out") {
    if (
      activeBattle?.finished &&
      ![5015, 20008, 20010, 5035].includes(p.opcode)
    ) {
      activeBattle.rewardPatches = cityDiff(activeBattle.before, state);
      activeBattle = undefined;
    }
    if (query?.responses.length) queries.push(query);
    const b = Buffer.from(p.frame, "base64");
    const name = mapping.outgoing[p.opcode];
    let request;
    try {
      request = name ? decodeMessage(name, b.subarray(20)) : undefined;
    } catch {}
    query = {
      opcode: p.opcode,
      request,
      body: b.subarray(20).toString("base64"),
      responses: [],
      at: p.at,
    };
    const mutator =
      [
        5014, 5012, 5017, 5155, 5156, 5039, 5038, 5025, 5125, 5180, 5184, 5185,
        5167, 8203, 5022, 5005, 8594, 8296,
      ].includes(p.opcode) ||
      (p.opcode === 5019 && request?.operate === 1) ||
      (p.opcode === 15044 && request?.op_type !== 0);
    if (mutator) {
      close();
      before = structuredClone(state);
      current = structuredClone(query);
    }
  } else {
    const packet = parse(p);
    if (packet.opcode === 157) close();
    if (
      current?.opcode === 8203 &&
      packet.opcode === 4130 &&
      current.responses.some((v: CityPacket) => v.opcode === 4130)
    ) {
      const next = structuredClone(current);
      close();
      before = structuredClone(state);
      current = { ...next, responses: [] };
    }
    if (
      current?.opcode === 15044 &&
      packet.opcode === 4387 &&
      packet.message?.farmLandInfo?.length === 1
    ) {
      const pos = packet.message.farmLandInfo[0].pos;
      if (pos !== current.request.pos) {
        const next = structuredClone(current);
        close();
        before = structuredClone(state);
        current = { ...next, request: { ...next.request, pos }, responses: [] };
      }
    }
    ingestCity(state, packet);
    if (query)
      query.responses.push({
        ...packet,
        delayMs: Math.max(0, Date.parse(p.at) - Date.parse(query.at)),
      });
    if (current)
      current.responses.push({
        ...packet,
        delayMs: Math.max(0, Date.parse(p.at) - Date.parse(current.at)),
      });
    if (packet.opcode === 157 && packet.message) {
      activeBattle = {
        prepare: packet.message,
        actions: [],
        before: structuredClone(state),
        rewards: [],
        trigger: structuredClone(current),
      };
      battles.push(activeBattle);
    }
    if (activeBattle && packet.opcode === 153)
      activeBattle.actions.push(packet.message);
    if (activeBattle && packet.opcode === 154) {
      activeBattle.finish = packet.message;
      activeBattle.finished = true;
    } else if (
      activeBattle?.finished &&
      ![1, 6, 75, 83, 111, 153, 154, 156, 157, 4234].includes(packet.opcode)
    )
      activeBattle.rewards.push(packet);
  }
}
if (activeBattle?.finished)
  activeBattle.rewardPatches = cityDiff(activeBattle.before, state);
close();
if (query?.responses.length) queries.push(query);
for (const b of battles) {
  b.heroStats = structuredClone(b.before.hero);
  b.rewards = b.rewards.filter((p: CityPacket) =>
    [3, 100, 109, 112, 113, 115, 128, 4103, 4205, 4373].includes(p.opcode),
  );
  delete b.before;
}
// These mail envelopes first appear after attachment withdrawal. Restore the
// unclaimed envelopes for local delivery; attachment rewards come from pickup cases.
for (const c of cases)
  for (const p of c.responses)
    if (p.opcode === 4131)
      for (const mail of p.message?.mailInfos ?? []) {
        if (!initial.mails[mail.id]) {
          const m = structuredClone(mail);
          for (let i = 1; i <= 5; i++) m["isAnnex" + i] = 0;
          initial.mails[m.id] = m;
        }
      }
const tower = queries
  .flatMap((c) => c.responses)
  .find((p) => p.opcode === 4205);
if (tower) ingestCity(initial, tower);
const ownFarm = queries
  .flatMap((c) => c.responses)
  .find((p) => p.opcode === 4386 && p.message?.user_id === 1810);
if (ownFarm) ingestCity(initial, ownFarm);
const friendFarm = queries
  .flatMap((c) => c.responses)
  .find((p) => p.opcode === 4386 && p.message?.user_id === 1605);
if (friendFarm) ingestCity(initial, friendFarm);
const questCatalog: Record<string, any> = {};
for (const p of rows.filter((p) => p.direction === "in" && p.opcode === 112))
  for (const q of parse(p).message?.quest ?? [])
    if (
      !questCatalog[q.template_id] ||
      (questCatalog[q.template_id].is_complete && !q.is_complete)
    )
      questCatalog[q.template_id] = q;
const dir = join(projectRoot, "data/city");
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "scenario.json"),
  JSON.stringify(
    {
      version: 1,
      userId: 1810,
      icon: 4,
      nickname: "lisertia",
      startedAt: rows[0].at,
      initial,
      cases,
      queries,
      questCatalog,
      battles,
      incoming,
      outgoing: mapping.outgoing,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    cases: cases.length,
    battles: battles.map((b) => ({
      map: b.prepare.map_temp_id,
      actions: b.actions.length,
    })),
    initialQuests: Object.keys(initial.quests),
    initialItems: Object.keys(initial.items),
    mails: Object.keys(initial.mails),
  }),
);
