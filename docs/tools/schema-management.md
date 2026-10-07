# Schema Management

This document covers all MCP tools that create, modify, or delete **tables** and **fields (columns)** in Stackby. These tools let AI clients build and reshape the structure of a stack programmatically.

**Related documents:** [Tool Catalog](README.md) · [API Reference](../api-reference.md) · [Read Operations](read-operations.md) · [Write Operations](write-operations.md) · [Input Validation](../input-validation.md)

---

## Quick Reference

| Tool | Operation | API Endpoint |
|---|---|---|
| [`create_table`](#create_table) | Create a new table | `POST /api/v1/mcp/stacks/:stackId/tables` |
| [`update_table`](#update_table) | Rename or describe a table | `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId` |
| [`delete_table`](#delete_table) | Permanently delete a table | `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId` |
| [`create_field`](#create_field) | Create a new column | `POST /api/v1/mcp/columns` |
| [`update_field`](#update_field) | Update a column | `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` |
| [`delete_field`](#delete_field) | Permanently delete a column | `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` |

---

## Column Types Reference

Before diving into individual tools, this section documents all supported column types. The `columnType` parameter in `create_field` accepts both canonical type names and common aliases, which are automatically normalized before the API call.

### Canonical Column Types

The following 43 types are the authoritative values recognized by the Stackby API:

| Type | Description |
|---|---|
| `shortText` | Single-line text |
| `longText` | Multi-line / rich text |
| `number` | Numeric value (integer or decimal) |
| `checkbox` | Boolean checkbox |
| `dateAndTime` | Date with optional time |
| `singleOption` | Single-select dropdown |
| `multipleOptions` | Multi-select dropdown |
| `email` | Email address |
| `url` | URL / link |
| `phoneNumber` | Phone number with optional country code |
| `duration` | Time duration |
| `time` | Time value |
| `rating` | Star/icon rating |
| `formula` | Calculated formula referencing other columns |
| `link` | Linked-record relationship to another table |
| `lookup` | Pulls a field value from a linked record |
| `lookupCount` | Counts linked records |
| `aggregation` | Rolls up (aggregates) values from linked records |
| `singleCollaborator` | Single collaborator reference |
| `multipleCollaborator` | Multiple collaborator references |
| `attachment` | File attachment (legacy alias — see `multipleAttachment`) |
| `multipleAttachment` | File attachment (canonical name) |
| `checkList` | Checklist / task list |
| `location` | Geographic location |
| `autoNumber` | Auto-incrementing row number |
| `barcode` | Barcode scanner field |
| `signature` | Signature capture |
| `ai` | AI-generated content |
| `createdTime` | Timestamp of row creation (read-only) |
| `updatedTime` | Timestamp of last update (read-only) |
| `createdBy` | User who created the row (read-only) |
| `updatedBy` | User who last updated the row (read-only) |
| `button` | Clickable button field |
| `apiPush` | API push integration |
| `api` | Generic API field |
| `apiData` | API data field |
| `apiDataJson` | API JSON data |
| `apiDataText` | API text data |
| `apiDataMultilineText` | API multiline text data |
| `apiDataPhone` | API phone data |
| `apiDataNumber` | API number data |
| `apiDataDate` | API date data |
| `apiDataDuration` | API duration data |

### Alias Mapping

The `columnType` parameter accepts the following aliases in addition to the canonical names. Aliases are normalized to their canonical form by `normalizeColumnType()` before processing. Alias matching is case-insensitive.

| Input Alias | Canonical Type |
|---|---|
| `text`, `short text` | `shortText` |
| `long text`, `multiline text` | `longText` |
| `date`, `datefield`, `date field`, `date_field`, `date-field` | `dateAndTime` |
| `date and time` | `dateAndTime` |
| `dropdown`, `drop down`, `select`, `singleselect`, `single_select`, `single-select`, `single option` | `singleOption` |
| `multiselect`, `multi_select`, `multi-select`, `multiple options` | `multipleOptions` |
| `rollup`, `roll up` | `aggregation` |
| `attachment`, `multiple attachment`, `multiple_attachment`, `multiple-attachment` | `multipleAttachment` |
| `phone number` | `phoneNumber` |
| `created time` | `createdTime` |
| `updated time` | `updatedTime` |
| `created by` | `createdBy` |
| `updated by` | `updatedBy` |
| `lookup count` | `lookupCount` |
| `auto number` | `autoNumber` |

Any value not in the alias map is passed through to the API unchanged.

### Aggregation Formulas

When `columnType` is `aggregation` (or its alias `rollup`), the `formulaText` parameter must be exactly one of the following 14 strings (case-sensitive). Any other value causes `create_field` to return an error before calling the API.

| Formula | Description |
|---|---|
| `MIN(values)` | Minimum value across linked records |
| `MAX(values)` | Maximum value across linked records |
| `SUM(values)` | Sum of values across linked records |
| `AVERAGE(values)` | Average of values across linked records |
| `COUNT(values)` | Count of non-empty values |
| `COUNTA(values)` | Count of non-empty, non-zero values |
| `COUNTALL(values)` | Count of all linked records (including empty) |
| `AND(values)` | Logical AND across boolean values |
| `OR(values)` | Logical OR across boolean values |
| `XOR(values)` | Logical XOR across boolean values |
| `ARRAYJOIN(values)` | Join values into a comma-separated string |
| `ARRAYUNIQUE(values)` | Unique values as an array |
| `ARRAYCOMPACT(values)` | Remove empty values from the array |
| `ARRAYFLATTEN(values)` | Flatten nested arrays into a single array |

---

## create_table

Create a new table (sheet) inside a stack.

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | yes | Stack ID to create the table in (from `list_stacks`) |
| `name` | string | yes | Table name (1–255 characters, non-empty after trimming) |

### API Call

```
POST /api/v1/mcp/stacks/:stackId/tables
Content-Type: application/json

{ "name": "Tasks" }
```

### Response

On success, the tool returns the new table's ID and display name:

```
Created table: Tasks
Table ID: tbl_abc123
```

### Error Handling

The tool returns `isError: true` and an error message in the following cases:

| Condition | Error message |
|---|---|
| `stackId` or `name` not provided (empty after trimming) | `"stackId and name are required."` |
| No auth credential configured | `"No auth credential found. ..."` |
| API returns a non-2xx response | `"Failed to create table: Stackby API {status}: {message}. ..."` |

### Example

```json
{
  "tool": "create_table",
  "arguments": {
    "stackId": "stk_abc123",
    "name": "Sprint Backlog"
  }
}
```

---

## update_table

Rename a table and/or update its description. At least one of `name` or `description` must be provided.

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | yes | Stack ID (from `list_stacks`) |
| `tableId` | string | yes | Table ID (from `list_tables`) |
| `name` | string | no | New table name (1–255 characters) |
| `description` | string | no | New table description (up to 1000 characters) |

At least one of `name` or `description` must be present in the call. Passing both is valid.

### API Call

```
PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId
Content-Type: application/json

{ "name": "Sprint Backlog v2" }
```

Only the fields provided are included in the PATCH body. Fields not provided are left unchanged.

### Response

On success, the tool returns the raw API response as formatted JSON:

```
Table updated.
{ ... }
```

### Error Handling

| Condition | Error message |
|---|---|
| `stackId` or `tableId` not provided | `"stackId and tableId are required."` |
| Neither `name` nor `description` provided | `"Provide at least one of: name, description."` |
| No auth credential configured | `"No auth credential found. ..."` |
| API returns a non-2xx response | `"Failed to update table: Stackby API {status}: {message}"` |

### Example

```json
{
  "tool": "update_table",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_def456",
    "name": "Active Bugs",
    "description": "Bugs currently in triage or development"
  }
}
```

---

## delete_table

Permanently delete a table from a stack.

> **Warning — Irreversible.** This operation permanently removes the table, all of its records (rows), all fields (columns), all views, and all associated data. There is no soft-delete or undo. Confirm the correct `tableId` before calling this tool.

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | yes | Stack ID (from `list_stacks`) |
| `tableId` | string | yes | Table ID to delete (from `list_tables`) |

### API Call

```
DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId
```

### Response

On success, the tool returns the raw API response as formatted JSON:

```
Table deleted.
{ ... }
```

### Error Handling

| Condition | Error message |
|---|---|
| `stackId` or `tableId` not provided | `"stackId and tableId are required."` |
| No auth credential configured | `"No auth credential found. ..."` |
| API returns a non-2xx response | `"Failed to delete table: Stackby API {status}: {message}"` |

### Example

```json
{
  "tool": "delete_table",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_obsolete99"
  }
}
```

---

## create_field

Create a new column (field) in a table. This is the most complex schema tool because the required parameters vary by column type.

### Parameters

#### Always Required

| Parameter | Type | Description |
|---|---|---|
| `stackId` | string | Stack ID (from `list_stacks`) |
| `tableId` | string | Table ID (from `list_tables`) |
| `name` | string | Column name (non-empty after trimming) |
| `columnType` | string | Column type — see [Column Types Reference](#column-types-reference) for all accepted values and aliases |

#### Optional (all column types)

| Parameter | Type | Description |
|---|---|---|
| `viewId` | string | View ID to associate the new column with. If not provided, the tool auto-resolves the first available view (see [Two-Step View Resolution](#two-step-view-resolution)). |

#### Conditionally Required by Column Type

See the full table in [Conditional Requirements by Column Type](#conditional-requirements-by-column-type) below.

| Parameter | Type | Required When | Description |
|---|---|---|---|
| `options` | array or string | `singleOption`, `multipleOptions` | Choice labels. Accepts a native array, a JSON array string (e.g. `"[\"A\",\"B\"]"`), or a comma-separated string (e.g. `"A, B"`). |
| `linkToTableId` | string | `link` | **Required.** Table ID of the table to link to (use `list_tables`). |
| `linkToTableViewId` | string | `link` (optional) | View ID on the target table. Auto-resolved from first view if omitted. |
| `formulaText` | string | `formula`, `aggregation` | **Required.** Formula expression for `formula` type (e.g. `{Amount}*{Quantity}`). One of 14 valid aggregation formulas for `aggregation` type. |
| `formula` | string | — | Legacy alias for `formulaText`. Accepted for compatibility; `formulaText` is preferred. |
| `linkColumnId` | string | `lookup`, `lookupCount`, `aggregation` | Field ID of the **link column on this table** that connects to the foreign table. |
| `linkedColumnId` | string | `lookup`, `aggregation` | Field ID of the **column on the foreign (linked) table** to pull values from or roll up. Not required for `lookupCount`. |
| `linkColumnName` | string | `lookup`, `lookupCount`, `aggregation` | Name-based alternative to `linkColumnId`. The link column name on this table. Used in stack templates. |
| `linkedColumnName` | string | `lookup`, `aggregation` | Name-based alternative to `linkedColumnId`. The column name on the foreign table. |

### Conditional Requirements by Column Type

| Column Type | `linkToTableId` | `formulaText` | `linkColumnId` | `linkedColumnId` | `options` |
|---|---|---|---|---|---|
| `shortText`, `longText`, `number`, etc. | — | — | — | — | — |
| `singleOption`, `multipleOptions` | — | — | — | — | recommended |
| `link` | **required** | — | — | — | — |
| `formula` | — | **required** | — | — | — |
| `aggregation` (rollup) | — | **required** (one of 14) | recommended | recommended | — |
| `lookup` | — | — | recommended | recommended | — |
| `lookupCount` | — | — | recommended | — | — |

> "recommended" means the field is not validated by the MCP server before the API call, but the Stackby API will return an error if it is absent for that type.

### Two-Step View Resolution

When `viewId` is not provided, `create_field` makes an extra API call before creating the column:

1. **`GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views`** — retrieves the list of views for the table
2. Takes the first view's ID from the response
3. **`POST /api/v1/mcp/columns`** — creates the column using the resolved view ID

If the views endpoint returns no views or fails, `create_field` returns an error and does not attempt to create the column.

For `link` type columns, the same two-step resolution is applied to `linkToTableViewId` against the **target table** if `linkToTableViewId` is not provided.

### API Call

```
POST /api/v1/mcp/columns
Content-Type: application/json

{
  "stackId": "stk_abc123",
  "tableId": "tbl_def456",
  "name": "Priority",
  "columnType": "singleOption",
  "viewId": "vi_xyz789",
  "options": ["Low", "Medium", "High"]
}
```

The body shape varies by column type. The MCP server sets `typeOptions` automatically based on the column type (default values from `DEFAULT_TYPE_OPTIONS` in `stackby-api.ts`). You do not need to supply `typeOptions` directly.

### Response

On success:

```
Created column: Priority
Column ID: cl_abc123
Type: singleOption
```

### Error Handling

| Condition | Error message |
|---|---|
| Any of `stackId`, `tableId`, `name`, or `columnType` is missing | `"stackId, tableId, name, and columnType are required."` |
| `columnType` is `link` and `linkToTableId` is not provided | `"To create a link column, you must specify which table to connect to. ..."` |
| `columnType` is `formula` or `aggregation` and `formulaText` is missing | `"formulaText is required for {type} columns. ..."` |
| `columnType` is `aggregation` and `formulaText` is not one of the 14 valid strings | `"Invalid formulaText for aggregation/rollup. Allowed values: ..."` |
| No auth credential configured | `"No auth credential found. ..."` |
| Views call succeeds but returns no views | Error indicating view could not be resolved |
| API returns a non-2xx response | `"Failed to create field: Stackby API {status}: {message}. ..."` |

The tool never retries on API error — the Stackby API error message is surfaced directly to the caller unchanged.

### Examples

**Simple text column:**

```json
{
  "tool": "create_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_def456",
    "name": "Description",
    "columnType": "longText"
  }
}
```

**Single-select with options:**

```json
{
  "tool": "create_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_def456",
    "name": "Status",
    "columnType": "singleOption",
    "options": ["Todo", "In Progress", "Done"]
  }
}
```

**Link column to another table:**

```json
{
  "tool": "create_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_tasks",
    "name": "Project",
    "columnType": "link",
    "linkToTableId": "tbl_projects"
  }
}
```

**Formula column:**

```json
{
  "tool": "create_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_def456",
    "name": "Total Revenue",
    "columnType": "formula",
    "formulaText": "{Price}*{Quantity}"
  }
}
```

> Always wrap column names in curly braces inside formula expressions: `{ColumnName}`. Do not use plain names without braces.

**Aggregation (rollup) column:**

```json
{
  "tool": "create_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_projects",
    "name": "Total Task Hours",
    "columnType": "aggregation",
    "formulaText": "SUM(values)",
    "linkColumnId": "cl_link_to_tasks",
    "linkedColumnId": "cl_hours_on_tasks_table"
  }
}
```

**Lookup column (display a field from a linked record):**

```json
{
  "tool": "create_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_tasks",
    "name": "Project Owner",
    "columnType": "lookup",
    "linkColumnId": "cl_project_link",
    "linkedColumnId": "cl_owner_on_projects_table"
  }
}
```

**Count linked records:**

```json
{
  "tool": "create_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_projects",
    "name": "Task Count",
    "columnType": "lookupCount",
    "linkColumnId": "cl_tasks_link"
  }
}
```

---

## update_field

Rename a field, update its description, or change its type configuration.

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | yes | Stack ID (from `list_stacks`) |
| `tableId` | string | yes | Table ID (from `list_tables`) |
| `columnId` | string | yes | Column ID to update (from `describe_table`) |
| `name` | string | no | New column name (1–255 characters) |
| `description` | string | no | New column description (0–1000 characters) |
| `type` | string | no | New column type (one of the 39 canonical types) |
| `body` | object | no | Raw PATCH body for advanced type-specific fields. Merged with the top-level `name`/`description`/`type` inputs before sending. |

At least one of `name`, `description`, `type`, or `body` must be provided. If all are absent, the tool returns an error before calling the API.

### API Call

```
PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId
Content-Type: application/json

{ "name": "Due Date", "description": "The deadline for this task" }
```

The `body` parameter is merged first; `name`, `description`, and `type` from top-level inputs are then overlaid on top.

### Response

On success, the tool returns the raw API response as formatted JSON:

```
Field updated.
{ ... }
```

### Error Handling

| Condition | Error message |
|---|---|
| Any of `stackId`, `tableId`, or `columnId` is missing | `"stackId, tableId, and columnId are required."` |
| None of `name`, `description`, `type`, or `body` is provided | `"Provide at least one field update: name, description, type, or body."` |
| No auth credential configured | `"No auth credential found. ..."` |
| API returns a non-2xx response (e.g. column not found) | `"Failed to update field: Stackby API {status}: {message}"` |

The API error message is surfaced directly to the caller — the tool does not retry.

### Example

```json
{
  "tool": "update_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_def456",
    "columnId": "cl_ghi789",
    "name": "Deadline",
    "description": "Hard deadline for delivery"
  }
}
```

Advanced update with raw body for type-specific configuration:

```json
{
  "tool": "update_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_def456",
    "columnId": "cl_ghi789",
    "type": "number",
    "body": {
      "typeOptions": "{\"format\":\"currency\",\"precision\":2,\"symbol\":\"$\"}"
    }
  }
}
```

---

## delete_field

Permanently delete a column (field) from a table.

> **Warning — Irreversible.** Deleting a field removes the column definition and all cell data stored in that column across every row in the table. This cannot be undone.

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | yes | Stack ID (from `list_stacks`) |
| `tableId` | string | yes | Table ID (from `list_tables`) |
| `columnId` | string | yes | Column ID to delete (from `describe_table`) |

### API Call

```
DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId
```

### Response

On success, the tool returns the raw API response as formatted JSON:

```
Field deleted.
{ ... }
```

### Error Handling

| Condition | Error message |
|---|---|
| Any of `stackId`, `tableId`, or `columnId` is missing | `"stackId, tableId, and columnId are required."` |
| No auth credential configured | `"No auth credential found. ..."` |
| API returns a non-2xx response (e.g. column not found) | `"Failed to delete field: Stackby API {status}: {message}"` |

The API error message is surfaced directly to the caller — the tool does not retry.

### Example

```json
{
  "tool": "delete_field",
  "arguments": {
    "stackId": "stk_abc123",
    "tableId": "tbl_def456",
    "columnId": "cl_obsolete_col"
  }
}
```

---

## Common Patterns

### Get IDs before modifying schema

Schema tools require IDs, not names. Use the read operations first:

```
list_stacks         → stackId
list_tables         → tableId
describe_table      → columnId, viewId
list_views          → viewId
```

### Workflow: add a computed column to an existing table

1. **`describe_table`** — get the link column ID (`linkColumnId`) and the foreign column ID (`linkedColumnId`)
2. **`list_views`** — get a `viewId` (or skip this step; `create_field` will auto-resolve it)
3. **`create_field`** — pass `columnType: "lookup"` or `"aggregation"` with the resolved IDs

### Formula column syntax

Always wrap column names in `{curly braces}` inside formula expressions:

```
{Revenue} - {Cost}         ✓
{Quantity} * {Unit Price}  ✓
Revenue - Cost             ✗  (plain names are not resolved)
```

### Alias normalization is automatic

You can pass common aliases for `columnType` and the server normalizes them:

```json
{ "columnType": "rollup" }    → treated as "aggregation"
{ "columnType": "date" }      → treated as "dateAndTime"
{ "columnType": "dropdown" }  → treated as "singleOption"
```

See [Alias Mapping](#alias-mapping) for the full list.

---

## Requirements Traceability

| Requirement | Covered by |
|---|---|
| 6.5 — `create_table` documented | [`create_table`](#create_table) |
| 6.6 — `update_table` documented | [`update_table`](#update_table) |
| 6.7 — `delete_table` documented with permanent-delete semantics | [`delete_table`](#delete_table) |
| 7.1 — `create_field` all parameters | [`create_field` Parameters](#parameters-2) |
| 7.2 — 39 column types + alias mapping | [Column Types Reference](#column-types-reference) |
| 7.3 — `create_field` two-step view resolution | [Two-Step View Resolution](#two-step-view-resolution) |
| 7.4 — `link` missing `linkToTableId` error | [`create_field` Error Handling](#error-handling-3) |
| 7.5 — `formula`/`aggregation` missing `formulaText` error | [`create_field` Error Handling](#error-handling-3) |
| 7.6 — 14 valid aggregation formula strings | [Aggregation Formulas](#aggregation-formulas) |
| 7.7 — `update_field` documented | [`update_field`](#update_field) |
| 7.8 — `delete_field` documented | [`delete_field`](#delete_field) |
| 7.9 — API error surfaced unchanged, no retry | [Error Handling](#error-handling-3) |
