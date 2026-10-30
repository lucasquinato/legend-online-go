import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { Store } from "../../store.js";
export const campaignRules = JSON.parse(
  readFileSync(join(projectRoot, "reference/campaign/rules.json"), "utf8"),
) as {
  campaigns: Record<string, string>[];
  normalRewards: Record<string, string>[];
  sssRewards: Record<string, string>[];
  config: Record<string, string>[];
  energyShop: Record<string, string>[];
};
export function campaignRank(id: number): number {
  return campaignRules.campaigns.find((c) => Number(c.CampaignId) === id)
    ?.DifficultyGrade === "2"
    ? 7
    : 5;
}
const chapterNames: Record<string, string> = JSON.parse(readFileSync(
  join(projectRoot, "reference/campaign/chapter-names.json"), "utf8"));
export function campaignMailText(district: number, kind: string) {
  const suffix = kind === "sss" ? " SsS" : "";
  return {sendNickName: "Email do sistema", title: `Conclusão de campanha${suffix}`,
    contents: `Recompensa pela conclusão do mapa ${chapterNames[district] ?? district}${suffix}`};
}
export function grantChapterRewards(
  store: Store,
  userId: number,
  completed: number[],
): number[] {
  if (!store.db.prepare("SELECT id FROM users WHERE id=?").get(userId))
    return [];
  const mails: number[] = [];
  for (const [kind, rewards, difficulty] of [
    ["normal", campaignRules.normalRewards, "1"],
    ["sss", campaignRules.sssRewards, "2"],
  ] as const)
    for (const district of new Set(rewards.map((r) => Number(r.District)))) {
      const phases = campaignRules.campaigns.filter(
        (c) =>
          Number(c.DungeonId) === district && c.DifficultyGrade === difficulty,
      );
      if (
        !phases.length ||
        phases.some((c) => !completed.includes(Number(c.CampaignId)))
      )
        continue;
      const items = rewards
        .filter((r) => Number(r.District) === district)
        .map((r) => ({ template: Number(r.ItemId), count: Number(r.Count) }));
      const key = `campaign:chapter:${district}:${kind}`;
      const existed = store.db
        .prepare("SELECT 1 FROM account_grants WHERE user_id=? AND grant_key=?")
        .get(userId, key);
      const id = store.sendLocalItemsOnce(
        userId,
        key,
        campaignMailText(district, kind).title,
        items,
        campaignMailText(district, kind).contents,
        "Email do sistema",
      );
      const row = store.db.prepare("SELECT detail FROM local_mail WHERE mail_id=?").get(id);
      if (row) store.db.prepare("UPDATE local_mail SET detail=? WHERE mail_id=?")
        .run(JSON.stringify({...JSON.parse(String(row.detail)), ...campaignMailText(district, kind)}), id);
      if (!existed) mails.push(id);
    }
  return mails;
}
export const sweepGold = Number(
  campaignRules.config.find((c) => c.ConfigName === "Campaign_Sweep_Gold")
    ?.ConfigValue ?? 5000,
);
// Original config is 60 seconds. The user requested a local duration of 15.
export const sweepSeconds = 15;
