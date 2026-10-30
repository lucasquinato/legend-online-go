import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { projectRoot } from "../../config.js";

const db = new DatabaseSync(join(projectRoot, "data/state.sqlite"), {
  readOnly: true,
});
try {
  const source = db
    .prepare(
      "SELECT sha256 FROM assets WHERE path='/xml/tempinfos.xml' ORDER BY saved_at DESC LIMIT 1",
    )
    .get();
  if (!source) throw new Error("tempinfos.xml não está no acervo do backend");
  const xml = inflateSync(
    readFileSync(
      join(projectRoot, `data/assets/objects/${source.sha256}.bin`),
    ).subarray(4),
  ).toString("utf8");
  const rows = (tag: string) =>
    [...xml.matchAll(new RegExp(`<${tag}\\s+([^>]+)\\/>`, "g"))].map((m) =>
      Object.fromEntries(
        [...m[1]!.matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!]),
      ),
    );
  const levels = rows("UpGradeTempInfo").filter((r) => r.Types === "113");
  if (levels.length !== 200)
    throw new Error("Tabela de moda até 200 incompleta");
  const ids = new Set(levels.flatMap((r) => r.TemplateName!.split(",")));
  const reference = {
    source: { path: "/xml/tempinfos.xml", sha256: source.sha256 },
    levels,
    config: Object.fromEntries(
      rows("ConfigInfo")
        .filter((r) => /^Fashion_(Lucky|Soul|Wing|Other)$/.test(r.ConfigName!))
        .map((r) => [r.ConfigName, Number(r.ConfigValue)]),
    ),
    properties: rows("SkillPropertyTempInfo").filter((r) =>
      ids.has(r.TemplateId!),
    ),
  };
  writeFileSync(
    join(projectRoot, "reference/fashion-progression.json"),
    JSON.stringify(reference, null, 2),
  );
  console.log(
    JSON.stringify({
      levels: levels.length,
      properties: reference.properties.length,
      config: reference.config,
    }),
  );
} finally {
  db.close();
}
