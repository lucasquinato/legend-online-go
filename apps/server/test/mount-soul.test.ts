import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { initialMounts } from "../src/features/mounts/state.js";
import { advanceSoul, remainingSoulXP, soulCenterPercent, soulExtraction, soulSidePercent } from "../src/features/mounts/soul.js";
import { soulLanguagePath, soulLanguageResource, soulTranslations } from "../src/features/mounts/soul-language.js";
import { Inventory } from "../src/inventory.js";
import type { Message } from "../src/messages.js";

test("anexo com 1998 corações gera duas pilhas de 999 sem ultrapassar MaxCount", () => {
  const items: Record<string, Message> = {};
  const inventory = new Inventory(items, { nextId: 1 }, 10);
  inventory.add({ template_id: 208070, bag_type: 1, object_id: 0, pos: -1 }, 1998);
  assert.deepEqual(Object.values(items).map(item => item.count), [999, 999]);
});

test("parcela central, arredondamento e bônus reproduzem os exemplos observados", () => {
  const soul = initialMounts().soul;
  assert.equal(soulCenterPercent(soul), 24);
  assert.deepEqual(soulExtraction(21920, soul, "power"), { pool: 5261, bonus: 0 });
  soul.grades.power = 5;
  assert.deepEqual(soulExtraction(160635, soul, "power"), { pool: 38553, bonus: 1928 });
  for (const name of Object.keys(soul.grades) as (keyof typeof soul.grades)[]) soul.grades[name] = 80;
  assert.equal(soulCenterPercent(soul), 100);
  assert.equal(soulSidePercent(80), 300);
  assert.deepEqual(soulExtraction(160635, soul, "power"), { pool: 100000, bonus: 300000 });
});

test("coração em lote equivale a uso individual, com 129600 pontos até o máximo", () => {
  const single = initialMounts().soul, bulk = initialMounts().soul;
  assert.equal(remainingSoulXP(single), 129600);
  for (let index = 0; index < 129600; index++) advanceSoul(single, 1);
  advanceSoul(bulk, remainingSoulXP(bulk));
  assert.deepEqual(single, bulk);
  assert.deepEqual(bulk, { grades: { power: 80, intellect: 80, physique: 80, agility: 80 }, xp: 0 });
  assert.equal(remainingSoulXP(bulk), 0);
});

test("graus desiguais usam custo pelo total e preservam XP entre ações/relogin", () => {
  const soul = { grades: { power: 80, intellect: 80, physique: 80, agility: 0 }, xp: 102 };
  assert.equal(remainingSoulXP(soul), 56400 - 102);
  advanceSoul(soul, 508);
  assert.equal(soul.grades.agility, 1);
  assert.equal(soul.xp, 0);
  const restored = JSON.parse(JSON.stringify(soul));
  advanceSoul(restored, remainingSoulXP(restored));
  assert.equal(restored.grades.agility, 80);
  assert.equal(restored.xp, 0);
  const threshold = initialMounts().soul;
  threshold.grades.power = 15; assert.equal(soulCenterPercent(threshold), 24);
  threshold.grades.power = 16; assert.equal(soulCenterPercent(threshold), 28);
});

test("descrições locais alteram somente seis chaves de refino da versão fixa", () => {
  const raw = readFileSync("data/assets/objects/5a308c2f481e65cb9ec2f7f5bc91a14dab08087d1eda5781f08f50bd6cabeb4f.bin");
  const patched = soulLanguageResource(soulLanguagePath, raw)!;
  const original = inflateSync(raw).toString("utf8").split(/\r?\n/);
  const changed = inflateSync(patched).toString("utf8").split(/\r?\n/);
  assert.equal(changed.length, original.length);
  let count = 0;
  for (let index = 0; index < original.length; index++) if (original[index] !== changed[index]) {
    count++; assert.ok(Object.keys(soulTranslations).some(key => original[index]!.startsWith(key + ":")));
  }
  assert.equal(count, 6);
  assert.equal(soulLanguageResource("/cdn/ui/zh_cn/language.txt", raw), undefined);
  assert.throws(() => soulLanguageResource(soulLanguagePath, Buffer.from("another release")), /Versão/);
});
