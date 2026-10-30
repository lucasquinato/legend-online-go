import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../src/config.js";
import {
  titleCatalog, TitleCatalog, titleConditions, TitleRequirementEvaluator, defaultTitleRules,
  thresholdTitleRule, localTitleFactReader, initialTitleSave, recordTitleProgress,
  type TitleEvaluationContext, type TitleFact, type TitleProgressValue, type TitleCatalogInput,
} from "../src/features/titles/index.js";

const engine = new TitleRequirementEvaluator();
const fact = (value: TitleProgressValue): TitleFact => ({ subjectId: 19, observedAt: 1000, complete: true, origin: { system: "test", reference: "verified-snapshot" }, value });
function context(values: Record<string, TitleProgressValue> = {}): TitleEvaluationContext {
  return { subjectId: 19, job: 3, now: 1000, readFact: key => Object.hasOwn(values, key) ? fact(values[key]!) : undefined };
}
const evaluate = (id: number, values: Record<string, TitleProgressValue> = {}) => engine.evaluate(titleCatalog.get(id)!, context(values));
const mount = (id: number, expiresAt: number | null = null) => ({ id, activatedAt: 100, expiresAt, stars: 0, blessing: 0, flightUnlocked: false });

test("títulos: nível da moda avalia limiares de todos os títulos da família sem conceder posse", () => {
  for (const [level, obtained] of [[99, 0], [100, 1], [139, 1], [140, 2], [179, 2], [180, 3], [200, 3]]) {
    const results = engine.evaluateAll(titleCatalog, context({ "fashion.level": level! }), { requirementKey: "fashion.level" });
    assert.equal(results.filter(r => r.status === "fulfilled").length, obtained);
    assert.ok(results.every(r => r.reason === "evaluated"));
  }
  const save = initialTitleSave(), result = evaluate(85, { "fashion.level": 100 });
  recordTitleProgress(save, titleCatalog, 85, result.progress!);
  assert.equal(save.entries[85]!.progress!.status, "completed");
  assert.equal(save.entries[85]!.ownership, undefined);
  assert.equal(save.attributeAccess.unlocked, false);
  assert.equal(evaluate(85, { "fashion.level": 201 }).reason, "invalid-facts");
});

test("títulos: coleções exigem IDs exatos; repetição de peça não substitui uma peça ausente", () => {
  const set = titleCatalog.get(1015)!, ids = set.requirement.groups[0]!.map(Number);
  const partial = evaluate(1015, { "fashion.activeIds": [ids[0]!, ids[0]!, ids[1]!, ids[2]!] });
  assert.equal(partial.status, "unfulfilled");
  assert.deepEqual(partial.progress!.values.missingIds, [ids[3]]);
  assert.equal(partial.progress!.wireValue, "3");
  assert.equal(evaluate(1015, { "fashion.activeIds": [...ids, ids[0]!] }).status, "fulfilled");
  const target = Number(titleCatalog.get(1008)!.requirement.groups[0]![0]);
  assert.equal(evaluate(1008, { "mounts.activeIds": [target + 1] }).status, "unfulfilled");
  assert.equal(evaluate(1008, { "mounts.activeIds": [target] }).status, "fulfilled");
});

test("títulos: snapshot de montarias considera ativação e validade, sem tocar seleção ou save", () => {
  const id = Number(titleCatalog.get(1008)!.requirement.groups[0]![0]);
  const snapshot = { mounts: { owned: { [id]: mount(id, 2000) } } };
  const before = structuredClone(snapshot), reader = localTitleFactReader(snapshot, 19, 1000);
  snapshot.mounts.owned[id]!.expiresAt = 999;
  const ctx = { ...context(), readFact: reader };
  assert.equal(engine.evaluate(titleCatalog.get(1008)!, ctx).status, "fulfilled", "leitor usa uma cópia estável");
  assert.equal(engine.evaluate(titleCatalog.get(1008)!, { ...ctx, now: 2000 }).reason, "invalid-facts", "snapshot antigo não serve para outro instante");
  const expired = localTitleFactReader(before, 19, 2000);
  assert.equal(engine.evaluate(titleCatalog.get(1008)!, { ...context(), now: 2000, readFact: expired }).status, "unfulfilled");
  const future = { mounts: { owned: { [id]: { ...mount(id), activatedAt: 2000 } } } };
  assert.equal(engine.evaluate(titleCatalog.get(1008)!, { ...context(), readFact: localTitleFactReader(future, 19, 1000) }).status, "unfulfilled");
  assert.deepEqual(before.mounts.owned[id]!.expiresAt, 2000);
});

