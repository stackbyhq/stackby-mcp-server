# Requirements Document

## Introduction

This document defines the requirements for comprehensive technical documentation of the Stackby MCP Server project. The Stackby MCP Server is a Model Context Protocol (MCP) server that exposes Stackby's spreadsheet/database platform to AI clients (Cursor, Claude Desktop, Cline, ChatGPT). The documentation must cover the project architecture, all MCP tools (36 total), the full API layer backed by `v1/app.js` endpoints under `/api/v1/mcp/*`, the request lifecycle, authentication model, and the reasoning behind each API call.

The documentation is intended for:
- Developers integrating with or extending the MCP server
- Stackby platform engineers maintaining the MCP API layer
- AI/LLM tool builders who want to understand how each tool maps to Stackby's data model

---

## Glossary

- **MCP**: Model Context Protocol — an open standard for connecting AI clients to external tools and data sources.
- **MCP_Server**: The Node.js/TypeScript server in this repository that implements MCP over stdio and HTTP.
- **MCP_Tool**: A named, schema-validated function registered with the MCP server and callable by AI clients.
- **Stackby_API**: The backend REST API served by `v1/app.js` at `/api/v1/mcp/*`, which the MCP_Server calls on behalf of users.
- **Stack**: Stackby's top-level data container, equivalent to a database or spreadsheet workbook.
- **Table**: A sheet/grid within a Stack, containing rows and columns.
- **Record**: A row in a Table.
- **Field**: A column definition in a Table, with a type (shortText, number, link, formula, etc.).
- **View**: A named, filtered/sorted perspective on a Table (grid, kanban, gallery, calendar, form).
- **Workspace**: An organisational container that holds Stacks; maps to a team or project space.
- **Automation**: An event-driven or scheduled workflow within Stackby.
- **Dashboard**: A Stackby dashboard container that holds visual Blocks.
- **Block**: A widget (chart, summary, pivot table, etc.) placed on a Dashboard.
- **Transport**: The communication channel between the MCP_Server and an AI client — either stdio or StreamableHTTP.
- **devapi**: The authentication mode used for all `/api/v1/mcp/*` endpoints; verified via `x-api-key` or `Authorization: Bearer` header.
- **Request_Context**: Per-request AsyncLocalStorage store in HTTP mode that holds the caller's API key, bearer token, and API base URL.
- **Stack_Template**: A declarative table/column/row structure passed at stack creation time; applied either server-side or client-side by `stack-template.ts`.
- **Block_App_Spec**: A registry entry mapping block type names and aliases to their canonical type string and required creation keys.

---

## Requirements

### Requirement 1: Project Overview and Architecture Documentation

**User Story:** As a developer integrating with the Stackby MCP Server, I want a clear project overview and architecture description, so that I understand the system's structure, entry points, and component responsibilities before reading detailed API documentation.

#### Acceptance Criteria

1. THE Documentation SHALL describe the two distinct entry points: `src/index.ts` for stdio transport (Cursor, Claude Desktop) and `src/server-http.ts` for HTTP transport (ChatGPT, hosted mode at `mcp.stackby.com`), stating the transport protocol each entry point uses and which AI clients are supported by each.
2. THE Documentation SHALL explain the stateless one-server-per-request model in HTTP mode, where a fresh `McpServer` and `StreamableHTTPServerTransport` are created for every POST to `/mcp`.
3. THE Documentation SHALL list all seven source files (`index.ts`, `server-http.ts`, `mcp-server.ts`, `stackby-api.ts`, `request-context.ts`, `stack-template.ts`, `block-app-specs.ts`) with a one-sentence description of each file's responsibility.
4. THE Documentation SHALL include a component description listing each layer in sequence with its label: AI Client → MCP Transport (stdio or StreamableHTTP) → MCP_Server tool handlers (`mcp-server.ts`) → Stackby API client (`stackby-api.ts`) → Stackby backend REST endpoints (`/api/v1/mcp/*`), specifying for each layer what it receives as input and what it produces as output.
5. THE Documentation SHALL describe the build system: TypeScript compiled with `tsc`, output to `dist/`, run via `npm start` (stdio) or `npm run start:http` (HTTP).
6. THE Documentation SHALL list `@modelcontextprotocol/sdk` and `zod` as the only production runtime dependencies, and SHALL state the minimum Node.js engine version requirement (>=18).

### Requirement 2: Authentication Model Documentation

**User Story:** As a developer configuring the MCP server for a client, I want precise documentation of the authentication model, so that I can correctly configure API keys and understand how credentials flow from client to Stackby's backend.

#### Acceptance Criteria

