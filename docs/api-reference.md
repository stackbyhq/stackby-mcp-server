# API Reference — Stackby MCP Backend Endpoints

This document describes every `/api/v1/mcp/*` endpoint served by the Stackby backend (`v1/app.js`). These are the REST endpoints that the MCP server calls on your behalf. You do not call them directly when using the MCP server, but understanding them is essential when debugging, extending, or maintaining the backend integration.

**Related documents:** [Architecture](architecture.md) · [Authentication](authentication.md) · [Request Lifecycle](request-lifecycle.md) · [Tool Catalog](tools/README.md)

---

## Authentication

All endpoints in this reference use **devapi** authentication. Every request must include both headers:

```
x-api-key: <your_api_key>
Authorization: Bearer <your_api_key>
```

The value is the same in both headers — your Stackby API key or Personal Access Token.

**Base URL:** `https://stackby.com` (override with `STACKBY_API_URL` environment variable or `X-Stackby-API-URL` request header)

---

## 1. Workspaces & Stacks

### GET /api/v1/mcp/workspaces

List all workspaces the authenticated user can access.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/workspaces` |
| Auth | devapi |
| Path Params | — |
| Request Body | — |

**Response shape:**

```json
[
  { "id": "ws_abc123", "name": "My Workspace" }
]
```

---

### POST /api/v1/mcp/stacks

List stacks in a specific workspace.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks` |
| Auth | devapi |
| Path Params | — |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | yes | ID of the workspace to list stacks from |

**Response shape:**

```json
[
  {
    "stackId": "stk_abc123",
    "stackName": "Project Tracker",
    "workspaceId": "ws_abc123",
    "color": "#3b82f6",
    "icon": "📋"
  }
]
```

---

### POST /api/v1/mcp/stacks/create

Create a new stack in a workspace. Optionally supply a `tables` array to apply a pre-built table/column/row structure server-side. If the server does not support the `tables` field, the MCP server falls back to client-side template application via `applyStackTemplate()`.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/create` |
| Auth | devapi |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Display name for the new stack |
| `workspaceId` | string | yes | ID of the workspace to create the stack in |
| `color` | string | no | Hex color code (e.g. `"#3b82f6"`) |
| `icon` | string | no | Emoji or icon string |
| `tables` | array | no | Declarative table/column/row template (see [Stack Creation](tools/stack-creation.md)) |

**Response shape:**

```json
{
  "stackId": "stk_newxyz",
  "stackName": "My New Stack",
  "workspaceId": "ws_abc123"
}
```

---

## 2. Tables

### GET /api/v1/mcp/stacks/:stackId/tables

List all tables in a stack.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/stacks/:stackId/tables` |
| Auth | devapi |
| Path Params | `stackId` — the stack to list tables from |

**Response shape:**

```json
[
  { "id": "tbl_abc123", "name": "Tasks" },
  { "id": "tbl_def456", "name": "Projects" }
]
```

---

### POST /api/v1/mcp/stacks/:stackId/tables

Create a new table in a stack.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/tables` |
| Auth | devapi |
| Path Params | `stackId` — the stack to create the table in |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Display name for the new table (max 255 characters) |
| `columns` | array | no | Initial column definitions (name, type, typeOptions) |

**Response shape:**

```json
{ "tableId": "tbl_newxyz", "name": "My New Table" }
```

---

### GET /api/v1/mcp/stacks/:stackId/tables/:tableId

Describe a table — returns its name, all field definitions, and all view definitions.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |

**Response shape:**

```json
{
  "id": "tbl_abc123",
  "name": "Tasks",
  "fields": [
    { "id": "fld_001", "name": "Name", "type": "shortText" },
    { "id": "fld_002", "name": "Status", "type": "singleOption" }
  ],
  "views": [
    { "id": "viw_001", "name": "Grid View", "tableId": "tbl_abc123", "type": "grid" }
  ]
}
```

---

### PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId

Update a table's name or description.

| Detail | Value |
|---|---|
| Method | `PATCH` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |
| Content-Type | `application/json` |

**Request body** (at least one field required):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | New display name (max 255 characters) |
| `description` | string | no | Table description (max 1000 characters) |

---

### DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId

Permanently delete a table and **all** of its records, views, and field definitions. This action is irreversible.

| Detail | Value |
|---|---|
| Method | `DELETE` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |

---

## 3. Columns (Fields)

### POST /api/v1/mcp/columns

Create a new column in a table.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/columns` |
| Auth | devapi |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | yes | Stack containing the target table |
| `tableId` | string | yes | Table to add the column to |
| `name` | string | yes | Display name for the column |
| `columnType` | string | yes | One of the 39 canonical column types (see [Schema Management](tools/schema-management.md)) |
| `viewId` | string | yes* | View context for column placement; auto-resolved from first view if omitted |
| `options` | array | no | Option labels for `singleOption` / `multipleOptions` columns |
| `linkToTableId` | string | conditional | Required when `columnType` is `link` |
| `linkToTableViewId` | string | no | View on the linked table; auto-resolved when omitted |
| `formulaText` | string | conditional | Required when `columnType` is `formula` or `aggregation` |
| `linkColumnId` | string | conditional | Same-table link column ID; required for `lookup`, `lookupCount`, `aggregation` |
| `linkedColumnId` | string | conditional | Column ID on the linked table; required for `lookup`, `aggregation` |
| `timeFormat` | string | no | `"12"` or `"24"` for `dateAndTime` columns |
| `isTimeInclude` | boolean | no | Whether to include time in `dateAndTime` display |
| `typeOptions` | string | no | JSON string of type-specific configuration; auto-built from other fields when possible |

