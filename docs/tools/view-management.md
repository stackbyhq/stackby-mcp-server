# View Management

Views are named, filtered, and sorted perspectives on a Table. They do not copy data; they define how data is presented and optionally filtered. Every table starts with at least one default grid view, and additional views can be created, renamed, or removed without affecting the underlying records.

**Tools covered:** [`create_view`](#create_view), [`rename_view`](#rename_view), [`delete_view`](#delete_view)

**Related docs:** [Schema Management](./schema-management.md) · [Read Operations](./read-operations.md) · [API Reference](../api-reference.md)

---

## View Types

Stackby supports five view types. Pass the lowercase string as the `type` parameter when creating a view.

| Type | Description |
|---|---|
| `grid` | Spreadsheet-style rows and columns. The default view type when `type` is omitted. |
| `kanban` | Card-based board organized by a single-option field. Cards move between columns when the field value changes. |
| `gallery` | Image-centric card layout. Best suited for tables with attachment fields. |
| `calendar` | Date-based layout. Requires a date/time field to determine where records are placed on the calendar. |
| `form` | Data-entry form interface. Used to collect new records via a shareable link. |

All five types read from and write to the same underlying table data.

---

## create_view

Creates a new view on a table.

**API call:** `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/views`

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID (from `list_stacks`) |
| `tableId` | string | Yes | Table ID (from `list_tables`) |
| `name` | string | Yes | View name. Must be 1–255 characters. |
| `type` | string | No | View type: `grid`, `kanban`, `gallery`, `calendar`, or `form`. Defaults to `grid` when omitted. |
| `copyMode` | string | No | How to initialize the new view: `"new"` (blank defaults) or `"duplicate"` (copy an existing view). |
| `copyViewId` | string | No | Source view ID to copy settings from. Required when `copyMode` is `"duplicate"`. |
| `sequenceViewId` | string | No | View whose column order and row visibility to adopt for the new view. Uses the first existing view when omitted. |
| `filters` | object | No | Initial filter payload applied to the view. |
| `groupLevels` | object | No | Initial grouping configuration applied to the view. |
| `description` | string | No | View description. Maximum 500 characters. |

### Behavior

- When `copyMode` is `"duplicate"`, the server copies the column visibility, sort order, filters, and display settings from `copyViewId` into the new view.
- When `sequenceViewId` is omitted, Stackby uses the first view on the table to derive the initial column order.
- Filters and group levels provided at creation time are applied immediately and are reflected in subsequent `list_records` calls that reference this `viewId`.

### Returns

The created view object as JSON, including the new `viewId`, `name`, and `type`.

```
View created.
{
  "id": "vi_abc123",
  "name": "My Kanban",
  "type": "kanban",
  ...
}
```

### Example

```json
{
  "tool": "create_view",
  "input": {
    "stackId": "st_xyz",
    "tableId": "tb_xyz",
    "name": "Priority Board",
    "type": "kanban"
  }
}
```

Duplicate an existing view:

```json
{
  "tool": "create_view",
  "input": {
    "stackId": "st_xyz",
    "tableId": "tb_xyz",
    "name": "Q2 Filtered Copy",
    "copyMode": "duplicate",
    "copyViewId": "vi_source123"
  }
}
```

---

## rename_view

Renames a view and/or updates its description.

**API call:** `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId`

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID (from `list_stacks`) |
| `tableId` | string | Yes | Table ID (from `list_tables`) |
| `viewId` | string | Yes | View ID (from `list_views`) |
| `name` | string | Yes | New view name. Must be 1–255 characters. |
| `description` | string | No | New view description. Maximum 500 characters. Pass an empty string to clear an existing description. |

### Returns

The updated view object as JSON.

```
View updated.
{
  "id": "vi_abc123",
  "name": "Renamed View",
  "description": "Updated description",
  ...
}
```

### Example

```json
{
  "tool": "rename_view",
  "input": {
    "stackId": "st_xyz",
    "tableId": "tb_xyz",
    "viewId": "vi_abc123",
    "name": "Q3 Sprint Board",
    "description": "Kanban view filtered to Q3 tasks"
  }
}
```

---

## delete_view

Soft-deletes a view from a table.

**API call:** `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId`

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `stackId` | string | Yes | Stack ID (from `list_stacks`) |
| `tableId` | string | Yes | Table ID (from `list_tables`) |
| `viewId` | string | Yes | View ID to delete (from `list_views`) |

### Soft-Delete Semantics

Deleting a view is a **soft-delete**:

- The view is immediately removed from `list_views` results and is no longer accessible via retrieval.
- All underlying table records remain intact and unmodified.
- The records are still accessible through any other views on the table.
- Workspace admins can recover the soft-deleted view.

Soft-delete behavior is distinct from deleting a table (`delete_table`), which permanently removes the table and all its data.

### Returns

A confirmation containing the deleted view's ID:

```
View deleted.
{
  "id": "vi_abc123",
  "deleted": true,
  ...
}
```

### Example

```json
{
  "tool": "delete_view",
  "input": {
    "stackId": "st_xyz",
    "tableId": "tb_xyz",
    "viewId": "vi_abc123"
  }
}
```

---

## Error Behavior

All three view management tools share the same error contract: **any error condition returns `isError: true` without modifying any state.**

The following conditions produce an error response:

| Condition | Tool(s) | Error Description |
|---|---|---|
| `stackId` is missing or empty | All | `"stackId, tableId, and name are required."` (create) / `"stackId, tableId, and viewId are required."` (delete) |
| `tableId` is missing or empty | All | Same as above |
| `name` is missing or empty | `create_view`, `rename_view` | Required parameter error |
| `viewId` is missing or empty | `rename_view`, `delete_view` | Required parameter error |
| No auth credential configured | All | `"No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config..."` |
| `stackId` does not identify an existing stack | All | Stackby API error surfaced as `"Failed to create/rename/delete view: Stackby API 404: ..."` |
| `tableId` does not identify a table in the stack | All | Stackby API error surfaced unchanged |
| `viewId` does not identify an existing view | `rename_view`, `delete_view` | Stackby API error surfaced unchanged |
| `copyMode` is `"duplicate"` but `copyViewId` is absent | `create_view` | Stackby API error (the backend enforces this constraint) |

No retry is performed on API errors. The raw error message from the Stackby backend is passed through to the caller.

---

## Workflow: Common Patterns

### Discover then modify

Use `list_views` to retrieve the current view IDs before renaming or deleting:

```
1. list_views   { stackId, tableId }         → get all view IDs
2. rename_view  { stackId, tableId, viewId, name }
```

### Create a filtered view

Create a view and pass `filters` at creation time so the view is immediately filtered:

```json
{
  "tool": "create_view",
  "input": {
    "stackId": "st_xyz",
    "tableId": "tb_xyz",
    "name": "Open Items",
    "type": "grid",
    "filters": {
      "filterSet": [
        { "columnId": "cl_status", "operator": "is", "value": "Open" }
      ]
    }
  }
}
```

### Duplicate a view and rename it

```
1. list_views     → identify source viewId
2. create_view    { copyMode: "duplicate", copyViewId: "<source>" }  → new viewId
3. rename_view    { viewId: "<new>", name: "My Custom Copy" }
```

---

## Related Tools

| Tool | Description |
|---|---|
| [`list_views`](./read-operations.md#list_views) | List all views on a table, including IDs and types |
| [`list_records`](./read-operations.md#list_records) | Accepts a `view` parameter to filter/sort records by a specific view |
| [`create_field`](./schema-management.md#create_field) | View ID is required (or auto-resolved) when creating a column |
