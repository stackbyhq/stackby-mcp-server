# Dashboards and Blocks

Stackby dashboards are visual containers that hold **blocks** — configurable widgets such as charts, summary KPI cards, pivot tables, countdown timers, and more. The MCP server exposes two tools for managing dashboards and blocks. Both tools are thin wrappers around Stackby's internal action endpoints; they forward a `body` payload to the corresponding backend route and return the raw API response.

All tools accept both `camelCase` and `snake_case` parameter names. The server's `withCamel()` wrapper normalises any `snake_case` key to `camelCase` before the handler runs, so `stack_id` and `stackId` are treated identically.

---

## Table of Contents

| Tool | Description |
|---|---|
| [`dashboard_action`](#dashboard_action) | Create, update, or query a dashboard |
| [`block_action`](#block_action) | Create, update, duplicate, or move a block on a dashboard |

Additional reference sections:

- [Supported Block Types](#supported-block-types)
- [Block Create Normalization — `normalizeBlockActionBody()`](#block-create-normalization)
- [Summary Block Special Handling](#summary-block-special-handling)

---

## `dashboard_action` {#dashboard_action}

Runs a dashboard operation via the Stackby MCP developer API. The `stackId` in the request URL takes precedence over any `stackId` you include in `body`, so you do not need to duplicate it in the payload.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID (from `list_stacks`). |
| `id` | string | Yes | Dashboard ID. For `create`, supply a new unique ID you generate (e.g. `"dash_newxyz"`). For all other actions, use an existing dashboard ID. |
| `action` | string | Yes | Operation to perform. One of: `create`, `update`, `getblocks`, `positionupdate`, `move`. See the action table below. |
| `body` | object | No | Action-specific payload. Shape varies by `action`. `stackId` is optional inside `body` — the URL value is used when omitted. |

### Valid Action Values

| `action` | Description | Required `body` fields | Example `body` |
|---|---|---|---|
| `create` | Create a new dashboard | `name` | `{ "name": "Sales Overview" }` |
| `update` | Update dashboard metadata (rename, etc.) | `name` | `{ "name": "Q2 Sales Overview" }` |
| `getblocks` | List all blocks on a dashboard | `dashboardId` | `{ "dashboardId": "dash_abc123" }` |
| `positionupdate` | Reorder or resize blocks on the dashboard grid | `blocks` (array of block layout objects) | `{ "blocks": [{ "i": "blk_001", "x": 0, "y": 0, "w": 4, "h": 3 }] }` |
| `move` | Move a dashboard to a different position | `position` | `{ "position": 2 }` |

### API Call

```
POST /api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action
Body: { ...body, "stackId": "<stackId>" }
```

The `stackId` is automatically injected into the request body before forwarding to the backend.

### Output

The raw Stackby API response as a pretty-printed JSON string. The exact shape depends on the `action`:

- **`create`** — returns the created dashboard object including its `id`.
- **`update`** — returns the updated dashboard object.
- **`getblocks`** — returns an array of block objects on the dashboard.
- **`positionupdate`** — returns a confirmation of the layout update.
- **`move`** — returns the updated dashboard position.

**Example output for `create`:**
```json
{
  "id": "dash_newxyz",
  "name": "Sales Overview",
  "stackId": "st_prod001",
  "createdAt": "2024-06-15T10:00:00.000Z"
}
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId`, `id`, or `action` not provided | Returns `isError: true` — `"stackId, id, and action are required."` |
| No auth credential configured | Returns a configuration advisory message. `isError` is not set. |
| API returns a non-2xx response | Returns `isError: true` — `"dashboard_action failed: Stackby API {status}: {message}."` |

### Examples

**Create a new dashboard:**
```json
{
  "stackId": "st_prod001",
  "id": "dash_newxyz",
  "action": "create",
  "body": { "name": "Sales Overview" }
}
```

**List all blocks on a dashboard:**
```json
{
  "stackId": "st_prod001",
  "id": "dash_newxyz",
  "action": "getblocks",
  "body": { "dashboardId": "dash_newxyz" }
}
```

**Rename a dashboard:**
```json
{
  "stackId": "st_prod001",
  "id": "dash_newxyz",
  "action": "update",
  "body": { "name": "Q2 Sales Overview" }
}
```

---

## `block_action` {#block_action}

Runs a block operation on a dashboard. For `create`, the server applies `normalizeBlockActionBody()` to transform user-friendly fields (type, name, dashboardId, layout, config) into the `blockFields`, `gridLayout`, and `linearLayout` fields required by the Stackby block API. For all other actions, the `body` is forwarded as-is.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID (from `list_stacks`). |
| `id` | string | Yes | Block ID. For `create`, supply a new unique ID you generate (e.g. `"blk_newxyz"`). For all other actions, use an existing block ID. |
| `action` | string | Yes | Operation to perform. One of: `create`, `update`, `duplicate`, `move`. |
| `body` | object | No | Action-specific payload. For `create`, see the [Block Create Normalization](#block-create-normalization) section below for the full field reference. |

### Valid Action Values

| `action` | Description | Key `body` fields |
|---|---|---|
| `create` | Create a new block on a dashboard | `dashboardId` (required), `type`, `name`, `layout`, `config` |
| `update` | Update block configuration or layout | `blockFields` (JSON string) and/or layout fields |
| `duplicate` | Duplicate an existing block | `dashboardId`, `newId` (optional — new block ID for the copy) |
| `move` | Move a block to a different position | Layout coordinate fields (`x`, `y`, `w`, `h`) |

### API Call

```
POST /api/v1/mcp/stacks/:stackId/block-actions/:id/:action
Body: <normalizedBody>
```

For `create` actions, `normalizedBody` is the output of `normalizeBlockActionBody()` (see [below](#block-create-normalization)). For all other actions, the body is forwarded as-is with `stackId` injected.

### Output

The raw Stackby API response as a pretty-printed JSON string. The exact shape depends on the `action`:

- **`create`** — returns the created block object including its `id`, `type`, and layout.
- **`update`** — returns the updated block object.
- **`duplicate`** — returns the duplicated block object with its new ID.
- **`move`** — returns a confirmation of the position update.

**Example output for `create`:**
```json
{
  "id": "blk_newxyz",
  "type": "Chart",
  "name": "Revenue Chart",
  "dashboardId": "dash_newxyz",
  "gridLayout": "{\"i\":\"blk_newxyz\",\"x\":0,\"y\":0,\"w\":2,\"h\":3}"
}
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId`, `id`, or `action` not provided | Returns `isError: true` — `"stackId, id, and action are required."` |
| `create` action is missing a required `body` field (e.g. `dashboardId`) | Returns `isError: true` — `"block_action create is missing required field(s) for \"{type}\": {field1}, {field2}."` — **no API call is made** |
| No auth credential configured | Returns a configuration advisory message. `isError` is not set. |
| API returns a non-2xx response | Returns `isError: true` — `"block_action failed: Stackby API {status}: {message}."` |

### Examples

**Create a Chart block:**
```json
{
  "stackId": "st_prod001",
  "id": "blk_chart01",
  "action": "create",
  "body": {
    "dashboardId": "dash_newxyz",
    "type": "Chart",
    "name": "Revenue Chart",
    "layout": { "x": 0, "y": 0, "w": 4, "h": 3 }
  }
}
```

**Create a Summary (KPI) block:**
```json
{
  "stackId": "st_prod001",
  "id": "blk_kpi01",
  "action": "create",
  "body": {
    "dashboardId": "dash_newxyz",
    "type": "Summary",
    "name": "Open Issues Count",
    "tableId": "tb_issues",
    "viewId": "vi_open",
    "columnId": "cl_status",
    "summaryType": "CountFilled",
    "colorCode": "#29293d",
    "label": "Open Issues"
  }
}
```

**Duplicate an existing block:**
```json
{
  "stackId": "st_prod001",
  "id": "blk_chart01",
  "action": "duplicate",
  "body": { "dashboardId": "dash_newxyz" }
}
```

---

## Supported Block Types {#supported-block-types}

The `type` field in a `block_action create` request identifies which kind of widget to place on the dashboard. Type names are resolved **case-insensitively** against the alias list for each block type. Unknown types fall back to `Chart`.

| Canonical Name | Accepted Aliases | Description |
|---|---|---|
| `Chart` | `chart`, `charts` | Configurable data chart (bar, line, pie, etc.) driven by table data. |
| `Summary` | `summary`, `kpi`, `metric` | KPI card displaying a single aggregated value (count, sum, average, etc.) from a column. |
| `Description` | `description`, `text` | Free-text rich-text block for labels, headings, or notes on the dashboard. |
| `GoalTracker` | `goaltracker`, `goal tracker`, `goal`, `goals` | Progress tracker toward a defined numeric goal. |
| `Embed` | `embed`, `iframe` | Embeds an external URL or iframe inside the dashboard. |
| `RowCard` | `rowcard`, `row card`, `record card` | Displays the fields of a specific record as a card. |
| `PivotTable` | `pivottable`, `pivot table`, `pivot` | Cross-tabulation view summarising data from a table. |
| `CountDown` | `countdown`, `countdown tracker` | Timer counting down to a target date/time. |
| `TimeTracker` | `timetracker`, `time tracker`, `timer` | Time-tracking widget for recording durations against records. |
| `Search` | `search`, `global search` | Global search widget for finding records across the stack. |
| `PageDesigner` | `pagedesigner`, `page designer`, `designer` | Drag-and-drop page layout tool for printable reports. |
| `StackSchema` | `stackschema`, `stack schema`, `schema` | Visual diagram of the stack's table and field relationships. |
| `Record Overview` | `record overview`, `overview` | Summary view of a selected record's related data. |
| `Map` | `map`, `map view` | Geographic map block driven by location column data. |
| `UrlPreview` | `urlpreview`, `url preview`, `url` | Renders a preview card for a URL stored in the stack. |
| `Datafetcher` | `datafetcher`, `data fetcher`, `dataflow` | Fetches and displays data from an external API endpoint. |
| `Batchupdate` | `batchupdate`, `batch update` | Widget for applying bulk updates to multiple records at once. |
| `vegalite` | `vegalite`, `vega-lite`, `vega lite` | Custom Vega-Lite specification chart for advanced visualisations. |

> **Alias resolution:** The `type` value you pass is lowercased and matched against the canonical type name and all aliases. For example, `"KPI"`, `"kpi"`, `"metric"`, and `"Summary"` all resolve to the `Summary` block type. If no match is found, the block is created as a `Chart`.

---

## Block Create Normalization — `normalizeBlockActionBody()` {#block-create-normalization}

When `action` is `create`, the `block_action` tool does not forward your `body` as-is. Instead, it calls `normalizeBlockActionBody()`, which transforms a user-friendly input object into the three fields the Stackby block API expects:

| Output field | Type | Description |
|---|---|---|
| `blockFields` | `string` (JSON) | JSON-serialised configuration object for the block. Contains all block-type-specific settings. |
| `gridLayout` | `string` (JSON) | JSON-serialised grid layout descriptor used by the desktop dashboard layout engine. |
| `linearLayout` | `string` (JSON) | JSON-serialised linear (mobile) layout descriptor. |

### How it works

1. **Block type resolution.** The `type` field is passed through `normalizeBlockAppType()`, which looks up the canonical block type name from the alias registry (case-insensitive). Unknown types fall back to `Chart`.

2. **Default name.** If `name` is not provided or is empty, the block's default name from `BLOCK_APP_SPECS` is used (e.g. `"Chart"`, `"Summary"`, etc.).

3. **Layout extraction.** The optional `layout` sub-object is read for `x`, `y`, `w`, and `h` values. If `layout` is absent, all four default to `0`, `0`, `2`, and `3` respectively.

4. **`blockFields` assembly.** The function collects fields from three sources in order (later sources override earlier ones):
   - The optional `config` sub-object
   - Any remaining top-level `body` keys that are not reserved (`stackId`, `dashboardId`, `name`, `type`, `layout`, `config`, `blockFields`, `gridLayout`, `linearLayout`)
   - For `Summary` blocks only: the derived `summaryData` object (see [Summary Block Special Handling](#summary-block-special-handling))

   The collected fields are JSON-serialised into `blockFields`.

5. **Layout objects.** Two JSON-serialised layout descriptors are built:
   - **`gridLayout`:** `{ "i": "<blockId>", "x": x, "y": y, "w": w, "h": h, "minH": 1, "minW": 1 }`
   - **`linearLayout`:** `{ "i": "<blockId>", "x": x, "y": y, "w": 1, "h": h, "minH": 1, "minW": 1, "moved": false, "static": false }`

   Note: `linearLayout` always uses `w: 1` regardless of the `w` value in `layout`.

6. **Pass-through check.** If the `body` already contains `blockFields`, `gridLayout`, or `linearLayout`, the normalization is skipped entirely and the body is forwarded as-is. This allows advanced callers to supply the raw layout format directly.

### Input field reference for `create`

| Field | Type | Required | Description |
|---|---|---|---|
| `dashboardId` | string | **Yes** | ID of the dashboard to add the block to. Missing this field causes the tool to return an error before calling the API. |
| `type` | string | No | Block type. Any canonical name or alias from the [Supported Block Types](#supported-block-types) table. Defaults to `Chart`. |
| `name` | string | No | Display name for the block. Defaults to the block type's default name. |
| `layout.x` | number | No | Horizontal grid position. Defaults to `0`. |
| `layout.y` | number | No | Vertical grid position. Defaults to `0`. |
| `layout.w` | number | No | Width in grid columns. Defaults to `2`. |
| `layout.h` | number | No | Height in grid rows. Defaults to `3`. |
| `config` | object | No | Block-type-specific configuration object. All keys are merged into `blockFields`. |
| Any other key | any | No | Any additional top-level key not in the reserved set is also merged into `blockFields`. |

### Example transformation

**Input body:**
```json
{
  "dashboardId": "dash_newxyz",
  "type": "chart",
  "name": "Revenue Chart",
  "layout": { "x": 0, "y": 0, "w": 4, "h": 3 },
  "config": {
    "tableId": "tb_sales",
    "viewId": "vi_all",
    "chartType": "bar"
  }
}
```

**Normalised output sent to the API:**
```json
{
  "stackId": "st_prod001",
  "dashboardId": "dash_newxyz",
  "name": "Revenue Chart",
  "type": "Chart",
  "blockFields": "{\"tableId\":\"tb_sales\",\"viewId\":\"vi_all\",\"chartType\":\"bar\"}",
  "gridLayout": "{\"i\":\"blk_chart01\",\"x\":0,\"y\":0,\"w\":4,\"h\":3,\"minH\":1,\"minW\":1}",
  "linearLayout": "{\"i\":\"blk_chart01\",\"x\":0,\"y\":0,\"w\":1,\"h\":3,\"minH\":1,\"minW\":1,\"moved\":false,\"static\":false}"
}
```

---

## Summary Block Special Handling {#summary-block-special-handling}

When `type` is `Summary` (or any of its aliases: `kpi`, `metric`), `normalizeBlockActionBody()` applies additional processing to derive a `summaryData` object from the individual fields you provide. This object is then JSON-serialised and stored in `blockFields`.

### Input fields specific to Summary blocks

| Field | Type | Description |
|---|---|---|
| `tableId` | string | ID of the table to aggregate data from. |
| `viewId` | string | ID of the view to scope the aggregation to. |
| `columnId` | string | ID of the column to aggregate. |
| `columnType` | string | Type of the column (e.g. `number`, `currency`, `formula`). Numeric column types enable Sum, Avg, Min, Max in addition to the counting options. |
| `summaryType` | string | The aggregation function to display. Case-insensitive; see normalization table below. |
| `colorCode` | string | Hex colour code for the KPI card background/accent. Defaults to `"#29293d"`. |
| `label` | string | Display label shown on the KPI card. |

### `summaryType` Normalization

The `summaryType` value you pass is lowercased, stripped of spaces, and looked up in the following map. Any unrecognised value results in an empty summary type string (no summary function selected).

| Input variants (all equivalent) | Canonical value |
|---|---|
| `none` | `None` |
| `countfilled`, `count filled`, `CountFilled` | `CountFilled` |
| `countempty`, `count empty`, `CountEmpty` | `CountEmpty` |
| `countunique`, `count unique`, `CountUnique` | `countUnique` |
| `percentfilled`, `percent filled`, `PercentFilled` | `percentFilled` |
| `percentempty`, `percent empty`, `PercentEmpty` | `percentEmpty` |
| `percentunique`, `percent unique`, `PercentUnique` | `percentUnique` |
| `sum`, `Sum` | `Sum` |
| `avg`, `average`, `Avg`, `Average` | `Avg` |
| `min`, `Min` | `Min` |
| `max`, `Max` | `Max` |

> **Numeric-only types:** `Sum`, `Avg`, `Min`, and `Max` are only included in the `summaryOption` list when the column type is one of `number`, `currency`, `count`, `formula`, or `aggregation`. If a non-numeric column is used with one of these four summary types, the summary type is silently cleared to an empty string.

### Derived `summaryData` structure

The function builds a `summaryData` object and serialises it into `blockFields`:

```json
{
  "tableValue": { "key": "tb_issues", "value": "tb_issues", "text": "tb_issues" },
  "viewValue": { "key": "vi_open", "value": "vi_open", "text": "vi_open" },
  "columnValue": { "key": "cl_status", "value": "cl_status", "text": "cl_status" },
  "summaryTypeValue": {
    "key": "1",
    "text": "CountFilled",
    "value": "CountFilled"
  },
  "summaryOption": [
    { "key": "0", "text": "None", "value": "None" },
    { "key": "1", "text": "CountFilled", "value": "CountFilled" },
    { "key": "2", "text": "CountEmpty", "value": "CountEmpty" },
    { "key": "3", "text": "CountUnique", "value": "countUnique" },
    { "key": "4", "text": "PercentFilled", "value": "percentFilled" },
    { "key": "5", "text": "PercentEmpty", "value": "percentEmpty" },
    { "key": "6", "text": "PercentUnique", "value": "percentUnique" }
  ],
  "colorCode": "#29293d",
  "label": "Open Issues",
  "selectSummary": true,
  "activeSummaryView": { "value": "Summary", "label": "Summary" }
}
```

When a numeric column type is used, four additional options are appended to `summaryOption`:
```json
{ "key": "7", "text": "Sum", "value": "Sum" },
{ "key": "8", "text": "Avg", "value": "Avg" },
{ "key": "9", "text": "Min", "value": "Min" },
{ "key": "10", "text": "Max", "value": "Max" }
```

The `activeSummaryView` field reflects whether the block is in Summary mode (`"Summary"`) or plain Count mode (`"Count"`). The server sets this to `"Summary"` whenever any of `summaryType`, `columnId`, or the `selectSummary` flag is truthy.

### Complete Summary block create example

**Input:**
```json
{
  "stackId": "st_prod001",
  "id": "blk_kpi01",
  "action": "create",
  "body": {
    "dashboardId": "dash_newxyz",
    "type": "kpi",
    "name": "Open Issues",
    "tableId": "tb_issues",
    "viewId": "vi_open",
    "columnId": "cl_status",
    "summaryType": "CountFilled",
    "colorCode": "#ff6b6b",
    "label": "Open Issues",
    "layout": { "x": 0, "y": 0, "w": 2, "h": 3 }
  }
}
```

**API call made:**
```
POST /api/v1/mcp/stacks/st_prod001/block-actions/blk_kpi01/create
```

**Normalised body sent:**
```json
{
  "stackId": "st_prod001",
  "dashboardId": "dash_newxyz",
  "name": "Open Issues",
  "type": "Summary",
  "blockFields": "{\"summaryData\":{\"tableValue\":{\"key\":\"tb_issues\",\"value\":\"tb_issues\",\"text\":\"tb_issues\"},\"viewValue\":{\"key\":\"vi_open\",\"value\":\"vi_open\",\"text\":\"vi_open\"},\"columnValue\":{\"key\":\"cl_status\",\"value\":\"cl_status\",\"text\":\"cl_status\"},\"summaryTypeValue\":{\"key\":\"1\",\"text\":\"CountFilled\",\"value\":\"CountFilled\"},\"summaryOption\":[...],\"colorCode\":\"#ff6b6b\",\"label\":\"Open Issues\",\"selectSummary\":true,\"activeSummaryView\":{\"value\":\"Summary\",\"label\":\"Summary\"}}}",
  "gridLayout": "{\"i\":\"blk_kpi01\",\"x\":0,\"y\":0,\"w\":2,\"h\":3,\"minH\":1,\"minW\":1}",
  "linearLayout": "{\"i\":\"blk_kpi01\",\"x\":0,\"y\":0,\"w\":1,\"h\":3,\"minH\":1,\"minW\":1,\"moved\":false,\"static\":false}"
}
```

---

## Common Patterns

### Creating a dashboard with blocks in sequence

The typical workflow for setting up a new dashboard is:

```
dashboard_action (create)         → get the dashboard ID
  → block_action (create, Chart)  → add a chart block
  → block_action (create, Summary)→ add a KPI card
  → block_action (create, PivotTable) → add a pivot table
  → dashboard_action (getblocks)  → verify all blocks are present
```

### Getting blocks on an existing dashboard

```json
{
  "stackId": "st_prod001",
  "id": "dash_newxyz",
  "action": "getblocks",
  "body": { "dashboardId": "dash_newxyz" }
}
```

The response contains an array of block objects. Each block includes its `id`, `type`, `name`, `blockFields` (the JSON-serialised config), and layout coordinates.

### Updating block configuration

To update a block's `blockFields` directly (e.g. to change a chart's data source), use `update` with the pre-serialised `blockFields` string:

```json
{
  "stackId": "st_prod001",
  "id": "blk_chart01",
  "action": "update",
  "body": {
    "blockFields": "{\"tableId\":\"tb_sales_v2\",\"viewId\":\"vi_q2\",\"chartType\":\"bar\"}"
  }
}
```
