# Implementation Plan: Stackby MCP Server Documentation

## Overview

Create the complete `docs/` documentation tree for the Stackby MCP Server. The implementation writes 17 Markdown files covering architecture, API reference, all 36 MCP tools, deployment, and troubleshooting, then adds property-based tests that verify the correctness of the two pure utility functions (`normalizeColumnType` and `getBlockAppSpec`) documented in the design's Correctness Properties section.

All files are authored in GitHub-flavored Markdown and require no build step.

---

## Tasks

- [x] 1. Set up docs/ directory structure and stub files
  - Create `docs/`, `docs/tools/` directories
  - Create empty placeholder files for all 17 docs: `index.md`, `architecture.md`, `authentication.md`, `http-server.md`, `api-reference.md`, `data-model.md`, `request-lifecycle.md`, `deployment.md`, `troubleshooting.md`, `tools/README.md`, `tools/read-operations.md`, `tools/write-operations.md`, `tools/schema-management.md`, `tools/view-management.md`, `tools/stack-creation.md`, `tools/automation.md`, `tools/dashboard-blocks.md`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Write docs/index.md — project overview and quick start
  - [x] 2.1 Write `docs/index.md`
    - Section: what the Stackby MCP Server is and what it does
    - Section: two transport modes (stdio and HTTP) and which AI clients use each
    - Section: quick-start install block (npx one-liner)
    - Section: quick-start Cursor mcp.json snippet
    - Section: table linking to every other doc file
    - _Requirements: 1.1, 14.2, 14.3_

- [x] 3. Write docs/architecture.md — system architecture and components
  - [x] 3.1 Write `docs/architecture.md`
    - Section: system architecture overview with ASCII or Mermaid component diagram
    - Section: entry points table (`src/index.ts` stdio vs `src/server-http.ts` HTTP), transport protocol, supported AI clients
    - Section: stateless one-server-per-request model for HTTP mode
    - Section: source file responsibility table — all 7 files with one-sentence description each
    - Section: layer-by-layer component flow (AI Client → Transport → `mcp-server.ts` → `stackby-api.ts` → `/api/v1/mcp/*`)
    - Section: build system (`tsc` → `dist/`, `npm start`, `npm run start:http`), runtime dependencies, Node.js ≥18
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 4. Write docs/authentication.md — credential model and auth flow
  - [x] 4.1 Write `docs/authentication.md`
    - Section: two credential types — `STACKBY_API_KEY` (env + `x-api-key` header) and `STACKBY_BEARER_TOKEN` (`Authorization: Bearer` header)
    - Section: HTTP per-request isolation via `AsyncLocalStorage` — credentials scoped to single request, concurrent requests never share state
    - Section: credential resolution priority (per-request header > env var)
    - Section: base URL resolution (`X-Stackby-API-URL` header > `STACKBY_API_URL` env > default `https://stackby.com`)
    - Section: both `x-api-key` and `Authorization: Bearer` headers sent on every outbound call
    - Section: 401 response when no credential present before MCP processing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 5. Write docs/http-server.md — HTTP transport routes and error handling
  - [x] 5.1 Write `docs/http-server.md`
    - Section: route table — all 8 routes with method, path, description (`/health`, `/mcp` POST, `/mcp` GET, `/.well-known/oauth-authorization-server`, `/mcp/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`, `*` catch-all)
    - Section: POST /mcp request flow — auth check → body buffering → JSON validation → fresh McpServer creation → `runWithRequestContext` wrap → response
    - Section: body pre-parsed and passed to `transport.handleRequest` to prevent stream re-read errors
    - Section: error response shapes table (401 missing auth, 400 invalid JSON with code `-32700`, 500 unhandled exception with `X-MCP-Error` header)
    - Section: OAuth 2.0 metadata response shape — all fields listed
    - Section: `PORT` env var (default 3001), PM2 commands
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 6. Write docs/api-reference.md — all Stackby backend endpoints
  - [x] 6.1 Write `docs/api-reference.md`
    - Section: authentication note — all endpoints require `x-api-key` + `Authorization: Bearer` headers
    - Section: workspace and stack endpoints (3 endpoints: GET workspaces, POST stacks list, POST stacks/create)
    - Section: table management endpoints (5 endpoints: GET/POST list+create, GET/PATCH/DELETE individual table)
    - Section: column management endpoints (3 endpoints: POST create, PATCH update, DELETE delete)
    - Section: row (record) CRUD endpoints (6 endpoints: GET list with all query params, POST create, POST update batch, GET single, DELETE soft-delete, POST search)
    - Section: view management endpoints (4 endpoints: GET list, POST create, PATCH update, DELETE soft-delete)
    - Section: comment endpoint (1 endpoint: POST create comment)
    - Section: automation endpoints (6 CRUD + 3 advanced passthrough routes with all valid `:action` values enumerated)
    - Section: dashboard and block endpoints (2 endpoints with valid action values)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

