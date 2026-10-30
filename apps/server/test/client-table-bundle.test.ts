import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { projectRoot } from "../src/config.js";
import { encodeClientTableBundle } from "../src/client-table-bundle.js";
import { localCampaignConfig } from "../src/features/campaign/config-overrides.js";
import { localSkillTables } from "../src/features/skills/descriptions.js";
import { localCosmosTables } from "../src/features/cosmos/client-tables.js";
import { localEquipmentTables } from "../src/features/equipment/client-tables.js";
import { localTitleQuestTables } from "../src/features/titles/quest.js";
import { localLabyrinthQuestTables } from "../src/features/labyrinth/quest.js";

test("empacotamento declara tamanho comprimido e preserva a versão interna das tabelas", () => {
  const data = Buffer.concat([Buffer.from([0, 0, 0, 42]), Buffer.alloc(10000, 65)]);
  const bundle = encodeClientTableBundle(data);
  assert.equal(bundle.readUInt32BE(0), bundle.length - 4);
  assert.notEqual(bundle.readUInt32BE(0), data.length);
  assert.deepEqual(inflateSync(bundle.subarray(4)), data);
});

test("todas as transformações e o pacote completo atendem à validação de tamanho do carregador Flash", () => {
  const original = readFileSync(join(projectRoot, "reference/quests/tempinfos.original.bin"));
  const version = inflateSync(original.subarray(4)).readUInt32BE(0);
  let current = original;
  for (const transform of [localCampaignConfig, localSkillTables, localCosmosTables, localEquipmentTables, localTitleQuestTables, localLabyrinthQuestTables]) {
    current = transform(current);
    assert.equal(current.readUInt32BE(0), current.length - 4, transform.name);
    const data = inflateSync(current.subarray(4));
    assert.equal(data.readUInt32BE(0), version, "versão interna não é o tamanho do transporte");
    let offset = 4, count = 0;
    while (offset < data.length) {
      const nameLength = data[offset++]!;
      offset += nameLength;
      const length = data.readUInt32BE(offset);
      offset += 4 + length;
      assert.ok(offset <= data.length, "registro de tabela não pode ultrapassar o pacote");
      count++;
    }
    assert.equal(offset, data.length);
    assert.equal(count, 292);
  }
  // BaseLoaderII rejects the stale header once the difference reaches 3000 bytes.
  const staleDifference = Math.abs(original.readUInt32BE(0) - (current.length - 4));
  assert.ok(staleDifference >= 3000, "fixture reproduz a rejeição do pacote anterior");
  assert.equal(Math.abs(current.readUInt32BE(0) - (current.length - 4)), 0);
});
