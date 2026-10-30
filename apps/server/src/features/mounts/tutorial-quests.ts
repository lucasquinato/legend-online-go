import { inflateSync } from "node:zlib";
import type { CityState } from "../../city-state.js";
import { encodeClientTableBundle } from "../../client-table-bundle.js";
import type { StoryQuest } from "../quests/index.js";
import { questClaimed } from "../quests/index.js";

export const mountWalkQuest = 2800;
export const mountTrainQuest = 753;
const base = { TemplateType: "0", Objective: "", NeedFightId: "0", NeedBuildingTemp: "0", NeedItemTemp: "0", NeedPos: "0", NeedMinLevel: "16", NeedMaxLevel: "100", IsLeague: "false", IsAuto: "true", IsRepeat: "false", IsLost: "false", RepeatInterval: "24", RepeatMax: "1", RewardPlayGP: "10000", RewardHeroGP: "0", RewardGold: "10000", RewardCrystal: "0", RewardDower: "0", RewardMoney: "0", RewardConsortiaOffer: "0", RewardPlayerOffer: "0", StartDate: "2000-01-01 00:00:00", EndDate: "2099-12-31 23:59:59", WeekSpace: "", HourSpace: "", RewardStrategy: "0", Sort: "1115.0", ShowType: "0" };
export const mountTutorialQuests: StoryQuest[] = [
  { template: { ...base, TemplateId: String(mountWalkQuest), Title: "Sua primeira montaria", PreQuestId: "", Detail: "Abra Montaria e clique uma vez em Montar para concluir a missão. Descansar permite desmontar, mas não é necessário para esta missão." },
    conditions: [{ TemplateId: String(mountWalkQuest), CondictionType: "71", CondictionTitle: "Clicar em Montar", Para1: "0", Para2: "1", Para3: "0", Para4: "0" }],
    items: [{ TemplateId: String(mountWalkQuest), RewardItemID: "208017", IsSelect: "false", RewardItemCount: "10", ToJob: "0", ValidDate: "0" }] },
  { template: { ...base, TemplateId: String(mountTrainQuest), Title: "Adestrar sua montaria", PreQuestId: String(mountWalkQuest), Sort: "1115.1", Detail: "Abra Montaria e consuma 10 Pedras Bestiais no adestramento de qualquer atributo. Você pode dividir o consumo entre atributos e sessões. Treinos pagos com diamantes não contam." },
    conditions: [{ TemplateId: String(mountTrainQuest), CondictionType: "71", CondictionTitle: "Consumir Pedras Bestiais no adestramento", Para1: "0", Para2: "10", Para3: "0", Para4: "0" }], items: [] },
];
export function mountTutorialAction(state: CityState, action: "mount" | "stones", amount = 0): void {
  const id = action === "stones" ? mountTrainQuest : mountWalkQuest, quest = state.quests[id];
  if (!quest?.is_accept || quest.is_complete || questClaimed(state, id)) return;
  const prior = Number(quest.condition_1 ?? 0);
  if (action === "mount") quest.condition_1 = Math.max(prior, 1);
  if (action === "stones") quest.condition_1 = Math.min(10, prior + amount);
  quest.is_complete = Number(quest.condition_1) >= (id === mountWalkQuest ? 1 : 10) ? 1 : 0;
}
/** Only local Flash tables; recovered sources and other quest rows stay intact. */
export function localMountTutorialTables(raw: Buffer): Buffer {
  const data = inflateSync(raw.subarray(4)), parts: Buffer[] = [data.subarray(0, 4)]; let pos = 4;
  const escape = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  while (pos < data.length) {
    const start = pos, n = data[pos++]!, name = data.subarray(pos, pos + n).toString(); pos += n;
    const length = data.readUInt32BE(pos); pos += 4; let body = data.subarray(pos, pos + length); pos += length;
    const rows = name === "QuestTemps" ? mountTutorialQuests.map(q => q.template) : name === "QuestCondictionInfos" ? mountTutorialQuests.flatMap(q => q.conditions) : name === "QuestGoods" ? mountTutorialQuests.flatMap(q => q.items) : undefined;
    if (rows) {
      const text = body.toString(), tag = text.match(/<(\w+)\s+[^>]*TemplateId="/)?.[1];
      if (!tag) throw new Error("Tabela de missão sem registros: " + name);
      const clean = text.replace(/<\w+\s+[^>]*\/>/g, row => [mountWalkQuest, mountTrainQuest].includes(Number(row.match(/TemplateId="(\d+)"/)?.[1])) ? "" : row);
      const serialized = rows.map(row => `<${tag} ${Object.entries(row).map(([key, value]) => `${key}="${escape(value)}"`).join(" ")}/>`).join("");
      const closing = clean.lastIndexOf("</");
      body = Buffer.from(closing < 0 ? clean + serialized : clean.slice(0, closing) + serialized + clean.slice(closing));
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(body.length); parts.push(data.subarray(start, start + 1 + n), size, body);
  }
  return encodeClientTableBundle(Buffer.concat(parts));
}
