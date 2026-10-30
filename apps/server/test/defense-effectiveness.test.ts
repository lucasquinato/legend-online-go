import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFENSE_EFFECTIVENESS, DEFENSE_K_MIN, DEFENSE_K_ADDITIONAL, DEFENSE_K_REFERENCE, DEFENSE_K_EXPONENT, defenseEffectiveness, baseDamage, offensiveDamage, resolveDamage } from "../src/features/battle/mechanics.js";
import { createEngine, execute, makeActor } from "../src/features/battle/engine.js";
import { skills } from "../src/features/battle/content.js";
import { runeBattleContract } from "../src/features/runes/index.js";

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= Math.max(Number.MIN_VALUE, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
}

// Independent direct reference for ordinary-scale operands (not the stable production implementation).
const referenceK = (d: number) => 5 + 2 * d ** 3 / (d ** 3 + 1500000 ** 3);
const referenceDamage = (a: number, d: number) => a === 0 ? 0 : a ** 2 / (a + referenceK(d) * d);

test("defesa: parâmetros centrais e fórmula dinâmica reproduzem a referência e preservam coeficiente/fixo", () => {
  assert.deepEqual([DEFENSE_K_MIN, DEFENSE_K_ADDITIONAL, DEFENSE_K_REFERENCE, DEFENSE_K_EXPONENT], [5, 2, 1500000, 3]);
  assert.equal(DEFENSE_EFFECTIVENESS, DEFENSE_K_MIN);
  for (const d of [0, 5000, 10000, 20000, 50000, 100000]) {
    const old = 10000 ** 2 / (10000 + 5 * d);
    near(baseDamage(10000, d), referenceDamage(10000, d));
    assert.ok(baseDamage(10000, d) <= old);
  }
  near(baseDamage(10000, 5000), referenceDamage(10000, 5000));
  near(offensiveDamage(10000, 5000, 1.2), referenceDamage(10000, 5000) * 1.2);
  near(offensiveDamage(10000, 5000, 1.2, 100), referenceDamage(10000, 5000) * 1.2 + 100);
});

test("defesa: tabela de K e casos reais das três contas usam a mesma curva", () => {
  for (const [d, k] of [[0, 5.0], [10000, 5.0], [100000, 5.00059], [500000, 5.07143], [1000000, 5.45714], [1500000, 6.0], [2000000, 6.40659], [3000000, 6.77778], [5000000, 6.94742], [10000000, 6.99327], [5530646, 6.96088], [5399455, 6.95802]]) {
    assert.ok(Math.abs(defenseEffectiveness(d!) - k!) <= .000005, `K(${d})`);
    near(defenseEffectiveness(d!), referenceK(d!));
  }
  for (const [a, d] of [[5924036, 5530646], [7339773, 5399455], [5629786, 5399455]]) near(baseDamage(a!, d!), referenceDamage(a!, d!));
});

test("defesa: K contínuo, crescente e estritamente abaixo da assíntota sem limitar pontos", () => {
  let previous = DEFENSE_K_MIN;
  for (const d of [0, Number.MIN_VALUE, 1, 1000, 10000, 100000, 500000, 1000000, 1500000, 2000000, 3000000, 1e7, 1e20, 1e200, Number.MAX_VALUE]) {
    const k = defenseEffectiveness(d);
    assert.ok(Number.isFinite(k) && k >= previous && k < 7); previous = k;
  }
  for (const d of [1000, 500000, 1000000, 1500000, 2000000, 3000000, 10000000]) {
    assert.ok(defenseEffectiveness(d - .001) <= defenseEffectiveness(d + .001));
    assert.ok(defenseEffectiveness(d + .001) - defenseEffectiveness(d - .001) < .000001);
  }
  assert.ok(7 - defenseEffectiveness(Number.MAX_VALUE) < 1e-12);
  for (const d of [-1, NaN, Infinity, -Infinity]) assert.equal(defenseEffectiveness(d), 5);
});