test("títulos: moda ativada difere de item não ativado; nível e coleção são fatos independentes", () => {
  const ids = titleCatalog.get(1015)!.requirement.groups[0]!.map(Number);
  const snapshot = { fashion: { level: 180 }, state: { fashions: Object.fromEntries(ids.map((id, i) => [id, { temp_id: id, is_switch: i === 0 ? 0 : 1 }])) } };
  const before = structuredClone(snapshot), ctx = { ...context(), readFact: localTitleFactReader(snapshot, 19, 1000) };
  assert.equal(engine.evaluate(titleCatalog.get(87)!, ctx).status, "fulfilled");
  assert.equal(engine.evaluate(titleCatalog.get(1015)!, ctx).status, "unfulfilled");
  assert.deepEqual(snapshot, before);
  assert.equal(evaluate(1015).reason, "missing-facts");
  assert.equal(evaluate(1015, { "fashion.activeIds": [] }).status, "unfulfilled");
});

test("títulos: entrar no piso final não prova vitória; normal e abismo usam históricos separados", () => {
  const assess = (snapshot: any) => engine.evaluateAll(titleCatalog, { ...context(), readFact: localTitleFactReader(snapshot, 19, 1000) }, { domain: "labyrinth" });
  const missing = assess({ labyrinth: { floor: 100, entered: true, abyss: { floor: 30 } } });
  assert.ok(missing.every(r => r.status === "pending-integration"));
  const partial = assess({ labyrinth: { record: 99, cleared: [99], floor: 100, abyss: { record: 29, cleared: [29], floor: 30 } } });
  assert.ok(partial.every(r => r.status === "unfulfilled"));
  const complete = assess({ labyrinth: { record: 100, cleared: [], floor: 1, abyss: { cleared: [30] } } });
  assert.ok(complete.every(r => r.status === "fulfilled"));
  assert.equal(assess({ labyrinth: { record: 1000, cleared: [] } }).find(r => r.titleId === 26)!.reason, "invalid-facts");
});

test("títulos: contadores compostos preservam progresso por ação e exigem as duas metas", () => {
  assert.equal(evaluate(66).reason, "missing-facts");
  assert.equal(evaluate(66, { "farm.lifetimeCareCounts": { "1": 100 } }).reason, "incomplete-facts");
  const partial = evaluate(66, { "farm.lifetimeCareCounts": { "1": 150, "2": 99 } });
  assert.equal(partial.status, "unfulfilled"); assert.equal(partial.progress!.wireValue, "1,150|2,99");
  assert.equal(evaluate(66, { "farm.lifetimeCareCounts": { "1": 150, "2": 100 } }).status, "fulfilled");
  const snapshot: any = { state: { farms: { planted: 999, logs: ["clean"] } } };
  assert.equal(localTitleFactReader(snapshot, 19, 1000)("farm.lifetimeCareCounts"), undefined, "plantios/logs não viram contadores históricos inventados");
});

test("títulos: dados ausentes, incompletos, de outra conta ou de outro instante nunca aprovam", () => {
  for (const update of [{ subjectId: 20 }, { observedAt: 999 }, { observedAt: 1001 }, { complete: false }, { value: NaN }]) {
    const result = engine.evaluate(titleCatalog.get(85)!, { ...context(), readFact: () => ({ ...fact(200), ...update }) });
    assert.equal(result.status, "pending-integration"); assert.equal(result.progress, undefined);
  }
  for (const value of [-1, 1.5, "200", null, true, {}]) assert.equal(evaluate(85, { "fashion.level": value }).reason, "invalid-facts");
  const ctx = { ...context(), readFact: () => { throw new Error("provider failed"); } };
  assert.equal(engine.evaluate(titleCatalog.get(85)!, ctx).reason, "provider-error");
  assert.throws(() => engine.evaluate(titleCatalog.get(85)!, { ...context(), subjectId: 0 }), /inválido/);
});

