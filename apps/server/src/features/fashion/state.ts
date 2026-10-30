import type { FashionProgress } from "./progression.js";
import type { RefinementProgress } from "./refinement.js";
import type { CityState, CityPacket } from "../../city-state.js";
import type { Message } from "../../messages.js";
import type { TutorialResponse } from "../../tutorial.js";
import type { AttributeState } from "../../attributes.js";
import type { Inventory, InventoryIds } from "../../inventory.js";
import type { GoldLedger } from "../../gold.js";
import type { Store } from "../../store.js";

/** Existing JSON keys are stable: extracting the module requires no save migration. */
export interface FashionSave {
  fashion?: FashionProgress & { baselineLevel: number };
  cosmeticIds?: Record<string, number>;
  refinement?: RefinementProgress;
}

/** Read state through getters: atomic rollback replaces the host's nested state. */
export interface FashionContext {
  readonly state: CityState;
  readonly saved: FashionSave & {
    used: number[];
    attributes?: AttributeState;
    inventory?: InventoryIds;
  };
  readonly scenario: {
    userId: number;
    cases: { opcode: number; responses: CityPacket[] }[];
  };
  readonly store: Store;
  readonly userId: number;
  readonly gold: GoldLedger;
  inventory(state: CityState): Inventory;
  packet(packet: CityPacket, refresh?: boolean): TutorialResponse;
  persist(): void;
  atomicMutation<T>(action: () => T): T;
  ensureAttributes(): void;
  notice(message: string): TutorialResponse;
  rejection(reason: string): TutorialResponse[];
}
