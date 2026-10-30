import type { TitleCatalog } from "./catalog.js";
import type { TitleCatalogFilter, TitleDefinition } from "./types.js";
import { validateTitleProgress, type TitleOrigin, type TitleProgress, type TitleProgressValue } from "./state.js";

export interface TitleFact {
  subjectId: number;
  observedAt: number;
  complete: boolean;
  origin: TitleOrigin;
  value: TitleProgressValue;
}
export type TitleFactReader = (key: string) => TitleFact | undefined;
export interface TitleEvaluationContext {
  subjectId: number;
  job: 1 | 2 | 3;
  now: number;
  readFact: TitleFactReader;
}
export type TitleEvaluationReason = "evaluated" | "class-restriction" | "unsupported-condition" | "unsupported-parameters" | "missing-facts" | "incomplete-facts" | "invalid-facts" | "provider-error" | "evaluator-error";
export interface TitleEvaluation {
  titleId: number;
  conditionType: number;
  requirementKey: string;
  subjectId: number;
  observedAt: number;
  status: "fulfilled" | "unfulfilled" | "pending-integration";
  reason: TitleEvaluationReason;
  factKeys: readonly string[];
  progress?: TitleProgress;
}
export interface TitleRuleResult {
  met: boolean;
  values: Record<string, TitleProgressValue>;
  wireValue: string;
}
export interface TitleRule {
  key: string;
  conditionType: number;
  evaluate(title: TitleDefinition, fact: (key: string) => TitleProgressValue): TitleRuleResult;
}
export class TitleEvaluationPending extends Error {
  constructor(readonly reason: Exclude<TitleEvaluationReason, "evaluated" | "class-restriction">) { super(reason); }
}
const pending = (reason: ConstructorParameters<typeof TitleEvaluationPending>[0]): never => { throw new TitleEvaluationPending(reason); };
function natural(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function target(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value) || !natural(Number(value)) || Number(value) === 0) return pending("unsupported-parameters");
  return Number(value);
}
function singleTarget(title: TitleDefinition): number {
  const groups = title.requirement.groups;
  if (groups.length !== 1 || groups[0]?.length !== 1) return pending("unsupported-parameters");
  return target(groups[0][0]);
}

/** Use only where the meaning of Para has been verified by that system. */
export function thresholdTitleRule(conditionType: number, key: string, factKey: string, maximum?: number): TitleRule {
  return { key, conditionType, evaluate(title, fact) {
    const required = singleTarget(title), current = fact(factKey);
    if (!natural(current) || (maximum !== undefined && current > maximum)) return pending("invalid-facts");
    return { met: current >= required, values: { current, target: required }, wireValue: String(current) };
  } };
}
export function collectionTitleRule(conditionType: number, key: string, factKey: string, single = false): TitleRule {
  return { key, conditionType, evaluate(title, fact) {
    const groups = title.requirement.groups;
    if (groups.length !== 1 || !groups[0]?.length || (single && groups[0].length !== 1)) return pending("unsupported-parameters");
    const required = groups[0].map(value => target(value));
    if (new Set(required).size !== required.length) return pending("unsupported-parameters");
    const value = fact(factKey);
    if (!Array.isArray(value) || value.some(id => !natural(id) || id === 0)) return pending("invalid-facts");
    const owned = new Set(value as number[]), matched = required.filter(id => owned.has(id)), missing = required.filter(id => !owned.has(id));
    return { met: missing.length === 0, values: { requiredIds: required, matchedIds: matched, missingIds: missing, current: matched.length, target: required.length }, wireValue: String(matched.length) };
  } };
}
/** Para is explicitly action,target|action,target; counters must contain every action. */
export function compoundCounterTitleRule(conditionType: number, key: string, factKey: string): TitleRule {
  return { key, conditionType, evaluate(title, fact) {
    const groups = title.requirement.groups;
    if (!groups.length || groups.some(group => group.length !== 2)) return pending("unsupported-parameters");
    const requirements = groups.map(group => ({ action: String(target(group[0])), target: target(group[1]) }));
    if (new Set(requirements.map(r => r.action)).size !== requirements.length) return pending("unsupported-parameters");
    const value = fact(factKey);
    if (!value || typeof value !== "object" || Array.isArray(value)) return pending("invalid-facts");
    const counts: Record<string, number> = {}, targets: Record<string, number> = {};
    for (const requirement of requirements) {
      if (!Object.hasOwn(value, requirement.action)) return pending("incomplete-facts");
      const current = value[requirement.action];
      if (!natural(current)) return pending("invalid-facts");
      counts[requirement.action] = current; targets[requirement.action] = requirement.target;
    }
    return {
      met: requirements.every(r => counts[r.action]! >= r.target), values: { counts, targets },
      wireValue: requirements.map(r => `${r.action},${counts[r.action]}`).join("|"),
    };
  } };
}

