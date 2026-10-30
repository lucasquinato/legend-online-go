import type { Primary } from "./content.js";
export interface MountOwned {
  id: number;
  activatedAt: number;
  expiresAt: number | null;
  stars: number;
  blessing: number;
  flightUnlocked: boolean;
}
export interface KingProgress { level: number; xp: number; extraPercent?: number }
export interface MountSave {
  version: 1;
  selected: number;
  mounted: boolean;
  xp: Record<Primary, number>;
  owned: Record<string, MountOwned>;
  kings: Record<string, KingProgress>;
  soul: { grades: Record<Primary, number>; xp: number };
  shop: { item: number; price: number; purchased: boolean }[];
  mobility: { mountId: number; mode: "ground" | "air-capable"; speed: number };
}
export function initialMounts(): MountSave {
  return { version: 1, selected: 1000, mounted: false, xp: { power: 0, intellect: 0, physique: 0, agility: 0 }, owned: {}, kings: {}, soul: { grades: { power: 0, intellect: 0, physique: 0, agility: 0 }, xp: 0 }, shop: [], mobility: { mountId: 0, mode: "ground", speed: 0 } };
}
