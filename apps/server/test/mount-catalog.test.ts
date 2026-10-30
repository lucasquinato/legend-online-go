import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { localMountTables } from "../src/features/mounts/catalog-overrides.js";

function unpack(raw: Buffer): Map<string, Buffer> {
  const data = inflateSync(raw.subarray(4)), tables = new Map<string, Buffer>(); let pos = 4;
  while (pos < data.length) {
    const n = data[pos++]!, name = data.subarray(pos, pos + n).toString(); pos += n;
    const length = data.readUInt32BE(pos); pos += 4; tables.set(name, data.subarray(pos, pos + length)); pos += length;
  }
  return tables;
}
test("cliente recebe apenas três registros corrigidos, com demais tabelas preservadas", () => {
  const raw = readFileSync("reference/quests/tempinfos.original.bin"), patched = localMountTables(raw);
  assert.equal(patched.readUInt32BE(0), patched.length - 4);
  const before = unpack(raw), after = unpack(patched);
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [name, data] of before) {
    if (!["ItemTempInfos", "MountTempInfos"].includes(name)) { assert.deepEqual(after.get(name), data, name); continue; }
    const elements = (bytes: Buffer) => [...bytes.toString().matchAll(/<\w+\s+[^>]*\/>/g)].map(m => m[0]);
    const original = elements(data), changed = elements(after.get(name)!);
    assert.equal(changed.length, original.length);
    const ids: number[] = [];
    for (let index = 0; index < original.length; index++) if (original[index] !== changed[index]) ids.push(Number(original[index]!.match(/TemplateId="(\d+)"/)![1]));
    assert.deepEqual(ids.sort((a,b) => a-b), name === "ItemTempInfos" ? [2180061] : [6002,6004]);
  }
  const items = after.get("ItemTempInfos")!.toString();
  const mammoth = [...items.matchAll(/<\w+\s+[^>]*\/>/g)].find(m=>m[0].includes('TemplateId="2180061"'))![0];
  assert.match(mammoth, /TemplateName="Carta do Mamute"/); assert.match(mammoth, /Property1="7005"/);
  assert.match(mammoth, /Icon="\/mount_elephant.png"/);
  assert.deepEqual(localMountTables(patched), patched, "aplicação repetida é idempotente");
});