**Response shape:**

```json
{ "columnId": "fld_newxyz", "tableId": "tbl_abc123", "name": "Priority" }
```

> **Note:** The MCP tool `create_field` performs a two-step call for this endpoint when `viewId` is not supplied: it first calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views` to resolve the first available view ID, then issues this POST. See [Request Lifecycle — Two-Step Pattern](request-lifecycle.md#two-step-api-pattern).

---

### PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId

Update a column's name, description, type, or type-specific configuration.

| Detail | Value |
|---|---|
| Method | `PATCH` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId`, `columnId` |
| Content-Type | `application/json` |

**Request body** (any subset of these fields):

| Field | Type | Description |
|---|---|---|
| `name` | string | New column name (1–255 characters) |
| `description` | string | Column description (0–1000 characters) |
| `type` | string | One of the 39 canonical column types |
| `typeOptions` | string | JSON string of type-specific config |
| *(any)* | * | Additional type-specific fields passed through as-is |

---

### DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId

Permanently delete a column and all the data stored in it for every record.

| Detail | Value |
|---|---|
| Method | `DELETE` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId`, `columnId` |

---

## 4. Rows (Records)

### GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows

List rows in a table with optional filtering, sorting, and pagination.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `maxrecord` | integer | `100` | Maximum rows to return; clamped to [1, 100] |
| `offset` | integer | `0` | Number of rows to skip; clamped to [0, ∞) |
| `rowIds` | string | — | Comma-separated list of specific row IDs to fetch |
| `view` | string | — | View ID or name to scope the query to |
| `filter` | string | — | Filter expression |
| `sort` | string | — | Sort expression |
| `latest` | string | — | Return only the latest N rows |
| `filterByFormula` | string | — | Formula-based filter string |
| `conjuction` | string | — | Conjunction operator for combining filters (`AND` / `OR`); note: one `n` — this is the canonical spelling used by the API |

**Response shape:**

```json
[
  { "id": "rec_abc123", "field": { "Name": "Task A", "Status": "In Progress" } },
  { "id": "rec_def456", "field": { "Name": "Task B", "Status": "Done" } }
]
```

---

### POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows

Create one or more rows in a table.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |
| Content-Type | `application/json` |

**Request body:**

```json
{
  "records": [
    { "field": { "Name": "New Task", "Status": "Open" } }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `records` | array | yes | Array of record objects; each has a `field` map of `columnName → value` |

**Response shape:** Array of created record objects, each with `id` and `field`.

---

### POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update

Batch-update up to 10 rows. Each record in the array must include its `id` and the fields to update.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |
| Content-Type | `application/json` |

**Request body:**

```json
{
  "records": [
    { "id": "rec_abc123", "field": { "Status": "Done" } },
    { "id": "rec_def456", "field": { "Status": "In Progress" } }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `records` | array | yes | 1–10 record objects; each requires `id` (row ID) and `field` (map of updates) |

> **Limit:** Maximum 10 records per request. Exceeding this limit causes the MCP tool to return an error without making any API call.

**Response shape:** Array of updated record objects with full field values.

---

### GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId

Fetch a single row by its record ID.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId`, `recordId` |

**Response shape:**

```json
{ "id": "rec_abc123", "field": { "Name": "Task A", "Status": "Done" } }
```

---

### DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/rows

Soft-delete up to 10 rows. Deleted rows are marked as deleted and excluded from all future read operations, but are **not permanently purged** from the database. They can be recovered by Stackby admins.

| Detail | Value |
|---|---|
| Method | `DELETE` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `rowIds` | string (repeated) | yes | One `rowIds=<id>` parameter per row; up to 10 total |

**Example URL:**
```
DELETE /api/v1/mcp/stacks/stk_abc/tables/tbl_xyz/rows?rowIds=rec_001&rowIds=rec_002
```

> **Limit:** Maximum 10 row IDs per request.

**Response shape:**

```json
{
  "records": [
    { "id": "rec_001", "deleted": true },
    { "id": "rec_002", "deleted": true }
  ]
}
```

---

### POST /api/v1/mcp/stacks/:stackId/tables/:tableId/search

Full-text search across a column in a table.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/search` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `search` | string | yes | The search term to match against |
| `columnId` | string | no | ID of the column to search within; if omitted, the first column is used |
| `maxRecords` | integer | no | Maximum number of matching rows to return |

**Response shape:**

```json
{
  "rowIds": ["rec_abc123", "rec_def456"],
  "rowname": ["Task A", "Task B"],
  "fields": [
    { "Name": "Task A", "Status": "Open" },
    { "Name": "Task B", "Status": "Done" }
  ]
}
```

---

## 5. Views

### GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views

List all views defined on a table.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |

**Response shape:**

```json
[
  { "id": "viw_001", "name": "Grid View", "tableId": "tbl_abc123", "type": "grid" },
  { "id": "viw_002", "name": "Kanban", "tableId": "tbl_abc123", "type": "kanban" }
]
```

---

### POST /api/v1/mcp/stacks/:stackId/tables/:tableId/views

Create a new view on a table.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` |
| Auth | devapi |
| Path Params | `stackId`, `tableId` |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Display name for the view (1–255 characters) |
| `type` | string | no | View type: `grid` (default), `kanban`, `gallery`, `calendar`, `form` |
| `copyMode` | string | no | `"new"` or `"duplicate"` |
| `copyViewId` | string | conditional | Required when `copyMode` is `"duplicate"` — the view to copy settings from |
| `sequenceViewId` | string | no | Insert this view after the specified view ID |
| `filters` | object | no | Pre-set filter configuration |
| `groupLevels` | object | no | Pre-set grouping configuration |
| `description` | string | no | View description (0–500 characters) |

**Response shape:** Created view object including the new `id` (view ID).

---

### PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId

Rename or update a view's description.

| Detail | Value |
|---|---|
| Method | `PATCH` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId`, `viewId` |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | New display name (1–255 characters) |
| `description` | string | no | Updated description (0–500 characters) |

---

### DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId

Soft-delete a view. The view is removed from listing and retrieval, but the underlying row data is retained. Admins can recover soft-deleted views.

| Detail | Value |
|---|---|
| Method | `DELETE` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` |
| Auth | devapi |
| Path Params | `stackId`, `tableId`, `viewId` |

---

## 6. Record Comments

### POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments

Add a text comment (and optional attachment or cell reference) to a record.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` |
| Auth | devapi |
| Path Params | `stackId`, `tableId`, `recordId` |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Comment body text (max 2000 characters) |
| `attachment` | object | no | Attachment metadata |
| `cellValue` | object | no | Cell value reference for annotating a specific cell |

**Response shape:** Created comment object including `id` and `createdAt` timestamp.

---

## 7. Automations

### GET /api/v1/mcp/stacks/:stackId/automations

List all automations defined in a stack.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/stacks/:stackId/automations` |
| Auth | devapi |
| Path Params | `stackId` |

**Response shape:** Array of automation objects (see [Automation Tool docs](tools/automation.md) for field descriptions).

---

### POST /api/v1/mcp/stacks/:stackId/automations

Create a new automation with a trigger and optional initial action steps.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/automations` |
| Auth | devapi |
| Path Params | `stackId` |
| Content-Type | `application/json` |

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Automation display name |
| `trigger` | object | yes | Trigger definition; must include `triggerType` (see [Trigger Codes](tools/automation.md#trigger-type-codes)) |
| `description` | string | no | Automation description |
| `isTurnedOn` | boolean | no | Whether the automation is active on creation (default: false) |
| `tableId` | string | no | Scoping table ID |
| `viewId` | string | no | Scoping view ID |
| `actions` | array | no | Initial action steps; each must include `actionType` (see [Action Codes](tools/automation.md#action-type-codes)) |

**Response shape:** Created automation object including `id` and `name`.

---

### GET /api/v1/mcp/stacks/:stackId/automations/:automationId

Get full details of a single automation including its trigger and all action steps.

| Detail | Value |
|---|---|
| Method | `GET` |
| Path | `/api/v1/mcp/stacks/:stackId/automations/:automationId` |
| Auth | devapi |
| Path Params | `stackId`, `automationId` |

---

### PATCH /api/v1/mcp/stacks/:stackId/automations/:automationId

Update automation metadata. Does not modify trigger or action step configurations — use the passthrough routes below for those.

| Detail | Value |
|---|---|
| Method | `PATCH` |
| Path | `/api/v1/mcp/stacks/:stackId/automations/:automationId` |
| Auth | devapi |
| Path Params | `stackId`, `automationId` |
| Content-Type | `application/json` |

**Patchable fields:**

| Field | Type | Description |
|---|---|---|
| `name` | string | Updated display name |
| `description` | string | Updated description |
| `isTurnedOn` | boolean | Enable or disable the automation |
| `tableId` | string | Updated scoping table |
| `viewId` | string | Updated scoping view |

---

### DELETE /api/v1/mcp/stacks/:stackId/automations/:automationId

Permanently delete an automation and all its associated triggers and action steps.

| Detail | Value |
|---|---|
| Method | `DELETE` |
| Path | `/api/v1/mcp/stacks/:stackId/automations/:automationId` |
| Auth | devapi |
| Path Params | `stackId`, `automationId` |

---

## 8. Advanced Automation Passthrough Routes

These three routes forward the request body as-is to the corresponding Stackby backend automation subsystem. No transformation is applied by the MCP server — the body you send is exactly what the backend receives.

### POST /api/v1/mcp/stacks/:stackId/automation-workflows/:action

Advanced workflow-level actions on an automation.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/automation-workflows/:action` |
| Auth | devapi |
| Path Params | `stackId`, `action` |
| Content-Type | `application/json` |
| Body | Passed through as-is to backend |

**Valid `:action` values:**

| Action | Description |
|---|---|
| `create` | Create a new workflow |
| `update` | Update workflow configuration |
| `delete` | Delete a workflow |
| `details` | Get full workflow details |
| `updateSequence` | Reorder workflows |
| `duplicate` | Duplicate a workflow |
| `runCount` | Get execution run count |
| `sectioncreate` | Create a workflow section |
| `sectionrename` | Rename a workflow section |
| `sectiondelete` | Delete a workflow section |
| `addtosection` | Add a workflow to a section |
| `sectionmove` | Move a section |
| `sectionexpand` | Expand/collapse a section |
| `updateDescription` | Update workflow description |

---

### POST /api/v1/mcp/stacks/:stackId/automation-triggers/:action

Manage trigger configurations on an automation.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/automation-triggers/:action` |
| Auth | devapi |
| Path Params | `stackId`, `action` |
| Content-Type | `application/json` |
| Body | Passed through as-is to backend |

**Valid `:action` values:**

| Action | Description |
|---|---|
| `create` | Add a trigger to an automation |
| `update` | Update trigger configuration |
| `delete` | Remove a trigger |
| `list` | List triggers on an automation |
| `trigger` | Manually fire the trigger (test execution) |

---

### POST /api/v1/mcp/stacks/:stackId/automation-actions/:action

Manage action step configurations on an automation.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/automation-actions/:action` |
| Auth | devapi |
| Path Params | `stackId`, `action` |
| Content-Type | `application/json` |
| Body | Passed through as-is to backend |

**Valid `:action` values:**

| Action | Description |
|---|---|
| `create` | Add an action step to an automation |
| `update` | Update an action step's configuration |
| `delete` | Remove an action step |
| `list` | List action steps on an automation |
| `action` | Execute a single action step (test run) |
| `updateSequence` | Reorder action steps |
| `duplicate` | Duplicate an action step |
| `updateDescription` | Update an action step's description |

---

## 9. Dashboards & Blocks

### POST /api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action

Create, update, or query a dashboard in a stack.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action` |
| Auth | devapi |
| Path Params | `stackId` — the stack; `id` — dashboard ID (use `"0"` or `"new"` when creating); `action` — operation to perform |
| Content-Type | `application/json` |

**Valid `:action` values:**

| Action | Description | Key body fields |
|---|---|---|
| `create` | Create a new dashboard | `name`, `stackId` |
| `update` | Update dashboard metadata | `name` |
| `getblocks` | List all blocks on a dashboard | `dashboardId` |
| `positionupdate` | Update block position/layout | `blocks` (array of layout updates) |
| `move` | Move dashboard to a different position | `position` |

**Request body:** Varies by action. `stackId` is automatically injected from the URL path if not present in the body.

---

### POST /api/v1/mcp/stacks/:stackId/block-actions/:id/:action

Create, update, or manipulate a block widget on a dashboard.

| Detail | Value |
|---|---|
| Method | `POST` |
| Path | `/api/v1/mcp/stacks/:stackId/block-actions/:id/:action` |
| Auth | devapi |
| Path Params | `stackId` — the stack; `id` — block ID (use `"0"` or `"new"` when creating); `action` — operation to perform |
| Content-Type | `application/json` |

**Valid `:action` values:**

| Action | Description | Key body fields |
|---|---|---|
| `create` | Create a new block on a dashboard | `dashboardId`, `name`, `type`, `blockFields`, `gridLayout`, `linearLayout` |
| `update` | Update an existing block | `name`, `blockFields`, `gridLayout`, `linearLayout` |
| `duplicate` | Duplicate a block | `dashboardId` |
| `move` | Move a block to another dashboard | `toDashboardId` |

> **Note:** For `create` actions, the MCP tool `block_action` transforms user-friendly inputs into the `blockFields`, `gridLayout`, and `linearLayout` JSON strings required by this API. See [Dashboard and Block Tools](tools/dashboard-blocks.md#block-create-normalization) for details.

---

## Endpoint Summary Table

| # | Method | Path | Description |
|---|---|---|---|
| 1 | GET | `/api/v1/mcp/workspaces` | List workspaces |
| 2 | POST | `/api/v1/mcp/stacks` | List stacks in a workspace |
| 3 | POST | `/api/v1/mcp/stacks/create` | Create a stack |
| 4 | GET | `/api/v1/mcp/stacks/:stackId/tables` | List tables |
| 5 | POST | `/api/v1/mcp/stacks/:stackId/tables` | Create a table |
| 6 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId` | Describe a table |
| 7 | PATCH | `/api/v1/mcp/stacks/:stackId/tables/:tableId` | Update a table |
| 8 | DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId` | Delete a table |
| 9 | POST | `/api/v1/mcp/columns` | Create a column |
| 10 | PATCH | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | Update a column |
| 11 | DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | Delete a column |
| 12 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | List rows |
| 13 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | Create rows |
| 14 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update` | Batch-update rows (max 10) |
| 15 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId` | Get a single row |
| 16 | DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | Soft-delete rows (max 10) |
| 17 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/search` | Full-text search |
| 18 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` | List views |
| 19 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` | Create a view |
| 20 | PATCH | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | Update a view |
| 21 | DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | Soft-delete a view |
| 22 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` | Add a record comment |
| 23 | GET | `/api/v1/mcp/stacks/:stackId/automations` | List automations |
| 24 | POST | `/api/v1/mcp/stacks/:stackId/automations` | Create an automation |
| 25 | GET | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | Get automation details |
| 26 | PATCH | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | Update an automation |
| 27 | DELETE | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | Delete an automation |
| 28 | POST | `/api/v1/mcp/stacks/:stackId/automation-workflows/:action` | Automation workflow passthrough |
| 29 | POST | `/api/v1/mcp/stacks/:stackId/automation-triggers/:action` | Automation trigger passthrough |
| 30 | POST | `/api/v1/mcp/stacks/:stackId/automation-actions/:action` | Automation action passthrough |
| 31 | POST | `/api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action` | Dashboard action |
| 32 | POST | `/api/v1/mcp/stacks/:stackId/block-actions/:id/:action` | Block action |
