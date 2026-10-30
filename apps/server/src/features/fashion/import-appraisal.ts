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
    .prepare("SELECT sha256 FROM assets WHERE path='/xml/tempinfos.xml'")
    .get()!;
  const xml = inflateSync(
    readFileSync(
      join(projectRoot, `data/assets/objects/${source.sha256}.bin`),
    ).subarray(4),
  ).toString();
  const rows = (tag: string) =>
    [...xml.matchAll(new RegExp(`<${tag}\\s+([^>]+)\\/>`, "g"))].map((m) =>
      Object.fromEntries(
        [...m[1]!.matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!]),
      ),
    );
  const skills = rows("SkillTempInfo").filter((r) =>
    [1090, 1100, 1110, 1120].some(
      (t) => Number(r.MasterType) >= t && Number(r.MasterType) <= t + 4,
    ),
  );
  const ids = new Set(skills.map((r) => r.TemplateId));
  const properties = rows("SkillPropertyTempInfo").filter((r) =>
    ids.has(r.TemplateId),
  );
  writeFileSync(
    join(projectRoot, "reference/fashion-appraisal-skills.json"),
    JSON.stringify(
      {
        source: { path: "/xml/tempinfos.xml", sha256: source.sha256 },
        skills,
        properties,
        levels: rows("UpGradeTempInfo").filter((r) => r.Types === "3"),
      },
      null,
      2,
    ) + "\n",
  );
  console.log({ skills: skills.length, properties: properties.length });
} finally {
  db.close();
}
