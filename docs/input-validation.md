# Input Validation and Normalization

Some inputs are auto-normalized — aliases are mapped to their canonical forms and alternative string representations are parsed transparently — while others cause hard validation errors that return `isError: true` without making any API call. This document describes every normalization rule applied by the MCP server before requests reach the Stackby backend.

**Related documents:**
- [Request Lifecycle](./request-lifecycle.md) — how normalized inputs flow to the API layer
- [Schema Management Tools](./tools/schema-management.md) — `create_field`, `update_field`, `delete_field`
- [Write Operations](./tools/write-operations.md) — `create_record`, `update_records`, `delete_records`
- [Dashboard and Block Tools](./tools/dashboard-blocks.md) — `block_action`, `dashboard_action`

---

## 1. Overview

The MCP server applies normalization at two points:

1. **`withCamel()` wrapper** — runs on every tool before its handler, converting any `snake_case` input keys (e.g. `stack_id`) to `camelCase` (`stackId`). Keys already in camelCase pass through unchanged. See [Request Lifecycle § camelCaseKeys](./request-lifecycle.md#camelcasekeys-and-withcamel).

2. **Per-tool normalization** — each tool's handler applies additional rules specific to its input type (column types, block types, option arrays, etc.).

The table below summarizes what is normalized vs. what is a hard error:

| Input | Behavior | Details |
|-------|----------|---------|
| `columnType` alias (e.g. `"rollup"`) | Normalized to canonical form | § 2 |
| `options` as comma-separated string | Parsed to `string[]` | § 3 |
| `options` as JSON string array | Parsed to `string[]` | § 3 |
| `options` as JSON string non-array | **Hard error** | § 3 |
| `fields` as JSON string object | Parsed to object | § 4 |
| `fields` as JSON string non-object | **Hard error** | § 4 |
| `type` in `block_action` / `block_action` alias | Normalized to canonical block type | § 5 |
| Unknown block type | Falls back to `"Chart"` (no error) | § 5 |
| `summaryType` case/space variant | Normalized to canonical form | § 6 |
| Unknown `summaryType` | Normalized to empty string (no error) | § 6 |
| `maxRecords` outside [1, 100] | Clamped silently | § 7 |
| `offset` below 0 | Clamped to 0 silently | § 7 |

---

## 2. Column Type Normalization (`normalizeColumnType`)

**Applies to:** `columnType` parameter in `create_field`

**Source:** `normalizeColumnType()` in `src/stackby-api.ts`

The function accepts any string and returns a canonical column type. Lookup is **case-insensitive**. If the input does not match any known alias or canonical type, it is **passed through unchanged** (no error). The normalized value is what the Stackby backend receives in the `columnType` field.

### Canonical Column Types

The following 42 canonical type strings are accepted directly (they match themselves after lowercasing):

| Canonical Type | Notes |
|---------------|-------|
| `shortText` | |
| `longText` | |
| `singleCollaborator` | |
| `multipleCollaborator` | |
| `singleOption` | |
| `multipleOptions` | |
| `attachment` | |
| `checkbox` | |
| `dateAndTime` | |
| `number` | |
| `phoneNumber` | |
| `duration` | |
| `time` | |
| `rating` | |
| `formula` | |
| `createdTime` | |
| `updatedTime` | |
| `createdBy` | |
| `updatedBy` | |
| `checkList` | |
| `location` | |
| `autoNumber` | |
| `email` | |
| `url` | |
| `barcode` | |
| `signature` | |
| `link` | |
| `lookup` | |
| `lookupCount` | |
| `aggregation` | Rollup/aggregation |
| `button` | |
| `apiPush` | |
| `api` | |
| `apiData` | |
| `apiDataJson` | |
| `apiDataText` | |
| `apiDataMultilineText` | |
| `apiDataPhone` | |
| `apiDataNumber` | |
| `apiDataDate` | |
| `apiDataDuration` | |
| `ai` | |
| `multipleAttachment` | |

### Alias Mapping Table

The following aliases are also accepted and mapped to their canonical forms. Matching is case-insensitive (the input is lowercased before lookup):

| Input (case-insensitive) | Canonical Type |
|--------------------------|---------------|
| `short text` | `shortText` |
| `text` | `shortText` |
| `long text` | `longText` |
| `multiline text` | `longText` |
| `single option` | `singleOption` |
| `dropdown` | `singleOption` |
| `drop down` | `singleOption` |
| `select` | `singleOption` |
| `singleselect` | `singleOption` |
| `single_select` | `singleOption` |
| `single-select` | `singleOption` |
| `multiple options` | `multipleOptions` |
| `multiselect` | `multipleOptions` |
| `multi_select` | `multipleOptions` |
| `multi-select` | `multipleOptions` |
| `date and time` | `dateAndTime` |
| `date` | `dateAndTime` |
| `datefield` | `dateAndTime` |
| `date_field` | `dateAndTime` |
| `date-field` | `dateAndTime` |
| `phone number` | `phoneNumber` |
| `created time` | `createdTime` |
| `updated time` | `updatedTime` |
| `created by` | `createdBy` |
| `updated by` | `updatedBy` |
| `lookup count` | `lookupCount` |
| `auto number` | `autoNumber` |
| `rollup` | `aggregation` |
| `roll up` | `aggregation` |
| `multiple_attachment` | `multipleAttachment` |
| `multiple attachment` | `multipleAttachment` |
| `multiple-attachment` | `multipleAttachment` |

### Behavior for Unknown Types

If the input does not match any canonical type or alias (after case-insensitive lookup), the original trimmed string is returned unchanged. This means unrecognized types are forwarded to the backend as-is, which may result in a backend API error.

### Examples

```
normalizeColumnType("rollup")        → "aggregation"
normalizeColumnType("Rollup")        → "aggregation"
normalizeColumnType("ROLLUP")        → "aggregation"
normalizeColumnType("date")          → "dateAndTime"
normalizeColumnType("dropdown")      → "singleOption"
normalizeColumnType("text")          → "shortText"
normalizeColumnType("shortText")     → "shortText"  (canonical, returned unchanged)
normalizeColumnType("myCustomType")  → "myCustomType"  (unknown, passed through)
```

---

## 3. `options` Field Parsing (`create_field`)

**Applies to:** `options` parameter in `create_field` (for `singleOption` and `multipleOptions` column types)

**Source:** `create_field` handler in `src/mcp-server.ts`

The `options` parameter accepts three input formats, all of which produce a `string[]` result:

### Format 1: Native Array (preferred)

Pass a JavaScript array of strings directly:

```json
["Option A", "Option B", "Option C"]
```

Each element is used as-is. Non-string elements are filtered out.

### Format 2: JSON Array String

Pass a JSON-encoded string whose parsed value is an array:

```json
"[\"Option A\", \"Option B\", \"Option C\"]"
```

The string is parsed with `JSON.parse`. If the parsed result is an array, each string element is extracted (non-strings are filtered). If the parsed result is **not an array** (e.g. a JSON object), the tool returns an error with `isError: true` and does not call the API.

### Format 3: Comma-Separated String

Pass a plain comma-separated string:

```json
"Option A, Option B, Option C"
```

When `JSON.parse` fails (the input is not valid JSON), the string is split on commas and each segment is trimmed. Empty segments after trimming are discarded.

### Error Case

| Condition | Result |
|-----------|--------|
| String parses as valid JSON but is not an array (e.g. `"{}"`) | `isError: true`, no API call |
| Any format that produces an empty array | Empty `options: []` sent to backend (backend may or may not allow it) |

### Output

In all success cases the result is `string[]`, passed to the backend as the `options` field.

---

## 4. `fields` Field Parsing (`create_record`)

**Applies to:** `fields` parameter in `create_record`

**Source:** `create_record` handler in `src/mcp-server.ts`

The `fields` parameter is used to specify column name → value pairs for the new record. It accepts two input formats:

### Format 1: JavaScript Object (preferred)

```json
{ "Name": "Alice", "Status": "Active", "Count": 5 }
```

The object is used as-is. Keys are column names; values can be any JSON-compatible type.

### Format 2: JSON String

```json
"{\"Name\": \"Alice\", \"Status\": \"Active\"}"
```

The string is parsed with `JSON.parse`. The result must be a plain object (not an array, not `null`, not a primitive).

### Error Cases

| Condition | Result |
|-----------|--------|
| String provided but `JSON.parse` fails | `isError: true`, no API call |
| String parses but result is not a plain object (e.g. an array `[...]`) | `isError: true`, no API call |
| `fields` is missing or `undefined` | `isError: true`, no API call |

### What the Backend Receives

The parsed object is passed as the `field` property inside `records[0]`:

```json
{
  "records": [
    { "field": { "Name": "Alice", "Status": "Active" } }
  ]
}
```

---

## 5. Block Type Normalization (`normalizeBlockAppType` / `getBlockAppSpec`)

**Applies to:** `type` parameter in `block_action` (create action body)

**Source:** `getBlockAppSpec()` and `normalizeBlockAppType()` in `src/block-app-specs.ts`

Block type resolution is **case-insensitive** and alias-aware. Unknown types fall back to `"Chart"` — this is not an error.

### Resolution Rules

1. The input is trimmed and lowercased.
2. The result is looked up in a map of canonical types and all known aliases.
3. If found, the matching `BlockAppSpec` is returned (canonical `type`, `defaultName`, `requiredCreateKeys`, `optionalCreateKeys`).
4. If **not found** (unknown type string or empty string), the `Chart` spec is returned as the default.

### Canonical Block Types and Aliases

All alias matching is case-insensitive. Canonical type names are shown exactly as stored.

| Canonical Type | Accepted Aliases |
|---------------|-----------------|
| `Chart` | `chart`, `charts` |
| `Summary` | `summary`, `kpi`, `metric` |
| `Description` | `description`, `text` |
| `GoalTracker` | `goaltracker`, `goal tracker`, `goal`, `goals` |
| `Embed` | `embed`, `iframe` |
| `RowCard` | `rowcard`, `row card`, `record card` |
| `PivotTable` | `pivottable`, `pivot table`, `pivot` |
| `CountDown` | `countdown`, `countdown tracker` |
| `TimeTracker` | `timetracker`, `time tracker`, `timer` |
| `Search` | `search`, `global search` |
| `PageDesigner` | `pagedesigner`, `page designer`, `designer` |
| `StackSchema` | `stackschema`, `stack schema`, `schema` |
| `Record Overview` | `record overview`, `overview` |
| `Map` | `map`, `map view` |
| `UrlPreview` | `urlpreview`, `url preview`, `url` |
| `Datafetcher` | `datafetcher`, `data fetcher`, `dataflow` |
| `Batchupdate` | `batchupdate`, `batch update` |
| `vegalite` | `vegalite`, `vega-lite`, `vega lite` |

### Examples

```
normalizeBlockAppType("Chart")        → "Chart"
normalizeBlockAppType("chart")        → "Chart"
normalizeBlockAppType("kpi")          → "Summary"
normalizeBlockAppType("pivot table")  → "PivotTable"
normalizeBlockAppType("PIVOT TABLE")  → "PivotTable"  (case-insensitive)
normalizeBlockAppType("unknown_xyz")  → "Chart"       (fallback, no error)
normalizeBlockAppType("")             → "Chart"       (empty string fallback)
```

### Required Keys per Block Type

Every block type spec defines `requiredCreateKeys`. Currently all 18 block types require only `dashboardId` for a create action. If `dashboardId` is absent in the `body` passed to `block_action create`, the server returns an error listing the missing field before calling the Stackby API.

---

## 6. Summary Block `summaryType` Normalization (`normalizeSummaryType`)

**Applies to:** `summaryType` (and `summary_type`, `summaryTypeValue`) fields inside the `config` or top-level body of a `block_action create` call when `type` is `"Summary"`

**Source:** `normalizeSummaryType()` in `src/mcp-server.ts`

The function accepts any value, trims it, lowercases it, and looks it up in a fixed map. Matching is **case-insensitive and space-insensitive** (all variants of a value map to the same canonical string). If the input does not match any known variant, the function returns an **empty string** — this is not a hard error; the Summary block will be created without a selected summary type.

### Normalization Map

| Input (case-insensitive, any spacing) | Canonical Value |
|---------------------------------------|-----------------|
| `none` | `None` |
| `countfilled`, `count filled` | `CountFilled` |
| `countempty`, `count empty` | `CountEmpty` |
| `countunique`, `count unique` | `countUnique` |
| `percentfilled`, `percent filled` | `percentFilled` |
| `percentempty`, `percent empty` | `percentEmpty` |
| `percentunique`, `percent unique` | `percentUnique` |
| `sum` | `Sum` |
| `avg`, `average` | `Avg` |
| `min` | `Min` |
| `max` | `Max` |
| *(anything else)* | `""` (empty string) |

> **Note:** Numeric-only summary types (`Sum`, `Avg`, `Min`, `Max`) are only meaningful for number, currency, count, formula, and aggregation column types. The server detects the column type from `columnType` or `columnValue.type` in the block config and suppresses these options for non-numeric columns, replacing the normalized value with an empty string.

### Canonical Values and Their `summaryOption` Keys

The canonical value is also mapped to a numeric key used inside the `summaryData.summaryTypeValue` object:

| Canonical Value | Key |
|----------------|-----|
| `None` | `"0"` |
| `CountFilled` | `"1"` |
| `CountEmpty` | `"2"` |
| `countUnique` | `"3"` |
| `percentFilled` | `"4"` |
| `percentEmpty` | `"5"` |
| `percentUnique` | `"6"` |
| `Sum` | `"7"` |
| `Avg` | `"8"` |
| `Min` | `"9"` |
| `Max` | `"10"` |

### Examples

```
normalizeSummaryType("count filled")  → "CountFilled"
normalizeSummaryType("CountFilled")   → "CountFilled"
normalizeSummaryType("COUNTFILLED")   → "CountFilled"
normalizeSummaryType("average")       → "Avg"
normalizeSummaryType("Average")       → "Avg"
normalizeSummaryType("SUM")           → "Sum"
normalizeSummaryType("unknown")       → ""   (no error)
normalizeSummaryType("")              → ""   (no error)
```

---

## 7. Numeric Field Clamping

**Applies to:** `maxRecords`, `offset`, and `pageSize` parameters in `list_records`

**Source:** `getRowList()` in `src/stackby-api.ts`

These parameters are silently clamped before being sent to the Stackby backend. The backend never receives out-of-range values.

### Clamping Rules

| Parameter | Clamp Range | Formula | Notes |
|-----------|-------------|---------|-------|
| `maxRecords` | [1, 100] | `Math.min(Math.max(1, value), 100)` | Default 100 when omitted |
| `pageSize` | [1, 100] | Same as `maxRecords` | Alias for `maxRecords`; both present → `maxRecords` takes precedence |
| `offset` | [0, ∞) | `Math.max(0, value)` | Default 0 when omitted |

### Precedence: `maxRecords` vs. `pageSize`

When both `maxRecords` and `pageSize` are provided, `maxRecords` takes precedence (it is evaluated first in the expression `opts.maxRecords ?? opts.pageSize ?? 100`). When only `pageSize` is provided, it is used as the record limit and clamped to [1, 100].

### Examples

| Input | After Clamping |
|-------|---------------|
| `maxRecords: 0` | `1` |
| `maxRecords: 150` | `100` |
| `maxRecords: 50` | `50` (unchanged) |
| `offset: -5` | `0` |
| `offset: 200` | `200` (unchanged, no upper bound) |
| `pageSize: 200` (no `maxRecords`) | `100` |
| `pageSize: 5` (no `maxRecords`) | `5` (unchanged) |

### Query Parameter Names

After clamping, `maxRecords` is sent to the backend as `maxrecord` (lowercase) and `offset` as `offset`:

```
GET /api/v1/mcp/stacks/{stackId}/tables/{tableId}/rows?maxrecord=100&offset=0
```

---

*Requirements covered: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6*
