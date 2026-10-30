// Audit a bounded capture snapshot while the gateway remains online.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { decodeMessage, PACKET_MESSAGES } from "../dist/messages.js";
import { checksum, HEADER } from "../dist/protocol.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markerPath = resolve(root, process.argv[2] ?? "data/checkpoints/campaign-capture-2026-10-12T17-24-27.825Z.json");
if (!markerPath.startsWith(root + "/") && !markerPath.startsWith(root + "\\")) throw new Error("Marco fora do backend");
const marker = JSON.parse(readFileSync(markerPath));
const now = new Date().toISOString();
const folder = join(root, "data/backups", "campaign-session-" + now.replaceAll(":", "-"));
mkdirSync(folder);
const out = join(root, "reports/capturas", "campanha-" + now.replaceAll(":", "-"));
mkdirSync(out, { recursive: true });
const db = new DatabaseSync(join(root, "data/state.sqlite"));
db.prepare("VACUUM INTO ?").run(join(folder, "state.sqlite"));
db.close();
const snapshot = new DatabaseSync(join(folder, "state.sqlite"), { readOnly: true });
const assets = snapshot.prepare("SELECT * FROM assets ORDER BY path,id").all();
const failures = snapshot.prepare("SELECT path,status,bytes,seen_at FROM dependencies WHERE seen_at>=? AND status<>200 ORDER BY path").all(marker.startedAt);
snapshot.close();
const maps = JSON.parse(readFileSync(join(root, "reference/postcity-protocols.json")));
const city = JSON.parse(readFileSync(join(root, "data/city/scenario.json")));
const incoming = { ...maps.incoming, ...city.incoming, ...PACKET_MESSAGES };
const outgoing = { ...maps.outgoing, ...city.outgoing };
const catalog = JSON.parse(readFileSync(join(root, "reports/missoes/missoes.json")));
const titles = Object.fromEntries(catalog.missions.filter(r => r.sourceTable === "QuestTemps").map(r => [r.id, r.title]));
const tcp = [], http = [], malformed = [], files = [];
const starts = new Map(marker.files.map(f => [f.path.replaceAll("\\", "/"), f.bytes]));
function capture(path, type) {
  const local = join(root, path), bytes = readFileSync(local);
  // Only complete JSONL records enter the snapshot.
  const end = bytes.lastIndexOf(10) + 1, complete = bytes.subarray(0, end);
  const start = starts.get(path) ?? 0;
  if (start > end) throw new Error("Log foi truncado desde o marco: " + path);
  const target = join(folder, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, complete);
  files.push({ path, startOffset: start, endOffset: end, sha256: createHash("sha256").update(complete).digest("hex"), pendingBytes: bytes.length - end });
  for (const [index, line] of complete.subarray(start).toString("utf8").split("\n").entries()) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      if (row.at >= marker.startedAt) (type === "tcp" ? tcp : http).push(row);
    } catch { malformed.push({ path, index }); }
  }
}
for (const file of readdirSync(join(root, "data")))
  if (/^packets-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) capture("data/" + file, "tcp");
for (const file of readdirSync(join(root, "data/http")))
  if (/^http-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) capture("data/http/" + file, "http");
