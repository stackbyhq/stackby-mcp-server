# Stack Creation

This page documents the `create_stack` tool and the Stackby Stack Template system — the declarative mechanism for creating tables, columns, and seed rows in a single call.

**Requirements covered:** 9.1, 9.2, 9.3, 9.4, 9.5, 9.6

---

## Table of Contents

- [create\_stack Tool](#create_stack-tool)
- [Template System Overview](#template-system-overview)
- [Four-Phase Column Creation Order](#four-phase-column-creation-order)
- [Topological Sort — Table Creation Order](#topological-sort--table-creation-order)
- [Row Key System](#row-key-system)
- [Table `key` Field](#table-key-field)
- [Complete Template Example](#complete-template-example)

---

## `create_stack` Tool

Creates a new Stackby stack (database/workbook) inside a workspace.

### Endpoint

```
POST /api/v1/mcp/stacks/create
```

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | **Yes** | Workspace to create the stack in. Use `list_workspaces` to get IDs. |
| `name` | string | **Yes** | Display name for the new stack. 1–150 characters. |
| `color` | string | No | Hex color for the stack icon. Default: `#30A9DE`. |
| `icon` | string | No | Icon name. Default: `ios-bulb`. |
| `tables` | TemplateTableInput[] | No | Declarative template: array of table definitions with columns and rows. Omit for an empty stack. |

### Response

On success, the tool returns:

```
Created stack: <name>
Stack ID: <stackId>
Workspace: <workspaceId>
```

If a template was applied, additional lines are appended:

```
Template applied:
  Table key "projects" → first stack table "Sheet1" (tb_abc123)
  Created table "Tasks" (tb_def456), key "tasks"
```

If the template produced warnings (e.g. a column that could not be created), those are listed after:

```
Template warnings:
  - Link column "Project": unknown linkToTableKey "projects"
```

### Error Handling

| Condition | Behavior |
|---|---|
| `workspaceId` or `name` is missing | Returns `isError: true` before any API call |
| No auth credential present | Returns `isError: true` with auth error message |
| Stack creation API call fails | Returns `isError: true` with the API error message |
| `tables` template causes server error | Falls back to client-side template application (see below) |
| Client-side template application fails | Returns the stack ID but appends warnings for each failure |

### Example Call

```json
{
  "workspaceId": "ws_123abc",
  "name": "Product Roadmap",
  "color": "#FF6B6B",
  "icon": "ios-rocket",
  "tables": [
    {
      "key": "features",
      "name": "Features",
      "columns": [
        { "name": "Title", "columnType": "shortText" },
        { "name": "Status", "columnType": "singleOption", "options": ["Planned", "In Progress", "Done"] }
      ],
      "rows": [
        { "rowKey": "feat-1", "fields": { "Title": "Dark mode", "Status": "Planned" } }
      ]
    }
  ]
}
```

---

## Template System Overview

The `tables` parameter lets you describe the entire initial structure of a stack — tables, columns, and seed rows — in a single tool call. Internally, the MCP server attempts two paths to apply the template.

### Path 1 — Server-Side Application

When `tables` is included in the `create_stack` call, the server-side backend (`POST /api/v1/mcp/stacks/create`) attempts to accept and process the `tables` payload directly. If the backend supports it and returns a successful response that includes template results, the stack and all its tables, columns, and rows are created in a single round trip.

### Path 2 — Client-Side Fallback via `applyStackTemplate()`

If the server-side attempt fails (for example, the backend returns an error indicating the `tables` field is unsupported), the MCP server catches the error and falls back to a two-step process:

1. Create the stack without the template: `POST /api/v1/mcp/stacks/create` (without `tables`)
2. Apply the template client-side by calling `applyStackTemplate(stackId, tables)` in `stack-template.ts`

The client-side path orchestrates individual API calls for each table, column, and row:

- **Tables**: `POST /api/v1/mcp/stacks/:stackId/tables` for each table beyond the first (the stack's default first table is reused)
- **Columns**: `POST /api/v1/mcp/columns` for each column in each table
- **Rows**: `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows` for each seed row

The fallback reason is included in the output so callers can diagnose unexpected behavior:

```
Server-side template apply failed, used client-side fallback: <reason>
```

---

## Four-Phase Column Creation Order

Within each table, columns are not created in the order they appear in the template. Instead, `applyStackTemplate()` separates columns into four phases and creates them in a fixed order. This ordering is necessary because some column types depend on other columns or tables already existing.

### Phase 1 — Base Types

**Columns included:** All types except `link`, `formula`, `lookup`, `lookupCount`, and `aggregation`.

**Examples:** `shortText`, `longText`, `number`, `checkbox`, `dateAndTime`, `singleOption`, `multipleOptions`, `email`, `url`, `autoNumber`, `attachment`, etc.

**Why first:** These columns have no dependencies. They can be created immediately once the table exists, using only the column's own definition.

---

### Phase 2 — Link Columns

**Columns included:** Any column with `columnType: "link"`.

**Why after Phase 1:** A link column requires the `tableId` of its target table to already exist in Stackby. In the template, the target table is identified by its `key` field. By the time Phase 2 runs for any table, all tables have already been created (due to topological sorting — see below), so the target table's ID is known.

**Resolution:** The `linkToTableKey` value in the column definition is looked up in a `keyToTableId` map that was populated during the table creation phase. If the key is unknown (the target table was not created), the column is skipped with a warning.

---

### Phase 3 — Formula Columns

**Columns included:** Any column with `columnType: "formula"`.

**Why after Phase 2:** Formula columns can reference other columns by name using curly-brace syntax (e.g. `{Amount}*{Quantity}` or `{Reach}+{Impressions}`). Those referenced columns — including link columns created in Phase 2 — must already exist in the table before the formula column is submitted to the API.

---

### Phase 4 — Lookup, LookupCount, and Aggregation Columns

**Columns included:** Any column with `columnType: "lookup"`, `columnType: "lookupCount"` (or `"count"`), or `columnType: "aggregation"` (or `"rollup"`).

**Why last:** These relational computed columns require two IDs that can only be known after earlier phases complete:

- **`linkColumnId`** — the ID of a link column on the *current* table (created in Phase 2). This is resolved by name via `linkColumnName`, which must match a link column created in Phase 2.
- **`linkedColumnId`** — the ID of a column on the *linked (foreign) table* (needed for `lookup` and `aggregation`). This is resolved by calling `describe_table` on the linked table to look up the column by its `linkedColumnName`.

If either ID cannot be resolved, the column is skipped with a warning.

### Phase Summary

```
Table created
      │
      ▼
Phase 1: Base types (shortText, number, checkbox, email, …)
      │
      ▼
Phase 2: Link columns (require target table ID)
      │
      ▼
Phase 3: Formula columns (can reference base + link columns)
      │
      ▼
Phase 4: Lookup / LookupCount / Aggregation (require link column ID + foreign column ID)
```

---

## Topological Sort — Table Creation Order

Before any tables are created, `sortTableIndicesByLinkDependencies()` reorders the `tables` array so that any table referenced as a link target is created *before* the table that holds the link column pointing to it.

### Why This Is Necessary

When a link column is created in Phase 2, the Stackby API requires the `linkToTableId` — the actual Stackby table ID of the target table. That ID is only available after the target table has been created. The topological sort guarantees this ordering.

**Example:** If `Tasks` has a link column pointing to `Projects`, then `Projects` must be created first so its table ID is available when the `Tasks` link column is submitted.

### How It Works

The sort uses [Kahn's algorithm](https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm):

1. For each table, scan its columns for any `link` type column with a `linkToTableKey`.
2. Build a directed dependency graph: if table B is a link target of table A, then B must come before A (B → A edge).
3. Start with tables that have no incoming dependencies (no one links to them as a target).
4. Process tables in dependency order, removing each from the pending set as it is added to the output list.

The first table in the reordered list maps to the stack's existing default first table. All subsequent tables are newly created via the API.

### Limitation: Circular Dependencies

Circular link dependencies (e.g. table A links to B and B links to A) are not supported by the topological sort. If a cycle is detected (fewer tables are emitted by the sort than exist in the input), the remaining tables are appended to the end of the list in their original order, which may cause link column creation to fail with "unknown linkToTableKey" warnings.

---

## Row Key System

Seed rows in a template can declare a stable identifier called a `rowKey`. Other rows can reference this key to create linked-record relationships between rows — using human-readable names defined in the template rather than API-assigned row IDs.

### `rowKey` — Declaring a Stable Identifier

Any row in the template can include a `rowKey` string:

```json
{ "rowKey": "task-1", "fields": { "Title": "Initial setup" } }
```

After the row is created via the API, the MCP server stores the mapping `"task-1" → "<api-assigned-row-id>"` in a `rowKeyToId` registry.

### `__linkRowKeys` — Referencing Multiple Rows

To link one row to multiple previously-defined rows, use `__linkRowKeys` in a field value:

```json
{
  "rowKey": "sprint-1",
  "fields": {
    "Name": "Sprint 1",
    "Tasks": { "__linkRowKeys": ["task-1", "task-2"] }
  }
}
```

Before the row is created, the MCP server replaces `{ "__linkRowKeys": [...] }` with an array of the resolved API row IDs from the registry.

### `__linkRowKey` — Referencing a Single Row

To link to exactly one previously-defined row, use `__linkRowKey`:

```json
{
  "fields": {
    "Name": "Subtask A",
    "Parent Task": { "__linkRowKey": "task-1" }
  }
}
```

This is resolved to a single-element array of the corresponding API row ID.

### Ordering Requirement

Row cross-references only work *forward in definition order within the template*. The MCP server processes rows in the same topologically-sorted table order, top to bottom. A row that references `rowKey: "X"` must appear *after* the row that declared `rowKey: "X"`. Referencing a key that has not been created yet produces a warning and an empty link array:

```
Unknown rowKey in __linkRowKeys: "task-99"
```

---

## Table `key` Field

Template table definitions can include an optional `key` field — a stable, unique string identifier that is separate from the table's display `name`.

```json
{
  "key": "projects",
  "name": "Projects",
  "columns": [ ... ]
}
```

### Purpose

The `key` is used by column definitions in *other* tables to identify their link target:

```json
{
  "name": "Project",
  "columnType": "link",
  "linkToTableKey": "projects"
}
```

The MCP server resolves `linkToTableKey: "projects"` to the actual Stackby table ID of the `projects` table after it is created.

### Why `key` and Not `name`

Using a stable `key` decouples column cross-references from the display name. If the `name` of the table changes (e.g. `"Projects"` → `"Active Projects"`), the `key` remains `"projects"` and all `linkToTableKey` references continue to resolve correctly without any changes.

### Automatic Key Assignment

If a table does not declare a `key`, the MCP server automatically generates one from the table's `name` by lowercasing it, replacing non-alphanumeric characters with hyphens, and trimming leading/trailing hyphens. For example, `"My Projects!"` becomes key `"my-projects"`. If no `name` is present either, the key is `"table-{index}"`.

---

## Complete Template Example

The following example creates a two-table stack — **Projects** and **Tasks** — with a link between them, a lookup column, a formula column, and seed rows that cross-reference each other.

```json
{
  "workspaceId": "ws_123abc",
  "name": "Project Tracker",
  "tables": [
    {
      "key": "projects",
      "columns": [
        { "name": "Name",     "columnType": "shortText" },
        { "name": "Status",   "columnType": "singleOption", "options": ["Active", "On Hold", "Done"] },
        { "name": "Priority", "columnType": "number" }
      ],
      "rows": [
        { "rowKey": "proj-alpha", "fields": { "Name": "Alpha", "Status": "Active",  "Priority": 1 } },
        { "rowKey": "proj-beta",  "fields": { "Name": "Beta",  "Status": "On Hold", "Priority": 2 } }
      ]
    },
    {
      "key": "tasks",
      "name": "Tasks",
      "columns": [
        { "name": "Title",   "columnType": "shortText" },
        { "name": "Done",    "columnType": "checkbox" },
        {
          "name": "Project",
          "columnType": "link",
          "linkToTableKey": "projects"
        },
        {
          "name": "Project Priority",
          "columnType": "lookup",
          "linkToTableKey": "projects",
          "linkColumnName": "Project",
          "linkedColumnName": "Priority"
        },
        {
          "name": "Task Label",
          "columnType": "formula",
          "formulaText": "{Title}&\" (\"&{Project Priority}&\")\""
        }
      ],
      "rows": [
        {
          "rowKey": "task-1",
          "fields": {
            "Title": "Design mockups",
            "Done": false,
            "Project": { "__linkRowKey": "proj-alpha" }
          }
        },
        {
          "rowKey": "task-2",
          "fields": {
            "Title": "Write tests",
            "Done": false,
            "Project": { "__linkRowKeys": ["proj-alpha", "proj-beta"] }
          }
        }
      ]
    }
  ]
}
```

### What Happens During Application

1. **Topological sort**: `projects` is a link target of `tasks`, so `projects` is created first.
2. **`projects` table**: Reuses the stack's default first table. Three base-type columns created (Phase 1). Two seed rows created; `proj-alpha` and `proj-beta` row keys registered.
3. **`tasks` table**: Created via `POST /api/v1/mcp/stacks/:stackId/tables`.
   - **Phase 1** — `Title` and `Done` created.
   - **Phase 2** — `Project` link column created (target table ID resolved from `keyToTableId["projects"]`).
   - **Phase 3** — `Task Label` formula column created (references `Title` and `Project Priority`, which exist after Phases 1–2).
   - **Phase 4** — `Project Priority` lookup column created using the `Project` link column ID (resolved by name) and the `Priority` column ID on the `projects` table (resolved via `describe_table`).
4. **Rows in `tasks`**: Two rows created. `__linkRowKey` and `__linkRowKeys` resolved to Stackby row IDs from the registry.

---

## Related Pages

- [Schema Management](./schema-management.md) — `create_table`, `create_field`, and all column types
- [Read Operations](./read-operations.md) — `list_stacks`, `list_tables`, `describe_table`
- [API Reference](../api-reference.md#workspace-and-stack-endpoints) — `POST /api/v1/mcp/stacks/create` endpoint details
- [Input Validation](../input-validation.md) — `normalizeColumnType()` alias map
