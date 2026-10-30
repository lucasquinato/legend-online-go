import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import {
  appraisalPlan,
  appraisalValues,
} from "../src/features/fashion/index.js";
test("avaliação usa os 100 skills originais e todos os custos S a D por parte", () => {
  const items = Object.values(
    JSON.parse(
      readFileSync(join(projectRoot, "reference/item-templates.json"), "utf8"),
    ).items,
  ) as any[];
  for (const type of [109, 110, 111, 112])
    for (let rank = 1; rank <= 5; rank++) {
      const item = items.find(
        (r) => Number(r.SonType) === type && Number(r.TransformId) === rank,
      )!;
      assert.ok(item);
      for (let stars = 1; stars <= 5; stars++) {
        const plan = appraisalPlan(Number(item.TemplateId), 0, () => stars);
        assert.equal(
          plan.gold,
          [0, 1000000, 800000, 600000, 400000, 200000][rank],
        );
        assert.equal(plan.value, ([0, 100, 40, 30, 20, 10][rank]! * stars) / 5);
        assert.deepEqual(
          appraisalValues({ piece: { appraisal_skill: plan.skill } }),
          { [`total_${plan.attribute}`]: plan.value },
        );
        if (stars === 5)
          assert.throws(
            () => appraisalPlan(Number(item.TemplateId), plan.skill),
            /máximo/,
          );
        else {
          const next = appraisalPlan(Number(item.TemplateId), plan.skill);
          assert.equal(next.stars, stars + 1);
          assert.equal(next.souls, 6 - rank);
          assert.equal(next.gold, 0);
        }
      }
    }
});
