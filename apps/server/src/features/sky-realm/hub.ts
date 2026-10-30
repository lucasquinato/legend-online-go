import type { Store } from "../../store.js";
import type { Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import type { CityState } from "../../city-state.js";
import type { PermanentModifiers } from "../battle/permanent-modifiers.js";
import { SkyDuels } from "./duels.js";

export interface SkyMember { uid: number; room(): Message; inspect(): { player: Message; army: Message; items: Message[]; hide: boolean; detail:Message };
  combat(): { state: CityState; modifiers: PermanentModifiers; initialFury: number } }
/** One live realm per Store; no captured players, offline ghosts or cross-server presence. */
export class SkyHub {
  readonly duels:SkyDuels;
  constructor(store?:Store){this.duels=new SkyDuels(this,Date.now,store);}
  readonly members = new Map<number, SkyMember>();
  private pending = new Map<number, CityPacket[]>();
  private fingerprints = new Map<number, string>();
  private fingerprint(m: SkyMember) { const { cur_pos_x, cur_pos_y, ...visual } = m.room(); return JSON.stringify(visual); }
  join(m: SkyMember): void {
    const exists = this.members.has(m.uid);
    this.members.set(m.uid, m); this.pending.delete(m.uid);
    this.fingerprints.set(m.uid, this.fingerprint(m));
    if (!exists) this.broadcast(m.uid, { opcode: 4592, message: { player: [m.room()] } });
  }
  leave(uid: number): void {
    this.duels.leave(uid);
    if (this.members.delete(uid)) this.broadcast(uid, { opcode: 4607, message: { players: [{ playerId: uid }] } });
    this.pending.delete(uid); this.fingerprints.delete(uid);
  }
  send(uid: number, packet: CityPacket): void {
    if (!this.members.has(uid)) return;
    const q = this.pending.get(uid) ?? []; q.push(structuredClone(packet)); this.pending.set(uid, q);
  }
  refresh(uid: number): void {
    const m = this.members.get(uid); if (!m) return;
    const next = this.fingerprint(m);
    if (next !== this.fingerprints.get(uid)) {
      this.fingerprints.set(uid, next);
      this.broadcast(uid, { opcode: 4597, message: { player: [m.room()] } });
    }
  }
  broadcast(sender: number, packet: CityPacket): void {
    for (const uid of this.members.keys()) if (uid !== sender) {
      const q = this.pending.get(uid) ?? [];
      // A slow consumer needs only the latest movement/appearance of each sender.
      if ([4594, 4597].includes(packet.opcode)) {
        const index = q.findIndex(p => p.opcode === packet.opcode && (p as CityPacket & { sender?: number }).sender === sender);
        if (index >= 0) q.splice(index, 1);
      }
      q.push(Object.assign(structuredClone(packet), { sender })); this.pending.set(uid, q);
    }
  }
  drain(uid: number): CityPacket[] { const packets = this.pending.get(uid) ?? []; this.pending.delete(uid); return packets; }
}
const hubs = new WeakMap<Store, SkyHub>();
export function skyHub(store: Store): SkyHub { let hub = hubs.get(store); if (!hub) { hub = new SkyHub(store); hubs.set(store, hub); } return hub; }