export const defaultTitleRules: readonly TitleRule[] = Object.freeze([
  collectionTitleRule(202, "mounts.ownership", "mounts.activeIds", true),
  collectionTitleRule(203, "fashion.collection", "fashion.activeIds"),
  thresholdTitleRule(102, "fashion.level", "fashion.level", 200),
  thresholdTitleRule(8, "labyrinth.floor", "labyrinth.normal.maxClearedFloor", 100),
  thresholdTitleRule(9, "abyss.floor", "labyrinth.abyss.maxClearedFloor", 30),
  compoundCounterTitleRule(38, "farm.maintenance", "farm.lifetimeCareCounts"),
].map(rule => Object.freeze(rule)));

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function memoizeReader(reader: TitleFactReader): TitleFactReader {
  const cache = new Map<string, { value?: TitleFact; error?: ConstructorParameters<typeof TitleEvaluationPending>[0] }>();
  return key => {
    if (!cache.has(key)) {
      try { cache.set(key, { value: structuredClone(reader(key)) }); }
      catch (error) { cache.set(key, { error: error instanceof TitleEvaluationPending ? error.reason : "provider-error" }); }
    }
    const result = cache.get(key)!;
    if (result.error) return pending(result.error);
    return result.value;
  };
}

/** Pure assessment only: no access to ownership, persistence, networking or the clock. */
export class TitleRequirementEvaluator {
  private readonly rules = new Map<string, TitleRule>();
  constructor(rules: readonly TitleRule[] = defaultTitleRules) {
    for (const rule of rules) {
      if (!rule.key || !Number.isSafeInteger(rule.conditionType) || typeof rule.evaluate !== "function" || this.rules.has(rule.key)) throw new Error("Avaliador de título inválido ou duplicado");
      this.rules.set(rule.key, Object.freeze({ ...rule }));
    }
  }
  supported(): readonly { key: string; conditionType: number }[] {
    return Object.freeze([...this.rules.values()].map(({ key, conditionType }) => Object.freeze({ key, conditionType })));
  }
  evaluate(title: TitleDefinition, context: TitleEvaluationContext): TitleEvaluation {
    if (!natural(context.subjectId) || context.subjectId === 0 || ![1, 2, 3].includes(context.job) || !natural(context.now) || context.now > 8640000000000000 || typeof context.readFact !== "function") throw new Error("Contexto de avaliação de títulos inválido");
    const used = new Set<string>();
    const base = { titleId: title.id, conditionType: title.requirement.conditionType, requirementKey: title.requirement.key, subjectId: context.subjectId, observedAt: context.now };
    const result = (status: TitleEvaluation["status"], reason: TitleEvaluationReason, progress?: TitleProgress): TitleEvaluation => freeze({ ...base, status, reason, factKeys: [...used], ...(progress ? { progress } : {}) });
    if (title.job !== 0 && title.job !== context.job) return result("unfulfilled", "class-restriction");
    const rule = this.rules.get(title.requirement.key);
    if (!rule || rule.conditionType !== title.requirement.conditionType) return result("pending-integration", "unsupported-condition");
    const reader = memoizeReader(context.readFact);
    const fact = (key: string): TitleProgressValue => {
      used.add(key);
      const observation = reader(key);
      if (!observation) return pending("missing-facts");
      if (observation.subjectId !== context.subjectId || observation.observedAt !== context.now) return pending("invalid-facts");
      if (observation.complete !== true) return pending("incomplete-facts");
      try {
        validateTitleProgress({ conditionType: title.requirement.conditionType, requirementKey: title.requirement.key, status: "tracking", values: { observed: observation.value }, wireValue: "", updatedAt: observation.observedAt, origin: observation.origin });
      } catch { return pending("invalid-facts"); }
      return freeze(observation.value);
    };
    try {
      const outcome = rule.evaluate(title, fact);
      if (typeof outcome.met !== "boolean") return pending("evaluator-error");
      const progress: TitleProgress = {
        conditionType: title.requirement.conditionType, requirementKey: title.requirement.key,
        status: outcome.met ? "completed" : "tracking", values: structuredClone(outcome.values), wireValue: outcome.wireValue,
        updatedAt: context.now, origin: { system: "titles.evaluation", reference: `subject:${context.subjectId}:title:${title.id}` },
      };
      validateTitleProgress(progress);
      return result(outcome.met ? "fulfilled" : "unfulfilled", "evaluated", progress);
    } catch (error) {
      return result("pending-integration", error instanceof TitleEvaluationPending ? error.reason : "evaluator-error");
    }
  }
  evaluateAll(catalog: TitleCatalog, context: TitleEvaluationContext, filter: TitleCatalogFilter = {}): readonly TitleEvaluation[] {
    // A batch sees one stable observation per fact, even for hundreds of titles.
    const shared = { ...context, readFact: memoizeReader(context.readFact) };
    return Object.freeze(catalog.list(filter).map(title => this.evaluate(title, shared)));
  }
}
