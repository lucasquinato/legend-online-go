import { createHash } from "node:crypto";
import type { TitleCatalog } from "./catalog.js";
import { titleAttributeUnlock } from "./catalog.js";
import type { TitleDefinition } from "./types.js";
import { TitleRequirementEvaluator, type TitleEvaluationContext, type TitleFactReader } from "./evaluation.js";
import { recordTitleAcquisition, recordTitleProgress, recordTitleAttributeUnlock, validateTitleSave, type TitleProgress, type TitleSave } from "./state.js";

export interface TitleGrantPolicy {
  key: string;
  conditionType: number;
  /** Historical achievements; conditional leases/renewals belong to TitleMaintenance. */
  lifetime: "permanent-once";
  allows(title: TitleDefinition): boolean;
}
export interface TitleReconciliationContext extends TitleEvaluationContext {
  reason: "login" | "gameplay";
  attributeUnlock: { level: number; questClaimed: boolean };
}
interface Cache { keys: readonly string[]; facts: string; state: string; }
export interface TitleReconciliation {
  state: TitleSave;
  changed: boolean;
  grantedIds: readonly number[];
  progressIds: readonly number[];
  deferredGrantIds: readonly number[];
  /** Opaque performance token; accept only after the surrounding transaction succeeds. */
  cache: Cache;
}

/** Verified collection/achievement families only; Time=0 is never a general policy. */
export const defaultTitleGrantPolicies: readonly TitleGrantPolicy[] = Object.freeze([
  [202, "mounts.ownership"], [203, "fashion.collection"], [102, "fashion.level"],
  [8, "labyrinth.floor"], [9, "abyss.floor"], [38, "farm.maintenance"],
].map(([type, key]) => Object.freeze({
  conditionType: type as number, key: key as string, lifetime: "permanent-once" as const,
  allows: (title: TitleDefinition) => title.validity.rawTime === "0" && !title.validity.isLong,
})));

const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function sameProgress(a: TitleProgress | undefined, b: TitleProgress): boolean {
  return Boolean(a && a.conditionType === b.conditionType && a.requirementKey === b.requirementKey && a.status === b.status && a.wireValue === b.wireValue && JSON.stringify(a.values) === JSON.stringify(b.values));
}
function initialZero(p: TitleProgress): boolean {
  if (p.values.current === 0) return true;
  const counts = p.values.counts;
  return Boolean(counts && typeof counts === "object" && !Array.isArray(counts) && Object.values(counts).length && Object.values(counts).every(n => n === 0));
}

export class TitleReconciler {
  private readonly policies = new Map<string, TitleGrantPolicy>();
  private readonly committed = new WeakMap<TitleSave, Cache>();
  constructor(private readonly catalog: TitleCatalog, private readonly evaluator = new TitleRequirementEvaluator(), policies = defaultTitleGrantPolicies) {
    for (const policy of policies) {
      if (!policy.key || !Number.isSafeInteger(policy.conditionType) || this.policies.has(policy.key) || policy.lifetime !== "permanent-once" || typeof policy.allows !== "function") throw new Error("Política de concessão de título inválida ou duplicada");
      this.policies.set(policy.key, Object.freeze({ ...policy }));
    }
  }

  /** Copy-on-write preparation: input ownership/progress is never changed here. */
  prepare(save: TitleSave, context: TitleReconciliationContext): TitleReconciliation {
    validateTitleSave(save);
    if (!Number.isSafeInteger(context.subjectId) || context.subjectId <= 0 || ![1, 2, 3].includes(context.job) || !Number.isSafeInteger(context.now) || context.now < 0 || context.now > 8640000000000000 || !["login", "gameplay"].includes(context.reason) || !Number.isSafeInteger(context.attributeUnlock.level) || context.attributeUnlock.level < 0 || typeof context.attributeUnlock.questClaimed !== "boolean") throw new Error("Contexto de reconciliação de títulos inválido");
    const observations = new Map<string, { read: () => ReturnType<TitleFactReader> }>();
    const reader: TitleFactReader = key => {
      if (!observations.has(key)) {
        try { const value = structuredClone(context.readFact(key)); observations.set(key, { read: () => value }); }
        catch (error) { observations.set(key, { read: () => { throw error; } }); }
      }
      return observations.get(key)!.read();
    };
    const facts = (keys: readonly string[]) => digest({
      subjectId: context.subjectId, job: context.job, unlock: context.attributeUnlock,
      facts: keys.map(key => {
        try {
          const f = reader(key);
          if (!f) return [key, "missing"];
          // Ignore advancing wall-clock timestamps, but never cache a stale observation as fresh.
          const value = { subjectId: f.subjectId, fresh: f.observedAt === context.now, complete: f.complete, origin: f.origin, value: f.value };
          return [key, JSON.stringify(value)];
        } catch { return [key, "unavailable"]; }
      }),
    });
    const previous = this.committed.get(save), stateDigest = digest(save);
    if (previous && previous.state === stateDigest && previous.facts === facts(previous.keys))
      return { state: save, changed: false, grantedIds: [], progressIds: [], deferredGrantIds: [], cache: previous };

    const assessments = this.evaluator.evaluateAll(this.catalog, { ...context, readFact: reader });
    let next = save;
    const editable = () => { if (next === save) next = structuredClone(save); return next; };
    const grantedIds: number[] = [], progressIds: number[] = [], deferredGrantIds: number[] = [];
    for (const result of assessments) {
      if (result.reason !== "evaluated" || !result.progress) continue;
      const entry = next.entries[result.titleId], policy = this.policies.get(result.requirementKey);
      // A missing activation now does not erase an already-earned permanent achievement.
      const preserveCompleted = Boolean(entry?.ownership && policy?.lifetime === "permanent-once" && result.status !== "fulfilled");
      if (!preserveCompleted && !sameProgress(entry?.progress, result.progress) && (!entry?.progress || entry.progress.updatedAt <= context.now) && (entry || result.status === "fulfilled" || !initialZero(result.progress))) {
        recordTitleProgress(editable(), this.catalog, result.titleId, result.progress);
        progressIds.push(result.titleId);
      }
      if (result.status !== "fulfilled" || entry?.ownership) continue;
      const title = this.catalog.get(result.titleId)!;
      if (!policy || policy.conditionType !== result.conditionType || !policy.allows(title)) { deferredGrantIds.push(title.id); continue; }
      // Stable per achievement, independent of login, clock, map and request opcode.
      if (recordTitleAcquisition(editable(), this.catalog, title.id, context.now, null, {
        system: "titles.conditions", reference: `v1:condition:${result.conditionType}:title:${title.id}:permanent-once`,
      })) {
        (next.pendingAcquisitions ??= []).push({ titleId: title.id, obtainedAt: context.now, retroactive: context.reason === "login" });
        grantedIds.push(title.id);
      }
    }
    if (context.attributeUnlock.level >= titleAttributeUnlock.minimumLevel && context.attributeUnlock.questClaimed === true && !next.attributeAccess.unlocked)
      recordTitleAttributeUnlock(editable(), context.now, { system: "quests", reference: `claimed:${titleAttributeUnlock.questId}` });
    validateTitleSave(next);
    const keys = [...new Set(assessments.flatMap(result => result.factKeys))].sort();
    return { state: next, changed: next !== save, grantedIds, progressIds, deferredGrantIds, cache: { keys, facts: facts(keys), state: digest(next) } };
  }

  /** A rollback creates/restores a different save object, invalidating this cache naturally. */
  accept(result: TitleReconciliation): void { this.committed.set(result.state, result.cache); }
}
