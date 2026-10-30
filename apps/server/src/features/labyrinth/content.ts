import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../config.js";
import type { AdventureReference } from "../../adventure-combat.js";
import type { Message } from "../../messages.js";
import { actionTemplates, skillTemplates } from "../../combat.js";

export type LabyrinthMode = 8001 | 8101;
export interface LabyrinthDrop {
  templateId: number;
  count: number;
  model?: Message;
}
export interface LabyrinthFloor {
  map: number;
  mode: LabyrinthMode;
  floor: number;
  nodes: Message[];
  fog: Message;
  room: Message;
  start: { x: number; y: number };
  drops: LabyrinthDrop[];
  reference: AdventureReference;
  template: Message;
}
const content = JSON.parse(
  readFileSync(join(projectRoot, "reference/labyrinth/content.json"), "utf8"),
) as {
  floors: LabyrinthFloor[];
  skills: Record<string, Message>;
  actions: Record<string, Message>;
};
export const labyrinthFloors = new Map(content.floors.map((f) => [f.map, f]));
export const labyrinthLimit = (mode: LabyrinthMode): number =>
  mode === 8001 ? 100 : 30;
export const isLabyrinthMap = (map: number): boolean =>
  labyrinthFloors.has(map);
for (const [id, row] of Object.entries(content.skills))
  if (!skillTemplates.has(Number(id))) skillTemplates.set(Number(id), row);
for (const [id, row] of Object.entries(content.actions))
  if (!actionTemplates.has(Number(id))) actionTemplates.set(Number(id), row);
