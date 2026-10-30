import { createHash } from "node:crypto";
import type { TitleCatalog } from "./catalog.js";

export class TitleStateError extends Error {}
export interface TitleOrigin { system: string; reference: string; }
export type TitleProgressValue = string | number | boolean | null | TitleProgressValue[] | { [key: string]: TitleProgressValue };
export interface TitleProgress {
  conditionType: number;
  requirementKey: string;
  status: "pending-integration" | "tracking" | "completed";
  values: Record<string, TitleProgressValue>;
  wireValue: string;
  updatedAt: number;
  origin: TitleOrigin;
}
export interface TitleOwnership {
  firstObtainedAt: number;
  obtainedAt: number;
  expiresAt: number | null;
  origin: TitleOrigin;
  revokedAt: number | null;
  revocationOrigin: TitleOrigin | null;
}
export interface TitleEntry {
  id: number;
  progress?: TitleProgress;
  ownership?: TitleOwnership;
  acquisitionKeys: string[];
}
export interface TitleSave {
  version: 1;
  entries: Record<string, TitleEntry>;
  selectedId: number;
  attributeAccess: { unlocked: boolean; unlockedAt: number | null; origin: TitleOrigin | null };
  legacy?: { observedAt: number; selectedId: number | null; attributesUnlocked: boolean | null; policy: "unverified-not-imported" };
  pendingAcquisitions?: { titleId: number; obtainedAt: number; retroactive: boolean }[];
  pendingRemovals?: { titleId: number; removedAt: number; reason: "expired" | "condition-lost"; retroactive: boolean }[];
  maintenance?: Record<string, {
    revision: number; publishedAt: number; observedAt: number; digest: string;
    managed: Record<string, { awardKey: string; reference: string; expiresAt: number | null }>;
  }>;
}

