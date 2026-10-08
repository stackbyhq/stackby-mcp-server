# API Coverage Report — Stackby MCP Server

This document tracks every `/api/v1/mcp/*` endpoint defined in the Stackby backend (`v1/app.js`) and shows whether the MCP server currently calls it, partially uses it, or has not implemented it yet.

**Last updated:** October 2026  
**Backend source:** `Stackby_API/v1/app.js`  
**MCP client source:** `stackby-mcp-server/src/stackby-api.ts`

---

## Summary

| Category | Count |
|---|---|
| ✅ In use — fully called by MCP server | 22 |
| ⚠️ Partial — endpoint exists, some methods not used | 3 |
| ❌ Not in use — endpoint exists in backend, no MCP tool calls it | 8 |
| **Total backend endpoints** | **33** |

---

## ✅ In Use — Fully Called

These endpoints are actively called by at least one MCP tool via `stackby-api.ts`.

| # | Method(s) | Endpoint | Called By (stackby-api.ts function) | MCP Tool(s) |
|---|---|---|---|---|
| 1 | GET | `/api/v1/mcp/workspaces` | `getWorkspaces()` | `list_workspaces`, `list_stacks` |
| 2 | POST | `/api/v1/mcp/stacks` | `getStacks()` | `list_stacks` |
| 3 | POST | `/api/v1/mcp/stacks/create` | `createStack()` | `create_stack` |
| 4 | GET | `/api/v1/mcp/stacks/:stackId/tables` | `getTables()` | `list_tables` |
| 5 | GET, PATCH, DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId` | `describeTable()`, `updateTable()`, `deleteTable()` | `describe_table`, `update_table`, `delete_table` |
| 6 | POST | `/api/v1/mcp/stacks/:stackId/tables` | `createTable()` | `create_table` |
| 7 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns` | `getTableColumns()` | `search_records` (auto-resolves first column) |
| 8 | PATCH, DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | `updateColumn()`, `deleteColumn()` | `update_field`, `delete_field` |
| 9 | POST | `/api/v1/mcp/columns` | `createColumn()` | `create_field` |
| 10 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` | `getTableViewList()` | `list_views`, `create_field` (auto-resolve viewId) |
| 11 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` | `createView()` | `create_view` |
| 12 | PATCH | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | `renameView()` | `rename_view` |
| 13 | DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | `deleteView()` | `delete_view` |
| 14 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | `getRowList()` | `list_records` |
| 15 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | `createRow()` | `create_record` |
| 16 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update` | `updateRows()` | `update_records`, `update_records_for_table` |
| 17 | GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId` | `getRecord()` | `get_record` |
| 18 | DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | `deleteRows()` | `delete_records` |
| 19 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/search` | `searchRecords()` | `search_records` |
| 20 | POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` | `createRecordComment()` | `create_record_comment` |
| 21 | GET | `/api/v1/mcp/stacks/:stackId/automations` | `getAutomations()` | `list_automations` |
| 22 | POST | `/api/v1/mcp/stacks/:stackId/automations` | `createAutomation()` | `create_automation` |
| 23 | GET | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | `getAutomation()` | `get_automation` |
| 24 | PATCH | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | `updateAutomation()` | `update_automation` |
| 25 | DELETE | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | `deleteAutomation()` | `delete_automation` |
| 26 | POST | `/api/v1/mcp/stacks/:stackId/automation-workflows/:action` | `mcpAutomationWorkflowAction()` | `automation_workflow_action` |
| 27 | POST | `/api/v1/mcp/stacks/:stackId/automation-triggers/:action` | `mcpAutomationTriggerAction()` | `automation_trigger_action`, `add_automation_trigger` |
| 28 | POST | `/api/v1/mcp/stacks/:stackId/automation-actions/:action` | `mcpAutomationActionAction()` | `automation_action_action`, `add_automation_action` |
| 29 | POST | `/api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action` | `mcpDashboardAction()` | `dashboard_action` |
| 30 | POST | `/api/v1/mcp/stacks/:stackId/block-actions/:id/:action` | `mcpBlockAction()` | `block_action` |

---

## ⚠️ Partial — Some HTTP Methods Not Used

These endpoints support multiple HTTP methods, but only a subset are currently called by the MCP server.

