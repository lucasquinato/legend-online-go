export type RawTitleRow = Readonly<Record<string, string>>;

export interface TitleCatalogInput {
  version: 1;
  sources: {
    bundle: { path: string; sha256: string };
    tables: readonly { name: string; sha256: string; rows: number }[];
  };
  titles: readonly RawTitleRow[];
  properties: readonly RawTitleRow[];
  skills: readonly RawTitleRow[];
  buffers: readonly RawTitleRow[];
}

/** These descriptors identify integrations; they neither evaluate nor grant titles. */
export interface TitleConditionDefinition {
  type: number;
  key: string;
  domain: string;
  description: string;
  parameters: "opaque" | "target" | "mount-id" | "fashion-ids";
}

export interface TitleRequirement {
  conditionType: number;
  key: string;
  domain: string;
  description: string;
  definitionStatus: "documented" | "unmapped";
  evaluation: "pending-integration";
  parameterLayout: TitleConditionDefinition["parameters"];
  rawParameters: string;
  groups: readonly (readonly string[])[];
  clientShowsProgress: boolean;
}

/** No primary conversion, effect summation or character calculation happens here. */
export interface TitleEffectDefinition {
  skillId: number;
  mode: "flat" | "percentage";
  values: Readonly<Record<string, number>>;
  skill: RawTitleRow;
  property: RawTitleRow;
}

export interface TitleDefinition {
  id: number;
  category: 1 | 2 | 3 | 4;
  job: 0 | 1 | 2 | 3;
  title: string;
  htmlTitle: string;
  description: string;
  quality: number;
  sort: number;
  notifyOnAcquire: boolean;
  hiddenUntilOwned: boolean;
  hideTitleText: boolean;
  chatPrefix: string;
  appearance: {
    raw: string;
    imageId: number;
    resourcePath: string | null;
    width: number;
    height: number;
    textY: number;
    fontSize: number;
    colorId: number;
  };
  validity: {
    rawTime: string;
    isLong: boolean;
    expiresAtAuthority: "server";
    timeUnit: "unresolved";
  };
  requirement: TitleRequirement;
  skillIds: readonly number[];
  effects: readonly TitleEffectDefinition[];
  bufferIds: readonly number[];
  buffers: readonly RawTitleRow[];
  raw: RawTitleRow;
}

export interface TitleCatalogFilter {
  category?: TitleDefinition["category"];
  job?: 1 | 2 | 3;
  conditionType?: number;
  domain?: string;
  requirementKey?: string;
}