function invalid(reason: string): never { throw new TitleStateError(`Estado de títulos inválido: ${reason}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(label);
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) invalid(label);
  return value as number;
}
function timestamp(value: unknown, label: string): number {
  const at = integer(value, label);
  if (at > 8640000000000000) invalid(label);
  return at;
}
function text(value: unknown, label: string, maximum: number, empty = false): string {
  if (typeof value !== "string" || value.length > maximum || (!empty && !value.trim())) invalid(label);
  return value as string;
}
function origin(value: unknown): void {
  const row = object(value, "origem");
  text(row.system, "origem.system", 128); text(row.reference, "origem.reference", 256);
}
function copyOrigin(value: TitleOrigin): TitleOrigin {
  origin(value);
  return { system: value.system, reference: value.reference };
}
function json(value: unknown, seen = new Set<object>(), depth = 0): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || !value || depth > 20 || seen.has(value)) invalid("progresso não serializável");
  if (!Array.isArray(value)) object(value, "progresso");
  seen.add(value);
  // Array holes, undefined, Date, BigInt and cycles must not silently change in JSON.
  for (const child of Array.isArray(value) ? Array.from(value) : Object.values(value)) json(child, seen, depth + 1);
  seen.delete(value);
}
export function validateTitleProgress(value: unknown): asserts value is TitleProgress {
  const p = object(value, "progresso");
  integer(p.conditionType, "conditionType", -2147483648);
  text(p.requirementKey, "requirementKey", 256);
  if (typeof p.status !== "string" || !["pending-integration", "tracking", "completed"].includes(p.status)) invalid("status do progresso");
  object(p.values, "valores do progresso"); json(p.values);
  text(p.wireValue, "valor do protocolo", 8192, true);
  timestamp(p.updatedAt, "data do progresso"); origin(p.origin);
}
function validateOwnership(value: unknown): void {
  const o = object(value, "posse");
  const first = timestamp(o.firstObtainedAt, "primeira obtenção"), at = timestamp(o.obtainedAt, "obtenção");
  if (first > at) invalid("ordem das obtenções");
  if (o.expiresAt !== null && timestamp(o.expiresAt, "validade") <= at) invalid("validade anterior à obtenção");
  origin(o.origin);
  if (o.revokedAt !== null) {
    if (timestamp(o.revokedAt, "revogação") < at) invalid("revogação anterior à obtenção");
    origin(o.revocationOrigin);
  } else if (o.revocationOrigin !== null) invalid("revogação sem data");
}

/** Reject corrupt/future saves rather than replacing ownership with an empty collection. */
export function validateTitleSave(value: unknown): asserts value is TitleSave {
  const save = object(value, "save");
  if (save.version !== 1) invalid("versão desconhecida");
  integer(save.selectedId, "seleção");
  const entries = object(save.entries, "coleção");
  for (const [key, value] of Object.entries(entries)) {
    const entry = object(value, "registro");
    const id = integer(entry.id, "ID", 1);
    if (key !== String(id)) invalid("ID diferente da chave do registro");
    if (!Array.isArray(entry.acquisitionKeys) || entry.acquisitionKeys.some(k => typeof k !== "string" || !/^[a-f0-9]{64}$/.test(k)) || new Set(entry.acquisitionKeys).size !== entry.acquisitionKeys.length) invalid("recibos de obtenção");
    if (entry.progress !== undefined) validateTitleProgress(entry.progress);
    if (entry.ownership !== undefined) {
      validateOwnership(entry.ownership);
      if (!entry.acquisitionKeys.includes(acquisitionKey((entry.ownership as TitleOwnership).origin))) invalid("posse sem recibo correspondente");
    } else if (entry.acquisitionKeys.length) invalid("recibos sem posse histórica");
  }
  if (save.selectedId !== 0 && !(entries[String(save.selectedId)] as TitleEntry | undefined)?.ownership) invalid("seleção sem posse registrada");
  const access = object(save.attributeAccess, "liberação de atributos");
  if (typeof access.unlocked !== "boolean") invalid("liberação de atributos");
  if (access.unlocked) { timestamp(access.unlockedAt, "data da liberação"); origin(access.origin); }
  else if (access.unlockedAt !== null || access.origin !== null) invalid("atributos bloqueados com liberação registrada");
  if (save.legacy !== undefined) {
    const legacy = object(save.legacy, "legado");
    timestamp(legacy.observedAt, "data do legado");
    if (legacy.selectedId !== null) integer(legacy.selectedId, "seleção legada");
    if (legacy.attributesUnlocked !== null && typeof legacy.attributesUnlocked !== "boolean") invalid("liberação legada");
    if (legacy.policy !== "unverified-not-imported") invalid("política do legado");
  }
  if (save.pendingAcquisitions !== undefined) {
    if (!Array.isArray(save.pendingAcquisitions)) invalid("notificações pendentes");
    const notices = new Set<string>();
    for (const value of save.pendingAcquisitions) {
      const notice = object(value, "notificação pendente");
      const id = integer(notice.titleId, "título da notificação", 1), at = timestamp(notice.obtainedAt, "data da notificação");
      if (typeof notice.retroactive !== "boolean" || !(entries[String(id)] as TitleEntry | undefined)?.ownership) invalid("notificação sem posse histórica");
      const key = `${id}:${at}`;
      if (notices.has(key)) invalid("notificação duplicada");
      notices.add(key);
    }
  }
  if (save.pendingRemovals !== undefined) {
    if (!Array.isArray(save.pendingRemovals)) invalid("retiradas pendentes");
    const notices = new Set<string>();
    for (const value of save.pendingRemovals) {
      const notice = object(value, "retirada pendente");
      const id = integer(notice.titleId, "título da retirada", 1), at = timestamp(notice.removedAt, "data da retirada");
      if (typeof notice.retroactive !== "boolean" || !["expired", "condition-lost"].includes(String(notice.reason)) || !(entries[String(id)] as TitleEntry | undefined)?.ownership) invalid("retirada sem posse histórica");
      const key = `${id}:${at}:${notice.reason}`;
      if (notices.has(key)) invalid("retirada duplicada");
      notices.add(key);
    }
  }
  if (save.maintenance !== undefined) {
    for (const [key, value] of Object.entries(object(save.maintenance, "manutenção"))) {
      text(key, "política de manutenção", 128);
      if (["__proto__", "constructor", "prototype"].includes(key)) invalid("política de manutenção");
      const record = object(value, "registro de manutenção");
      integer(record.revision, "revisão da manutenção", 1);
      if (timestamp(record.publishedAt, "publicação") > timestamp(record.observedAt, "observação")) invalid("publicação futura");
      if (typeof record.digest !== "string" || !/^[a-f0-9]{64}$/.test(record.digest)) invalid("recibo da manutenção");
      for (const [id, managedValue] of Object.entries(object(record.managed, "títulos administrados"))) {
        if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !(entries[id] as TitleEntry | undefined)?.ownership) invalid("título administrado sem histórico");
        const managed = object(managedValue, "concessão administrada");
        text(managed.awardKey, "referência da premiação", 128); text(managed.reference, "origem da premiação", 256);
        const reference = createHash("sha256").update(JSON.stringify([key, Number(id), managed.awardKey])).digest("hex");
        if (managed.reference !== reference || !(entries[id] as TitleEntry).acquisitionKeys.includes(acquisitionKey({ system: "titles.maintenance", reference }))) invalid("concessão administrada sem recibo correspondente");
        if (managed.expiresAt !== null) timestamp(managed.expiresAt, "validade administrada");
      }
    }
  }
}

export function initialTitleSave(): TitleSave {
  return { version: 1, entries: {}, selectedId: 0, attributeAccess: { unlocked: false, unlockedAt: null, origin: null } };
}

/** Called only at load. Captured visual/flag fields are evidence, never proof of ownership. */
export function initializeTitleSave(host: { titles?: TitleSave }, at: number, legacy?: { selectedId?: unknown; attributesUnlocked?: unknown }): TitleSave {
  timestamp(at, "inicialização");
  if (host.titles !== undefined) { validateTitleSave(host.titles); return host.titles; }
  const save = initialTitleSave();
  const selected = typeof legacy?.selectedId === "number" && Number.isSafeInteger(legacy.selectedId) && legacy.selectedId >= 0 ? legacy.selectedId : null;
  const unlocked = legacy?.attributesUnlocked === true || legacy?.attributesUnlocked === 1 ? true : legacy?.attributesUnlocked === false || legacy?.attributesUnlocked === 0 ? false : null;
  if ((selected ?? 0) > 0 || unlocked === true)
    save.legacy = { observedAt: at, selectedId: selected, attributesUnlocked: unlocked, policy: "unverified-not-imported" };
  host.titles = save;
  return save;
}

function known(catalog: TitleCatalog, id: number): void {
  if (!catalog.get(integer(id, "ID", 1))) throw new TitleStateError(`Título não encontrado no catálogo: ${id}`);
}
function acquisitionKey(source: TitleOrigin): string {
  origin(source);
  return createHash("sha256").update(JSON.stringify([source.system, source.reference])).digest("hex");
}

/** Storage operation: the reconciler/caller must verify the condition and grant policy first. */
export function recordTitleAcquisition(save: TitleSave, catalog: TitleCatalog, id: number, at: number, expiresAt: number | null, source: TitleOrigin): boolean {
  known(catalog, id); timestamp(at, "obtenção");
  const key = acquisitionKey(source), entry = save.entries[id];
  if (entry?.acquisitionKeys.includes(key)) return false;
  const previous = entry?.ownership;
  if (previous && at < Math.max(previous.obtainedAt, previous.revokedAt ?? 0)) throw new TitleStateError("Obtenção antiga não pode substituir o estado atual");
  const ownership: TitleOwnership = { firstObtainedAt: previous?.firstObtainedAt ?? at, obtainedAt: at, expiresAt, origin: copyOrigin(source), revokedAt: null, revocationOrigin: null };
  validateOwnership(ownership);
  save.entries[id] = { ...(entry ?? { id }), ownership, acquisitionKeys: [...(entry?.acquisitionKeys ?? []), key] };
  return true;
}

/** A progress update does not grant ownership, even when its status says completed. */
export function recordTitleProgress(save: TitleSave, catalog: TitleCatalog, id: number, progress: TitleProgress): boolean {
  known(catalog, id); validateTitleProgress(progress);
  const definition = catalog.get(id)!;
  if (progress.conditionType !== definition.requirement.conditionType || progress.requirementKey !== definition.requirement.key) throw new TitleStateError("Progresso incompatível com a condição do título");
  const entry = save.entries[id];
  if (entry?.progress && progress.updatedAt < entry.progress.updatedAt) throw new TitleStateError("Atualização de progresso antiga");
  if (JSON.stringify(entry?.progress) === JSON.stringify(progress)) return false;
  save.entries[id] = { ...(entry ?? { id, acquisitionKeys: [] }), progress: structuredClone(progress) };
  return true;
}

export function titleOwned(save: TitleSave, catalog: TitleCatalog, id: number, now: number): boolean {
  timestamp(now, "consulta");
  const ownership = save.entries[id]?.ownership;
  return Boolean(catalog.get(id) && ownership && ownership.obtainedAt <= now && ownership.revokedAt === null && (ownership.expiresAt === null || ownership.expiresAt > now));
}
export function selectedTitle(save: TitleSave, catalog: TitleCatalog, job: 1 | 2 | 3, now: number): number {
  timestamp(now, "consulta");
  if (![1, 2, 3].includes(job)) invalid("classe");
  const definition = catalog.get(save.selectedId);
  return definition && (definition.job === 0 || definition.job === job) && titleOwned(save, catalog, definition.id, now) ? definition.id : 0;
}
export function selectTitle(save: TitleSave, catalog: TitleCatalog, id: number, job: 1 | 2 | 3, now: number): boolean {
  integer(id, "seleção"); timestamp(now, "seleção");
  if (![1, 2, 3].includes(job)) invalid("classe");
  if (id !== 0) {
    known(catalog, id);
    const definition = catalog.get(id)!;
    if ((definition.job !== 0 && definition.job !== job) || !titleOwned(save, catalog, id, now)) throw new TitleStateError("Título indisponível para seleção");
  }
  if (save.selectedId === id) return false;
  save.selectedId = id;
  return true;
}
export function revokeTitle(save: TitleSave, id: number, at: number, source: TitleOrigin): boolean {
  integer(id, "ID", 1); timestamp(at, "revogação"); origin(source);
  const ownership = save.entries[id]?.ownership;
  if (!ownership || ownership.revokedAt !== null) return false;
  if (at < ownership.obtainedAt) throw new TitleStateError("Revogação anterior à obtenção");
  const revocationOrigin = copyOrigin(source);
  ownership.revokedAt = at; ownership.revocationOrigin = revocationOrigin;
  if (save.selectedId === id) save.selectedId = 0;
  return true;
}

/** Records a verified unlock; the reconciler checks level/quest, and presentation is separate. */
export function recordTitleAttributeUnlock(save: TitleSave, at: number, source: TitleOrigin): boolean {
  timestamp(at, "liberação"); origin(source);
  if (save.attributeAccess.unlocked) return false;
  save.attributeAccess = { unlocked: true, unlockedAt: at, origin: copyOrigin(source) };
  return true;
}
