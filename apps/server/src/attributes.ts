import type { Message } from "./messages.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./config.js";
import { calculateCombatModifiers, type CombatModifierInput } from "./features/attributes/combat-modifiers.js";
const primaryConversions: Record<string, Record<string, number>> = JSON.parse(
  readFileSync(
    join(projectRoot, "reference/attribute-conversions.json"),
    "utf8",
  ),
).conversion;
const naturalClasses: {
  revision: number;
  classes: Record<
    string,
    {
      name: string;
      primary: Record<string, number>;
      flat: Record<string, number>;
    }
  >;
} = JSON.parse(
  readFileSync(join(projectRoot, "reference/natural-class-bases.json"), "utf8"),
);

export type AttributeKind =
  "natural" | "permanent" | "equipment" | "other" | "unresolved";
export interface AttributeSource {
  kind: AttributeKind;
  evidence:
    | "captured-base"
    | "observed-delta"
    | "recovered-table"
    | "local-balance"
    | "unresolved";
  values: Record<string, number>;
  /** Non-negative source-local reductions (e.g. tattoo tradeoffs). */
  deductions?: Record<string, number>;
  // Kept for archive readability. Every active source is raw and the central
  // calculator converts its primaries, irrespective of this legacy marker.
  derivePrimary?: boolean;
  percentages?: Record<string, number>;
  /** Elemental damage reductions in percentage points; reserved, not executed by battle. */
  elementalReductions?: Partial<Record<"wind"|"water"|"fire"|"elect"|"light"|"dark"|"wind_water"|"fire_elect"|"light_dark",number>>;
  combatModifiers?: CombatModifierInput[];
  factors?: { values: Record<string, number>; factor: number; percent?: number }[];
  // Source-local effects (fashion refinement, mount soul) are evaluated here,
  // before primary conversion and the character-wide percentage layer.
  scaling?: { values: Record<string, number>; percent: number; rounding?: "floor" | "ceil"; cap?: number; finalPercent?: number }[];
}
export interface AttributeState {
  version: 1;
  calculationVersion?: 2;
  sources: Record<string, AttributeSource>;
  naturalProgression?: {
    baselineLevel: 10;
    baseline: AttributeSource;
    classJob?: number;
    revision?: number;
  };
}
export const isAttribute = (key: string): boolean =>
  /^(base_|total_)/.test(key) ||
  [
    "fighting_capacity",
    "fireResi",
    "waterResi",
    "electResi",
    "windResi",
    "darkResi",
    "lightResi",
    "reduce_resi",
  ].includes(key);

export function attributeSnapshot(hero: Message): Record<string, number> {
  return Object.fromEntries(
    Object.entries(hero).filter(
      ([key, value]) =>
        isAttribute(key) && typeof value === "number" && Number.isFinite(value),
    ),
  );
}

export function calculateAttributes(state: AttributeState): Record<string, number> {
  // Initial fury is battle metadata, not a field of HeroInfo/SimpleHeroInfo.
  const { total_initial_fury, total_gold_production, ...panel } = AttributeCalculator.calculate(state);
  return panel;
}

function validateRaw(values: Record<string, number>): void {
  for (const [key, value] of Object.entries(values))
    if (!isAttribute(key) || key === "fighting_capacity" || !Number.isFinite(value) || value < 0)
      throw new Error(`Fonte bruta inválida: ${key}=${value}`);
}

/** One evaluator for every source-local calculation and every character total. */
export class AttributeCalculator {
  static snapshot(state: AttributeState) { return { attributes: this.calculate(state), combatModifiers: this.combat(state), elementalReductions: this.elementalReductions(state) }; }
  static elementalReductions(state: AttributeState): Record<string,number> {
    const result:Record<string,number>={};
    for(const source of Object.values(state.sources))for(const [element,value]of Object.entries(source.elementalReductions??{})){
      if(!["wind","water","fire","elect","light","dark","wind_water","fire_elect","light_dark"].includes(element)||typeof value!=="number"||!Number.isFinite(value)||value<0||value>100)throw new Error("Redução elemental inválida");
      result[element]=Math.min(100,(result[element]??0)+value);
    }
    return result;
  }
  /** Kept outside the Flash panel. No random rolls, damage or HP changes occur here. */
  static combat(state: AttributeState) { return calculateCombatModifiers(state.sources); }
  static sourceValues(source: AttributeSource): Record<string, number> {
    validateRaw(source.values);
    const result = { ...source.values };
    for (const entry of source.factors ?? []) {
      validateRaw(entry.values);
      if (!Number.isSafeInteger(entry.factor) || entry.factor < 0 || !Number.isFinite(entry.percent ?? 0) || (entry.percent ?? 0) < 0) throw new Error("Fator de fonte inválido");
      for (const [key, value] of Object.entries(entry.values)) {
        const base = value * entry.factor;
        result[key] = (result[key] ?? 0) + base + Math.floor(base * (entry.percent ?? 0) / 100);
      }
    }
    for (const scale of source.scaling ?? []) {
      validateRaw(scale.values);
      if (!Number.isFinite(scale.percent) || scale.percent < 0 || (scale.cap !== undefined && (!Number.isFinite(scale.cap) || scale.cap < 0)) || (scale.finalPercent !== undefined && (!Number.isFinite(scale.finalPercent) || scale.finalPercent < 0)))
        throw new Error("Multiplicador bruto inválido");
      const round = scale.rounding === "ceil" ? Math.ceil : Math.floor;
      for (const [key, value] of Object.entries(scale.values)) {
        let bonus = round(value * scale.percent / 100);
        if (scale.cap !== undefined) bonus = Math.min(bonus, scale.cap);
        if (scale.finalPercent !== undefined) bonus = round(bonus * scale.finalPercent / 100);
        result[key] = (result[key] ?? 0) + bonus;
      }
    }
    validateRaw(source.deductions ?? {});
    for (const [key,value] of Object.entries(source.deductions ?? {})) result[key]=(result[key]??0)-value;
    return result;
  }
  static calculate(state: AttributeState): Record<string, number> {
    this.combat(state);
    const result: Record<string, number> = {}, percentages: Record<string, number> = {};
    for (const [id, source] of Object.entries(state.sources)) {
      if (source.kind === "unresolved" || id === "unresolved") throw new Error("Fonte histórica não pode participar do cálculo central");
      for (const [key, value] of Object.entries(this.sourceValues(source))) result[key] = (result[key] ?? 0) + value;
      validateRaw(source.percentages ?? {});
      for (const [key, value] of Object.entries(source.percentages ?? {})) percentages[key] = (percentages[key] ?? 0) + value;
    }
    for (const key of Object.keys(result)) result[key]=Math.max(0,result[key]!);
    for (const [key, value] of Object.entries(primaryAttributeEffects(result))) result[key] = (result[key] ?? 0) + value;
    for (const [key, value] of Object.entries(percentages)) result[key] = (result[key] ?? 0) * (1 + value / 100);
    for (const key of Object.keys(result)) result[key] = Math.floor(result[key]!);
    result.fighting_capacity = combatCapacity(result);
    return result;
  }
}