- [x] 7. Write docs/data-model.md — Stackby entity model
  - [x] 7.1 Write `docs/data-model.md`
    - Section: entity hierarchy description — Workspace → Stack → Table → Field/View/Record → Comment, Dashboard → Block, Automation
    - Section: Mermaid ER diagram showing all entities and relationships
    - Section: entity descriptions for all 10 entities (Workspace, Stack, Table, Field, View, Record, Automation, Dashboard, Block, Comment) with key fields listed
    - Section: Stack Template data model — `TemplateTableInput`, `TemplateColumnInput`, `TemplateRowInput` schemas
    - _Requirements: (supports all tool catalog requirements by providing entity reference)_

- [x] 8. Write docs/request-lifecycle.md — end-to-end request flow
  - [x] 8.1 Write `docs/request-lifecycle.md`
    - Section: end-to-end flow — annotated walkthrough from AI Client JSON-RPC call through all layers to response
    - Section: `camelCaseKeys()` and `withCamel()` — snake_case → camelCase conversion, keys already camelCase pass through unchanged
    - Section: `normalizeResponse()` — unwraps `{ data: T }` envelope, falls back to treating full body as payload
    - Section: `authHeaders()` — resolves credentials, throws when neither credential available, header shape sent on every call
    - Section: `request<T>()` — URL construction, header merge, JSON parse, typed error on non-2xx
    - Section: error propagation chain — `stackby-api.ts` throws → handler catches → `isError: true` response
    - Section: two-step API pattern for `create_field` — views call → resolve viewId → columns call
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 9. Write docs/tools/README.md — tool catalog overview
  - [x] 9.1 Write `docs/tools/README.md`
    - Section: tool registration model (`mcpServer.registerTool`, Zod inputSchema, `withCamel` wrapper)
    - Section: tool response shape `{ content: [{ type: "text", text }], isError? }`
    - Section: input conventions — both camelCase and snake_case accepted
    - Section: tool catalog table — all 36 tools with one-line description and link to the relevant sub-page
    - Section: tool grouping overview — read (11), write/records (5), schema/tables (3), schema/fields (3), views (3), stack creation (1), automations (11), dashboards+blocks (2), comments (1) = 40 registrations counting `update_records_for_table` alias
    - _Requirements: 5.1–5.11, 6.1–6.8, 7.1–7.9, 8.1–8.4, 9.1–9.6, 10.1–10.8, 11.1–11.6_

- [x] 10. Write docs/tools/read-operations.md — 11 read tools
  - [x] 10.1 Write `docs/tools/read-operations.md`
    - Document `list_workspaces` — no input, GET /workspaces, formatted workspace list, error handling
    - Document `list_stacks` — optional `workspaceId`, iteration vs. specific workspace, 200-stack truncation behavior
    - Document `list_tables` — required `stackId`, GET tables, formatted list
    - Document `describe_table` — required `stackId`+`tableId`, returns fields (id/name/type) + views (id/name)
    - Document `list_views` — required `stackId`+`tableId`, returns view names/IDs/types
    - Document `list_records` — all query parameters documented (`maxRecords` clamp [1,100], `offset` clamp [0,∞), `rowIds`, `view`, `filter`, `sort`, `filterByFormula`, `conjuction` spelling note)
    - Document `search_records` — two-step flow (GET views to resolve column, POST search), `fieldIds` behavior
    - Document `get_record` — single record fetch, null vs. error distinction
    - Document `list_automations` — raw JSON response
    - Document `get_automation` — raw JSON response
    - Document `list_automation_capabilities` — no API call, returns formatted catalog
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