1. THE Documentation SHALL state, for each of the two supported credentials, its name, the transport mode it applies to, and the exact header or environment variable used to supply it: `STACKBY_API_KEY` set via environment variable for stdio transport and via `x-api-key` request header for HTTP transport; `STACKBY_BEARER_TOKEN` supplied via the `Authorization: Bearer <token>` request header.
2. THE Documentation SHALL state that in HTTP mode credentials are extracted per-request from the `X-Stackby-API-Key` or `Authorization: Bearer` header, stored in `AsyncLocalStorage` scoped to that request, and that each concurrent request therefore reads only its own credentials.
3. WHEN a POST request reaches `/mcp` without any credential header, THE Documentation SHALL state that the server responds with HTTP 401 and a JSON body containing an error message field before any MCP processing occurs.
4. THE Documentation SHALL state the credential resolution priority rule: a per-request HTTP credential takes precedence over the `STACKBY_API_KEY` environment variable, and SHALL state that this allows the same server binary to serve both stdio and hosted HTTP clients simultaneously.
5. THE Documentation SHALL state that the `STACKBY_API_URL` environment variable and the `X-Stackby-API-URL` request header each override the default base URL `https://stackby.com`, and SHALL specify that the per-request header value takes precedence over the environment variable when both are present.
6. THE Documentation SHALL state that every outbound Stackby backend API call includes both the `x-api-key` header and the `Authorization: Bearer` header, each populated with the resolved API key value.

### Requirement 3: HTTP Server and Transport Layer Documentation

**User Story:** As a platform engineer deploying the hosted MCP endpoint, I want documentation of the HTTP server routes, error handling, and OAuth proxy behavior, so that I can configure load balancers, debug failures, and understand the security model.

#### Acceptance Criteria

