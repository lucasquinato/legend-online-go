import { test } from "node:test";
import assert from "node:assert/strict";
import { classNaturalAttributes, calculateAttributes, synchronizeNaturalAttributes, addAttributeContribution, replaceAttributeContribution, applyAttributes, type AttributeState } from "../src/attributes.js";

// Replaces the old contract that preserved deltas from captured panels.
test("baseline pública fornece primários brutos das três classes, sem converter fora do centro", () => {
  const rows = [1,2,3].map(job=>calculateAttributes({version:1,calculationVersion:2,sources:{natural:classNaturalAttributes(job)}}));
  assert.equal(rows[0]!.total_phy_attack,127);assert.equal(rows[1]!.total_phy_attack,167);assert.equal(rows[2]!.total_magic_attack,147);
  assert.ok(rows[0]!.total_live!>rows[1]!.total_live!&&rows[1]!.total_live!>rows[2]!.total_live!);
  assert.equal(classNaturalAttributes(1).values.total_phy_attack,7);assert.equal(classNaturalAttributes(3).values.total_magic_attack,7);
  assert.throws(()=>classNaturalAttributes(0),/Classe inválida/);
});
test("crescimento natural substitui a fonte sem escalar bônus permanentes ou curar", () => {
  for(const job of [1,2,3]){
    const s:AttributeState={version:1,calculationVersion:2,sources:{}};
    replaceAttributeContribution(s,"appraisal",{kind:"permanent",evidence:"recovered-table",values:{total_intellect:400}});
    const bonus=structuredClone(s.sources.appraisal), hero:any={hp:50};
    for(const [level,factor] of [[10,1],[11,1],[12,2],[27,17]]){
      synchronizeNaturalAttributes(s,level!,job);applyAttributes(s,hero);
      const base=calculateAttributes({version:1,sources:{natural:classNaturalAttributes(job)}});
      assert.equal(hero.total_magic_attack,base.total_magic_attack!*factor!+1600);assert.equal(hero.hp,50);
      assert.deepEqual(s.sources.appraisal,bonus);
    }
    const once=structuredClone(s);synchronizeNaturalAttributes(s,27,job);assert.deepEqual(s,once);
    assert.deepEqual(calculateAttributes(JSON.parse(JSON.stringify(s))),calculateAttributes(s));
  }
});
test("substituir ou remover equipamento preserva as demais fontes, sem subtrações permanentes", () => {
  const s:AttributeState={version:1,calculationVersion:2,sources:{}};
  addAttributeContribution(s,"sanctuary","permanent",{total_phy_attack:158});
  const weapon={kind:"equipment" as const,evidence:"recovered-table" as const,values:{total_phy_attack:52}};
  replaceAttributeContribution(s,"weapon",weapon);replaceAttributeContribution(s,"weapon",weapon);
  assert.equal(calculateAttributes(s).total_phy_attack,210);replaceAttributeContribution(s,"weapon");assert.equal(calculateAttributes(s).total_phy_attack,158);
  assert.throws(()=>addAttributeContribution(s,"correction","equipment",{total_phy_attack:-33}));assert.equal(s.sources.correction,undefined);
  assert.throws(()=>addAttributeContribution(s,"unresolved","unresolved",{total_phy_attack:10}));
});
test("fonte inválida não apaga o painel existente quando o cálculo falha", () => {
  const s:AttributeState={version:1,sources:{bad:{kind:"equipment",evidence:"observed-delta",values:{total_phy_attack:-1}}}};
  const hero={total_phy_attack:200,total_live:500,hp:300}, before=structuredClone(hero);
  assert.throws(()=>applyAttributes(s,hero));assert.deepEqual(hero,before);
});