- [x] 11. Write docs/tools/write-operations.md — record write tools and comments
  - [x] 11.1 Write `docs/tools/write-operations.md`
    - Document `create_record` — `fields` accepts object or JSON string, POST body shape, created record response, error on invalid fields
    - Document `update_records` — `records` array 1–10, PATCH body shape, full updated fields returned, hard 10-item limit error
    - Document `update_records_for_table` — documented as alias of `update_records`, identical behavior and constraints
    - Document `delete_records` — `recordIds` 1–10, soft-delete semantics (marked deleted, not purged), DELETE query param format
    - Document `create_record_comment` — required `text`, optional `attachment`/`cellValue`, POST body, comment ID + timestamp response
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8_

- [x] 12. Write docs/tools/schema-management.md — table and field tools
  - [x] 12.1 Write `docs/tools/schema-management.md`
    - Document `create_table` — required `stackId`+`name`, returns table ID+name
    - Document `update_table` — requires at least one of `name`/`description`, error when neither provided
    - Document `delete_table` — permanently deletes table and all data (records, views, fields)
    - Document `create_field` — all input parameters (required + conditionally required per type), all 39 canonical column types listed, alias mapping table, two-step viewId resolution, type-specific validation rules
    - Document `update_field` — `stackId`+`tableId`+`columnId` required, optional `name`/`description`/`type`/`body`
    - Document `delete_field` — hard delete of column
    - Section: 39 column types list with aliases (rollup → aggregation, date → dateAndTime, dropdown → singleOption, etc.)
    - Section: 14 valid aggregation formula strings
    - Section: `create_field` conditional requirements table per column type
    - _Requirements: 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

