# MCP Tool Catalog

## Overview

The Stackby MCP Server registers **36 MCP tools** via `mcpServer.registerTool()` in `src/mcp-server.ts`. Every tool is callable by any MCP-compatible AI client (Cursor, Claude Desktop, Cline, ChatGPT). All 36 tools accept input keys in either **camelCase** (`stackId`) or **snake_case** (`stack_id`) — the server normalizes both conventions automatically before any handler runs.

---

## Tool Registration Model

Tools are registered with the following signature:

```typescript
mcpServer.registerTool(name, { description, inputSchema }, handler)
```

| Component | Description |
|---|---|
| `name` | The string identifier used by AI clients to call the tool |
| `description` | Human-readable description shown to the AI client for tool selection |
| `inputSchema` | Zod schema that validates the input object; each field is declared with `z.string()`, `z.number()`, `z.array()`, etc. |
| `handler` | Async function that runs after input validation; always wrapped with `withCamel()` |

### `withCamel()` Wrapper

Every handler is wrapped with `withCamel()`, which runs before the handler body:

```typescript
function withCamel<R>(handler: (input) => Promise<R>): (input) => Promise<R>
```

It calls `camelCaseKeys()` on the raw input, converting any `snake_case` key to `camelCase`:

```
stack_id    → stackId
table_id    → tableId
record_ids  → recordIds
column_type → columnType
```

Keys already in camelCase pass through unchanged. This means all tools accept **either convention** from any AI client.

### Response Shape

Every tool returns a value of the following shape:

```typescript
{
  content: [{ type: "text", text: string }],
  isError?: boolean
}
```

- On **success**, `isError` is omitted (or `false`) and `text` contains the formatted result.
- On **error**, `isError` is `true` and `text` contains a human-readable error description.

Errors are surfaced as tool output (not as JSON-RPC errors), so the AI client always receives readable text regardless of success or failure.

---

## Input Conventions

All tools accept both camelCase and snake_case for every input parameter. The following pairs are equivalent:

| snake_case | camelCase |
|---|---|
| `stack_id` | `stackId` |
| `table_id` | `tableId` |
| `record_id` | `recordId` |
| `record_ids` | `recordIds` |
| `column_id` | `columnId` |
| `column_type` | `columnType` |
| `workspace_id` | `workspaceId` |
| `view_id` | `viewId` |
| `automation_id` | `automationId` |
| `max_records` | `maxRecords` |
| `filter_by_formula` | `filterByFormula` |
| `link_to_table_id` | `linkToTableId` |
| `formula_text` | `formulaText` |
| `search_term` | `searchTerm` |

You may use either convention and the server will normalize it before the handler runs. Mixed usage within a single call is also fine.

---

## Complete Tool Catalog

All 36 registered tools, in the order they appear in `src/mcp-server.ts`:

