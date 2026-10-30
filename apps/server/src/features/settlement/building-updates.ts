import { decodeMessage, encodeMessage, typeName, type Message } from "../../messages.js";
import { frame } from "../../protocol.js";
import { buildingTemplates } from "./content.js";

/** Per-connection projection: Flash treats every physical row in 4130 as an upgrade. */
export class BuildingUpdates {
  private readonly delivered = new Map<number, Message>();

  filter(packet: Buffer, playerLevel: number, clientReady = true): Buffer {
    if (packet.readUInt16BE(6) !== 4130) return packet;
    const name = typeName("building.BuildingInfoListMsg");
    const message = decodeMessage(name, packet.subarray(20));
    if (!message.result) return packet;
    const rows: Message[] = message.building ?? [];
    const building = clientReady ? rows.filter(row => {
      const template = buildingTemplates.get(Number(row.template_id));
      // Research uses the same protocol but must keep refreshing its own window.
      if (!template || Number(template.MasterType) >= 13) return true;
      const id = Number(row.building_id), previous = this.delivered.get(id);
      if (!previous) {
        this.delivered.set(id, structuredClone(row));
        return true;
      }
      const previousTemplate = buildingTemplates.get(Number(previous.template_id));
      const level = Number(template.BuildingGrade);
      if (level > Number(previousTemplate?.BuildingGrade ?? 0) && level === playerLevel) {
        this.delivered.set(id, structuredClone(row));
        return true;
      }
      // Same-level refreshes, property changes and captured stale templates cannot
      // replay the building-up animation. Taxes have their dedicated 4242 packet.
      return false;
    }) : [];
    if (building.length === rows.length) return packet;
    return frame(4130, packet.readInt32BE(8), encodeMessage(name, { ...message, building }),
      packet.readInt32BE(12), packet.readInt32BE(16));
  }
}
