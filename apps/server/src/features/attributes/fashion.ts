import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { AttributeSource } from "../../attributes.js";
import type { Message } from "../../messages.js";
import { fashionBonuses } from "../fashion/progression.js";
import { appraisalValues } from "../fashion/appraisal.js";
import { initialRefinement, refinementRage, type RefinementProgress } from "../fashion/refinement.js";
import { itemTemplate } from "../../inventory.js";

const fury: Record<string, number> = JSON.parse(readFileSync(join(projectRoot, "reference/attributes/fashion-fury.json"), "utf8")).fury;
const rows: Message[] = JSON.parse(readFileSync(join(projectRoot, "reference/fashion-refinement.json"), "utf8")).rows;
export function fashionAttributeSources(level: number, collection: Record<string, Message>, progress: RefinementProgress = initialRefinement()): Record<string, AttributeSource> {
  const bonuses = fashionBonuses(level), row = (part: number, n: number) => rows.find(r => Number(r.SonType) === part && Number(r.Level) === n)!;
  const refinement: AttributeSource = { kind: "permanent", evidence: "recovered-table", derivePrimary: true, values: { total_initial_fury: refinementRage(progress) }, scaling: [] };
  for (const [part, keys] of [[111, ["total_phy_attack", "total_magic_attack"]], [112, ["total_phy_defence", "total_magic_defence"]], [110, ["total_live"]]] as const)
    refinement.scaling!.push({ values: Object.fromEntries(keys.map(k => [k, Number(bonuses.flat[k] ?? 0)])), percent: Number(row(109, progress[109]!.level).LevelAdd) + Number(row(part, progress[part]!.level).LevelAdd) });
  for (const part of [109,110,111,112]) {
    const own = Object.fromEntries(Object.entries(collection).filter(([id]) => Number(itemTemplate(Number(id))?.SonType) === part));
    refinement.scaling!.push({ values: appraisalValues(own), percent: Number(row(part, Math.floor(progress[part]!.level / 10) * 10).AppraisalAdd) });
  }
  return {
    "fashion:progression": { kind: "permanent", evidence: "recovered-table", derivePrimary: true, values: { ...bonuses.flat, total_initial_fury: Number(fury[level] ?? 0) }, percentages: { ...bonuses.percent } },
    "fashion:appraisal": { kind: "permanent", evidence: "recovered-table", derivePrimary: true, values: appraisalValues(collection) },
    "fashion:refinement": refinement,
  };
}
