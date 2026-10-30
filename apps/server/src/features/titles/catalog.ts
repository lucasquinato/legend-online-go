import type { TitleCatalogFilter, TitleCatalogInput, TitleConditionDefinition, TitleDefinition, RawTitleRow, TitleEffectDefinition } from "./types.js";
import { describeTitleRequirement, titleConditions } from "./requirements.js";

const attributeFields: Record<string, string> = {
  Power: "power", Agility: "agility", Intellect: "intellect", Physique: "physique", Captain: "captain",
  Attack: "phy_attack", Defence: "phy_defence", MagicAttack: "magic_attack", MagicDefence: "magic_defence",
  ForceHit: "force_hit", Penetrate: "penetrate", Parry: "parry", Live: "live", Conat: "conat_army", StunAttr: "stunAttr",
};

function number(value: string | undefined, field: string, fallback?: number): number {
  if ((value === undefined || value === "") && fallback !== undefined) return fallback;
  if (value === undefined || value.trim() === "" || !Number.isFinite(Number(value)))
    throw new Error(`Número inválido no catálogo de títulos: ${field}`);
  return Number(value);
}
function integer(value: string | undefined, field: string, fallback?: number): number {
  const n = number(value, field, fallback);
  if (!Number.isSafeInteger(n)) throw new Error(`Inteiro inválido no catálogo de títulos: ${field}`);
  return n;
}
function positive(value: string | undefined, field: string): number {
  const n = integer(value, field);
  if (n <= 0) throw new Error(`ID inválido no catálogo de títulos: ${field}`);
  return n;
}
function bool(value: string | undefined, field: string, numeric = false): boolean {
  if (numeric && ["0", "1"].includes(value ?? "")) return value === "1";
  if (value === "true" || value === "false") return value === "true";
  throw new Error(`Booleano inválido no catálogo de títulos: ${field}`);
}
function ids(value: string | undefined): number[] {
  return (value ?? "").split(",").filter(v => v !== "" && v !== "0").map(v => positive(v, "referência de efeito"));
}
function index(rows: readonly RawTitleRow[], field: string, name: string): Map<number, RawTitleRow> {
  const result = new Map<number, RawTitleRow>();
  for (const row of rows) {
    const id = positive(row[field], `${name}.${field}`);
    if (result.has(id)) throw new Error(`ID duplicado em ${name}: ${id}`);
    result.set(id, row);
  }
  return result;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export class TitleCatalog {
  private readonly byId = new Map<number, TitleDefinition>();
  readonly all: readonly TitleDefinition[];
  readonly sources: TitleCatalogInput["sources"];

  constructor(input: TitleCatalogInput, conditions: readonly TitleConditionDefinition[] = titleConditions) {
    if (input.version !== 1) throw new Error("Versão desconhecida do catálogo de títulos");
    if (!/^[a-f0-9]{64}$/.test(input.sources.bundle.sha256) || !input.sources.bundle.path)
      throw new Error("Origem inválida do catálogo de títulos");
    for (const table of input.sources.tables)
      if (!/^[a-f0-9]{64}$/.test(table.sha256) || !Number.isSafeInteger(table.rows) || table.rows < 0)
        throw new Error("Origem de tabela inválida");
    const conditionIds = new Set<number>(), conditionKeys = new Set<string>();
    for (const row of conditions) {
      if (!Number.isSafeInteger(row.type) || !row.key || !row.domain || conditionIds.has(row.type) || conditionKeys.has(row.key))
        throw new Error("Registro de condições de títulos inválido ou duplicado");
      conditionIds.add(row.type); conditionKeys.add(row.key);
    }
    // Own all rows so callers cannot change the catalog by mutating the import.
    const owned = structuredClone(input);
    this.sources = freeze(owned.sources);
    const properties = index(owned.properties, "TemplateId", "propriedades");
    const skills = index(owned.skills, "TemplateId", "habilidades");
    const buffers = index(owned.buffers, "Id", "buffers");
    for (const raw of owned.titles) {
      const id = positive(raw.TemplateId, "TemplateId");
      if (this.byId.has(id)) throw new Error(`Título duplicado: ${id}`);
      const category = integer(raw.Type, "Type"), job = integer(raw.Job, "Job");
      if (![1, 2, 3, 4].includes(category) || ![0, 1, 2, 3].includes(job)) throw new Error(`Categoria/classe inválida no título ${id}`);
      if (!raw.Title) throw new Error(`Título ${id} sem nome`);
      const skillIds = ids(raw.Skills), bufferIds = ids(raw.Buffs);
      const effects: TitleEffectDefinition[] = skillIds.map(skillId => {
        const property = properties.get(skillId), skill = skills.get(skillId);
        if (!property || !skill) throw new Error(`Título ${id}: efeito ${skillId} sem habilidade/propriedade`);
        const addType = integer(property.AddType, "AddType");
        if (![0, 1].includes(addType)) throw new Error(`Tipo de adição não suportado: ${addType}`);
        const values: Record<string, number> = {};
        for (const [key, rawValue] of Object.entries(property)) {
          if (["TemplateId", "AddType"].includes(key)) continue;
          const value = number(rawValue, `propriedade ${skillId}.${key}`, 0);
          if (value < 0 || (!attributeFields[key] && value !== 0)) throw new Error(`Propriedade de título não suportada: ${key}=${value}`);
          if (value) values[`total_${attributeFields[key]}`] = value;
        }
        return { skillId, mode: addType === 1 ? "flat" : "percentage", values, skill, property };
      });
      const linkedBuffers = bufferIds.map(bufferId => {
        const row = buffers.get(bufferId);
        if (!row) throw new Error(`Título ${id}: buffer ${bufferId} ausente`);
        return row;
      });
      const options = (raw.ShowParam ?? "").split(",");
      const option = (i: number, fallback: number) => integer(options[i], `ShowParam[${i}]`, 0) || fallback;
      const imageId = option(0, 0);
      if (imageId < 0) throw new Error(`Imagem inválida no título ${id}`);
      const title: TitleDefinition = {
        id, category: category as TitleDefinition["category"], job: job as TitleDefinition["job"],
        title: raw.Title.replace(/\\n/g, ""), htmlTitle: raw.Title.replace(/\\n/g, "\n"),
        description: raw.Descript ?? "", quality: integer(raw.Quality, "Quality"), sort: number(raw.Sort, "Sort"),
        notifyOnAcquire: bool(raw.Notice, "Notice"), hiddenUntilOwned: bool(raw.IsHide, "IsHide", true),
        hideTitleText: bool(raw.IsTitleHide ?? "0", "IsTitleHide", true), chatPrefix: raw.Perfix ?? "",
        appearance: {
          raw: raw.ShowParam ?? "", imageId,
          resourcePath: options.length >= 4 ? `icon/appell/${imageId}.png` : null,
          width: option(1, 65), height: option(2, 18), textY: option(3, 0), fontSize: option(4, 16), colorId: Math.max(1, option(5, 1)),
        },
        validity: { rawTime: raw.Time ?? "0", isLong: bool(raw.IsLong, "IsLong"), expiresAtAuthority: "server", timeUnit: "unresolved" },
        requirement: describeTitleRequirement(integer(raw.CondtionType, "CondtionType"), raw.Para ?? "", conditions),
        skillIds, effects, bufferIds, buffers: linkedBuffers, raw,
      };
      this.byId.set(id, freeze(title));
    }
    this.all = Object.freeze([...this.byId.values()].sort((a, b) => b.sort - a.sort || a.id - b.id));
  }

  get(id: number): TitleDefinition | undefined { return this.byId.get(id); }
  list(filter: TitleCatalogFilter = {}): readonly TitleDefinition[] {
    return Object.freeze(this.all.filter(title =>
      (filter.category === undefined || title.category === filter.category) &&
      (filter.job === undefined || title.job === 0 || title.job === filter.job) &&
      (filter.conditionType === undefined || title.requirement.conditionType === filter.conditionType) &&
      (filter.domain === undefined || title.requirement.domain === filter.domain) &&
      (filter.requirementKey === undefined || title.requirement.key === filter.requirementKey),
    ));
  }
}

export const titleAttributeUnlock = Object.freeze({ minimumLevel: 14, originalMinimumLevel: 45, questId: 936, playerFlag: "applle_property_Open", authority: "server" as const });
