import { protoInt, protoString, varint, fields } from "../../protocol.js";
import { encodeMessage, typeName, type Message } from "../../messages.js";
import type { MountOwned } from "./state.js";
import type { KingProgress } from "./state.js";
import { kingPercent } from "./kings.js";
import type { CityPacket } from "../../city-state.js";
export const date = (time: number | null): string => time === null ? "2000-01-01 00:00:00" : new Date(time).toISOString().slice(0, 19).replace("T", " ");
export function mountRequest(body: Buffer): Message {
  const values = fields(body);
  const get = (tag: number) => Number(values.find(field => field.number === tag)?.value ?? 0);
  return { property_type: get(1), pay_type: get(2), param1: get(3), param2: get(4), op: get(5) };
}
function nested(tag: number, body: Buffer): Buffer { return Buffer.concat([varint(tag * 8 + 2), varint(body.length), body]); }
export function avatarBody(owned: MountOwned): Buffer {
  return Buffer.concat([protoInt(1, owned.id), protoInt(2, 1), protoString(3, date(owned.expiresAt)), protoString(4, date(owned.activatedAt)), protoInt(6, owned.stars), protoInt(7, owned.blessing), protoInt(10, Number(owned.flightUnlocked))]);
}
export function collectionPackets(owned: MountOwned[], score: number, stamp: number): CityPacket[] {
  const pages = Math.max(1, Math.ceil(owned.length / 200));
  return Array.from({ length: pages }, (_, page) => ({ opcode: 4427, body: Buffer.concat([...owned.slice(page * 200, (page + 1) * 200).map(row => nested(1, avatarBody(row))), protoInt(2, score), protoInt(4, stamp), protoInt(5, pages)]).toString("base64") }));
}
export function kingsPacket(kings: Record<string, KingProgress>, opcode = 4973, id?: number): CityPacket {
  const bodies = Object.entries(kings).filter(([key]) => id === undefined || Number(key) === id).map(([key, row]) => Buffer.concat([protoInt(1, Number(key)), protoInt(2, kingPercent(row)), protoInt(3, row.level), protoInt(4, row.xp)]));
  return { opcode, body: (opcode === 4973 ? Buffer.concat(bodies.map(body => nested(1, body))) : bodies[0] ?? Buffer.alloc(0)).toString("base64") };
}
export function shopPacket(rows: { item: number; price: number; purchased: boolean }[], opcode = 4975): CityPacket {
  return { opcode, body: Buffer.concat(rows.map(row => nested(1, Buffer.concat([protoInt(1, row.item), protoInt(2, 1), protoInt(3, row.price), protoInt(4, Number(!row.purchased))])))).toString("base64") };
}
export function generalPacket(message: Message, grades: number[], soulXP: number, opcode = 4426): CityPacket {
  const base = encodeMessage(typeName("campaign.MountInfoMsg"), message);
  return { opcode, body: Buffer.concat([base, ...grades.map((value, index) => protoInt(16 + index, value)), protoInt(20, soulXP)]).toString("base64") };
}