copyFileSync(markerPath, join(folder, "capture-start.json"));
const counts = {}, actions = {}, badFrames = [], decodeIssues = [], noSchemas = {}, energy = [], profiles = {}, campaignEntries = [], sceneLoads = [], campaignCards = [], battles = [], battleReports = [], quests = [];
function count(object, key) { object[key] = (object[key] ?? 0) + 1; }
for (const p of tcp) {
  count(counts, p.direction + ":" + p.opcode);
  const bytes = Buffer.from(p.frame, "base64");
  if (bytes.length < 20 || bytes.readUInt16BE(0) !== HEADER || bytes.readUInt16BE(2) !== bytes.length || bytes.readUInt16BE(4) !== checksum(bytes) || bytes.readUInt16BE(6) !== p.opcode) {
    badFrames.push({ at: p.at, opcode: p.opcode });
    continue;
  }
  const name = (p.direction === "in" ? incoming : outgoing)[p.opcode];
  let m;
  if (!name) count(noSchemas, p.direction + ":" + p.opcode);
  else try { m = decodeMessage(name, bytes.subarray(20)); }
  catch (error) { decodeIssues.push({ opcode: p.opcode, direction: p.direction, name, error: error.message }); }
  if (p.direction === "out" && ![20008, 20010].includes(p.opcode)) {
    const entry = actions[p.opcode] ??= { opcode: p.opcode, name, count: 0, requests: [], first: p.at, last: p.at };
    entry.count++; entry.last = p.at;
    if (m && !entry.requests.some(r => JSON.stringify(r) === JSON.stringify(m))) entry.requests.push(m);
  }
  if (!m) continue;
  if (p.direction === "out" && p.opcode === 5039) campaignEntries.push({ at: p.at, userId: p.userId, ...m });
  if (p.direction === "out" && p.opcode === 5038) sceneLoads.push({ at: p.at, userId: p.userId, ...m });
  if (p.direction === "in" && p.opcode === 135) campaignCards.push({ at: p.at, ...m });
  if (p.direction === "in" && p.opcode === 157) battles.push({ at: p.at, id: m.battle_id, type: m.battle_type, map: m.map_temp_id,
    fighters: [...(m.heros ?? []), ...(m.soldiers ?? [])].map(h => ({ template: h.temp_id ?? h.pawn_temp_id, name: h.nick_name, type: h.type, side: h.side, grade: h.grade, resource: h.res, hp: h.max_hp, skillIds: h.skillId })) });
  if (p.direction === "in" && p.opcode === 4103) battleReports.push({ at: p.at, ...m });
  if (p.direction === "out" && p.opcode === 5014) quests.push({ at: p.at, userId: p.userId, ...m, title: titles[m.template_id] ?? "Não encontrado em QuestTemps" });
  if (p.direction === "in" && p.opcode === 3) {
    const prev = profiles[p.userId] ?? {}, next = { ...prev, ...m };
    if (Number.isFinite(m.weary) && prev.weary !== m.weary)
      energy.push({ at: p.at, userId: p.userId, before: prev.weary ?? null, after: m.weary, delta: Number.isFinite(prev.weary) ? m.weary - prev.weary : null });
    profiles[p.userId] = next;
  }
}
const assetIssues = [], newAssets = assets.filter(a => a.saved_at >= marker.startedAt), seenObjects = new Set();
let assetBytes = 0;
for (const a of assets) {
  const file = join(root, "data/assets/objects", a.sha256 + ".bin");
  if (!existsSync(file)) { assetIssues.push({ path: a.path, problem: "missing" }); continue; }
  const bytes = readFileSync(file);
  if (bytes.length !== a.bytes || createHash("sha256").update(bytes).digest("hex") !== a.sha256) { assetIssues.push({ path: a.path, problem: "hash-or-size" }); continue; }
  assetBytes += bytes.length;
  if (!seenObjects.has(a.sha256)) {
    const target = join(folder, "data/assets/objects", a.sha256 + ".bin");
    mkdirSync(dirname(target), { recursive: true }); copyFileSync(file, target); seenObjects.add(a.sha256);
  }
}
// Preserve all existing HTTP objects, including requests and historical responses.
mkdirSync(join(folder, "data/http/objects"), { recursive: true });
for (const name of readdirSync(join(root, "data/http/objects"))) if (/^[a-f0-9]{64}\.bin$/.test(name))
  copyFileSync(join(root, "data/http/objects", name), join(folder, "data/http/objects", name));
