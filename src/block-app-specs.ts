export interface BlockAppSpec {
  type: string;
  aliases: string[];
  defaultName: string;
  requiredCreateKeys: string[];
  optionalCreateKeys: string[];
}

const DEFAULT_BLOCK_APP_TYPE = "Chart";

const BLOCK_APP_SPECS: BlockAppSpec[] = [
  {
    type: "Chart",
    aliases: ["chart", "charts"],
    defaultName: "Chart",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Summary",
    aliases: ["summary", "kpi", "metric"],
    defaultName: "Summary",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Description",
    aliases: ["description", "text"],
    defaultName: "Description",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "GoalTracker",
    aliases: ["goaltracker", "goal tracker", "goal", "goals"],
    defaultName: "GoalTracker",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Embed",
    aliases: ["embed", "iframe"],
    defaultName: "Embed",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "RowCard",
    aliases: ["rowcard", "row card", "record card"],
    defaultName: "RowCard",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "PivotTable",
    aliases: ["pivottable", "pivot table", "pivot"],
    defaultName: "PivotTable",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "CountDown",
    aliases: ["countdown", "countdown tracker"],
    defaultName: "CountDown",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "TimeTracker",
    aliases: ["timetracker", "time tracker", "timer"],
    defaultName: "TimeTracker",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Search",
    aliases: ["search", "global search"],
    defaultName: "Search",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "PageDesigner",
    aliases: ["pagedesigner", "page designer", "designer"],
    defaultName: "PageDesigner",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "StackSchema",
    aliases: ["stackschema", "stack schema", "schema"],
    defaultName: "StackSchema",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Record Overview",
    aliases: ["record overview", "overview"],
    defaultName: "Record Overview",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Map",
    aliases: ["map", "map view"],
    defaultName: "Map",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "UrlPreview",
    aliases: ["urlpreview", "url preview", "url"],
    defaultName: "UrlPreview",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Datafetcher",
    aliases: ["datafetcher", "data fetcher", "dataflow"],
    defaultName: "Datafetcher",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "Batchupdate",
    aliases: ["batchupdate", "batch update"],
    defaultName: "Batchupdate",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
  {
    type: "vegalite",
    aliases: ["vegalite", "vega-lite", "vega lite"],
    defaultName: "vegalite",
    requiredCreateKeys: ["dashboardId"],
    optionalCreateKeys: ["config", "layout"],
  },
];

const SPEC_BY_ALIAS = new Map<string, BlockAppSpec>();
for (const spec of BLOCK_APP_SPECS) {
  SPEC_BY_ALIAS.set(spec.type.toLowerCase(), spec);
  for (const alias of spec.aliases) {
    SPEC_BY_ALIAS.set(alias.toLowerCase(), spec);
  }
}

export function getBlockAppSpec(rawType: unknown): BlockAppSpec {
  const type = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
  if (!type) {
    return SPEC_BY_ALIAS.get(DEFAULT_BLOCK_APP_TYPE.toLowerCase())!;
  }
  return SPEC_BY_ALIAS.get(type) ?? SPEC_BY_ALIAS.get(DEFAULT_BLOCK_APP_TYPE.toLowerCase())!;
}

export function normalizeBlockAppType(rawType: unknown): string {
  return getBlockAppSpec(rawType).type;
}