test("títulos: famílias ambíguas e desconhecidas ficam pendentes sem apagar progresso", () => {
  for (const id of [7, 39, 431]) {
    const title = titleCatalog.get(id); if (!title) continue;
    const result = engine.evaluate(title, context({ "cosmos.maxLevel": 10, "vip.level": 9 }));
    assert.equal(result.status, "pending-integration"); assert.equal(result.reason, "unsupported-condition");
    assert.equal(result.progress, undefined);
  }
  const save = initialTitleSave(), ready = evaluate(85, { "fashion.level": 140 });
  recordTitleProgress(save, titleCatalog, 85, ready.progress!);
  const before = structuredClone(save);
  evaluate(85);
  assert.deepEqual(save, before);
});

test("títulos: restrição de classe impede avaliação e leitores não são consultados", () => {
  let reads = 0;
  const result = engine.evaluate(titleCatalog.get(5)!, { ...context(), job: 1, readFact: () => { reads++; return fact(999); } });
  assert.equal(result.status, "unfulfilled"); assert.equal(result.reason, "class-restriction");
  assert.equal(result.progress, undefined); assert.equal(reads, 0);
});

test("títulos: um adaptador futuro adiciona regra sem mudar o catálogo ou os avaliadores existentes", () => {
  const input = JSON.parse(readFileSync(join(projectRoot, "reference/titles/content.json"), "utf8")) as TitleCatalogInput;
  input.titles = [{ ...input.titles[0]!, TemplateId: "9000", Job: "0", CondtionType: "9000", Para: "25" }];
  const catalog = new TitleCatalog(input, [...titleConditions, { type: 9000, key: "future.level", domain: "future", description: "Meta verificada pelo sistema futuro", parameters: "target" }]);
  const title = catalog.get(9000)!;
  assert.equal(engine.evaluate(title, context()).reason, "unsupported-condition");
  const extended = new TitleRequirementEvaluator([...defaultTitleRules, thresholdTitleRule(9000, "future.level", "future.level")]);
  assert.equal(extended.evaluate(title, context({ "future.level": 24 })).status, "unfulfilled");
  assert.equal(extended.evaluate(title, context({ "future.level": 25 })).status, "fulfilled");
  assert.throws(() => new TitleRequirementEvaluator([...defaultTitleRules, defaultTitleRules[0]!]), /duplicado/);
  const malformed = { ...title, requirement: { ...title.requirement, groups: [["1", "25"]] } };
  assert.equal(extended.evaluate(malformed, context({ "future.level": 99 })).reason, "unsupported-parameters");
});

test("títulos: lote compartilha observações, resultados são imutáveis e avaliador defeituoso não aprova", () => {
  const counts = new Map<string, number>();
  const batch = engine.evaluateAll(titleCatalog, { ...context(), readFact: key => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return key === "fashion.activeIds" ? fact([]) : undefined;
  } });
  assert.equal(batch.length, 951);
  assert.ok([...counts.values()].every(n => n === 1));
  assert.equal(batch.filter(r => r.status === "fulfilled").length, 0);
  assert.ok(Object.isFrozen(batch));
  const result = evaluate(85, { "fashion.level": 100 });
  assert.throws(() => { result.progress!.values.current = 999; }, TypeError);
  const broken = new TitleRequirementEvaluator([{ key: "fashion.level", conditionType: 102, evaluate: () => ({ met: true, values: { current: NaN }, wireValue: "" }) }]);
  assert.equal(broken.evaluate(titleCatalog.get(85)!, context()).reason, "evaluator-error");
});