- [x] 13. Write docs/tools/view-management.md — view tools
  - [x] 13.1 Write `docs/tools/view-management.md`
    - Document `create_view` — all parameters (`type` default grid, `copyMode`/`copyViewId` for duplicate), POST body, returns created view with `viewId`
    - Document `rename_view` — required `stackId`+`tableId`+`viewId`+`name`, optional `description`, returns updated view
    - Document `delete_view` — soft-delete semantics (view inaccessible, data retained), returns deleted `viewId`
    - Section: view types supported (grid, kanban, gallery, calendar, form)
    - Section: error behavior on missing/invalid parameters
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 14. Write docs/tools/stack-creation.md — create_stack and template system
  - [x] 14.1 Write `docs/tools/stack-creation.md`
    - Document `create_stack` — all inputs (`workspaceId`, `name`, `color`, `icon`, optional `tables` template), success response with stack ID and name
    - Section: two-path template application — server-side (backend accepts `tables`) vs. client-side fallback via `applyStackTemplate()` when server returns error
    - Section: four-phase column creation order — (1) base types, (2) link columns, (3) formula columns, (4) lookup/lookupCount/aggregation columns — rationale for ordering
    - Section: topological sort — link targets created before link holders, circular dependency limitation
    - Section: `rowKey` and `__linkRowKeys`/`__linkRowKey` system — stable row cross-referencing within a template
    - Section: `key` field on table definitions — stable identifier for `linkToTableKey` cross-references
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 15. Write docs/tools/automation.md — automation tools and catalogs
  - [-] 15.1 Write `docs/tools/automation.md`
    - Document `create_automation` — required `stackId`+`name`+`trigger`, optional `description`/`isTurnedOn`/`tableId`/`viewId`/`actions`, single-request creation, returns automation ID+name
    - Document `update_automation` — `body` patch object, patchable fields listed
    - Document `delete_automation` — confirmation response
    - Document `add_automation_trigger` — required `stackId`+`automationId`+`triggerType`, optional `triggerParams`/`tableId`/`description`
    - Document `add_automation_action` — required `stackId`+`automationId`+`actionType`, optional `actionParams`/`sequence`/`description`
    - Document three advanced passthrough tools — `automation_workflow_action`, `automation_trigger_action`, `automation_action_action` with all valid `action` values enumerated for each
    - Section: 6 trigger type codes table with names, descriptions, required `triggerParams` fields, and complete example for each
    - Section: 11 action type codes table with names, descriptions, required `actionParams` fields, and complete example for each
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [ ] 16. Write docs/tools/dashboard-blocks.md — dashboard and block tools
  - [-] 16.1 Write `docs/tools/dashboard-blocks.md`
    - Document `dashboard_action` — required `stackId`+`id`+`action`, optional `body`, all valid action values (create, update, getblocks, positionupdate, move)
    - Document `block_action` — required `stackId`+`id`+`action`, optional `body`, all valid action values (create, update, duplicate, move)
    - Section: all 18 supported block types table with canonical name and accepted aliases
    - Section: `normalizeBlockActionBody()` — how user-friendly input is transformed into `blockFields` (JSON-stringified), `gridLayout`, `linearLayout` for create actions
    - Section: `Summary` block special handling — `summaryData` derived from `tableId`/`viewId`/`columnId`/`summaryType`/`colorCode`/`label`
    - Section: required `dashboardId` field for block create — error behavior when missing
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 17. Write docs/deployment.md — environment variables, install methods, and configs
  - [-] 17.1 Write `docs/deployment.md`
    - Section: environment variables table — `STACKBY_API_KEY`, `STACKBY_BEARER_TOKEN`, `STACKBY_API_URL`, `PORT` with defaults and modes
    - Section: three install methods — `npx stackby-mcp-server`, `npm install -g`, local source build (`npm install && npm run build && npm start`)
    - Section: exact Cursor `mcp.json` block for stdio mode (command/args/env)
    - Section: exact Cursor `mcp.json` block for hosted HTTP mode (`streamableHttp`, `https://mcp.stackby.com/mcp`, `X-Stackby-API-Key` header)
    - Section: exact Cursor `mcp.json` block for local HTTP testing (`http://localhost:3001/mcp`)
    - Section: Claude Desktop `claude_desktop_config.json` structure — stdio only, note that HTTP transport is not supported
    - Section: `list-workspaces.ts` utility usage — `npm run build && node dist/list-workspaces.js` with `STACKBY_API_KEY` set
    - Section: Docker — default entrypoint (stdio), HTTP override (`node dist/server-http.js`), `PORT` mapping via `-p`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [ ] 18. Write docs/troubleshooting.md — failure modes and fixes
  - [-] 18.1 Write `docs/troubleshooting.md`
    - Each failure mode documented with: observable symptom, root cause, step-by-step fix
    - Failure mode 1: "Error - Show Output" in Cursor — Node.js process exited, fix: Settings → MCP → stackby → Show Output
    - Failure mode 2: Missing auth credential (HTTP 401) — absent/incorrect API key, fix: add `STACKBY_API_KEY` to env (stdio) or `X-Stackby-API-Key` header (HTTP)
    - Failure mode 3: POST body empty or invalid JSON (HTTP 400 code -32700) — MCP client not sending JSON body, fix: verify client sends JSON-encoded request bodies
    - Failure mode 4: "Already connected to a transport" — `McpServer` reused across requests, fix: create fresh `McpServer` per request
    - Failure mode 5: Diagnosing Stackby API errors — format `"Stackby API {statusCode}: {message}"`, full detail in stderr with `status`/`authMode`/`responseError`/`responseBody` fields
    - Failure mode 6: `X-MCP-Error` response header on HTTP 500 — URL-encoded error cause, readable without parsing JSON body
    - Failure mode 7: stdio works but hosted URL returns 500 — key not sent in HTTP headers, fix: add header to streamableHttp config
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

- [ ] 19. Write docs/input-validation.md — input normalization rules
  - [-] 19.1 Write `docs/input-validation.md`
    - Section: `normalizeColumnType()` — alias map, canonical types, unknown types passed through unchanged
    - Section: `options` field parsing in `create_field` — JSON array string, comma-separated string, native array; error on non-array JSON parse result
    - Section: `fields` field parsing in `create_record` — object or JSON string; error on parse failure or non-object result
    - Section: block type normalization via `normalizeBlockAppType()` and `getBlockAppSpec()` — unknown types fall back to `Chart`, case-insensitive alias resolution
    - Section: `normalizeSummaryType()` — case-insensitive variants with/without spaces, empty string for unknown
    - Section: `maxRecords` clamped to [1, 100], `offset` clamped to [0, ∞), `pageSize` alias for `maxRecords`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [~] 20. Checkpoint — review all docs for cross-linking and completeness
  - Verify all 18 documentation files exist and contain their required sections
  - Verify `docs/tools/README.md` tool catalog table contains all 36 tool names
  - Verify `docs/api-reference.md` covers all 31 backend endpoints
  - Ensure all docs cross-link to related pages where referenced
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Set up test infrastructure for property-based tests
  - [x] 21.1 Install `vitest` and `fast-check` as dev dependencies
    - Add `vitest` and `fast-check` to `devDependencies` in `package.json`
    - Add `"test": "vitest --run"` script to `package.json`
    - Create `vitest.config.ts` configured for ESM and TypeScript
    - _Requirements: (test infrastructure for Properties 3, 4, 5, 6, 7)_

