import { encodeMessage, projectMessage, typeName } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import type { TutorialResponse } from "../../tutorial.js";
import { frame } from "../../protocol.js";
export const skySchemas: Record<number, string> = {
  83: "chat.ChatChannelMsg", 111: "chat.ChatChannelMsg", 4421: "campaign.HangupAttackMsg",
  77: "battle.AttackModeMsg", 75: "battle.HeroOrderMsg", 153: "battle.AttackOrderMsg", 154: "battle.PrepareOverMsg", 156: "battle.BattleStartMsg",
  157: "battle.BattlePrepareMsg", 158: "battle.ItemUseResultMsg", 4361: "battle.BattleNoticeMsg", 4103: "battle.BattleReportMsg",
  4592: "room.RoomEnterMsg", 4595: "room.RoomEnterMsg", 4597: "room.RoomEnterMsg", 4606: "room.RoomEnterMsg",
  4593: "campaign.CampaignExitMsg", 4594: "campaign.SpacePlayerMoveMsg", 4607: "campaign.SpacePlayerMoveMsg",
  4126: "campaign.StandPosMsg", 4256: "simple.RelationPlayerMsg", 4125: "simple.DetailRspMsg", 4128: "simple.InfoRspMsg",
};
// These are live account identities. Captured-scenario personalizers must never rewrite them.
export function skyWire(packet: CityPacket, recipient: number): TutorialResponse {
  if(packet.authoritative&&packet.body!==undefined)return {frame:frame(packet.opcode,recipient,Buffer.from(packet.body,"base64")).toString("base64"),delayMs:packet.delayMs??0};
  const schema = skySchemas[packet.opcode];
  if (!schema) throw new Error(`Pacote do reino sem schema: ${packet.opcode}`);
  const name = typeName(schema), message = packet.message ?? {};
  const duelId = (packet as CityPacket & { duelId?: string }).duelId;
  return { frame: frame(packet.opcode, recipient, encodeMessage(name, packet.opcode === 4125 ? projectMessage(name, message) : message)).toString("base64"), delayMs: packet.delayMs ?? 0,
    ...(duelId ? { battleId: duelId } : {}) };
}
