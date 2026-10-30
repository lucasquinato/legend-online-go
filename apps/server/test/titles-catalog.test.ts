import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { titleCatalog, TitleCatalog, describeTitleRequirement, titleConditions, titleAttributeUnlock, type TitleCatalogInput } from "../src/features/titles/index.js";
import { AttributeCalculator } from "../src/attributes.js";
import { projectRoot } from "../src/config.js";
import { prepareTitleCatalog } from "../scripts/import-title-content.js";

const input = (): TitleCatalogInput => JSON.parse(readFileSync(join(projectRoot, "reference/titles/content.json"), "utf8"));

test("títulos: catálogo reproduz o acervo do backend e todas as referências possuem origem", () => {
  const recovered = prepareTitleCatalog();
  assert.deepEqual(input(), recovered, "reimportar o acervo deve produzir o mesmo catálogo");
  const bundle = readFileSync(join(projectRoot, recovered.sources.bundle.path));
  assert.equal(createHash("sha256").update(bundle).digest("hex"), recovered.sources.bundle.sha256);
  assert.equal(titleCatalog.all.length, 951);
  assert.equal(recovered.properties.length, 176);
  assert.equal(titleCatalog.all.filter(t => t.effects.length).length, 950);
  assert.equal(new Set(titleCatalog.all.map(t => t.requirement.conditionType)).size, 52);
  for (const title of titleCatalog.all) {
    assert.equal(title.requirement.evaluation, "pending-integration");
    assert.equal(title.requirement.definitionStatus, "documented");
    assert.equal(title.effects.length, title.skillIds.length);
    assert.equal(title.buffers.length, title.bufferIds.length);
    for (const effect of title.effects) assert.equal(effect.mode, "flat");
  }
});

test("títulos: efeitos conhecidos são brutos, sem conversão ou percentual aplicado fora da central", () => {
  assert.deepEqual(titleCatalog.get(26)!.effects[0]!.values, { total_phy_attack: 40, total_magic_attack: 40 });
  assert.deepEqual(titleCatalog.get(27)!.effects[0]!.values, { total_force_hit: 95, total_parry: 95 });
  assert.deepEqual(titleCatalog.get(66)!.effects[0]!.values, { total_live: 120 });
  assert.deepEqual(titleCatalog.get(85)!.effects[0]!.values, { total_phy_attack: 1200, total_magic_attack: 1200, total_live: 6000 });
  assert.deepEqual(titleCatalog.get(431)!.effects, []);
  // Demonstrates the catalog's contract without installing a source on any account.
  const panel = AttributeCalculator.calculate({ version: 1, sources: {
    title: { kind: "permanent", evidence: "recovered-table", values: { ...titleCatalog.get(85)!.effects[0]!.values } },
    passive: { kind: "permanent", evidence: "recovered-table", values: {}, percentages: { total_magic_attack: 15 } },
  } });
  assert.equal(panel.total_magic_attack, 1380);
  assert.equal(panel.total_live, 6000);
});

test("títulos: filtros respeitam classe, categorias e famílias sem esconder requisitos futuros", () => {
  assert.equal(titleCatalog.list({ domain: "mounts" }).length, 486);
  assert.equal(titleCatalog.list({ requirementKey: "fashion.collection" }).length, 275);
  assert.equal(titleCatalog.list({ requirementKey: "fashion.level" }).length, 3);
  for (const [category, count] of [[1, 30], [2, 35], [3, 5], [4, 881]] as const)
    assert.equal(titleCatalog.list({ category }).length, count);
  assert.ok(titleCatalog.list({ job: 3 }).some(t => t.id === 5));
  assert.ok(!titleCatalog.list({ job: 3 }).some(t => t.id === 3 || t.id === 4));
  assert.equal(titleCatalog.get(25)!.hiddenUntilOwned, true);
  assert.equal(titleCatalog.get(65)!.hiddenUntilOwned, true);
  assert.equal(titleCatalog.get(999999), undefined);
});

