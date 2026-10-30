import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { projectRoot } from "../../config.js";
import { itemTemplate, InventoryError } from "../../inventory.js";
const reference = JSON.parse(
  readFileSync(
    join(projectRoot, "reference/fashion-appraisal-skills.json"),
    "utf8",
  ),
);
export const characterLevels = new Map<number, number>(
  reference.levels.map((r: any) => [Number(r.Grades), Number(r.Data)]),
);
const skills = new Map<number, any>(
  reference.skills.map((r: any) => [Number(r.TemplateId), r]),
);
const properties = new Map<number, any>(
  reference.properties.map((r: any) => [Number(r.TemplateId), r]),
);
export function appraisalPlan(
  template: number,
  currentSkill: number,
  roll = () => randomInt(1, 6),
) {
  const row = itemTemplate(template),
    type = Number(row?.SonType),
    rank = Number(row?.TransformId);
  if (![109, 110, 111, 112].includes(type) || ![1, 2, 3, 4, 5].includes(rank))
    throw new InventoryError("Moda sem categoria de avaliação válida");
  const current = skills.get(currentSkill);
  if (currentSkill && !current)
    throw new InventoryError("Avaliação anterior sem tabela recuperada");
  const stars = current ? Number(current.Grades) + 1 : roll();
  if (stars > 5)
    throw new InventoryError("Moda já avaliada no máximo de cinco estrelas");
  if (!Number.isInteger(stars) || stars < 1)
    throw new InventoryError("Resultado de avaliação inválido");
  const attribute = (
    {
      109: "Physique",
      110: "Intellect",
      111: "Power",
      112: "Agility",
    } as Record<number, string>
  )[type]!;
  const maximum = [0, 100, 40, 30, 20, 10][rank]!;
  const skill = reference.skills.find(
    (s: any) =>
      Number(s.MasterType) === type * 10 &&
      Number(s.Grades) === stars &&
      Number(properties.get(Number(s.TemplateId))?.[attribute]) ===
        (maximum * stars) / 5,
  );
  if (!skill) throw new InventoryError("Skill da avaliação não encontrado");
  return {
    skill: Number(skill.TemplateId),
    stars,
    gold: current ? 0 : [0, 1000000, 800000, 600000, 400000, 200000][rank]!,
    souls: current ? 6 - rank : 0,
    attribute: attribute.toLowerCase(),
    value: (maximum * stars) / 5,
  };
}
export function appraisalValues(
  collection: Record<string, any>,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const fashion of Object.values(collection)) {
    const p = properties.get(Number(fashion.appraisal_skill));
    if (!p) continue;
    for (const key of ["Power", "Agility", "Intellect", "Physique"]) {
      const value = Number(p[key] ?? 0);
      if (value)
        values[`total_${key.toLowerCase()}`] =
          (values[`total_${key.toLowerCase()}`] ?? 0) + value;
    }
  }
  return values;
}