export function naturalAttributeSource(job: number, level: number): AttributeSource {
  const profile = naturalClasses.classes[job];
  if (!profile) throw new Error(`Classe inválida para a base natural: ${job}`);
  const factor = Math.max(1, level - 10), values: Record<string, number> = {};
  for (const [key, value] of Object.entries({ ...profile.primary }))
    for (const prefix of ["base", "total"]) values[`${prefix}_${key}`] = value * factor;
  for (const [key, value] of Object.entries(profile.flat))
    for (const prefix of ["base", "total"]) values[`${prefix}_${key}`] = value * factor;
  for (const key of ["phy_attack", "magic_attack", "phy_defence", "magic_defence", "live", "conat_army", "force_hit", "parry", "strength", "tenacity", "penetrate", "stunAttr"])
    for (const prefix of ["base", "total"]) values[`${prefix}_${key}`] ??= 0;
  for (const key of ["fireResi", "waterResi", "electResi", "windResi", "darkResi", "lightResi", "reduce_resi", "total_initial_fury"]) values[key] = 0;
  return { kind: "natural", evidence: "local-balance", values, derivePrimary: true };
}

export function primaryAttributeEffects(
  values: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const prefix of ["base", "total"])
    for (const [primary, conversions] of Object.entries(primaryConversions))
      for (const [attribute, multiplier] of Object.entries(conversions)) {
        const amount = (values[`${prefix}_${primary}`] ?? 0) * multiplier;
        if (amount)
          result[`${prefix}_${attribute}`] =
            (result[`${prefix}_${attribute}`] ?? 0) + amount;
      }
  return result;
}
// BaseArmy.heroRace and AttackProrertyInfo.totalAttribute in the recovered code.
export function combatCapacity(v: Record<string, number>): number {
  return Math.floor(
    (v.total_phy_attack ?? 0) +
      (v.total_phy_defence ?? 0) +
      Math.floor((v.total_magic_attack ?? 0) * 1.05) +
      (v.total_magic_defence ?? 0) +
      (v.total_force_hit ?? 0) +
      (v.total_live ?? 0) / 5 +
      (v.total_conat_army ?? 0),
  );
}

/** Public baseline is raw; primary conversion always belongs to AttributeCalculator. */
export function classNaturalAttributes(job: number): AttributeSource { return naturalAttributeSource(job, 10); }
export function synchronizeNaturalAttributes(state: AttributeState, level: number, job?: number): void {
  const classJob = job ?? state.naturalProgression?.classJob ?? 1;
  state.calculationVersion = 2;
  state.sources.natural = naturalAttributeSource(classJob, level);
  state.naturalProgression = { baselineLevel: 10, baseline: naturalAttributeSource(classJob, 10), classJob, revision: naturalClasses.revision };
}

export function addAttributeContribution(state: AttributeState, id: string, kind: AttributeKind, values: Record<string, number>, evidence: AttributeSource["evidence"] = "recovered-table"): void {
  if (kind === "unresolved" || id === "unresolved") throw new Error("Não é permitido adicionar resíduos ao cálculo central");
  validateRaw(values);
  const source = state.sources[id] ??= { kind, evidence, values: {} };
  if (source.kind !== kind) throw new Error("Origem de atributo incompatível: " + id);
  for (const [key, value] of Object.entries(values)) source.values[key] = (source.values[key] ?? 0) + value;
}

/** Replacement is used for an active equipment contribution; it never subtracts other sources. */
export function replaceAttributeContribution(state: AttributeState, id: string, source?: AttributeSource): void {
  if (!source) { delete state.sources[id]; return; }
  AttributeCalculator.sourceValues(source); validateRaw(source.percentages ?? {});
  if (source.kind === "unresolved" || id === "unresolved") throw new Error("Fonte histórica inválida");
  state.sources[id] = structuredClone(source);
}

export function applyAttributes(state: AttributeState, hero: Message): void {
  const panel = calculateAttributes(state);
  for (const key of Object.keys(hero)) if (isAttribute(key)) hero[key] = 0;
  Object.assign(hero, panel);
  // Current HP is combat state, not a permanent contribution. A larger maximum does not heal.
  if (typeof hero.hp === "number" && typeof hero.total_live === "number")
    hero.hp = Math.max(0, Math.min(hero.hp, hero.total_live));
}
