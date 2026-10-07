# Read Operations

These 11 tools cover every read path exposed by the Stackby MCP Server — from workspace and stack discovery through individual record retrieval and automation inspection. None of these tools modifies data.

All tools accept both `camelCase` and `snake_case` parameter names. The server's `withCamel()` wrapper normalises any `snake_case` key to `camelCase` before the handler runs, so `stack_id` and `stackId` are treated identically.

---

## Table of Contents

| Tool | Description |
|---|---|
| [`list_workspaces`](#list_workspaces) | List all workspaces the authenticated user can access |
| [`list_stacks`](#list_stacks) | List stacks (bases) across all workspaces or within one |
| [`list_tables`](#list_tables) | List tables in a stack |
| [`describe_table`](#describe_table) | Get a table's fields and views |
| [`list_views`](#list_views) | List views for a table |
| [`list_records`](#list_records) | List rows with optional filtering, sorting, and pagination |
| [`search_records`](#search_records) | Full-text search within a table column |
| [`get_record`](#get_record) | Fetch a single row by ID |
| [`list_automations`](#list_automations) | List automations in a stack |
| [`get_automation`](#get_automation) | Get full details for one automation |
| [`list_automation_capabilities`](#list_automation_capabilities) | Browse all trigger and action type codes (no API call) |

---

## `list_workspaces` {#list_workspaces}

Lists all Stackby workspaces the authenticated user can access. This is typically the first call in any session — the returned workspace IDs are required by `list_stacks` and `create_stack`.

### Inputs

This tool accepts no input parameters.

### API Call

```
GET /api/v1/mcp/workspaces
```

### Output

A plain-text list, one workspace per line:

```
Workspaces (2):
- My Team (id: ws_abc123)
- Personal Projects (id: ws_def456)
```

When the authenticated user belongs to no workspaces, the tool returns:

```
Workspaces (0):
No workspaces found.
```

### Error Behavior

| Condition | Result |
|---|---|
| No auth credential configured | Returns a message explaining that `STACKBY_API_KEY` or `STACKBY_BEARER_TOKEN` is required. `isError` is **not** set — this is treated as a configuration advisory. |
| Stackby API returns a non-2xx response | Returns `isError: true` with the message `"Failed to list workspaces: Stackby API {status}: {message}. STACKBY_API_KEY and STACKBY_API_URL in use: {baseUrl}."` |

### Example

**Input:** _(none)_

**Output:**
```
Workspaces (3):
- Acme Corp (id: ws_111aaa)
- Side Projects (id: ws_222bbb)
- Sandbox (id: ws_333ccc)
```

---

## `list_stacks` {#list_stacks}

Lists Stackby stacks (analogous to databases or spreadsheet workbooks). Optionally scoped to a single workspace. Without a `workspaceId`, the tool iterates every workspace the user can access and aggregates results.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | No | Workspace ID from `list_workspaces`. When provided, only stacks in that workspace are returned. When omitted, stacks from all workspaces are returned (truncated at 200). |

### API Call

**With `workspaceId`:**
```
POST /api/v1/mcp/stacks
Body: { "workspaceId": "<id>" }
```

**Without `workspaceId`:**
Calls `POST /api/v1/mcp/stacks` once for each workspace returned by `GET /api/v1/mcp/workspaces`, then aggregates the results.

### Output

A plain-text list, one stack per line:

```
Stacks (4):
- CRM Database (id: st_aaa111, workspace: Acme Corp)
- Marketing Tracker (id: st_bbb222, workspace: Acme Corp)
- Personal Finance (id: st_ccc333, workspace: Side Projects)
- Sandbox Stack (id: st_ddd444, workspace: Sandbox)
```

**Truncation:** When `workspaceId` is omitted and the total number of stacks exceeds 200, only the first 200 are listed and the output appends:

```
... and 47 more. Please provide a specific workspaceId to list_stacks to see more.
```

### Error Behavior

| Condition | Result |
|---|---|
| No auth credential configured | Returns a configuration advisory message. `isError` is not set. |
| Any Stackby API call returns non-2xx | Returns `isError: true` with the message `"Failed to list stacks: Stackby API {status}: {message}."` |

### Example

**Input:**
```json
{ "workspaceId": "ws_111aaa" }
```

**Output:**
```
Stacks (2):
- Product Roadmap (id: st_prod001, workspace: Acme Corp)
- Bug Tracker (id: st_bugs002, workspace: Acme Corp)
```

---

## `list_tables` {#list_tables}

Lists all tables (sheets) within a given stack. Use the returned table IDs with `describe_table`, `list_records`, and all schema management tools.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |

### API Call

```
GET /api/v1/mcp/stacks/:stackId/tables
```

### Output

A plain-text list, one table per line:

```
Tables in stack st_prod001 (3):
- Features (id: tb_feat01)
- Sprints (id: tb_sprt02)
- Team Members (id: tb_team03)
```

When no tables exist:

```
Tables in stack st_prod001 (0):
No tables found in this stack.
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId` not provided | Returns `isError: true` — `"stackId is required."` |
| No auth credential | Returns a configuration advisory message. `isError` not set. |
| API returns non-2xx | Returns `isError: true` — `"Failed to list tables: Stackby API {status}: {message}. Check stackId and API access."` |

### Example

**Input:**
```json
{ "stackId": "st_prod001" }
```

**Output:**
```
Tables in stack st_prod001 (2):
- Backlog (id: tb_back01)
- Releases (id: tb_rel02)
```

---

## `describe_table` {#describe_table}

Returns the full schema of a table: its display name, every field (column) with ID, name, and type, and every view with ID and name. This is the primary discovery tool for building subsequent read and write calls.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |
| `tableId` | string | Yes | Table ID from `list_tables`. |

### API Call

```
GET /api/v1/mcp/stacks/:stackId/tables/:tableId
```

The response shape is `{ id, name, fields[], views[] }`.

### Output

A structured plain-text block:

```
Table: Backlog (id: tb_back01)

Fields:
  - Title (id: cl_title01, type: shortText)
  - Status (id: cl_status02, type: singleOption)
  - Priority (id: cl_prio03, type: number)
  - Due Date (id: cl_due04, type: dateAndTime)
  - Assignee (id: cl_assign05, type: singleCollaborator)

Views:
  - All Items (id: vi_all01)
  - Active Sprint (id: vi_sprint02)
  - My Tasks (id: vi_mine03)
```

When a table has no fields or no views, the corresponding section shows `(no fields)` or `(no views)`.

### Error Behavior

| Condition | Result |
|---|---|
| `stackId` or `tableId` not provided | Returns `isError: true` — `"stackId and tableId are required."` |
| No auth credential | Returns a configuration advisory. `isError` not set. |
| API returns non-2xx | Returns `isError: true` — `"Failed to describe table: Stackby API {status}: {message}. Check stackId, tableId, and API access."` |

### Example

**Input:**
```json
{
  "stackId": "st_prod001",
  "tableId": "tb_back01"
}
```

**Output:**
```
Table: Backlog (id: tb_back01)

Fields:
  - Name (id: cl_name01, type: shortText)
  - Status (id: cl_stat02, type: singleOption)

Views:
  - Grid View (id: vi_grid01)
```

---

## `list_views` {#list_views}

Lists all views defined on a table. Views are named, filtered/sorted perspectives on table data (grid, kanban, gallery, calendar, form). The returned view IDs are used by `list_records` (to scope row order and filtering) and `create_field` (which requires a view ID).

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |
| `tableId` | string | Yes | Table ID from `list_tables`. |

### API Call

```
GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views
```

### Output

A plain-text list with view name, ID, and type:

```
Views in table tb_back01 (3):
- All Items (id: vi_all01, type: grid)
- Kanban Board (id: vi_kb02, type: kanban)
- Form Entry (id: vi_form03, type: form)
```

When no views exist:

```
Views in table tb_back01 (0):
No views found.
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId` or `tableId` not provided | Returns `isError: true` — `"stackId and tableId are required."` |
| No auth credential | Returns a configuration advisory. `isError` not set. |
| API returns non-2xx | Returns `isError: true` — `"Failed to list views: Stackby API {status}: {message}."` |

### Example

**Input:**
```json
{
  "stackId": "st_prod001",
  "tableId": "tb_back01"
}
```

**Output:**
```
Views in table tb_back01 (2):
- Default View (id: vi_def01, type: grid)
- By Assignee (id: vi_assign02, type: grid)
```

---

## `list_records` {#list_records}

Lists rows (records) from a table. Supports pagination, view scoping, column-based filtering and sorting, formula-based filters, and direct row ID lookup. Returns up to 100 records per call.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |
| `tableId` | string | Yes | Table ID from `list_tables`. |
| `maxRecords` | integer | No | Maximum number of records to return. Clamped to the range **[1, 100]**. Defaults to `100`. |
| `offset` | integer | No | Number of records to skip before returning results (zero-based). Clamped to **[0, ∞)**. Defaults to `0`. Use with `maxRecords` for page-by-page iteration. |
| `rowIds` | string[] | No | Return only the specific row IDs listed. When provided alongside `maxRecords`, the count is still capped at 100. |
| `view` | string | No | View ID or view name. When set, the API returns rows in the order and filter defined by that view. |
| `filter` | string | No | Filter expression in JSON format. Passed as-is to the backend `filter` query parameter. |
| `sort` | string | No | Sort expression in JSON format. Passed as-is to the backend `sort` query parameter. |
| `filterByFormula` | string | No | Formula-based row filter (e.g. `{Status}="Open"`). Passed as the `filterByFormula` query parameter. |
| `conjuction` | string | No | Logical conjunction for filter sets — `"and"` or `"or"`. **Note: this parameter is spelled with one `n`** — this is the canonical spelling used by the Stackby backend. Defaults to `"and"` when omitted. |

> **Pagination note:** `pageSize` is accepted as an alias for `maxRecords` and is subject to the same [1, 100] clamp.

### API Call

```
GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows?maxrecord=<n>&offset=<n>[&...]
```

Query parameters sent to the backend:

| Backend Param | Source |
|---|---|
| `maxrecord` | `maxRecords` (or `pageSize`), clamped to [1, 100] |
| `offset` | `offset`, clamped to [0, ∞) |
| `rowIds` | `rowIds` joined with commas |
| `view` | `view` or `viewId` (last one wins) |
| `filter` | `filter` |
| `sort` | `sort` |
| `latest` | `latest` |
| `filterByFormula` | `filterByFormula` |
| `conjuction` | `conjuction` |

### Output

A plain-text list, one record per line:

```
Records in table tb_back01 (3):
- id: rw_r001 | {"Name":"Fix login bug","Status":"Open","Priority":1}
- id: rw_r002 | {"Name":"Add dark mode","Status":"In Progress","Priority":2}
- id: rw_r003 | {"Name":"Update readme","Status":"Done","Priority":3}
```

When no records match:

```
Records in table tb_back01 (0):
No records found.
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId` or `tableId` not provided | Returns `isError: true` — `"stackId and tableId are required."` |
| No auth credential | Returns a configuration advisory. `isError` not set. |
| API returns non-2xx | Returns `isError: true` — `"Failed to list records: Stackby API {status}: {message}. Check stackId, tableId, and API access."` |

### Example

**Input:**
```json
{
  "stackId": "st_prod001",
  "tableId": "tb_back01",
  "maxRecords": 5,
  "offset": 10,
  "filterByFormula": "{Status}=\"Open\""
}
```

**Output:**
```
Records in table tb_back01 (5):
- id: rw_r011 | {"Name":"Pagination fix","Status":"Open"}
- id: rw_r012 | {"Name":"Auth timeout","Status":"Open"}
...
```

---

## `search_records` {#search_records}

Performs a full-text search within a specific column of a table. When no column is specified, the search is run against the first column of the table (resolved automatically).

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |
| `tableId` | string | Yes | Table ID from `list_tables`. |
| `searchTerm` | string | Yes | The text to search for. Must be non-empty after trimming. |
| `fieldIds` | string[] | No | Column IDs to search within. **Only the first element is used.** When omitted, the tool resolves the first column of the table automatically (see API call flow). |
| `maxRecords` | integer | No | Maximum number of matching records to return. Defaults to `100`. Maximum accepted by the backend is `99999`. |

### API Call Flow

**When `fieldIds` is provided:**
```
POST /api/v1/mcp/stacks/:stackId/tables/:tableId/search
Body: { "search": "<searchTerm>", "columnId": "<fieldIds[0]>", "maxRecords": <n> }
```

**When `fieldIds` is not provided (auto-resolve):**
1. First, fetch the table's columns to find the first column ID:
   ```
   GET /api/v1/mcp/stacks/:stackId/tables/:tableId/columns
   ```
2. Then search using that column ID:
   ```
   POST /api/v1/mcp/stacks/:stackId/tables/:tableId/search
   Body: { "search": "<searchTerm>", "columnId": "<firstColumnId>", "maxRecords": <n> }
   ```

> Only one column is searched per call. The `fieldIds` array may contain multiple IDs, but only `fieldIds[0]` is used.

### Output

A summary line followed by matching row IDs and their primary display names:

```
Search "login" in table tb_back01 (2 matches):
- id: rw_r001 | Fix login bug
- id: rw_r007 | Login redirect issue
```

When no records match:

```
Search "foobar" in table tb_back01 (0 matches):
No matching records.
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId`, `tableId`, or `searchTerm` missing/empty | Returns `isError: true` — `"stackId, tableId, and searchTerm are required."` |
| No auth credential | Returns a configuration advisory. `isError` not set. |
| Columns fetch or search call returns non-2xx | Returns `isError: true` — `"Failed to search records: Stackby API {status}: {message}. Check stackId, tableId, and API access."` |

### Example

**Input:**
```json
{
  "stackId": "st_prod001",
  "tableId": "tb_back01",
  "searchTerm": "auth",
  "maxRecords": 10
}
```

**Output:**
```
Search "auth" in table tb_back01 (3 matches):
- id: rw_r002 | Auth token expiry
- id: rw_r007 | OAuth login flow
- id: rw_r014 | Auth middleware bug
```

---

## `get_record` {#get_record}

Fetches a single row (record) by its ID and returns all field values as pretty-printed JSON.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |
| `tableId` | string | Yes | Table ID from `list_tables`. |
| `recordId` | string | Yes | Row ID from `list_records` or `search_records`. |

### API Call

```
GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId
```

The response may be a single record object `{ id, field }` or an array; if an array is returned, the first element is used.

### Output

The record's ID followed by its field values as indented JSON:

```
Record rw_r001:

{
  "Name": "Fix login bug",
  "Status": "Open",
  "Priority": 1,
  "Due Date": "2024-06-15",
  "Assignee": "alice@example.com"
}
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId`, `tableId`, or `recordId` not provided | Returns `isError: true` — `"stackId, tableId, and recordId are required."` |
| No auth credential | Returns a configuration advisory. `isError` not set. |
| Record not found (API returns null/empty body) | Returns a plain message `"No record found with id {recordId} in table {tableId}."` **without** setting `isError: true`. |
| API returns a non-2xx error status | Returns `isError: true` — `"Failed to get record: Stackby API {status}: {message}. Check stackId, tableId, recordId, and API access."` |

> **Distinction:** A missing record (null body from a 2xx response) is not treated as an error — it produces a plain "not found" message. A non-2xx HTTP status code from the backend is treated as an error with `isError: true`.

### Example

**Input:**
```json
{
  "stackId": "st_prod001",
  "tableId": "tb_back01",
  "recordId": "rw_r001"
}
```

**Output:**
```
Record rw_r001:

{
  "Name": "Fix login bug",
  "Status": "Open"
}
```

---

## `list_automations` {#list_automations}

Lists all automation workflows defined within a stack. Returns the raw API response as pretty-printed JSON, preserving the full structure returned by the Stackby backend.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |

### API Call

```
GET /api/v1/mcp/stacks/:stackId/automations
```

### Output

The raw API response as a pretty-printed JSON string. The exact shape is determined by the Stackby backend and may include a list of automation objects, each with `id`, `name`, `isTurnedOn`, `trigger`, `actions`, and related metadata.

```json
[
  {
    "id": "aut_abc123",
    "name": "Notify on row create",
    "isTurnedOn": true,
    "trigger": {
      "triggerType": "T_CR_ROW",
      "tableId": "tb_back01"
    },
    "actions": [
      {
        "actionType": "S_EMAIL",
        "sequence": 1
      }
    ]
  }
]
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId` not provided | Returns `isError: true` — `"stackId is required."` |
| No auth credential | Returns a configuration advisory. `isError` not set. |
| API returns non-2xx | Returns `isError: true` — `"Failed to list automations: Stackby API {status}: {message}."` |

### Example

**Input:**
```json
{ "stackId": "st_prod001" }
```

**Output:**
```json
[
  {
    "id": "aut_001",
    "name": "Send weekly digest",
    "isTurnedOn": false
  }
]
```

---

## `get_automation` {#get_automation}

Retrieves the full details of a single automation, including its trigger configuration and all action steps. Returns the raw API response as pretty-printed JSON.

### Inputs

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID from `list_stacks`. |
| `automationId` | string | Yes | Automation ID from `list_automations`. |

### API Call

```
GET /api/v1/mcp/stacks/:stackId/automations/:automationId
```

### Output

The raw API response as a pretty-printed JSON string:

```json
{
  "id": "aut_abc123",
  "name": "Notify on row create",
  "description": "Sends email when a row is added to Backlog",
  "isTurnedOn": true,
  "tableId": "tb_back01",
  "trigger": {
    "id": "trg_001",
    "triggerType": "T_CR_ROW",
    "triggerParams": {},
    "tableId": "tb_back01"
  },
  "actions": [
    {
      "id": "act_001",
      "actionType": "S_EMAIL",
      "sequence": 1,
      "actionParams": {
        "toWithColumnId": "tb_back01 cl_email01",
        "subjectWithColumnId": "New row added",
        "messageWithColumnId": "A new item was created: {{Name}}"
      }
    }
  ]
}
```

### Error Behavior

| Condition | Result |
|---|---|
| `stackId` or `automationId` not provided | Returns `isError: true` — `"stackId and automationId are required."` |
| No auth credential | Returns a configuration advisory. `isError` not set. |
| API returns non-2xx | Returns `isError: true` — `"Failed to get automation: Stackby API {status}: {message}."` |

### Example

**Input:**
```json
{
  "stackId": "st_prod001",
  "automationId": "aut_abc123"
}
```

**Output:** _(full automation JSON as shown in the Output section above)_

---

## `list_automation_capabilities` {#list_automation_capabilities}

Returns a formatted catalog of all trigger type codes and action type codes supported by the Stackby automation system. No external API call is made — the catalog is built from the data embedded in `mcp-server.ts`.

Call this tool first when setting up an automation to select the right `triggerType` and `actionType` codes for `create_automation`, `add_automation_trigger`, and `add_automation_action`.

### Inputs

This tool accepts no input parameters.

### API Call

None. The catalog is served from in-memory data; no network request is made.

### Output

A structured plain-text catalog covering:

1. **Trigger types** — code, name, description, where to set `tableId`, example `triggerParams`, and notes
2. **Action types** — code, name, description, example `actionParams`, and notes
3. **Advanced endpoint action values** — valid `:action` strings for `automation_workflow_action`, `automation_trigger_action`, and `automation_action_action`

#### Trigger Type Reference

| Code | Name | Description |
|---|---|---|
| `T_CR_ROW` | When record created | Fires when a new row is added to the trigger table. Usually no `triggerParams` are needed. |
| `T_UP_ROW` | When record updated | Fires when any row in the trigger table is updated. Use `watchingColumns` in `triggerParams` to restrict to specific column IDs. |
| `SD_TIME` | At scheduled time | Fires on a schedule. `triggerParams` specifies `interval` (minutes/hours/days/weeks/months/oneTime), cadence details, and `nextTriggerTime`. |
| `WH_RECV` | Webhook received | Fires when an incoming webhook hits the automation endpoint. `triggerParams` shape depends on the webhook configuration. |
| `RW_COND` | Row matches conditions | Fires when a row enters a state matching defined conditions. Use `filterData.filterSet` in `triggerParams` to define conditions. |
| `VM_ROW` | View match / row event | Fires based on a specific view or view-based row event. Pass `viewId` in `triggerParams`. |

#### Action Type Reference

| Code | Name | Description |
|---|---|---|
| `CR_ROW` | Create record | Creates a new row in a target table. `actionParams.tableId` and `actionParams.column` are required. |
| `UP_ROW` | Update record | Updates an existing row. `actionParams.tableId`, `actionParams.rowId`, and `actionParams.column` are required. |
| `FIND_ROW` | Find record | Searches for rows to use in later steps. Use `findOn: "condition"` with `filterData`, or `viewId` for view-based lookup. |
| `S_EMAIL` | Send email | Sends an email. Uses `...WithColumnId` fields: `toWithColumnId`, `subjectWithColumnId`, `messageWithColumnId`, etc. |
| `WHATSAPP` | Send WhatsApp | Sends a WhatsApp message. Requires `apiConfigId`, `templateName`, and `whatsappActionObj`. |
| `GMAIL` | Send Gmail | Sends via Gmail integration. Uses same `...WithColumnId` field pattern as `S_EMAIL`. |
| `OUTLOOK` | Send Outlook email | Sends via Outlook integration. Uses same `...WithColumnId` field pattern as `S_EMAIL`. |
| `MS_TEAM` | Send to Microsoft Teams | Posts to a Teams channel. Requires `teamId`, `channelId`, `accessToken`, and `body`. |
| `SLACK` | Send Slack message | Posts to a Slack channel. Requires `channelId`, `accessToken`, and `message`. |
| `SORT` | Sort records | Sorts the result of a prior `FIND_ROW` step. Pass `findActionId` and a `sort` array. |
| `AI_GEN` | AI generate | Generates content using an AI step. Requires `findActionId`, `columnCellvalues`, and `column`. |

#### Advanced Endpoint Action Values

| Tool | Valid `action` values |
|---|---|
| `automation_workflow_action` | `create`, `update`, `delete`, `details`, `updateSequence`, `duplicate`, `runCount`, `sectioncreate`, `sectionrename`, `sectiondelete`, `addtosection`, `sectionmove`, `sectionexpand`, `updateDescription` |
| `automation_trigger_action` | `create`, `update`, `delete`, `list`, `trigger` |
| `automation_action_action` | `create`, `update`, `delete`, `list`, `action`, `updateSequence`, `duplicate`, `updateDescription` |

### Error Behavior

This tool does not call any external API and therefore cannot produce an API error. It always returns successfully.

### Example

**Input:** _(none)_

**Output (excerpt):**
```
Automation trigger types:
- T_CR_ROW: When record created — Runs when a new row is created in a table.
  table: top-level trigger.tableId
  triggerParams example: {}
  notes: Usually no triggerParams are needed beyond the trigger table.

- T_UP_ROW: When record updated — Runs when a row is updated.
  table: top-level trigger.tableId
  triggerParams example: {"watchingColumns":["cl_status","cl_owner"],...}
  notes: `watchingColumns` is read by the backend and is the most useful field here.

...

Automation action types:
- CR_ROW: Create record — Create a new row in a target table.
  actionParams example: {"tableId":"tb_target123","column":{"cl_name":"tb_source123 cl_title",...}}
  notes: `column` maps target column ids to static values or trigger-derived values.

...

Advanced workflow endpoint actions: create, update, delete, details, updateSequence, ...
Advanced trigger endpoint actions: create, update, delete, list, trigger
Advanced action endpoint actions: create, update, delete, list, action, updateSequence, duplicate, updateDescription
```

---

## Common Patterns

### Discovering IDs for a read operation

The typical discovery sequence for reading records is:

```
list_workspaces          → workspace IDs
  → list_stacks          → stack IDs
    → list_tables        → table IDs
      → describe_table   → field IDs, view IDs
        → list_records   → record IDs
          → get_record   → field values
```

### Pagination with `list_records`

Iterate through large tables using `maxRecords` and `offset`:

```json
// Page 1
{ "stackId": "st_x", "tableId": "tb_y", "maxRecords": 100, "offset": 0 }

// Page 2
{ "stackId": "st_x", "tableId": "tb_y", "maxRecords": 100, "offset": 100 }

// Page 3
{ "stackId": "st_x", "tableId": "tb_y", "maxRecords": 100, "offset": 200 }
```

When the returned record count is less than `maxRecords`, the last page has been reached.

### Searching before reading

When looking for specific rows by keyword rather than by ID:

```json
// Step 1: find matching row IDs
{
  "tool": "search_records",
  "stackId": "st_x",
  "tableId": "tb_y",
  "searchTerm": "invoice #1042"
}

// Step 2: fetch full record details for a matched ID
{
  "tool": "get_record",
  "stackId": "st_x",
  "tableId": "tb_y",
  "recordId": "rw_r099"
}
```
