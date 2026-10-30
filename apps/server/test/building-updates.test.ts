import { test } from "node:test";
import assert from "node:assert/strict";
import { BuildingUpdates } from "../src/features/settlement/building-updates.js";
import { buildingAt } from "../src/features/settlement/content.js";
import { decodeMessage, encodeMessage, typeName, type Message } from "../src/messages.js";
import { FrameReader, frame, crypt, INITIAL_KEY } from "../src/protocol.js";

const name = typeName("building.BuildingInfoListMsg");
const row = (son: number, level: number): Message => ({
  building_id: 12300000 + son, son_type: son,
  template_id: Number(buildingAt(son, level)!.TemplateId), propterty1: 0, propterty2: 0,
});
const packet = (building: Message[], result = true) => frame(4130, 123, encodeMessage(name, { result, building }), 7, 9);
const read = (packet: Buffer): Message[] => decodeMessage(name, packet.subarray(20)).building ?? [];

test("login initializes buildings once; repeated refreshes and property-only updates do not animate", () => {
  const delivery = new BuildingUpdates(), initial = [row(901, 11), row(402, 11), row(501, 11)];
  assert.deepEqual(read(delivery.filter(packet(initial), 11)), initial);
  for (let n = 0; n < 5; n++) assert.equal(read(delivery.filter(packet(initial), 11)).length, 0);
  assert.equal(read(delivery.filter(packet([{ ...initial[0], propterty1: 4 }]), 11)).length, 0);
  // A new Flash connection needs its complete initial model, independently.
  assert.equal(read(new BuildingUpdates().filter(packet(initial), 11)).length, 3);
});

test("only real building levels matching player progress are delivered again", () => {
  const delivery = new BuildingUpdates();
  delivery.filter(packet([row(901, 11)]), 11);
  assert.equal(read(delivery.filter(packet([row(901, 12)]), 11)).length, 0);
  const upgraded = delivery.filter(packet([row(901, 12)]), 12);
  assert.equal(read(upgraded)[0]!.template_id, row(901, 12).template_id);
  assert.equal(read(delivery.filter(packet([row(901, 12)]), 12)).length, 0);
  assert.equal(read(delivery.filter(packet([row(901, 10)]), 12)).length, 0);
  assert.equal(read(delivery.filter(packet([row(901, 15)]), 15)).length, 1);
  // Headers and checksums survive packet rebuilding.
  const filtered = delivery.filter(packet([row(901, 15)]), 15);
  assert.equal(filtered.readInt32BE(8), 123);
  assert.equal(filtered.readInt32BE(12), 7);
  assert.equal(filtered.readInt32BE(16), 9);
  const reader = new FrameReader();
  let count = 0; reader.push(crypt(filtered, INITIAL_KEY), () => count++); assert.equal(count, 1);
});

test("sanctuary research keeps its updates while repeated physical buildings are removed", () => {
  const delivery = new BuildingUpdates();
  delivery.filter(packet([row(501, 14), row(1441, 0)]), 14);
  const research = row(1441, 1);
  assert.deepEqual(read(delivery.filter(packet([row(501, 14), research]), 14)), [research]);
  const tax = frame(4242, 123, Buffer.alloc(0));
  assert.strictEqual(delivery.filter(tax, 14), tax);
});

test("failed updates do not suppress the later successful initialization", () => {
  const delivery = new BuildingUpdates(), building = [row(901, 11)];
  const rejected = packet(building, false);
  assert.strictEqual(delivery.filter(rejected, 11), rejected);
  assert.equal(read(delivery.filter(packet(building), 11)).length, 1);
});

test("pre-bootstrap login cannot consume the authoritative snapshot before Flash is ready", () => {
  for (const level of [20, 22, 80]) {
    const delivery = new BuildingUpdates(), rows = [row(901, level), row(402, level), row(501, level)];
    assert.equal(read(delivery.filter(packet(rows), level, false)).length, 0);
    assert.deepEqual(read(delivery.filter(packet(rows), level, true)), rows);
    // An older login callback can arrive late; it must remain silent and not
    // invalidate the bootstrap, even after readiness changed on the socket.
    assert.equal(read(delivery.filter(packet(rows), level, false)).length, 0);
    assert.equal(read(delivery.filter(packet(rows), level, true)).length, 0);
    if (level < 80) {
      const next = rows.map(b=>row(b.son_type,level+1));
      assert.equal(read(delivery.filter(packet(next), level+1, true)).length, 3);
    }
  }
});
