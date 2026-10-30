import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./config.js";
import { fields, varint } from "./protocol.js";

type Field = {
  name: string;
  type: string;
  wire: number;
  repeated: boolean;
  message?: string;
};
const schemas = JSON.parse(
  readFileSync(join(projectRoot, "reference/messages.json"), "utf8"),
) as Record<string, Record<string, Field>>;
Object.assign(schemas, JSON.parse(readFileSync(join(projectRoot, "reference/navigation-messages.json"), "utf8")));
Object.assign(schemas, JSON.parse(readFileSync(join(projectRoot, "reference/residence-messages.json"), "utf8")));
Object.assign(schemas, JSON.parse(readFileSync(join(projectRoot, "reference/clock-messages.json"), "utf8")));
Object.assign(schemas, JSON.parse(readFileSync(join(projectRoot, "reference/tattoo-messages.json"), "utf8")));
Object.assign(schemas, JSON.parse(readFileSync(join(projectRoot, "reference/dragon-soul/messages.json"), "utf8")));
Object.assign(schemas, JSON.parse(readFileSync(join(projectRoot, "reference/social/inspection-messages.json"), "utf8")));
Object.assign(schemas, JSON.parse(readFileSync(join(projectRoot, "reference/social/marriage-messages.json"), "utf8")));
// Unknown fields retain their wire representation, including newer fields absent from recovered sources.
export type Message = Record<string, any>;
export const typeName = (name: string) => `com.road.yishi.proto.${name}`;
export function decodeMessage(name: string, body: Buffer): Message {
  const result: Message = {};
  const schema = schemas[name];
  if (!schema) throw new Error(`Unknown message: ${name}`);
  for (const f of fields(body)) {
    const candidate = schema[f.number];
    const spec = candidate?.wire === f.wire ? candidate : undefined;
    const key = spec?.name ?? `$${f.number}`;
    let value: any;
    if (!spec)
      value = {
        wire: f.wire,
        value: Buffer.isBuffer(f.value)
          ? f.value.toString("base64")
          : f.value.toString(),
      };
    else if (Buffer.isBuffer(f.value)) {
      value = spec.message
        ? decodeMessage(spec.message, f.value)
        : spec.type === "STRING"
          ? f.value.toString("utf8")
          : { bytes: f.value.toString("base64") };
    } else {
      const signed = spec.type.startsWith("INT")
        ? BigInt.asIntN(64, f.value)
        : f.value;
      value = Number.isSafeInteger(Number(signed))
        ? Number(signed)
        : { integer: signed.toString() };
    }
    if (spec?.repeated) (result[key] ??= []).push(value);
    else if (key in result)
      throw new Error(`Duplicate scalar field ${name}.${key}`);
    else result[key] = value;
  }
  return result;
}
export function encodeMessage(name: string, value: Message): Buffer {
  const schema = schemas[name];
  if (!schema) throw new Error(`Unknown message: ${name}`);
  const byName = new Map(
    Object.entries(schema).map(([n, f]) => [f.name, [Number(n), f] as const]),
  );
  const chunks: Buffer[] = [];
  for (const [key, item] of Object.entries(value)) {
    const entry = byName.get(key);
    if (!entry && !key.startsWith("$"))
      throw new Error(`Unknown field ${name}.${key}`);
    const n = entry?.[0] ?? Number(key.slice(1));
    const spec = entry?.[1];
    for (const v of spec?.repeated ? item : [item]) {
      const wire = spec?.wire ?? v.wire;
      chunks.push(varint(n * 8 + wire));
      if (wire === 0) {
        const integer = BigInt(spec ? (v?.integer ?? v) : v.value);
        chunks.push(varint(BigInt.asUintN(64, integer)));
      } else {
        const bytes = !spec
          ? Buffer.from(v.value, "base64")
          : spec.message
            ? encodeMessage(spec.message, v)
            : spec.type === "STRING"
              ? Buffer.from(v, "utf8")
              : Buffer.from(v.bytes, "base64");
        if (wire === 2) chunks.push(varint(bytes.length));
        chunks.push(bytes);
      }
    }
  }
  return Buffer.concat(chunks);
}
export const PACKET_MESSAGES: Record<number, string> = {
  341: typeName("pet.NavigationResMsg"),
  342: typeName("pet.NavigationMsg"),
  178: typeName("pet.NavigationFishingStateMsg"),
  115: typeName("item.ItemMovedListMsg"),
  3: typeName("player.PlayerMsg"),
  100: typeName("army.ArmyPawnUpdatedMsg"),
  113: typeName("army.SimpleHeroInfoMsg"),
  140: typeName("army.MapUpdatedMsg"),
  150: typeName("army.ArmyMsg"),
  157: typeName("battle.BattlePrepareMsg"),
  153: typeName("battle.AttackOrderMsg"),
  154: typeName("battle.PrepareOverMsg"),
  156: typeName("battle.BattleStartMsg"),
  75: typeName("battle.HeroOrderMsg"),
  77: typeName("battle.AttackModeMsg"),
  158: typeName("battle.ItemUseResultMsg"),
  21: typeName("room.RoomEnterMsg"),
  22: typeName("campaign.CampaignExitMsg"),
  127: typeName("campaign.CampaignNodeListMsg"),
  128: typeName("campaign.CampaignNodeUpdateMsg"),
  131: typeName("army.ArmyMsg"),
};

/** Keep only declared native fields when projecting public player models. */
export function projectMessage(name:string,source:Message):Message {const schema=schemas[name];if(!schema)throw new Error(`Unknown message: ${name}`);const out:Message={};for(const f of Object.values(schema)){const v=source[f.name];if(v===undefined||v===null)continue;out[f.name]=f.message?(f.repeated?v.map((x:Message)=>projectMessage(f.message!,x)):projectMessage(f.message,v)):v;}return out;}