- [ ] 22. Write property-based and unit tests for utility functions
  - [~] 22.1 Create `tests/utils.test.ts` — unit tests for `normalizeColumnType`
    - Test that each canonical column type is returned unchanged
    - Test each known alias (e.g. `"rollup"` → `"aggregation"`, `"date"` → `"dateAndTime"`, `"text"` → `"shortText"`, `"dropdown"` → `"singleOption"`)
    - Test that unknown type strings are passed through unchanged
    - _Requirements: 13.1_

  - [ ]* 22.2 Write property test for `normalizeColumnType` — Property 6: Column Type Normalization is Total and Idempotent
    - **Property 6: Column Type Normalization is Total and Idempotent**
    - **Validates: Requirements 13.1**
    - Use `fc.constantFrom(...Object.keys(COLUMN_TYPE_ALIASES))` as input generator
    - Assert: result is a member of `COLUMN_TYPES`
    - Assert: `normalizeColumnType(normalizeColumnType(input)) === normalizeColumnType(input)` (idempotence)
    - Run 100 iterations with `fast-check`

  - [~] 22.3 Create `tests/block-specs.test.ts` — unit tests for `getBlockAppSpec`
    - Test that each of the 18 canonical block type strings returns a spec with matching `type`
    - Test that all known aliases resolve to the correct canonical type
    - Test that an empty string input returns the `Chart` fallback spec
    - Test that an unknown string returns the `Chart` fallback spec
    - _Requirements: 13.4_

  - [ ]* 22.4 Write property test for `getBlockAppSpec` — Property 7: Block App Spec Resolution is Total
    - **Property 7: Block App Spec Resolution is Total**
    - **Validates: Requirements 13.4**
    - Use `fc.oneof(fc.string(), fc.constant(""), fc.constant(undefined))` as input generator
    - Assert: result is not `null` or `undefined`
    - Assert: `result.type` is a string
    - Assert: result is one of the 18 canonical block specs
    - Run 100 iterations with `fast-check`

  - [~] 22.5 Create `tests/docs-coverage.test.ts` — documentation presence tests
    - For each of the 18 doc files: assert file exists and is non-empty
    - Test that `docs/tools/README.md` contains all 36 tool names
    - Test that `docs/api-reference.md` contains key endpoint path patterns (e.g. `/api/v1/mcp/workspaces`, `/api/v1/mcp/stacks`, `/api/v1/mcp/columns`)
    - Test that `docs/architecture.md` mentions all 7 source file names
    - Test that `docs/deployment.md` mentions all 4 environment variable names
    - _Requirements: 1.3, 4.1, 14.1_

- [~] 23. Final checkpoint — run tests and verify documentation completeness
  - Run `npm test` and ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- All documentation is GitHub-flavored Markdown — no build step required
- Property tests use `fast-check` with a minimum of 100 iterations each
- Unit tests are required; property tests are optional but strongly recommended given the invariant-based Correctness Properties in the design
- Checkpoints ensure documentation correctness is validated incrementally
- `docs/input-validation.md` is added as task 19 to fully cover Requirements 13.x — this is an 18th documentation file beyond the original 17 in the design's file tree; it can be merged into an existing file if preferred

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "9.1", "21.1"] },
    { "id": 1, "tasks": ["10.1", "11.1", "12.1", "13.1", "14.1", "15.1", "16.1", "17.1", "18.1", "19.1"] },
    { "id": 2, "tasks": ["22.1", "22.3", "22.5"] },
    { "id": 3, "tasks": ["22.2", "22.4"] }
  ]
}
```
