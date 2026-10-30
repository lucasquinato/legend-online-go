import type { Engine } from "./engine.js";
import type { Message } from "../../messages.js";
import { advanceInitiative } from "./initiative.js";

export function setBattleAutomatic(e: Engine, actorId: number, enabled: boolean, now?:number): boolean {
  if(now!==undefined)advanceInitiative(e,now);
  const actor=e.actors.find(a=>a.id===actorId);
  if(!actor||(e.players??[e.hero]).includes(actorId)===false||actor.hp<=0)return false;
  actor.autoBattle=enabled;
  // Preserve an accepted manual selection; replace only pending automatic choices.
  e.queue=e.queue.filter(c=>c.actor!==actorId||!c.automatic||(e.initiative&&c.readyAt!==undefined&&c.readyAt<=e.initiative.lastAt));
  return true;
}
export function automaticModeMessage(e: Engine, actorId: number, userId: number, battleId: string): Message {
  return {userId,battle_id:battleId,mode:e.actors.find(a=>a.id===actorId)?.autoBattle?1:2,fm_turn:0,hero_sp:0};
}