test("defesa: impacto gradual comparado a K=5 no início e no intermediário", () => {
  let previousReduction = 0;
  for (const d of [0, 1000, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000]) {
    const a = Math.max(1000, d), old = a ** 2 / (a + 5 * d), current = baseDamage(a, d);
    const reduction = 1 - current / old;
    assert.ok(reduction >= previousReduction); previousReduction = reduction;
    if (d <= 10000) assert.ok(reduction < .000002);
    if (d >= 2000000) assert.ok(reduction > .15);
  }
});

test("defesa: faixa 5–7 reduz dano com defesa baixa e aumenta com defesa alta frente à faixa 3–8,9", () => {
  const attack=1000000;
  for(const defence of [1000,10000,100000,5000000,10000000]) {
    const oldK=3+5.9*defence**3/(defence**3+1500000**3);
    const oldDamage=attack**2/(attack+oldK*defence);
    if(defence<=100000) assert.ok(baseDamage(attack,defence)<oldDamage);
    else assert.ok(baseDamage(attack,defence)>oldDamage);
  }
  assert.equal(baseDamage(attack,0),attack);
});

test("defesa: zero, valores inválidos e defesa maior não geram dano base negativo ou não finito", () => {
  assert.equal(baseDamage(0, 0), 0);
  assert.equal(baseDamage(0, 10000), 0);
  assert.equal(baseDamage(10000, 0), 10000);
  for (const invalid of [-10, NaN, Infinity, -Infinity]) {
    assert.equal(baseDamage(invalid, 100), 0);
    assert.equal(baseDamage(100, invalid), 100);
  }
  for (const a of [0, 1, 1000, 1e200, Number.MAX_VALUE]) {
    for (const d of [0, 1, 100000, 1e200, Number.MAX_VALUE]) {
      const value = baseDamage(a, d);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= a);
    }
  }
  assert.ok(baseDamage(1, 1e12) > 0);
  assert.equal(resolveDamage(baseDamage(1, 1e12), false, false), 1);
});

test("defesa: fórmula escala sem overflow, arredondamento intermediário ou limites artificiais", () => {
  near(baseDamage(1e200, 1e200), 1e200 / 8);
  near(baseDamage(Number.MAX_VALUE, Number.MAX_VALUE), Number.MAX_VALUE / 8);
  near(baseDamage(1e308, 5e307), 1e308 / 4.5);
  near(baseDamage(1e100, 1e300), 1e-100 / 7);
  near(baseDamage(1e-100, 1e100), 1e-300 / 7);
  near(baseDamage(1e-200, 1e-200), 1e-200 / 6);
  assert.equal(baseDamage(Number.MIN_VALUE, 0), Number.MIN_VALUE);
  near(baseDamage(1000, 1000), referenceDamage(1000, 1000));
  assert.notEqual(baseDamage(1000, 1000), Math.round(referenceDamage(1000, 1000)));
});

test("defesa: ataque é monotônico crescente e defesa monotônica decrescente", () => {
  const values = [0, 1e-10, 1, 100, 10000, 1e8, 1e100, 1e200, Number.MAX_VALUE];
  for (const fixed of values) {
    let previous = 0;
    for (const a of values) { const damage = baseDamage(a, fixed); assert.ok(damage >= previous); previous = damage; }
    previous = Infinity;
    for (const d of values) { const damage = baseDamage(fixed, d); assert.ok(damage <= previous); previous = damage; }
  }
});

function fixture(physical: number, magical: number) {
  const make = (id: number, side: number) => makeActor({ living_id: id, temp_id: side === 1 ? 3 : 1011, side, pos: side === 1 ? 6 : 2, hp: 1000000, max_hp: 1000000, grade: 80, sp: 100, skillId: [10000, 30000, 10711, 95, 96] },
    { attack: physical, magicAttack: magical, defence: 5000, magicDefence: 15000 }, 30000);
  const actor = make(1, 1), target = make(2, 2), engine = createEngine([actor, target], 1, 2);
  return { actor, target, engine };
}