| # | Endpoint | All Backend Methods | Called Methods | Missing Methods | Notes |
|---|---|---|---|---|---|
| 1 | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | GET, PATCH, DELETE | PATCH, DELETE | **GET** | No MCP tool fetches a single column by ID. Column IDs are obtained from `describe_table` (which returns all fields) rather than individual column fetches. |
| 2 | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` | GET, POST | POST | **GET** | No MCP tool lists existing comments on a record — only creating new ones is supported. |
| 3 | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | GET, PATCH, DELETE | PATCH, DELETE | **GET** | No MCP tool fetches a single view by ID. View IDs are obtained from `list_views` and used directly. |

---

## ❌ Not in Use — Backend Endpoint Exists, No MCP Tool Calls It

These endpoints exist in `v1/app.js` with `devapi` authentication but have no corresponding function in `stackby-api.ts` and no MCP tool that calls them.

| # | Endpoint | Controller | What It Does | Why Not Implemented |
|---|---|---|---|---|
| 1 | `/api/v1/mcp/stacks/:stackId/apps` | `controller.mcp.appCreate` | Create or manage apps (interface-level feature) within a stack | Apps/Interfaces are a distinct Stackby UI feature not yet exposed to AI clients via MCP tools |
| 2 | `/api/v1/mcp/stacks/:stackId/interfaces` | `controller.mcp.interfaceCreate` | Create or list interfaces in a stack | Same as above — Interface management not yet implemented in MCP tool layer |
| 3 | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/layouts` | `controller.mcp.interfaceLayoutCreate` | Create or manage layouts within an interface | Dependent on `interfaces` — not yet implemented |
| 4 | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages` | `controller.mcp.interfacePageCreate` | Create or list pages in an interface | Dependent on `interfaces` — not yet implemented |
| 5 | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId` | `controller.mcp.interfacePage` | Get, update, or delete a specific interface page | Dependent on `interfaces` — not yet implemented |
| 6 | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId/components` | `controller.mcp.interfaceComponents` | List or create components on a page | Dependent on `interfaces` — not yet implemented |
| 7 | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId/components/:componentId` | `controller.mcp.interfaceComponentById` | Get, update, or delete a specific page component | Dependent on `interfaces` — not yet implemented |
| 8 | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId/components/:componentId` | `controller.mcp.interfaceComponentById` | Manage individual component by ID | Dependent on `interfaces` — not yet implemented |

> **Note:** All 7 unimplemented endpoints belong to the **Interfaces** feature group — a Stackby product feature that allows building custom app-like interfaces on top of stacks. This entire group can be implemented together as a single future milestone.

---

## Missing Methods Detail

### GET `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId`

```
What it returns:  Single column definition with full typeOptions
Why add it:       Useful for inspecting a specific column's configuration
                  (e.g., formula text, link target, option list)
                  without fetching the full table schema
Effort:           Low — one new stackby-api.ts function + one MCP tool (get_field)
```

### GET `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments`

```
What it returns:  List of all comments on a record
Why add it:       Allows AI clients to read discussion/annotation history on a row
Effort:           Low — one new stackby-api.ts function + one MCP tool (list_record_comments)
```

### GET `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId`

```
What it returns:  Full view definition (filters, sorts, groupings, column visibility)
Why add it:       Allows AI clients to inspect a specific view's configuration
Effort:           Low — one new stackby-api.ts function + one MCP tool (get_view)
```

---

## Roadmap: Unimplemented Endpoint Groups

### 🔵 Quick Wins (Low Effort, High Value)

These 3 missing GET methods each require only ~10 lines in `stackby-api.ts` and a small tool registration in `mcp-server.ts`:

| Priority | New Tool | Endpoint | Effort |
|---|---|---|---|
| P1 | `get_field` | GET `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | 1–2 hours |
| P2 | `list_record_comments` | GET `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` | 1–2 hours |
| P3 | `get_view` | GET `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | 1–2 hours |

### 🟡 Larger Milestone: Interfaces Feature (7 endpoints)

Implementing the full Interfaces feature group requires designing 7 new MCP tools that mirror the backend's capabilities. Suggested tool names:

| New MCP Tool | Backend Endpoint |
|---|---|
| `create_interface` | POST `/api/v1/mcp/stacks/:stackId/interfaces` |
| `create_interface_layout` | POST `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/layouts` |
| `create_interface_page` | POST `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages` |
| `get_interface_page` | GET `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId` |
| `update_interface_page` | PATCH `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId` |
| `list_page_components` | GET `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId/components` |
| `create_page_component` | POST `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId/components` |
| `get_page_component` | GET `.../components/:componentId` |
| `update_page_component` | PATCH `.../components/:componentId` |
| `delete_page_component` | DELETE `.../components/:componentId` |
| `create_app` | POST `/api/v1/mcp/stacks/:stackId/apps` |

Also note the Interfaces endpoint `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/layouts` implies a layout creation but no GET/PATCH/DELETE for individual layout IDs exists in the current backend — these would need to be added to `v1/app.js` first before the MCP tools can be built.

---

## Complete Endpoint Reference

Quick-lookup table of every `/api/v1/mcp/*` endpoint with its MCP status.

| Method | Endpoint | Status |
|---|---|---|
| GET | `/api/v1/mcp/workspaces` | ✅ In use |
| POST | `/api/v1/mcp/stacks` | ✅ In use |
| POST | `/api/v1/mcp/stacks/create` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/tables` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId` | ✅ In use |
| PATCH | `/api/v1/mcp/stacks/:stackId/tables/:tableId` | ✅ In use |
| DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId` | ✅ In use |
| POST | `/api/v1/mcp/columns` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | ⚠️ Partial (PATCH, DELETE only) |
| PATCH | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | ✅ In use |
| DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | ⚠️ Partial (PATCH, DELETE only) |
| PATCH | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | ✅ In use |
| DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId` | ✅ In use |
| DELETE | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/search` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` | ⚠️ Partial (POST only) |
| GET | `/api/v1/mcp/stacks/:stackId/automations` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/automations` | ✅ In use |
| GET | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | ✅ In use |
| PATCH | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | ✅ In use |
| DELETE | `/api/v1/mcp/stacks/:stackId/automations/:automationId` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/automation-workflows/:action` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/automation-triggers/:action` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/automation-actions/:action` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/block-actions/:id/:action` | ✅ In use |
| POST | `/api/v1/mcp/stacks/:stackId/apps` | ❌ Not in use |
| POST | `/api/v1/mcp/stacks/:stackId/interfaces` | ❌ Not in use |
| POST | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/layouts` | ❌ Not in use |
| POST | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages` | ❌ Not in use |
| GET, PATCH, DELETE | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId` | ❌ Not in use |
| GET, POST | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId/components` | ❌ Not in use |
| GET, PATCH, DELETE | `/api/v1/mcp/stacks/:stackId/interfaces/:interfaceId/pages/:pageId/components/:componentId` | ❌ Not in use |
