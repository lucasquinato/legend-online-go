import { encodeMessage, decodeMessage, typeName, type Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import type { Cosmo, CosmosSave } from "./state.js";
const replies: Record<number, string> = { 4178: "StarMoveRspMsg", 4179: "StarRandRspMsg", 4180: "StarRandRspMsg", 4479: "StarRandRspMsg", 4677: "StarAdditionMsg", 4261: "StarShopMsg" };
const requests: Record<number, string> = { 8267: "StarMoveReqMsg", 8268: "StarPickReqMsg", 8269: "StarRandReqMsg", 8270: "PayTypeMsg", 8330: "StarLockReqMsg", 8331: "StarComposeReqMsg", 8341: "StarShopMsg", 8876: "StarVipEventMsg", 8772: "AdditionInfoMsg", 5182: "StarGrowOpMsg" };
export const wireStar = (star: Cosmo, userId: number): Message => ({ id: star.id, template_id: star.templateId, user_id: userId, object_id: star.previousBag ?? 0, pos: star.pos, exist: 1, bag_type: star.bag, grade: star.level, gp: star.xp, is_lock: Number(star.locked) });
export function packet(opcode: number, message: Message): CityPacket { return { opcode, body: encodeMessage(typeName(`star.${replies[opcode]}`), message).toString("base64") }; }
export function request(opcode: number, body: Buffer): Message {
  return requests[opcode] ? decodeMessage(typeName(opcode === 8270 ? "player.PayTypeMsg" : `star.${requests[opcode]}`), body) : {};
}
export function moves(before: CosmosSave, after: CosmosSave, userId: number): CityPacket {
  const previous = new Map(Object.values(before.instances).filter(row => row.bag > 0).map(row => [`${row.bag}:${row.pos}`, row]));
  const current = new Map(Object.values(after.instances).filter(row => row.bag > 0).map(row => [`${row.bag}:${row.pos}`, row]));
  return packet(4178, { move: [...new Set([...previous.keys(), ...current.keys()])].filter(key => JSON.stringify(previous.get(key)) !== JSON.stringify(current.get(key))).map(key => {
    const [bag, pos] = key.split(":").map(Number), star = current.get(key);
    return { change_type: bag, change_pos: pos, ...(star ? { star_Info: wireStar(star, userId) } : {}) };
  }) });
}