const httpIssues = [], checked = new Set(), statuses = {}, httpPaths = {};
let responseBytes = 0;
for (const h of http) {
  count(statuses, h.status); count(httpPaths, h.path.split("?")[0]);
  if (h.complete) responseBytes += h.response?.bytes ?? 0;
  for (const obj of [h.request, h.response]) {
    if (!obj || checked.has(obj.sha256)) continue;
    const file = resolve(root, "data/http", obj.file);
    if (!file.startsWith(resolve(root, "data/http/objects") + "\\") && !file.startsWith(resolve(root, "data/http/objects") + "/")) throw new Error("Objeto HTTP fora do acervo");
    if (!existsSync(file)) httpIssues.push({ path: h.path, problem: "missing", hash: obj.sha256 });
    else {
      const bytes = readFileSync(file);
      if (bytes.length !== obj.bytes || createHash("sha256").update(bytes).digest("hex") !== obj.sha256) httpIssues.push({ path: h.path, problem: "hash-or-size", hash: obj.sha256 });
    }
    checked.add(obj.sha256);
  }
}
// Read the local packed tables to name campaign entries without any client access.
const templateAsset = assets.find(a => a.path === "/xml/tempinfos.xml");
const campaignNames = {};
if (templateAsset) {
  const packed = inflateSync(readFileSync(join(root, "data/assets/objects", templateAsset.sha256 + ".bin")).subarray(4));
  let pos = 4;
  while (pos < packed.length) {
    const sizeName = packed[pos++], name = packed.subarray(pos, pos + sizeName).toString(); pos += sizeName;
    const size = packed.readUInt32BE(pos); pos += 4;
    if (/Campaign/i.test(name)) {
      const xml = packed.subarray(pos, pos + size).toString();
      for (const [, attrs] of xml.matchAll(/<(?:CampaignInfo|CampaignTempInfo|SingleCampaignTempInfo)\s+([^>]+)\/>/g)) {
        const row = Object.fromEntries([...attrs.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
        const id = row.TemplateId ?? row.CampaignId;
        if (id) campaignNames[id] = row.CampaignName ?? row.Name ?? row.Title ?? "";
      }
    }
    pos += size;
  }
}
const uniqueCampaigns = [...new Set(campaignEntries.map(r => r.para_int2).filter(Boolean))].map(id => ({ id, name: campaignNames[id] ?? "" }));
const distinctBattles = [...new Map(battles.map(b => [b.id, b])).values()];
const summary = {
  generatedAt: now, startedAt: marker.startedAt, snapshotDirectory: relative(root, folder), reportDirectory: relative(root, out),
  tcp: { packets: tcp.length, first: tcp[0]?.at, last: tcp.at(-1)?.at, connections: [...new Set(tcp.map(p => p.connection))], users: [...new Set(tcp.map(p => p.userId))], counts, badFrames, malformed, noSchemas, decodeIssues },
  gameplay: { campaignEntryRequests: campaignEntries.length, campaigns: uniqueCampaigns, sceneLoads: sceneLoads.length, loadedMaps: [...new Set(sceneLoads.map(r => r.para_int1))], distinctBattles: distinctBattles.length, battleResultPackets: battleReports.length, wins: battleReports.filter(b => b.battle_result === 1).length, losses: battleReports.filter(b => b.battle_result !== 1).length, campaignCardPackets: campaignCards.length, questFinishRequests: quests.length, distinctQuestRequests: [...new Set(quests.map(q => q.template_id))] },
  http: { requests: http.length, statuses, paths: httpPaths, incomplete: http.filter(h => !h.complete).map(h => ({ at: h.at, path: h.path, status: h.status, error: h.error })), checkedObjects: checked.size, responseBytes, issues: httpIssues },
  assets: { checked: assets.length, valid: assets.length - assetIssues.length, bytes: assetBytes, newSavedEntries: newAssets.length, newBytes: newAssets.reduce((n, a) => n + a.bytes, 0), issues: assetIssues, failedDependencies: failures },
  profiles: Object.fromEntries(Object.entries(profiles).map(([id, p]) => [id, { nickname: p.nick_name, level: p.grades, energy: p.weary, gp: p.gp, totalGp: p.totalGp }])), files,
};
const details = { actions: Object.values(actions), campaignEntries, sceneLoads, distinctBattles, battleReports, campaignCards, quests, energy, newAssets };
writeFileSync(join(out, "resumo.json"), JSON.stringify(summary, null, 2));
writeFileSync(join(out, "acoes.json"), JSON.stringify(details, null, 2));
copyFileSync(join(out, "resumo.json"), join(folder, "resumo.json"));
copyFileSync(join(out, "acoes.json"), join(folder, "acoes.json"));
for (const file of ["reference/messages.json", "reference/postcity-protocols.json", "data/city/scenario.json", "data/tutorial/scenario.json"]) {
  const target = join(folder, file); mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(root, file), target);
}
console.log(JSON.stringify({ report: relative(root, out), snapshot: relative(root, folder), tcp: { packets: tcp.length, first: tcp[0]?.at, last: tcp.at(-1)?.at, badFrames: badFrames.length, malformed: malformed.length, unsupported: Object.keys(noSchemas).length, decodeIssues: decodeIssues.length }, gameplay: summary.gameplay, http: summary.http, assets: { ...summary.assets, failedDependencies: failures.length }, profiles: summary.profiles }));
