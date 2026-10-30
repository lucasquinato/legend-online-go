import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import {
  initialRefinement,
  planRefinement,
  refinementBody,
  refinementBonuses,
  refinementRage,
} from "../src/features/fashion/index.js";
import { fields } from "../src/protocol.js";
const items = Object.values(
  JSON.parse(
    readFileSync(join(projectRoot, "reference/item-templates.json"), "utf8"),
  ).items,
) as any[];
const collection = Object.fromEntries(
  [109, 110, 111, 112].flatMap((type) =>
    items
      .filter((x) => Number(x.SonType) === type)
      .slice(0, 50)
      .map((x) => [
        x.TemplateId,
        { temp_id: Number(x.TemplateId), appraisal_skill: 0 },
      ]),
  ),
);
test("408 recuperado representa quatro partes, níveis e XP; máximo reproduz os bônus observados no nível 27", () => {
  const p = initialRefinement();
  for (const part of Object.values(p)) part.level = 100;
  assert.equal(
    refinementBody(p),
    "CgYIcBBkGAAKBghtEGQYAAoGCG4QZBgACgYIbxBkGAA=",
  );
  assert.equal(
    fields(Buffer.from(refinementBody(initialRefinement()), "base64")).length,
    4,
  );
  assert.deepEqual(refinementBonuses(p, 27, {}), {
    total_phy_attack: 15600,
    total_magic_attack: 15600,
    total_phy_defence: 14400,
    total_magic_defence: 14400,
    total_live: 144000,
  });
  assert.equal(refinementRage(p), 20);
});
test("refinação carrega excedente, limita consumo no marco conjunto e exige coleção", () => {
  const start = initialRefinement();
  const one = planRefinement(start, collection, 111, 1);
  assert.deepEqual(one.progress[111], { level: 5, xp: 25 });
  assert.deepEqual(start[111], { level: 0, xp: 0 });
  const batch = planRefinement(start, collection, 111, 9999);
  assert.deepEqual(batch.progress[111], { level: 10, xp: 0 });
  assert.equal(batch.consumed, 3);
  assert.throws(
    () => planRefinement(batch.progress, collection, 111, 1),
    /outras partes/,
  );
  assert.throws(() => planRefinement(start, {}, 111, 1), /Ative/);
  const few = Object.fromEntries(
    Object.entries(collection).filter(
      ([id]) => Number(id) < 1110000 || Number(id) >= 1120000,
    ),
  );
  for (const entry of Object.entries(collection)
    .filter(([id]) => Number(id) >= 1110000 && Number(id) < 1120000)
    .slice(0, 3))
    few[entry[0]] = entry[1];
  const gated = planRefinement(start, few, 111, 9999);
  assert.equal(gated.progress[111]!.level, 9);
  assert.throws(() => planRefinement(gated.progress, few, 111, 1), /5 modas/);
});
test("bônus de avaliação do marco permanece no nível 11 e máximo não consome", () => {
  const p = initialRefinement();
  for (const part of Object.values(p)) part.level = 10;
  const next = planRefinement(p, collection, 111, 1);
  assert.equal(next.progress[111]!.level, 11);
  const owned = {
    ...collection,
    1110801: { temp_id: 1110801, appraisal_skill: 5204 },
  };
  assert.equal(refinementBonuses(next.progress, 200, owned).total_power, 10);
  for (const part of Object.values(p)) part.level = 100;
  assert.throws(() => planRefinement(p, collection, 111, 1), /máximo/);
  assert.equal(refinementBonuses(p, 200, owned).total_power, 100);
});
