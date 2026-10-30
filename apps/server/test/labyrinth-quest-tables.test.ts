import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { localLabyrinthQuestTables } from "../src/features/labyrinth/quest.js";
import { storyQuest } from "../src/features/quests/index.js";

function tables(raw: Buffer): Map<string, string> {
  const data = inflateSync(raw.subarray(4)), result = new Map<string, string>();
  let offset = 4;
  while (offset < data.length) {
    const n = data[offset++]!, name = data.subarray(offset, offset + n).toString(); offset += n;
    const size = data.readUInt32BE(offset); offset += 4;
    result.set(name, data.subarray(offset, offset + size).toString()); offset += size;
  }
  return result;
}
test("cliente e servidor concluem a missão 1840 com recorde 1 e deixam todas as outras tabelas intactas", () => {
  const raw = readFileSync("reference/quests/tempinfos.original.bin");
  const patched = localLabyrinthQuestTables(raw), before = tables(raw), after = tables(patched);
  assert.equal(patched.readUInt32BE(0), patched.length - 4);
  assert.equal(inflateSync(patched.subarray(4)).readUInt32BE(0), inflateSync(raw.subarray(4)).readUInt32BE(0));
  assert.equal(before.size, after.size);
  for (const [name, original] of before) {
    if (name !== "QuestCondictionInfos") { assert.equal(after.get(name), original, name); continue; }
    const target = /<\w+\s+[^>]*\bTemplateId="1840"[^>]*\/>/g;
    const oldRows = original.match(target)!, newRows = after.get(name)!.match(target)!;
    assert.equal(oldRows.length, 1); assert.equal(newRows.length, 1);
    assert.equal(newRows[0], oldRows[0]!.replace(/\bPara2="[^"]*"/, 'Para2="1"'));
    assert.equal(after.get(name)!.replace(target, ""), original.replace(target, ""));
    const goal = Number(newRows[0]!.match(/\bPara2="(\d+)"/)![1]);
    // TaskTemplate.checkMazeRecord compares the tower's maxIndex to Para2.
    assert.equal(0 >= goal, false); assert.equal(1 >= goal, true);
    assert.equal(Number(storyQuest(1840)!.conditions[0]!.Para2), goal);
  }
  assert.deepEqual(localLabyrinthQuestTables(patched), patched);
});