| Tool Name | Group | Description | Reference |
|---|---|---|---|
| `list_workspaces` | Read Operations | List all Stackby workspaces the authenticated user can access | [read-operations.md](./read-operations.md#list_workspaces) |
| `list_stacks` | Read Operations | List stacks (bases) the user can access; filter by `workspaceId` or iterate all workspaces | [read-operations.md](./read-operations.md#list_stacks) |
| `create_stack` | Stack Creation | Create a new stack in a workspace; accepts optional `tables` template for pre-built structure | [stack-creation.md](./stack-creation.md#create_stack) |
| `list_views` | View Management | List views for a table (grid, kanban, gallery, calendar, form) | [view-management.md](./view-management.md#list_views) |
| `create_view` | View Management | Create a new view on a table; supports duplicate mode via `copyMode` + `copyViewId` | [view-management.md](./view-management.md#create_view) |
| `rename_view` | View Management | Rename or update the description of an existing view | [view-management.md](./view-management.md#rename_view) |
| `delete_view` | View Management | Soft-delete a view (data is retained; view becomes inaccessible) | [view-management.md](./view-management.md#delete_view) |
| `list_tables` | Read Operations | List tables in a stack | [read-operations.md](./read-operations.md#list_tables) |
| `describe_table` | Read Operations | Get table schema: name, all fields (id, name, type), and all views (id, name) | [read-operations.md](./read-operations.md#describe_table) |
| `list_records` | Read Operations | List rows in a table with optional pagination, view, filter, and sort parameters | [read-operations.md](./read-operations.md#list_records) |
| `search_records` | Read Operations | Full-text search for rows in a table by column value | [read-operations.md](./read-operations.md#search_records) |
| `get_record` | Read Operations | Retrieve a single row by record ID | [read-operations.md](./read-operations.md#get_record) |
| `create_record` | Record Write Operations | Create a new row in a table; `fields` accepted as object or JSON string | [write-operations.md](./write-operations.md#create_record) |
| `update_records` | Record Write Operations | Batch update up to 10 existing rows; accepts array of `{ id, fields }` | [write-operations.md](./write-operations.md#update_records) |
| `delete_records` | Record Write Operations | Soft-delete up to 10 rows by ID | [write-operations.md](./write-operations.md#delete_records) |
| `create_table` | Table & Field Schema | Create a new table in a stack | [schema-management.md](./schema-management.md#create_table) |
| `update_table` | Table & Field Schema | Update a table's name and/or description | [schema-management.md](./schema-management.md#update_table) |
| `delete_table` | Table & Field Schema | Delete a table and all of its data from a stack | [schema-management.md](./schema-management.md#delete_table) |
| `create_field` | Table & Field Schema | Create a column in a table; supports all 39 column types including link, formula, lookup, and rollup | [schema-management.md](./schema-management.md#create_field) |
| `update_field` | Table & Field Schema | Rename, update the description of, or reconfigure a column | [schema-management.md](./schema-management.md#update_field) |
| `delete_field` | Table & Field Schema | Delete a column from a table | [schema-management.md](./schema-management.md#delete_field) |
| `create_record_comment` | Record Write Operations | Add a comment to a record (row) | [write-operations.md](./write-operations.md#create_record_comment) |
| `list_automation_capabilities` | Read Operations | Return the full catalog of supported trigger codes and action codes; makes no API call | [read-operations.md](./read-operations.md#list_automation_capabilities) |
| `update_records_for_table` | Record Write Operations | Alias of `update_records`; identical inputs, outputs, and API call | [write-operations.md](./write-operations.md#update_records_for_table) |
| `list_automations` | Read Operations | List all automations in a stack | [read-operations.md](./read-operations.md#list_automations) |
| `get_automation` | Read Operations | Get full details for a single automation by ID | [read-operations.md](./read-operations.md#get_automation) |
| `create_automation` | Automation | Create a full automation in one call: workflow, trigger, and optional actions | [automation.md](./automation.md#create_automation) |
| `update_automation` | Automation | Update automation metadata (name, description, enabled state, table, view) | [automation.md](./automation.md#update_automation) |
| `delete_automation` | Automation | Delete an automation workflow | [automation.md](./automation.md#delete_automation) |
| `add_automation_trigger` | Automation | Add a trigger to an existing automation | [automation.md](./automation.md#add_automation_trigger) |
| `add_automation_action` | Automation | Add an action step to an existing automation | [automation.md](./automation.md#add_automation_action) |
| `automation_workflow_action` | Automation | Advanced passthrough for automation workflow operations (duplicate, updateSequence, section actions, etc.) | [automation.md](./automation.md#automation_workflow_action) |
| `automation_trigger_action` | Automation | Advanced passthrough for automation trigger operations (create, update, delete, list, trigger) | [automation.md](./automation.md#automation_trigger_action) |
| `automation_action_action` | Automation | Advanced passthrough for automation action-step operations (create, update, delete, list, updateSequence, duplicate, updateDescription) | [automation.md](./automation.md#automation_action_action) |
| `dashboard_action` | Dashboards & Blocks | Run a dashboard action: create, update, getblocks, positionupdate, or move | [dashboard-blocks.md](./dashboard-blocks.md#dashboard_action) |
| `block_action` | Dashboards & Blocks | Run a block action: create, update, duplicate, or move; normalizes user-friendly fields into the API payload automatically | [dashboard-blocks.md](./dashboard-blocks.md#block_action) |

---

## Tool Groups Summary

| Group | Count | Tools | Sub-page |
|---|---|---|---|
| Read Operations | 11 | `list_workspaces`, `list_stacks`, `list_tables`, `describe_table`, `list_views`, `list_records`, `search_records`, `get_record`, `list_automations`, `get_automation`, `list_automation_capabilities` | [read-operations.md](./read-operations.md) |
| Record Write Operations | 5 | `create_record`, `update_records`, `update_records_for_table`, `delete_records`, `create_record_comment` | [write-operations.md](./write-operations.md) |
| Table & Field Schema | 6 | `create_table`, `update_table`, `delete_table`, `create_field`, `update_field`, `delete_field` | [schema-management.md](./schema-management.md) |
| View Management | 4 | `list_views`, `create_view`, `rename_view`, `delete_view` | [view-management.md](./view-management.md) |
| Stack Creation | 1 | `create_stack` | [stack-creation.md](./stack-creation.md) |
| Automation | 8 | `create_automation`, `update_automation`, `delete_automation`, `add_automation_trigger`, `add_automation_action`, `automation_workflow_action`, `automation_trigger_action`, `automation_action_action` | [automation.md](./automation.md) |
| Dashboards & Blocks | 2 | `dashboard_action`, `block_action` | [dashboard-blocks.md](./dashboard-blocks.md) |

> **Note:** `list_views` appears in both View Management and Read Operations depending on context; it is counted once in the 36-tool total.

---

## Conventions and Cross-References

- **IDs are always strings.** `stackId`, `tableId`, `recordId`, `columnId`, `viewId`, and `automationId` are all strings — typically prefixed with `st_`, `tb_`, `rw_`, `cl_`, `vi_`, or `at_` respectively.
- **Discovery order.** The typical call sequence is: `list_workspaces` → `list_stacks` → `list_tables` → `describe_table`, then whichever read or write tool is needed.
- **Auth required.** Every tool checks for a valid credential (API key or bearer token) before calling any API. If no credential is present, the tool returns an error immediately without making any network request.
- **Error shape.** All errors follow the same format: `{ content: [{ type: "text", text: "Failed to …: <message>" }], isError: true }`. The `<message>` value comes directly from the Stackby API response when the error originates there.