test("defesa: ataques físicos, mágicos e de tropas/NPCs usam apenas sua defesa correspondente", () => {
  for (const [id, attack, defence] of [[10000, 10000, 5000], [30000, 20000, 15000], [95, 20000, 15000], [96, 20000, 15000], [10, 10000, 5000], [11, 10000, 5000]]) {
    const { actor, target, engine } = fixture(10000, 20000);
    actor.learned.push(id!);
    const before = JSON.stringify([actor.stats, target.stats]), row = skills.get(id!)!;
    const result = execute(engine, { actor: 1, skill: id!, targets: [2], sequence: 1, automatic: true }, 0, { hits: 1 });
    const expected = Math.round(referenceDamage(attack!, defence!) * Math.abs(Number(row.Parameter1)) / 100 + Number(row.Parameter2));
    assert.equal(result.canceled, false);
    assert.equal(result.damages[0]!.damage_value, expected, `skill ${id}`);
    assert.equal(JSON.stringify([actor.stats, target.stats]), before);
  }
});

test("defesa: adaptativo escolhe maior ataque, empate físico e nunca a menor defesa", () => {
  for (const [physical, magical, attack, defence] of [[2000000, 1000000, 2000000, 500000], [1000000, 2000000, 2000000, 5000000], [1000000, 1000000, 1000000, 500000]]) {
    const { actor, target, engine } = fixture(physical!, magical!);
    target.stats.defence = 500000;
    target.stats.magicDefence = 5000000;
    const state = JSON.parse(readFileSync("data/city/scenario.json", "utf8")).initial;
    state.player.grades = 80;
    state.hero.rune = { runeKey: "601", runeinfo: [{ rune_id: 601, rune_gp: 0, swallowCount: 0 }] };
    actor.runes = runeBattleContract(state); actor.learned.push(9601);
    const row = skills.get(9601)!;
    const result = execute(engine, { actor: 1, skill: 9601, targets: [2], sequence: 1, automatic: false }, 0, { hits: 1 });
    assert.equal(result.canceled, false);
    assert.equal(result.damages[0]!.damage_value, Math.max(1, Math.round(referenceDamage(attack!, defence!) * Math.abs(Number(row.Parameter1)) / 100 + Number(row.Parameter2))));
  }
});

test("defesa: físico e mágico iguais têm o mesmo resultado em todas as classes e níveis", () => {
  for (const level of [1, 11, 80]) for (const icon of [1, 2, 3, 4, 5, 6]) for (const skill of [10000, 30000]) {
    const { actor, target, engine } = fixture(20000, 20000);
    actor.template = icon; actor.stats.level = target.stats.level = level;
    target.stats.defence = target.stats.magicDefence = 500000;
    const result = execute(engine, { actor: 1, skill, targets: [2], sequence: 1, automatic: false }, 0, { hits: 1 });
    assert.equal(result.damages[0]!.damage_value, Math.round(referenceDamage(20000, 500000)));
  }
});

test("defesa: coeficiente e parcela fixa continuam antes dos modificadores e da divisão em impactos", () => {
  const { actor, engine } = fixture(10000, 20000), row = skills.get(10711)!;
  const expected = Math.round(referenceDamage(10000, 5000) * Math.abs(Number(row.Parameter1)) / 100 + Number(row.Parameter2));
  const result = execute(engine, { actor: actor.id, skill: 10711, targets: [2], sequence: 1, automatic: false }, 0, { hits: 3 });
  assert.equal(result.damages.length, 3);
  assert.equal(result.damages.reduce((sum, hit) => sum + hit.damage_value, 0), expected);
  assert.deepEqual(result.damages.map(hit => hit.damage_value), Array.from({ length: 3 }, (_, i) => Math.round(expected * (i + 1) / 3) - Math.round(expected * i / 3)));
});
