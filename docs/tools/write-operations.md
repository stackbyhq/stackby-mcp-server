# Write Operations

This page documents every record write tool in the Stackby MCP Server: the 5 tools that create, update, delete, and annotate records (rows) in a table. These tools correspond to Requirements 6.1–6.4 and 6.8.

> **Prerequisites.** Use [`list_stacks`](./read-operations.md#list_stacks) → [`list_tables`](./read-operations.md#list_tables) → [`describe_table`](./read-operations.md#describe_table) to obtain valid `stackId`, `tableId`, and column names before writing data.

---

## Table of Contents

- [create_record](#create_record)
- [update_records](#update_records)
- [update_records_for_table](#update_records_for_table)
- [delete_records](#delete_records)
- [create_record_comment](#create_record_comment)

---

## create_record

Create a new row in a Stackby table. Fields are keyed by **column name** (not column ID). Use [`describe_table`](./read-operations.md#describe_table) to look up the exact column names before calling this tool.

**Requirements:** 6.1

### Input Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID — from `list_stacks` |
| `tableId` | string | Yes | Table ID — from `list_tables` |
| `fields` | object \| JSON string | Yes | Column name → value map for the new row |

#### `fields` Parsing Rules

The `fields` parameter is flexible and accepts two forms:

1. **JavaScript object** (preferred): `{ "Name": "Alice", "Status": "Active" }`
2. **JSON string**: a string that `JSON.parse()` resolves to a plain (non-array) object: `"{\"Name\":\"Alice\",\"Status\":\"Active\"}"`

If a string is provided and `JSON.parse` fails, or if the parsed result is not a plain object (e.g. it is an array or a primitive), the tool returns an error with `isError: true` and no API call is made.

### API Call

```
POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows
```

**Request body:**

```json
{
  "records": [
    {
      "field": {
        "Name": "Alice",
        "Status": "Active"
      }
    }
  ]
}
```

### Response

On success, the tool returns the created record's ID and all field values as set by the API:

```
Created record: rw_abc123

{
  "Name": "Alice",
  "Status": "Active"
}
```

### Error Behavior

| Condition | Behavior |
|---|---|
| `stackId` or `tableId` is missing or empty | Returns error with `isError: true`; no API call made |
| `fields` is a non-parseable string, an array, or not an object | Returns error with `isError: true`; no API call made |
| API returns a non-2xx response | Returns error message (`Stackby API {status}: {message}`) with `isError: true` |
| API returns an empty records array | Returns error: `No record was created. Check table schema and field names.` with `isError: true` |

### Example

```json
{
  "stackId": "st_abc123",
  "tableId": "tb_def456",
  "fields": {
    "Name": "Alice",
    "Status": "Active",
    "Priority": 1
  }
}
```

```json
{
  "stackId": "st_abc123",
  "tableId": "tb_def456",
  "fields": "{\"Name\": \"Bob\", \"Status\": \"Pending\"}"
}
```

---

## update_records

Batch-update up to 10 existing rows in a table in a single request. Each record in the array is identified by its row ID and carries the fields to update. Fields not included in the update payload are left unchanged.

**Requirements:** 6.2

### Input Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID — from `list_stacks` |
| `tableId` | string | Yes | Table ID — from `list_tables` |
| `records` | array of `{ id, fields }` | Yes | Records to update — minimum 1, maximum 10 items |

#### `records` Array Item Shape

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Record (row) ID — from `list_records`, `search_records`, or `get_record` |
| `fields` | object | Yes | Column name → new value map; only specified columns are updated |

### Hard Limit: 10 Records Per Request

The Zod input schema enforces `.min(1).max(10)` on the `records` array. If the array is empty or contains more than 10 items, the MCP framework rejects the input before the handler runs, and no API call is made.

### API Call

```
POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update
```

**Request body:**

```json
{
  "records": [
    { "id": "rw_row1", "field": { "Status": "Done" } },
    { "id": "rw_row2", "field": { "Status": "In Progress", "Priority": 2 } }
  ]
}
```

> **Note:** The API body uses `field` (singular) while the tool input uses `fields` (plural). The tool handler maps `fields` → `field` automatically.

### Response

On success, the tool returns the full updated field values for every record that was updated:

```
Updated 2 record(s):

- rw_row1: {"Status":"Done","Name":"Alice"}
- rw_row2: {"Status":"In Progress","Priority":2,"Name":"Bob"}
```

### Error Behavior

| Condition | Behavior |
|---|---|
| `stackId` or `tableId` is missing | Returns error with `isError: true`; no API call made |
| `records` array has 0 items | Schema validation error; no API call made |
| `records` array has more than 10 items | Schema validation error; no API call made |
| API returns a non-2xx response | Returns error message with `isError: true` |

### Example

```json
{
  "stackId": "st_abc123",
  "tableId": "tb_def456",
  "records": [
    {
      "id": "rw_row001",
      "fields": { "Status": "Done", "Notes": "Completed on time" }
    },
    {
      "id": "rw_row002",
      "fields": { "Status": "In Progress" }
    }
  ]
}
```

---

## update_records_for_table

This tool is a **registered alias** of [`update_records`](#update_records). It accepts the same parameters, enforces the same minimum 1 / maximum 10 record constraint, makes the same API call (`POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update`), and returns the same response structure.

**Requirements:** 6.3

The only differences are the tool name and a slightly different success message suffix (`for table {tableId}:`). All input validation, API behavior, and error handling are identical to `update_records`.

Use whichever name your AI client resolves more naturally; both tools are registered and available in the same server.

### Input Parameters

Identical to [`update_records`](#update_records):

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID |
| `tableId` | string | Yes | Table ID |
| `records` | array of `{ id, fields }` | Yes | Records to update — minimum 1, maximum 10 items |

### API Call

```
POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update
```

Identical to `update_records`.

### Response

```
Updated 1 record(s) for table tb_def456:

- rw_row001: {"Status":"Done","Name":"Alice"}
```

---

## delete_records

Soft-delete up to 10 rows from a table in a single request. Deleted records are **marked as deleted** and excluded from all future read operations, but they are **not permanently purged** from the database. Deleted data may be recoverable by Stackby admins.

**Requirements:** 6.4

### Input Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID — from `list_stacks` |
| `tableId` | string | Yes | Table ID — from `list_tables` |
| `recordIds` | array of strings | Yes | Row IDs to delete — minimum 1, maximum 10 items |

### Hard Limit: 10 Records Per Request

The Zod input schema enforces `.min(1).max(10)` on the `recordIds` array. If the array is empty or contains more than 10 items, the MCP framework rejects the input before the handler runs, and no API call is made.

### What "Soft-Delete" Means

A soft-deleted record is:

- **Not returned** by `list_records`, `search_records`, or `get_record`.
- **Not permanently removed** from the Stackby database.
- **Potentially recoverable** by Stackby administrators through backend tooling.

This is distinct from a hard (permanent) delete.

### API Call

```
DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/rows?rowIds=id1&rowIds=id2
```

Each record ID is appended as a separate `rowIds` query parameter. The tool constructs the query string with `encodeURIComponent` applied to each ID.

**No request body is sent.**

### Response

On success, the tool returns a per-record confirmation:

```
Deleted 2 record(s):

- rw_row001: deleted=true
- rw_row002: deleted=true
```

### Error Behavior

| Condition | Behavior |
|---|---|
| `stackId` or `tableId` is missing | Returns error with `isError: true`; no API call made |
| `recordIds` array has 0 items | Schema validation error; no API call made |
| `recordIds` array has more than 10 items | Schema validation error; no API call made |
| API returns a non-2xx response | Returns error message with `isError: true` |

### Example

```json
{
  "stackId": "st_abc123",
  "tableId": "tb_def456",
  "recordIds": ["rw_row001", "rw_row002", "rw_row003"]
}
```

---

## create_record_comment

Add a text comment to an existing record (row). Comments are attached to a specific record within a specific table and are visible in the Stackby UI alongside the record.

**Requirements:** 6.8

### Input Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID — from `list_stacks` |
| `tableId` | string | Yes | Table ID — from `list_tables` |
| `recordId` | string | Yes | Record (row) ID — from `list_records`, `search_records`, or `get_record` |
| `text` | string | Yes | Comment text — must be non-empty; maximum 2000 characters |
| `attachment` | unknown | No | Optional attachment payload (Stackby attachment format) |
| `cellValue` | unknown | No | Optional cell value payload for inline cell references in the comment |

### API Call

```
POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments
```

**Request body:**

```json
{
  "text": "Please review this row before the deadline.",
  "attachment": null,
  "cellValue": null
}
```

Only `text` is required. `attachment` and `cellValue` are included in the body only when provided.

### Response

On success, the tool returns the raw API response for the created comment as pretty-printed JSON, which includes the comment ID and timestamp:

```
Comment created.
{
  "id": "cm_xyz789",
  "text": "Please review this row before the deadline.",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "recordId": "rw_row001"
}
```

### Error Behavior

| Condition | Behavior |
|---|---|
| `stackId`, `tableId`, `recordId`, or `text` is missing or empty | Returns error with `isError: true`; no API call made |
| API returns a non-2xx response | Returns error message (`Stackby API {status}: {message}`) with `isError: true` |

### Example — Basic Comment

```json
{
  "stackId": "st_abc123",
  "tableId": "tb_def456",
  "recordId": "rw_row001",
  "text": "Approved for release. See ticket #1234."
}
```

### Example — Comment with Attachment

```json
{
  "stackId": "st_abc123",
  "tableId": "tb_def456",
  "recordId": "rw_row001",
  "text": "See the attached file for reference.",
  "attachment": {
    "url": "https://example.com/file.pdf",
    "name": "reference.pdf"
  }
}
```

---

## Common Patterns

### Typical Write Workflow

```
1. list_workspaces          → get workspaceId
2. list_stacks              → get stackId
3. list_tables              → get tableId
4. describe_table           → get column names and field types
5. create_record / update_records / delete_records
```

### Discovering Record IDs Before Writing

Record IDs (`rw_*`) are required for `update_records`, `delete_records`, and `create_record_comment`. Obtain them with:

- [`list_records`](./read-operations.md#list_records) — returns all records with their IDs
- [`search_records`](./read-operations.md#search_records) — find specific records by text value
- [`get_record`](./read-operations.md#get_record) — retrieve a single known record

### Error Message Format

All errors follow the same pattern:

```
Failed to <operation>: <message>. <optional hint>
```

Where `<message>` is either a validation message (missing parameter) or the raw Stackby API error string (`Stackby API {statusCode}: {errorMessage}`). The full error detail including `status`, `authMode`, `responseError`, and `responseBody` is written to the server's stderr for debugging.

---

## Quick Reference

| Tool | Method | Endpoint | Max Items | Soft Delete? |
|---|---|---|---|---|
| `create_record` | POST | `.../rows` | 1 record per call | N/A |
| `update_records` | POST | `.../rows/update` | 10 records per call | N/A |
| `update_records_for_table` | POST | `.../rows/update` | 10 records per call | N/A |
| `delete_records` | DELETE | `.../rows?rowIds=...` | 10 records per call | Yes |
| `create_record_comment` | POST | `.../rows/:recordId/comments` | 1 comment per call | N/A |
