import { createHash } from "node:crypto";
import type { TitleCatalog } from "./catalog.js";
import type { TitleDefinition } from "./types.js";
import { titleConditions } from "./requirements.js";
import { recordTitleAcquisition, revokeTitle, selectedTitle, validateTitleSave, type TitleSave } from "./state.js";

export interface TitleLifecycleContext { subjectId: number; job: 1 | 2 | 3; now: number; reason: "login" | "gameplay"; }
export interface TitleLifecycleResult { state: TitleSave; changed: boolean; expiredIds: number[]; revokedIds: number[]; grantedIds: number[]; }
export class TitleMaintenanceError extends Error {}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const date = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 8640000000000000;
function validateContext(c: TitleLifecycleContext): void {
  if (!Number.isSafeInteger(c.subjectId) || c.subjectId <= 0 || ![1, 2, 3].includes(c.job) || !date(c.now) || !["login", "gameplay"].includes(c.reason)) throw new TitleMaintenanceError("Contexto de manutenção de títulos inválido");
}
function removed(save: TitleSave, id: number, at: number, reason: "expired" | "condition-lost", retroactive: boolean): void {
  const notices = save.pendingRemovals ??= [];
  if (!notices.some(n => n.titleId === id && n.removedAt === at && n.reason === reason)) notices.push({ titleId: id, removedAt: at, reason, retroactive });
}
/** Deadlines are absolute. Never derives milliseconds from an unresolved client Time field. */
export function nextTitleDeadline(save: TitleSave): number {
  let next = Infinity;
  for (const { ownership } of Object.values(save.entries))
    if (ownership && ownership.revokedAt === null && ownership.expiresAt !== null) next = Math.min(next, ownership.expiresAt);
  return next;
}
export function expireTitles(save: TitleSave, catalog: TitleCatalog, context: TitleLifecycleContext): TitleLifecycleResult {
  validateTitleSave(save); validateContext(context);
  let next = save;
  const edit = () => { if (next === save) next = structuredClone(save); return next; };
  const expiredIds: number[] = [];
  for (const entry of Object.values(save.entries)) {
    const o = entry.ownership;
    if (!o || o.revokedAt !== null || o.expiresAt === null || o.expiresAt > context.now) continue;
    if (revokeTitle(edit(), entry.id, o.expiresAt, { system: "titles.expiry", reference: `deadline:${o.expiresAt}` })) {
      removed(next, entry.id, o.expiresAt, "expired", context.reason === "login"); expiredIds.push(entry.id);
    }
  }
  if (next.selectedId !== 0 && selectedTitle(next, catalog, context.job, context.now) === 0) edit().selectedId = 0;
  validateTitleSave(next);
  return { state: next, changed: next !== save, expiredIds, revokedIds: [], grantedIds: [] };
}

export interface TitleMaintenancePolicy { key: string; conditionType: number; allows(title: TitleDefinition): boolean; }
export interface TitleMaintenanceSnapshot {
  subjectId: number; policyKey: string; revision: number; publishedAt: number; complete: boolean;
  /** Stable awardKey per season/award. Renewal/reacquisition must use a new key. */
  awards: { titleId: number; awardKey: string; expiresAt: number | null }[];
}
// These integrations provide resolved title IDs and explicit deadlines, not guessed rank thresholds.
export const defaultTitleMaintenancePolicies: readonly TitleMaintenancePolicy[] = Object.freeze(titleConditions
  .filter(c => c.domain === "ranking" || c.key === "vip.membership")
  .map(c => Object.freeze({ key: c.key, conditionType: c.type, allows: (t: TitleDefinition) => t.requirement.key === c.key && t.requirement.conditionType === c.type })));