test("títulos: condições compostas, IDs de coleções e validade preservam semântica e dados originais", () => {
  const farm = titleCatalog.get(66)!;
  assert.equal(farm.requirement.rawParameters, "1,100|2,100");
  assert.deepEqual(farm.requirement.groups, [["1", "100"], ["2", "100"]]);
  assert.equal(farm.requirement.clientShowsProgress, true);
  const set = titleCatalog.get(1015)!;
  assert.equal(set.requirement.key, "fashion.collection");
  assert.deepEqual(set.requirement.groups, [["1098020", "1108020", "1118020", "1128020"]]);
  assert.equal(titleCatalog.get(7)!.requirement.parameterLayout, "opaque", "Para do título de cosmo não pode virar um nível inventado");
  assert.equal(titleCatalog.get(140)!.validity.rawTime, "3");
  assert.equal(titleCatalog.get(140)!.validity.timeUnit, "unresolved");
  assert.equal(titleCatalog.get(140)!.validity.expiresAtAuthority, "server");
  assert.equal(titleAttributeUnlock.minimumLevel, 14);
  assert.equal(titleAttributeUnlock.originalMinimumLevel, 45);
  assert.equal(titleAttributeUnlock.questId, 936);
});

test("títulos: condição desconhecida permanece pendente e aceita descrição por um adaptador futuro", () => {
  const unknown = describeTitleRequirement(9000, "event-uuid,phase-a|boss,score");
  assert.equal(unknown.key, "unmapped:9000");
  assert.equal(unknown.definitionStatus, "unmapped");
  assert.equal(unknown.evaluation, "pending-integration");
  assert.deepEqual(unknown.groups, [["event-uuid", "phase-a"], ["boss", "score"]]);
  const data = input(), original = data.titles[0]!;
  data.titles = [{ ...original, CondtionType: "9000", Para: "12" }];
  const pending = new TitleCatalog(data).all[0]!;
  assert.equal(pending.requirement.definitionStatus, "unmapped");
  const extended = new TitleCatalog(data, [...titleConditions, {
    type: 9000, key: "future.boss", domain: "future", description: "Condição descrita pelo sistema futuro", parameters: "target",
  }]);
  assert.equal(extended.all[0]!.requirement.key, "future.boss");
  assert.equal(extended.all[0]!.requirement.evaluation, "pending-integration", "descrever não concede nem implementa a condição");
});

test("títulos: defeitos no acervo falham explicitamente e não eliminam atributos silenciosamente", () => {
  const duplicated = input(); duplicated.titles = [...duplicated.titles, duplicated.titles[0]!];
  assert.throws(() => new TitleCatalog(duplicated), /duplicado/);
  const missing = input(); missing.properties = missing.properties.filter(p => p.TemplateId !== "8126");
  assert.throws(() => new TitleCatalog(missing), /8126.*sem habilidade\/propriedade/);
  const negative = input(); negative.properties = negative.properties.map(p => p.TemplateId === "8126" ? { ...p, Attack: "-1" } : p);
  assert.throws(() => new TitleCatalog(negative), /não suportada/);
  const unhandled = input(); unhandled.properties = unhandled.properties.map(p => p.TemplateId === "8126" ? { ...p, FutureDamage: "50" } : p);
  assert.throws(() => new TitleCatalog(unhandled), /FutureDamage/);
  assert.throws(() => describeTitleRequirement(203, "100,100"), /distintas/);
  assert.throws(() => describeTitleRequirement(202, "0"), /positivo/);
  assert.throws(() => new TitleCatalog(input(), [...titleConditions, titleConditions[0]!]), /duplicado/);
});

test("títulos: catálogo é imutável e efeitos compartilhados continuam ligados a cada título", () => {
  const data = input(), catalog = new TitleCatalog(data);
  const before = catalog.get(26)!.raw.Title;
  (data.titles.find(t => t.TemplateId === "26") as Record<string, string>).Title = "alterado";
  assert.equal(catalog.get(26)!.raw.Title, before);
  assert.throws(() => { (catalog.get(26)!.effects[0]!.values as Record<string, number>).total_magic_attack = 999; }, TypeError);
  assert.ok(Object.isFrozen(catalog.all));
  assert.ok(Object.isFrozen(catalog.list({ job: 3 })));
  const shared = catalog.all.filter(t => t.skillIds.includes(8957));
  assert.ok(shared.length > 1);
  assert.equal(new Set(shared.map(t => t.id)).size, shared.length);
  assert.ok(shared.every(t => t.effects[0]!.values.total_live === 3000));
});
