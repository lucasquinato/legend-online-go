export interface Cosmo {
  id: number; templateId: number; bag: 0 | 1 | 2 | 3; pos: number; level: number; xp: number; locked: boolean;
  previousBag?: 1 | 2;
  previousPos?: number;
}
export interface CosmosSave {
  version: 1; nextId: number; bagExtra: number; points: number; free: number;
  stages: number[]; instances: Record<string, Cosmo>;
  slots: { grade: number; xp: number }[];
  suspended?: Record<string, Cosmo>;
}
export function initialCosmos(): CosmosSave {
  return { version: 1, nextId: 1, bagExtra: 0, points: 0, free: 1, stages: [1,0,0,0,0], instances: {}, slots: Array.from({length: 10}, () => ({grade: 0, xp: 0})) };
}
