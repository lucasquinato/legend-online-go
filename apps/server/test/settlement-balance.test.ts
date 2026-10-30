import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { projectRoot } from "../src/config.js";
import { townHallProduction, sanctuaryBonus } from "../src/features/settlement/balance.js";
import { buildingAt, researchSons } from "../src/features/settlement/content.js";
import { localSettlementTables } from "../src/features/settlement/client-tables.js";

function unpack(raw: Buffer): Map<string, Buffer> {
  assert.equal(raw.readUInt32BE(0), raw.length - 4);
  const data = inflateSync(raw.subarray(4)), result = new Map<string, Buffer>();
  let pos = 4;
  while (pos < data.length) {
    const n = data[pos++]!, name = data.subarray(pos, pos + n).toString(); pos += n;
    const length = data.readUInt32BE(pos); pos += 4;
    result.set(name, data.subarray(pos, pos + length)); pos += length;
  }
  return result;
}

test("LOGo: todas as pesquisas seguem a escala linear e os máximos definidos", () => {
  for (const [base, normal, advanced] of [
    [1304, 1000000, 1000000],
    [1420, 20000, 26000], [1445, 20000, 26000],
    [1421, 10000, 13000], [1423, 10000, 13000], [1441, 10000, 13000], [1442, 10000, 13000],
    [1422, 7000, 9000], [1424, 7000, 9000], [1443, 7000, 9000], [1444, 7000, 9000], [1446, 7000, 9000],
  ]) {
    for (const [son, maximum] of [[base!, normal!], [base! + 1000, advanced!]]) {
      for (let level = 0; level <= 80; level++) {
        const expected = [1420,1445].includes(base!) ? 2 * Math.floor((son! >= 2000 ? 13000 : 10000) * level / 80) : Math.floor(maximum! * level / 80);
        assert.equal(sanctuaryBonus(son!, level), expected);
        assert.match(buildingAt(son!, level)!.Activity, new RegExp(`\\+${expected}(?:$|/h)`));
      }
    }
  }
});

test("LOGo: prefeitura cresce linearmente entre os marcos sem reduzir renda", () => {
  assert.equal(townHallProduction(10), 500000);
  assert.equal(townHallProduction(80), 5000000);
  assert.equal(townHallProduction(45), 2750000);
  for (const [level, rate] of [[20,1142857],[30,1785714],[40,2428571],[50,3071428],[60,3714285],[70,4357142]]) assert.equal(townHallProduction(level!), rate);
  for (let level = 10; level <= 80; level++) {
    assert.equal(Number(buildingAt(901, level)!.Property1), townHallProduction(level));
    if (level > 10) assert.ok(townHallProduction(level) > townHallProduction(level - 1));
  }
});

test("LOGo: tabela local preserva custos, modas e todos os blocos não relacionados", () => {
  const raw = readFileSync(join(projectRoot, "reference/quests/tempinfos.original.bin"));
  const original = unpack(raw), patched = unpack(localSettlementTables(raw));
  assert.deepEqual([...patched.keys()], [...original.keys()]);
  for (const [name, bytes] of original) if (name !== "BuildingTempInfos") assert.deepEqual(patched.get(name), bytes, name);
  const rows = (bytes: Buffer) => [...bytes.toString().matchAll(/<BuildingTempInfo\s+[^>]*\/>/g)].map(m => Object.fromEntries([...m[0].matchAll(/(\w+)="([^"]*)"/g)].map(a => [a[1]!, a[2]!])));
  const before = rows(original.get("BuildingTempInfos")!), after = rows(patched.get("BuildingTempInfos")!);
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const a = before[i]!, b = after[i]!;
    const changed = Number(a.SonType) === 901 || researchSons.includes(Number(a.SonType));
    for (const key of Object.keys(a)) if (!changed || !["Activity", ...(Number(a.SonType) === 901 ? ["Property1"] : [])].includes(key)) assert.equal(b[key], a[key], `${a.TemplateId}:${key}`);
    if (changed) {
      assert.equal(b.Activity, buildingAt(Number(b.SonType), Number(b.BuildingGrade))!.Activity);
      assert.equal(b.Property1, String(buildingAt(Number(b.SonType), Number(b.BuildingGrade))!.Property1));
    }
  }
});
