import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import type { Message } from "../../messages.js";

export function normalizeLabyrinthQuestConditions(conditions: Message[]): void {
  for (const condition of conditions)
    if (Number(condition.TemplateId) === 1840 && Number(condition.CondictionType) === 38)
      condition.Para2 = "1";
}

/** TaskTemplate.checkMazeRecord uses maxIndex, independently of QuestInfo.isComplete. */
export function localLabyrinthQuestTables(raw: Buffer): Buffer {
  const data = inflateSync(raw.subarray(4));
  const parts: Buffer[] = [data.subarray(0, 4)];
  let offset = 4;
  while (offset < data.length) {
    const start = offset, size = data[offset++]!;
    const name = data.subarray(offset, offset + size).toString(); offset += size;
    const length = data.readUInt32BE(offset); offset += 4;
    let body = data.subarray(offset, offset + length); offset += length;
    if (name === "QuestCondictionInfos") body = Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g, row => {
      if (!/\bTemplateId="1840"/.test(row) || !/\bCondictionType="38"/.test(row)) return row;
      return row.replace(/\bPara2="[^"]*"/, 'Para2="1"');
    }));
    const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
    parts.push(data.subarray(start, start + 1 + size), header, body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
