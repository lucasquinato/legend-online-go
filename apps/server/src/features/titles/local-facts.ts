import type { MountSave } from "../mounts/state.js";
import type { Message } from "../../messages.js";
import { TitleEvaluationPending, type TitleFactReader, type TitleFact } from "./evaluation.js";
import type { TitleProgressValue } from "./state.js";

interface FloorSnapshot { record?: number; cleared?: readonly number[]; }
export interface TitleLocalSnapshot {
  mounts?: Pick<MountSave, "owned">;
  fashion?: { level: number };
  state?: { fashions?: Record<string, Message> };
  labyrinth?: FloorSnapshot & { abyss?: FloorSnapshot };
}
const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const invalid = (): never => { throw new TitleEvaluationPending("invalid-facts"); };

/** Read-only adapter: captures only authoritative fields; never initializes a game feature. */
export function localTitleFactReader(snapshot: TitleLocalSnapshot, subjectId: number, at: number): TitleFactReader {
  const mounts = structuredClone(snapshot.mounts?.owned);
  const fashionLevel = snapshot.fashion?.level;
  const fashions = structuredClone(snapshot.state?.fashions);
  const labyrinth = structuredClone(snapshot.labyrinth);
  const providers = new Map<string, { system: string; read: () => TitleProgressValue }>();
  const add = (key: string, system: string, read: () => TitleProgressValue) => providers.set(key, { system, read });
  if (mounts !== undefined) add("mounts.activeIds", "local.mounts", () => {
    if (!mounts || typeof mounts !== "object" || Array.isArray(mounts)) return invalid();
    const active: number[] = [];
    for (const [key, row] of Object.entries(mounts)) {
      if (!row || !validCount(row.id) || row.id === 0 || key !== String(row.id) || !validCount(row.activatedAt) || (row.expiresAt !== null && (!validCount(row.expiresAt) || row.expiresAt <= row.activatedAt))) return invalid();
      if (row.activatedAt <= at && (row.expiresAt === null || row.expiresAt > at)) active.push(row.id);
    }
    return active;
  });
  if (fashionLevel !== undefined) add("fashion.level", "local.fashion", () => fashionLevel);
  if (fashions !== undefined) add("fashion.activeIds", "local.fashion", () => {
    if (!fashions || typeof fashions !== "object" || Array.isArray(fashions)) return invalid();
    const active = new Set<number>();
    for (const row of Object.values(fashions)) {
      if (!row || !validCount(row.temp_id) || row.temp_id === 0 || ![undefined, 0, 1, false, true].includes(row.is_switch)) return invalid();
      if (row.is_switch === 1 || row.is_switch === true) active.add(row.temp_id);
    }
    return [...active];
  });
  const floor = (value: FloorSnapshot, limit: number): number => {
    if (value.record !== undefined && (!validCount(value.record) || value.record > limit)) return invalid();
    if (value.cleared !== undefined && (!Array.isArray(value.cleared) || value.cleared.some(n => !validCount(n) || n < 1 || n > limit))) return invalid();
    // An absent history is not proof of zero; current map/floor never proves a win.
    if (value.record === undefined && value.cleared === undefined) throw new TitleEvaluationPending("missing-facts");
    return Math.max(value.record ?? 0, ...(value.cleared ?? []));
  };
  if (labyrinth !== undefined) add("labyrinth.normal.maxClearedFloor", "local.labyrinth", () => floor(labyrinth, 100));
  if (labyrinth?.abyss !== undefined) add("labyrinth.abyss.maxClearedFloor", "local.labyrinth", () => floor(labyrinth.abyss!, 30));
  // Farm care flags/daily logs do not establish lifetime weed/worm counters.
  // Cosmos Para=1 does not establish a level target. Neither is guessed here.
  return key => {
    const provider = providers.get(key);
    if (!provider) return undefined;
    const fact: TitleFact = { subjectId, observedAt: at, complete: true, origin: { system: provider.system, reference: "authoritative-local-snapshot" }, value: provider.read() };
    return fact;
  };
}
