import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import { projectRoot } from "../../config.js";
import type { CityState } from "../../city-state.js";
import type { Message } from "../../messages.js";
import { questClaimed } from "../quests/index.js";
import { titleAttributeUnlock } from "./catalog.js";
const recovered = JSON.parse(readFileSync(join(projectRoot, "reference/titles/unlock-quest.json"), "utf8"));
export const titleUnlockQuest: { template: Message; conditions: Message[]; items: Message[] } = {
  template: { ...recovered.template, NeedMinLevel: String(titleAttributeUnlock.minimumLevel), PreQuestId: "", EndDate: "2099-12-31 23:59:59", Detail: `Atinja o nível ${titleAttributeUnlock.minimumLevel} e conclua esta missão para ativar os atributos de todos os títulos obtidos.` },
  conditions: [{ ...recovered.conditions[0], CondictionType: "1", CondictionTitle: `Alcançar o nível ${titleAttributeUnlock.minimumLevel}`, Para1: "0", Para2: String(titleAttributeUnlock.minimumLevel), Para3: "0", Para4: "" }],
  items: recovered.items,
};
export function synchronizeTitleUnlockQuest(state: CityState, now: number): void {
  const id = titleAttributeUnlock.questId;
  if (Number(state.player.grades) < titleAttributeUnlock.minimumLevel || questClaimed(state, id)) return;
  state.quests[id] = { template_id: id, is_select: 1, repeat_finish: 0, completed_date: "2000-01-01 00:00:00", add_date: new Date(now).toISOString().slice(0, 19).replace("T", " "), ...state.quests[id], is_accept: 1, is_complete: 1, condition_1: titleAttributeUnlock.minimumLevel, condition_2: 0, condition_3: 0, condition_4: 0 };
}
/** Local response only. Preserve the archived bundle and every unrelated row/table. */
export function localTitleQuestTables(raw: Buffer): Buffer {
  const data = inflateSync(raw.subarray(4)), parts: Buffer[] = [data.subarray(0, 4)]; let offset = 4;
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  while (offset < data.length) {
    const start = offset, n = data[offset++]!, name = data.subarray(offset, offset + n).toString(); offset += n;
    const length = data.readUInt32BE(offset); offset += 4; let body = data.subarray(offset, offset + length); offset += length;
    if (["QuestTemps", "QuestCondictionInfos"].includes(name)) body = Buffer.from(body.toString().replace(/<\w+\s+[^>]*\/>/g, row => {
      if (!/\bTemplateId="936"/.test(row)) return row;
      const fields = name === "QuestTemps" ? titleUnlockQuest.template : titleUnlockQuest.conditions[0]!;
      return row.replace(/(\w+)="([^"]*)"/g, (all, key: string) => Object.hasOwn(fields, key) ? `${key}="${escape(String(fields[key]))}"` : all);
    }));
    const size = Buffer.alloc(4); size.writeUInt32BE(body.length); parts.push(data.subarray(start, start + 1 + n), size, body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
