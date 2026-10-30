import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";

export interface Point { x: number; y: number }
export const skyMap = JSON.parse(readFileSync(join(projectRoot, "reference/sky-realm/map.json"), "utf8")) as {
  mapId: number; width: number; height: number; cellSize: number; spawn: Point; bits: string;
};
const cells = Buffer.from(skyMap.bits, "base64");
export function inBounds(p: Point): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < skyMap.width && p.y < skyMap.height;
}
export function walkable(p: Point): boolean {
  const n = p.y * skyMap.width + p.x;
  return inBounds(p) && !!(cells[n >> 3]! & (1 << (n & 7)));
}
/** Same truthy-cell convention as the original FindPath8. Flight bypasses terrain only. */
export function clearSegment(from: Point, to: Point, flying: boolean): boolean {
  if (!inBounds(from) || !inBounds(to)) return false;
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let i = 0; i <= steps; i++) {
    const p = steps ? { x: Math.round(from.x + (to.x - from.x) * i / steps), y: Math.round(from.y + (to.y - from.y) * i / steps) } : from;
    if (!flying && !walkable(p)) return false;
  }
  return true;
}
export function onSegment(p: Point, from: Point, to: Point): boolean {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let i = 0; i <= steps; i++) {
    const x = steps ? Math.round(from.x + (to.x - from.x) * i / steps) : from.x;
    const y = steps ? Math.round(from.y + (to.y - from.y) * i / steps) : from.y;
    if (p.x === x && p.y === y) return true;
  }
  return false;
}
export function nearestGround(p: Point): Point {
  if (walkable(p)) return { ...p };
  const origin = inBounds(p) ? p : skyMap.spawn;
  for (let radius = 1; radius < Math.max(skyMap.width, skyMap.height); radius++)
    for (let y = Math.max(0, origin.y - radius); y <= Math.min(skyMap.height - 1, origin.y + radius); y++)
      for (const x of y === origin.y - radius || y === origin.y + radius
        ? Array.from({ length: radius * 2 + 1 }, (_, i) => origin.x - radius + i)
        : [origin.x - radius, origin.x + radius]) {
        if (walkable({ x, y })) return { x, y };
      }
  throw new Error("Reino do Céu não possui uma célula terrestre válida");
}