1. THE Documentation SHALL document all HTTP routes served by `server-http.ts`: `GET /health` (ALB health check), `POST /mcp` and `GET /mcp` (MCP protocol), `GET /.well-known/oauth-authorization-server` and `GET /mcp/.well-known/oauth-authorization-server` (OAuth discovery), `GET /oauth/authorize` (redirect proxy to `stackby.com`), and `POST /oauth/token` (proxy to `https://stackby.com/api/oauth/token`).
2. THE Documentation SHALL explain that the POST body is read and parsed once before the SDK transport is created, and the pre-parsed body is passed to `transport.handleRequest`, preventing stream re-read errors after the body has been consumed.
3. WHEN a POST `/mcp` request body is empty or contains invalid JSON, THE Documentation SHALL state the server returns HTTP 400 with a JSON-RPC parse error (`code: -32700`) without forwarding to the MCP handler.
4. WHEN the MCP handler throws an unhandled error, THE Documentation SHALL state the server returns HTTP 500 with a JSON body containing `error`, `name`, `message`, and `stack` fields, and also sets the `X-MCP-Error` response header to a URL-encoded excerpt of the error message (truncated to 200 characters).
5. THE Documentation SHALL explain the `PORT` environment variable (default `3001`) and the PM2 deployment commands (`npm run pm2:start`, `npm run pm2:restart`, `npm run pm2:stop`).
6. THE Documentation SHALL document the OAuth 2.0 metadata response shape returned by the well-known endpoint, listing all fields: `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `response_types_supported`, `grant_types_supported`, `token_endpoint_auth_methods_supported`, `code_challenge_methods_supported`, and `scopes_supported`.
7. THE Documentation SHALL state the behavior for unauthenticated POST `/mcp` requests: the server returns HTTP 401 with a JSON error body before the MCP transport is initialized, and the 401 response body includes an `error` field containing a human-readable message.

### Requirement 4: MCP API Endpoint Reference (Stackby Backend)

**User Story:** As a Stackby platform engineer, I want a complete reference of every `/api/v1/mcp/*` endpoint declared in `v1/app.js`, so that I understand what each endpoint does, which HTTP methods it accepts, and how it is authenticated.

#### Acceptance Criteria

1. THE Documentation SHALL list every MCP route from `v1/app.js`. For each route entry, the documentation SHALL include: the exact path pattern (e.g. `/api/v1/mcp/stacks/:stackId/tables`), the HTTP method(s) accepted, the authentication mode (`devapi` — verified via `x-api-key` or `Authorization: Bearer` header), any path parameters (e.g. `:stackId`, `:tableId`), the required request body fields (if any), and a one-sentence description of what the endpoint does.
2. THE Documentation SHALL document the workspace and stack discovery endpoints: `GET /api/v1/mcp/workspaces` (list workspaces) and `POST /api/v1/mcp/stacks` (list stacks in a workspace) and `POST /api/v1/mcp/stacks/create` (create a new stack).
3. THE Documentation SHALL document the table management endpoints: `GET /api/v1/mcp/stacks/:stackId/tables` (list tables), `POST /api/v1/mcp/stacks/:stackId/tables` (create table), `GET /api/v1/mcp/stacks/:stackId/tables/:tableId` (describe table with fields and views), `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId` (update table), and `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId` (delete table).
4. THE Documentation SHALL document the column management endpoints: `POST /api/v1/mcp/columns` (create column), `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` (update column), and `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId` (delete column).
5. THE Documentation SHALL document the row (record) CRUD endpoints: `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows` (list rows with pagination/filter, supported query parameters: `page`, `pageSize`, `filterByFormula`, `sortBy`), `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows` (create row), `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update` (batch update rows), `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId` (get single row), `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/rows` (soft-delete rows by query param `rowIds` — rows are marked deleted and excluded from future queries but not permanently removed), and `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/search` (full-text search).
6. THE Documentation SHALL document the view management endpoints: `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views` (list views), `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/views` (create view), `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` (rename/update view), and `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId` (soft-delete view — view is inaccessible via listing/retrieval but data is retained).
7. THE Documentation SHALL document the automation endpoints: `GET /api/v1/mcp/stacks/:stackId/automations` (list), `POST /api/v1/mcp/stacks/:stackId/automations` (create with trigger and actions), `GET /api/v1/mcp/stacks/:stackId/automations/:automationId` (get details), `PATCH /api/v1/mcp/stacks/:stackId/automations/:automationId` (update metadata), `DELETE /api/v1/mcp/stacks/:stackId/automations/:automationId` (delete), and the advanced passthrough routes for `automation-workflows`, `automation-triggers`, and `automation-actions` (all POST with `/:action`, forwarding the request body as-is without transformation, with valid `:action` values enumerated for each route).
8. THE Documentation SHALL document the dashboard and block endpoints: `POST /api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action` (create, update, getblocks, positionupdate, move) and `POST /api/v1/mcp/stacks/:stackId/block-actions/:id/:action` (create, update, duplicate, move).
9. THE Documentation SHALL document the record comment endpoint: `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments` (add a comment to a record).

### Requirement 5: MCP Tool Catalog — Read Operations

**User Story:** As a developer using AI clients to query Stackby data, I want documentation of every read-oriented MCP tool, so that I know what inputs each tool accepts, what Stackby API endpoint it calls, and what the tool returns.

#### Acceptance Criteria

1. THE Documentation SHALL document `list_workspaces`: calls `GET /api/v1/mcp/workspaces`, requires no input, returns a formatted list of workspace names and IDs; IF the API call fails, THEN the tool returns an error message with `isError: true`.
2. THE Documentation SHALL document `list_stacks`: accepts optional `workspaceId`; calls `POST /api/v1/mcp/stacks` for a specific workspace or iterates all workspaces via `getAllStacks()`; returns stack names, IDs, and workspace association; when no `workspaceId` is provided, truncates output at 200 stacks and appends a message to the output indicating truncation occurred; IF the API call fails, THEN the tool returns an error message with `isError: true`.
3. THE Documentation SHALL document `list_tables`: accepts required `stackId`; calls `GET /api/v1/mcp/stacks/:stackId/tables`; returns table names and IDs; IF the API call fails, THEN the tool returns an error message with `isError: true`.
4. THE Documentation SHALL document `describe_table`: accepts required `stackId` and `tableId`; calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId`; returns table name, field list (each entry includes id, name, and type), and view list (each entry includes id and name); IF the API call fails, THEN the tool returns an error message with `isError: true`.
5. THE Documentation SHALL document `list_views`: accepts required `stackId` and `tableId`; calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views`; returns view names, IDs, and types; IF the API call fails, THEN the tool returns an error message with `isError: true`.
6. THE Documentation SHALL document `list_records`: accepts required `stackId` and `tableId`, and optional `maxRecords` (integer, clamped to [1, 100]), `offset` (integer, clamped to [0, ∞)), `rowIds`, `view`, `filter`, `sort`, `filterByFormula`, and `conjuction` (note: spelled with one 'n' — this is the canonical parameter name); calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows` with the supplied query parameters; returns up to 100 records per call; IF the API call fails, THEN the tool returns an error message with `isError: true`.
7. THE Documentation SHALL document `search_records`: accepts required `stackId`, `tableId`, and `searchTerm`, optional `fieldIds` array, and optional `maxRecords`; calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views` first to resolve the first column ID when `fieldIds` is not provided (only the first resolved column is used as the search field), then calls `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/search`; returns matching row IDs and row names; IF the views call or search call fails, THEN the tool returns an error message with `isError: true`.
8. THE Documentation SHALL document `get_record`: accepts required `stackId`, `tableId`, and `recordId`; calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId`; returns the record's field values as JSON; IF the API call returns a non-2xx status, THEN the tool returns an error message with `isError: true`; IF the record does not exist, THEN the tool returns the API response body without setting `isError: true`.
9. THE Documentation SHALL document `list_automations`: accepts required `stackId`; calls `GET /api/v1/mcp/stacks/:stackId/automations`; returns the raw API response as pretty-printed JSON; IF the API call fails, THEN the tool returns an error message with `isError: true`.
10. THE Documentation SHALL document `get_automation`: accepts required `stackId` and `automationId`; calls `GET /api/v1/mcp/stacks/:stackId/automations/:automationId`; returns the raw API response as pretty-printed JSON; IF the API call fails, THEN the tool returns an error message with `isError: true`.
11. THE Documentation SHALL document `list_automation_capabilities`: accepts no input; returns a formatted catalog of all supported trigger type codes and action type codes with parameter examples, without calling any external API.

### Requirement 6: MCP Tool Catalog — Write Operations (Records and Schema)

**User Story:** As a developer using AI clients to create and modify Stackby data, I want documentation of every write-oriented MCP tool for records and schema, so that I understand the exact inputs, API calls, and validation rules for each operation.

#### Acceptance Criteria

1. THE Documentation SHALL document `create_record`: accepts `stackId`, `tableId`, and `fields` (object or JSON string); calls `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows` with body `{ records: [{ field: fields }] }`; returns the created record's ID and all field values as set by the API; IF `stackId`, `tableId`, or `fields` is missing or invalid, THEN THE Documentation SHALL specify that the tool returns an error indicating the invalid or missing parameter without creating a record.

2. THE Documentation SHALL document `update_records`: accepts `stackId`, `tableId`, and `records` (array of `{ id, fields }`, minimum 1 and maximum 10 items); calls `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update` with body `{ records: [{ id, field }] }`; returns the full updated field values for each updated record; enforces a hard limit of 10 records per call; IF the `records` array is empty or contains more than 10 items, THEN THE Documentation SHALL specify that the tool returns an error indicating the constraint violation without modifying any records.

3. THE Documentation SHALL document `update_records_for_table` as an alias of `update_records`, accepting the same parameters, enforcing the same minimum 1 and maximum 10 record constraint, making the same API call, and returning the same response structure, such that the documented behavior is identical in all respects to `update_records`.

4. THE Documentation SHALL document `delete_records`: accepts `stackId`, `tableId`, and `recordIds` (array of record ID strings, minimum 1 and maximum 10 items); calls `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/rows?rowIds=...`; performs a soft-delete, meaning records are marked as deleted and no longer returned by read operations but are not permanently purged; enforces a hard limit of 10 IDs per call; IF the `recordIds` array is empty or contains more than 10 items, THEN THE Documentation SHALL specify that the tool returns an error indicating the constraint violation without deleting any records.

5. THE Documentation SHALL document `create_table`: accepts `stackId` and `name` (non-empty string, maximum 255 characters); calls `POST /api/v1/mcp/stacks/:stackId/tables`; returns the new table's ID and name; IF `stackId` is invalid or `name` is empty or exceeds 255 characters, THEN THE Documentation SHALL specify that the tool returns an error indicating the invalid parameter without creating a table.

6. THE Documentation SHALL document `update_table`: accepts `stackId`, `tableId`, and at least one of the optional fields `name` (non-empty string, maximum 255 characters) or `description` (string, maximum 1000 characters); calls `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId`; IF neither `name` nor `description` is provided, THEN THE Documentation SHALL specify that the tool returns an error indicating that at least one updatable field is required, without modifying the table; IF `stackId` or `tableId` is invalid, THEN THE Documentation SHALL specify that the tool returns an error indicating the invalid parameter.

7. THE Documentation SHALL document `delete_table`: accepts `stackId` and `tableId`; calls `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId`; permanently deletes the table and all of its records, views, and associated data; returns a confirmation that the table was deleted; IF `stackId` or `tableId` is invalid, THEN THE Documentation SHALL specify that the tool returns an error indicating the invalid parameter without deleting any data.

8. THE Documentation SHALL document `create_record_comment`: accepts `stackId`, `tableId`, `recordId`, `text` (non-empty string, maximum 2000 characters), and optional `attachment` and `cellValue`; calls `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId/comments`; returns the created comment's ID and timestamp; IF `stackId`, `tableId`, `recordId`, or `text` is missing or invalid, THEN THE Documentation SHALL specify that the tool returns an error indicating the invalid or missing parameter without creating a comment.

### Requirement 7: MCP Tool Catalog — Field (Column) Management

**User Story:** As a developer building schemas via AI clients, I want documentation of every field management tool, so that I understand the supported column types, required parameters for each type, and how the server derives and sets `typeOptions` when creating columns.

#### Acceptance Criteria

1. THE Documentation SHALL document `create_field` with all input parameters: `stackId`, `tableId`, `name`, `columnType` (all required), optional `viewId`, `options` (for singleOption/multipleOptions), `linkToTableId` and `linkToTableViewId` (for link), `formulaText` (for formula and aggregation/rollup), `linkColumnId` and `linkedColumnId` (for lookup, lookupCount, aggregation), specifying that `stackId`, `tableId`, `name`, and `columnType` are required and all other parameters are conditionally required based on `columnType`.
2. THE Documentation SHALL list all 39 supported column types from `COLUMN_TYPES` (e.g. `shortText`, `longText`, `number`, `checkbox`, `dateAndTime`, `singleOption`, `multipleOptions`, `email`, `url`, `link`, `formula`, `lookup`, `lookupCount`, `aggregation`, `autoNumber`, `barcode`, `signature`, `ai`, `multipleAttachment`, and others) and note the alias mapping (e.g. `rollup` → `aggregation`, `date` → `dateAndTime`, `text` → `shortText`, `dropdown` → `singleOption`), specifying that alias values are accepted as input to `columnType` and are normalized to their canonical form before processing.
3. THE Documentation SHALL explain that `create_field`, when `viewId` is not provided, calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views` first to resolve the first view ID from the response, then calls `POST /api/v1/mcp/columns` with the resolved `viewId`; and that if the views endpoint returns no views or fails, `create_field` returns an error indicating that a valid view could not be resolved.
4. WHEN `columnType` is `link` and `linkToTableId` is not provided, THE Documentation SHALL state that `create_field` returns an error indicating the missing required parameter without calling any API.
5. WHEN `columnType` is `formula` or `aggregation` and `formulaText` is not provided, THE Documentation SHALL state that `create_field` returns an error indicating the missing required parameter, and that for `aggregation` the error message identifies the 14 valid aggregation formula strings listed in criterion 6.
6. THE Documentation SHALL list the 14 valid aggregation formula strings: `MIN(values)`, `MAX(values)`, `SUM(values)`, `AVERAGE(values)`, `COUNT(values)`, `COUNTA(values)`, `COUNTALL(values)`, `AND(values)`, `OR(values)`, `XOR(values)`, `ARRAYJOIN(values)`, `ARRAYUNIQUE(values)`, `ARRAYCOMPACT(values)`, `ARRAYFLATTEN(values)`, and specify that any `formulaText` value not matching one of these 14 strings exactly (case-sensitive) when `columnType` is `aggregation` causes `create_field` to return an error before calling any API.
7. THE Documentation SHALL document `update_field`: accepts `stackId`, `tableId`, `columnId` as required parameters, and optional `name` (string, 1–255 characters), `description` (string, 0–1000 characters), `type` (one of the 39 canonical column types), and a raw `body` object containing additional type-specific fields; calls `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId`; and that if `stackId`, `tableId`, or `columnId` does not identify an existing resource, the tool returns an error indicating which identifier was not found.
8. THE Documentation SHALL document `delete_field`: accepts `stackId`, `tableId`, `columnId` as required parameters; calls `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/columns/:columnId`; and that if `stackId`, `tableId`, or `columnId` does not identify an existing resource, the tool returns an error indicating which identifier was not found.
9. IF the Stackby API returns an error response for any `create_field`, `update_field`, or `delete_field` call, THEN THE Documentation SHALL state that the tool surfaces the API error message to the caller unchanged and does not perform any retry.

### Requirement 8: MCP Tool Catalog — View Management

**User Story:** As a developer managing table views via AI clients, I want documentation of every view management tool, so that I know how to create, rename, and delete views and what parameters each tool accepts.

#### Acceptance Criteria

1. THE Documentation SHALL document `create_view`: accepts required `stackId`, `tableId`, and `name` (1–255 characters), and optional `type` (grid/kanban/gallery/calendar/form, default grid), `copyMode` (new or duplicate), `copyViewId` (required when `copyMode` is `duplicate`), `sequenceViewId`, `filters`, `groupLevels`, and `description` (0–500 characters); calls `POST /api/v1/mcp/stacks/:stackId/tables/:tableId/views`; returns the created view object including the new `viewId`.
2. THE Documentation SHALL document `rename_view`: accepts required `stackId`, `tableId`, `viewId`, and `name` (1–255 characters), and optional `description` (0–500 characters); calls `PATCH /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId`; returns the updated view object.
3. THE Documentation SHALL document `delete_view`: accepts required `stackId`, `tableId`, `viewId`; calls `DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/views/:viewId`; performs a soft-delete (the view is no longer accessible via listing or retrieval but the underlying data is retained and recoverable by admins); returns a confirmation containing the deleted `viewId`.
4. IF any view management tool receives a missing required parameter, an invalid parameter value, or a `stackId`/`tableId`/`viewId` that does not identify an existing resource, THEN THE Documentation SHALL specify that the tool returns an error response describing the reason, without modifying any state.

### Requirement 9: MCP Tool Catalog — Stack Creation and Templating

**User Story:** As a developer creating new Stackby stacks via AI clients, I want documentation of the `create_stack` tool and the Stack Template system, so that I understand how to create stacks with pre-built table structures including columns, links, formulas, and seed rows.

#### Acceptance Criteria

1. THE Documentation SHALL document `create_stack`: accepts `workspaceId`, `name`, optional `color`, `icon`, and optional `tables` array (declarative template); calls `POST /api/v1/mcp/stacks/create`; and states that on success the tool returns the new stack's ID and name.
2. THE Documentation SHALL explain the two-path template application: server-side (when the backend accepts `tables` in the create payload and returns a successful response) and client-side fallback via `applyStackTemplate()` in `stack-template.ts` when the server returns an error indicating the `tables` field is unsupported, with the client-side path creating each table, column, and row by issuing individual API calls.
3. THE Documentation SHALL explain the four-phase column creation order in `stack-template.ts`: (1) base types created first; (2) `link` columns created next so foreign table IDs are available; (3) `formula` columns created after base and link columns exist so they can reference those columns; (4) `lookup`, `lookupCount`, and `aggregation` columns created last because they require link column IDs to already exist.
4. THE Documentation SHALL explain the topological sort in `sortTableIndicesByLinkDependencies()`: tables that are link targets are created before tables that hold the link column, ensuring that when a link column is created the target table ID is already known; and that circular link dependencies are not supported.
5. THE Documentation SHALL explain the `rowKey` and `__linkRowKeys`/`__linkRowKey` system: a row may declare a stable `rowKey` string, and subsequent rows in the same template can reference that key in `__linkRowKeys` or `__linkRowKey` to create a linked-record relationship using the row name rather than the row's API-assigned ID; and that the MCP server resolves these keys to row IDs during template application.
6. THE Documentation SHALL document the `key` field on template table definitions as a stable, unique identifier used to resolve `linkToTableKey` references in column definitions, distinct from the table's display name, so that column cross-references remain valid even if the table's display name changes.

### Requirement 10: MCP Tool Catalog — Automation Management

**User Story:** As a developer building automated workflows via AI clients, I want documentation of every automation tool, so that I understand how to create triggers, add action steps, and use the advanced passthrough tools for complex automation configurations.

#### Acceptance Criteria

1. THE Documentation SHALL document `create_automation`: accepts required `stackId` (string) and `name` (string), optional `description` (string), `isTurnedOn` (boolean), `tableId` (string), `viewId` (string), a required `trigger` object with fields `triggerType` (string), `triggerParams` (object), `tableId` (string), and `description` (string), and an optional `actions` array of action objects; calls `POST /api/v1/mcp/stacks/:stackId/automations` in a single request; returns the created automation's ID and name; IF `stackId`, `name`, or `trigger` is missing or invalid, THEN the tool returns an error before calling the API.
2. THE Documentation SHALL document `update_automation`: accepts required `stackId` (string) and `automationId` (string), and a `body` patch object that may contain any of the following patchable fields: `name` (string), `description` (string), `isTurnedOn` (boolean), `tableId` (string), `viewId` (string); calls `PATCH /api/v1/mcp/stacks/:stackId/automations/:automationId`; returns the updated automation object; IF `stackId` or `automationId` is invalid, THEN the tool returns an error.
3. THE Documentation SHALL document `delete_automation`: accepts required `stackId` (string) and `automationId` (string); calls `DELETE /api/v1/mcp/stacks/:stackId/automations/:automationId`; returns a confirmation that the automation was deleted; IF `stackId` or `automationId` is invalid, THEN the tool returns an error.
4. THE Documentation SHALL document `add_automation_trigger`: accepts required `stackId` (string), `automationId` (string), and `triggerType` (string), and optional `triggerParams` (object), `tableId` (string), and `description` (string); calls `POST /api/v1/mcp/stacks/:stackId/automation-triggers/create`; returns the created trigger's ID; IF any required parameter is missing or invalid, THEN the tool returns an error before calling the API.
5. THE Documentation SHALL document `add_automation_action`: accepts required `stackId` (string), `automationId` (string), and `actionType` (string), and optional `actionParams` (object), `sequence` (positive integer indicating order of execution), and `description` (string); calls `POST /api/v1/mcp/stacks/:stackId/automation-actions/create`; returns the created action's ID; IF any required parameter is missing or invalid, THEN the tool returns an error before calling the API.
6. THE Documentation SHALL document the three advanced passthrough tools — `automation_workflow_action`, `automation_trigger_action`, `automation_action_action` — explaining that each accepts `stackId`, `automationId`, an `action` path segment, and a `body` payload, forwards the body as-is to the corresponding backend route (`automation-workflows`, `automation-triggers`, or `automation-actions`), and SHALL enumerate the valid `action` values accepted by each passthrough tool.
7. THE Documentation SHALL list all 6 trigger type codes with their names, descriptions, and at least one example showing all required `triggerParams` fields: `T_CR_ROW` (Row Created), `T_UP_ROW` (Row Updated), `SD_TIME` (Scheduled Time), `WH_RECV` (Webhook Received), `RW_COND` (Row Condition), `VM_ROW` (View Matched Row).
8. THE Documentation SHALL list all 11 action type codes with their names, descriptions, and at least one example showing all required `actionParams` fields: `CR_ROW` (Create Row), `UP_ROW` (Update Row), `FIND_ROW` (Find Row), `S_EMAIL` (Send Email), `WHATSAPP` (Send WhatsApp), `GMAIL` (Send via Gmail), `OUTLOOK` (Send via Outlook), `MS_TEAM` (Send to MS Teams), `SLACK` (Send to Slack), `SORT` (Sort Records), `AI_GEN` (AI Generate).

### Requirement 11: MCP Tool Catalog — Dashboard and Block Management

**User Story:** As a developer managing Stackby dashboards via AI clients, I want documentation of the `dashboard_action` and `block_action` tools, so that I understand how to create dashboards, add blocks, and configure block types.

#### Acceptance Criteria

1. THE Documentation SHALL document `dashboard_action`: accepts required `stackId`, `id` (dashboard ID), and `action` (one of: create/update/getblocks/positionupdate/move), and optional `body`; calls `POST /api/v1/mcp/stacks/:stackId/dashboard-actions/:id/:action`.
2. THE Documentation SHALL document `block_action`: accepts required `stackId`, `id` (block ID), and `action` (one of: create/update/duplicate/move), and optional `body`; calls `POST /api/v1/mcp/stacks/:stackId/block-actions/:id/:action`.
3. THE Documentation SHALL list all 18 supported block types from `block-app-specs.ts`: `Chart`, `Summary`, `Description`, `GoalTracker`, `Embed`, `RowCard`, `PivotTable`, `CountDown`, `TimeTracker`, `Search`, `PageDesigner`, `StackSchema`, `Record Overview`, `Map`, `UrlPreview`, `Datafetcher`, `Batchupdate`, and `vegalite`, including their accepted aliases (resolved case-insensitively).
4. THE Documentation SHALL explain the `normalizeBlockActionBody()` function: for `create` actions it transforms user-friendly input into the `blockFields` (JSON-stringified), `gridLayout`, and `linearLayout` fields required by the Stackby block API.
5. THE Documentation SHALL explain the `Summary` block special handling: when `type` is `Summary`, the server derives `summaryData` from individual fields (`tableId`, `viewId`, `columnId`, `summaryType`, `colorCode`, `label`, etc.) and JSON-serializes it into `blockFields`.
6. WHEN a `block_action create` request is missing a required key for the block type (e.g. `dashboardId`), THE Documentation SHALL state that `block_action` returns an error listing the missing fields before calling the Stackby API.

### Requirement 12: API Calling Flow and Request Lifecycle Documentation

**User Story:** As a developer debugging or extending the MCP server, I want documentation of the complete API calling flow from tool invocation to Stackby backend response, so that I can trace requests, identify failure points, and understand the data transformations applied at each layer.

#### Acceptance Criteria

1. THE Documentation SHALL describe the end-to-end request flow: AI Client sends JSON-RPC tool call → MCP Transport decodes it → `mcp-server.ts` handler fires → `withCamel()` normalizes snake_case keys → handler validates inputs → `stackby-api.ts` function called → HTTP request made to Stackby backend → response normalized → tool returns text content.
2. THE Documentation SHALL document the `camelCaseKeys()` and `withCamel()` wrapper: it converts any snake_case input key (e.g. `stack_id`) to camelCase (`stackId`) before the handler runs, allowing AI clients to use either convention; keys that are already camelCase are passed through unchanged.
3. THE Documentation SHALL document the `normalizeResponse()` function in `stackby-api.ts`: it unwraps a `{ data: T }` envelope when `body.data !== undefined`, otherwise treats the entire body as the payload, always producing a consistent `{ data: T }` shape consumed by all callers.
4. THE Documentation SHALL document the `authHeaders()` function: it returns an object containing `x-api-key` and `Authorization: Bearer` headers populated from the resolved credentials; it throws an error when called if neither `STACKBY_API_KEY` nor a per-request bearer token is available, causing the HTTP request to fail before it is dispatched.
5. THE Documentation SHALL document the `request<T>()` function: it constructs the full URL from base + path, merges auth headers, parses the JSON response, and throws a typed error with status code and message on non-2xx responses.
6. THE Documentation SHALL explain the error propagation pattern: `stackby-api.ts` throws `Error("Stackby API {status}: {message}")`, which the tool handler catches and returns as `{ content: [{ type: "text", text: "Failed to ..." }], isError: true }`.
7. THE Documentation SHALL document the two-step API call pattern used by `create_field` when no view ID is provided: first calls `GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views` to resolve the first available view ID, then calls the primary endpoint using that resolved view ID.

### Requirement 13: Input Validation and Input Normalization Documentation

**User Story:** As an AI tool builder using the MCP server, I want documentation of all input normalization and validation rules, so that I know which inputs are auto-corrected, which cause hard errors, and what formats are accepted.

#### Acceptance Criteria

1. THE Documentation SHALL document column type normalization via `normalizeColumnType()`: it maps a broad set of lowercase aliases and common names to their canonical API types (e.g. `rollup` → `aggregation`, `date` → `dateAndTime`, `dropdown` → `singleOption`, `text` → `shortText`, `multiselect` → `multipleOptions`, `attachment` → `multipleAttachment`); unknown types are passed through unchanged.
2. THE Documentation SHALL document the `options` field parsing in `create_field`: accepts a JSON array string (e.g. `"[\"A\",\"B\"]"`), a comma-separated string (e.g. `"A, B"`), or a native array; if the input is a string that parses as valid JSON but does not yield an array, the tool returns an error; always produces `string[]` on success.
3. THE Documentation SHALL document the `fields` field parsing in `create_record`: accepts either a JavaScript object or a JSON string; if a string is provided and JSON.parse fails or the parsed result is not a plain object, the tool returns an error message with `isError: true` without calling the API; otherwise the parsed object is passed to the API call.
4. THE Documentation SHALL document the block type normalization in `normalizeBlockAppType()` and `getBlockAppSpec()`: unknown types fall back to `Chart`; aliases are resolved case-insensitively against each block type's alias list.
5. THE Documentation SHALL document the Summary block `summaryType` normalization in `normalizeSummaryType()`: accepts case-insensitive variants with or without spaces (e.g. `"count filled"`, `"CountFilled"`, `"countfilled"`) and maps all to the canonical value; if the input does not match any known variant, the normalized value is an empty string.
6. THE Documentation SHALL state that `maxRecords` is clamped to the range [1, 100] before being sent to the Stackby backend, and that `offset` is clamped to [0, ∞); and that `pageSize`, when provided, is treated as an alias for `maxRecords` and subject to the same [1, 100] clamp.

### Requirement 14: Deployment and Configuration Guide Documentation

**User Story:** As a developer setting up the MCP server, I want a deployment and configuration reference, so that I can install, build, and run the server in both local and hosted modes with the correct environment variables.

#### Acceptance Criteria

1. THE Documentation SHALL document all environment variables: `STACKBY_API_KEY` (API key or PAT, required for stdio mode; also accepted for HTTP mode when no per-request header is present), `STACKBY_BEARER_TOKEN` (alternative bearer token, per-request for HTTP mode), `STACKBY_API_URL` (override base URL, default `https://stackby.com`), and `PORT` (HTTP server port, default 3001).
2. THE Documentation SHALL document the three ways to install and run: `npx stackby-mcp-server` (one-click for Cursor without a global install), `npm install -g stackby-mcp-server` (global install), and local build from source (`npm install && npm run build && npm start`); and shall specify that `npm run start:http` is used to launch the HTTP transport mode.
3. THE Documentation SHALL provide the exact Cursor `mcp.json` configuration block for stdio mode (command, args, env with `STACKBY_API_KEY`), for hosted HTTP mode (type `streamableHttp`, url `https://mcp.stackby.com/mcp`, headers with `X-Stackby-API-Key`), and for local HTTP testing (url `http://localhost:3001/mcp`).
4. THE Documentation SHALL provide the Claude Desktop `claude_desktop_config.json` configuration structure for stdio mode, noting that Claude Desktop uses stdio transport only and does not support the HTTP transport mode.
5. THE Documentation SHALL document the `list-workspaces.ts` utility script and its usage: run `npm run build && node dist/list-workspaces.js` with `STACKBY_API_KEY` set in the environment to verify API key validity and list available workspaces before configuring an AI client.
6. THE Documentation SHALL document the Docker support: the `Dockerfile` builds the server image and the default entrypoint runs stdio mode; to run HTTP mode via Docker, the entrypoint must be overridden to `node dist/server-http.js`; the `PORT` environment variable must be mapped via `-p` to expose the HTTP server.

### Requirement 15: Troubleshooting and Debugging Guide Documentation

**User Story:** As a developer encountering errors when using the MCP server, I want documentation of common failure modes and diagnostic steps, so that I can resolve configuration and connectivity problems without reading the source code.

#### Acceptance Criteria

1. THE Documentation SHALL document each failure mode with three components: the observable symptom the developer sees, the root cause of the failure, and the step-by-step fix the developer must apply.
2. THE Documentation SHALL document the "Error - Show Output" troubleshooting path in Cursor, covering the symptom (the MCP server entry shows an error state), the cause (the underlying Node.js process exited or threw), and the fix (navigating to Settings → MCP → stackby → Show Output to read the Node.js error message, then applying the corresponding fix from this guide).
3. THE Documentation SHALL document the "Missing auth credential" (HTTP 401) failure mode, specifying that the cause is an absent or incorrect API key in the MCP client configuration, and that the fix is adding `STACKBY_API_KEY` to the `env` block for stdio transport or adding the `X-Stackby-API-Key` header for HTTP transport.
4. THE Documentation SHALL document the "POST body empty or invalid JSON" (HTTP 400) failure mode, specifying that the cause is the MCP client sending a request to the `/mcp` endpoint with no body or with a body that is not valid JSON, and that the fix is verifying the MCP client is configured to send JSON-encoded request bodies as required by the MCP protocol.
5. THE Documentation SHALL document the "Already connected to a transport" failure mode, specifying that the cause is an `McpServer` instance being reused across multiple HTTP requests, and that the fix is ensuring each incoming HTTP request creates a new `McpServer` instance rather than reusing a shared one.
6. THE Documentation SHALL document how to diagnose Stackby API errors, specifying that the error message visible to the client follows the format `"Stackby API {statusCode}: {message}"`, and that the full error detail including `status`, `authMode`, `responseError`, and `responseBody` fields is written to the server's stderr output.
7. THE Documentation SHALL document the `X-MCP-Error` response header present on HTTP 500 responses, specifying that its value contains the error cause and that it can be read without parsing the JSON response body.