/** Server-only integration hook. Missing/partial ranking data is never a loss of eligibility. */
export class TitleMaintenance {
  private readonly policies = new Map<string, TitleMaintenancePolicy>();
  constructor(private readonly catalog: TitleCatalog, policies = defaultTitleMaintenancePolicies) {
    for (const policy of policies) {
      if (!policy.key || policy.key.length > 128 || ["__proto__", "constructor", "prototype"].includes(policy.key) || !Number.isSafeInteger(policy.conditionType) || this.policies.has(policy.key) || typeof policy.allows !== "function") throw new TitleMaintenanceError("Política de manutenção inválida");
      if ([8, 9, 38, 102, 202, 203].includes(policy.conditionType)) throw new TitleMaintenanceError("Conquistas permanentes não podem usar manutenção condicional");
      this.policies.set(policy.key, { ...policy });
    }
  }
  prepare(save: TitleSave, snapshot: TitleMaintenanceSnapshot, context: TitleLifecycleContext): TitleLifecycleResult & { status: "applied" | "duplicate" | "stale" | "pending-integration" } {
    validateTitleSave(save); validateContext(context);
    if (snapshot.subjectId !== context.subjectId || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1 || !date(snapshot.publishedAt) || snapshot.publishedAt > context.now || typeof snapshot.complete !== "boolean" || !Array.isArray(snapshot.awards)) throw new TitleMaintenanceError("Snapshot de títulos inválido");
    const expiry = expireTitles(save, this.catalog, context), policy = this.policies.get(snapshot.policyKey);
    if (!policy || !snapshot.complete) return { ...expiry, status: "pending-integration" };
    const previous = save.maintenance?.[policy.key], awards = snapshot.awards.map(a => ({ titleId: a.titleId, awardKey: a.awardKey, expiresAt: a.expiresAt })).sort((a, b) => a.titleId - b.titleId), seen = new Set<number>();
    for (const award of awards) {
      const title = this.catalog.get(award.titleId);
      if (!title || seen.has(award.titleId) || title.requirement.key !== policy.key || title.requirement.conditionType !== policy.conditionType || !policy.allows(title) || (title.job !== 0 && title.job !== context.job) || typeof award.awardKey !== "string" || !award.awardKey.trim() || award.awardKey.length > 128 || (award.expiresAt !== null && (!date(award.expiresAt) || award.expiresAt <= snapshot.publishedAt))) throw new TitleMaintenanceError("Premiação de título incompatível com a política");
      if (award.expiresAt === null && title.validity.rawTime !== "0") throw new TitleMaintenanceError("Título temporário exige validade absoluta explícita");
      seen.add(award.titleId);
    }
    const digest = hash({ policy: policy.key, publishedAt: snapshot.publishedAt, awards });
    if (previous && (snapshot.revision < previous.revision || snapshot.publishedAt < previous.publishedAt || context.now < previous.observedAt)) return { ...expiry, status: "stale" };
    if (previous?.revision === snapshot.revision) {
      if (previous.digest !== digest) throw new TitleMaintenanceError("Revisão de títulos reutilizada com conteúdo diferente");
      return { ...expiry, status: "duplicate" };
    }
    // Validate renewal identities before creating any state changes.
    for (const a of awards) {
      const old = previous?.managed[a.titleId];
      if (old?.awardKey === a.awardKey && old.expiresAt !== a.expiresAt) throw new TitleMaintenanceError("Renovação exige nova referência de premiação");
    }
    const next = structuredClone(expiry.state), revokedIds: number[] = [], grantedIds: number[] = [];
    const managed = { ...previous?.managed };
    const active = new Set(awards.filter(a => a.expiresAt === null || a.expiresAt > context.now).map(a => a.titleId));
    for (const [id, old] of Object.entries(managed)) {
      const o = next.entries[id]?.ownership;
      if (active.has(Number(id)) || !o || o.origin.system !== "titles.maintenance" || o.origin.reference !== old.reference || o.revokedAt !== null) continue;
      if (revokeTitle(next, Number(id), context.now, { system: "titles.maintenance", reference: hash([policy.key, snapshot.revision, "lost", id]) })) {
        removed(next, Number(id), context.now, "condition-lost", context.reason === "login"); revokedIds.push(Number(id));
      }
    }
    for (const a of awards) {
      if (!active.has(a.titleId) || previous?.managed[a.titleId]?.awardKey === a.awardKey) continue;
      const reference = hash([policy.key, a.titleId, a.awardKey]);
      if (recordTitleAcquisition(next, this.catalog, a.titleId, context.now, a.expiresAt, { system: "titles.maintenance", reference })) {
        managed[a.titleId] = { awardKey: a.awardKey, reference, expiresAt: a.expiresAt }; grantedIds.push(a.titleId);
        const notices = next.pendingAcquisitions ??= [];
        if (!notices.some(n => n.titleId === a.titleId && n.obtainedAt === context.now)) notices.push({ titleId: a.titleId, obtainedAt: context.now, retroactive: context.reason === "login" });
      }
    }
    (next.maintenance ??= {})[policy.key] = { revision: snapshot.revision, publishedAt: snapshot.publishedAt, observedAt: context.now, digest, managed };
    validateTitleSave(next);
    return { state: next, changed: true, expiredIds: expiry.expiredIds, revokedIds, grantedIds, status: "applied" };
  }
}
