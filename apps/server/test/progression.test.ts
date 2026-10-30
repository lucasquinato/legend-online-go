import { test } from "node:test";
import assert from "node:assert/strict";
import {
  grantExperience,
  experienceReward,
  repairExperience,
} from "../src/progression.js";

test("XP de missão usa o ganho acumulado, não a barra reduzida ao passar de nível", () => {
  const patches = [
    { path: ["player", "gp"], before: 11280, after: 4280 },
    { path: ["player", "totalGp"], before: 96080, after: 111080 },
    { path: ["player", "grades"], before: 11, after: 12 },
  ];
  const amount = experienceReward(patches);
  assert.equal(amount, 15000);
  const original = { grades: 11, gp: 11280, totalGp: 96080 };
  grantExperience(original, amount);
  assert.deepEqual(original, { grades: 12, gp: 4280, totalGp: 111080 });
  const advanced = { grades: 27, gp: 1000, totalGp: 2003060 };
  grantExperience(advanced, amount);
  assert.deepEqual(advanced, { grades: 27, gp: 16000, totalGp: 2018060 });
});
test("XP negativo herdado é recuperado pelo acumulado sem perder recompensa", () => {
  const player = { grades: 12, gp: -4720, totalGp: 2019340 };
  assert.equal(repairExperience(player), true);
  assert.deepEqual(player, { grades: 27, gp: 17280, totalGp: 2019340 });
  assert.equal(repairExperience(player), false);
  const before = structuredClone(player);
  assert.throws(() => grantExperience(player, -1));
  assert.deepEqual(player, before);
});
