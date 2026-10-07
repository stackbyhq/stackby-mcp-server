# Stackby MCP Server

**Model Context Protocol server for Stackby** — exposes Stackby's spreadsheet/database platform to AI clients so they can read, write, and manage your data through natural language.

The server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) and registers 36 tools that cover the full Stackby data model: workspaces, stacks, tables, records, fields, views, automations, dashboards, and blocks. AI clients call these tools directly; no manual API integration is needed.

---

## Transport Modes

The server ships with two transport entry points for different client types:

| Mode | Entry Point | Clients | How to Connect |
|---|---|---|---|
| **stdio** | `src/index.ts` | Cursor, Claude Desktop, Cline | Add to `mcp.json` / `claude_desktop_config.json` with `command: npx` |
| **HTTP (StreamableHTTP)** | `src/server-http.ts` | ChatGPT, any HTTP MCP client | Point client at `https://mcp.stackby.com/mcp` or run locally on `PORT` (default 3001) |

---

## Quick Start

### Option 1 — One-liner via npx (stdio, Cursor / Claude Desktop / Cline)

Add the following to your Cursor `mcp.json` (or Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "stackby": {
      "command": "npx",
      "args": ["-y", "stackby-mcp-server"],
      "env": {
        "STACKBY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

No global install required — `npx` downloads and runs the server on first use.

### Option 2 — Hosted HTTP endpoint (ChatGPT / HTTP clients)

Connect to the hosted Stackby MCP endpoint at `mcp.stackby.com`:

```json
{
  "mcpServers": {
    "stackby": {
      "type": "streamableHttp",
      "url": "https://mcp.stackby.com/mcp",
      "headers": {
        "X-Stackby-API-Key": "your_api_key_here"
      }
    }
  }
}
```

Your API key is sent per-request in the `X-Stackby-API-Key` header. See [Authentication](./authentication.md) for details on credential handling and isolation.

---

## Prerequisites

- **Node.js ≥ 18** (required for the stdio / local HTTP mode)
- **Stackby API key** — generate one from your Stackby account settings

To verify your API key before configuring an AI client:

```bash
STACKBY_API_KEY=<your-key> npm run build && node dist/list-workspaces.js
```

This calls the Stackby API and prints your available workspaces. If it fails, check the key and your network access to `stackby.com`.

---

## What You Can Do with 36 Tools

Once connected, AI clients can perform the following operations through natural language:

- **Workspaces & Stacks** — list workspaces, list stacks across all workspaces or within a specific workspace, create new stacks with optional pre-built table/column/row templates
- **Tables** — list tables in a stack, describe a table's schema (fields and views), create tables, rename or update table descriptions, delete tables
- **Records (Rows)** — list records with pagination, filtering, sorting, and formula-based filters; search records by text; get a single record by ID; create records; batch-update up to 10 records at once; soft-delete up to 10 records at once; add comments to records
- **Fields (Columns)** — describe all 39 supported column types (text, number, link, formula, lookup, rollup, etc.); create fields with type-specific options; update field name, description, and configuration; delete fields
- **Views** — list views (grid, kanban, gallery, calendar, form), create views with optional copy/duplicate mode, rename views, soft-delete views
- **Automations** — list automations, get automation details, create full automation workflows (trigger + actions in one call), add individual triggers or actions, update automation metadata, delete automations, use advanced passthrough tools for complex workflow operations
- **Dashboards & Blocks** — run dashboard actions (create, update, get blocks, reposition, move), run block actions (create, update, duplicate, move) for all 18 supported block types including Chart, Summary, PivotTable, and more

---

## Documentation Map

| Document | Description |
|---|---|
| [Architecture](./architecture.md) | System components, entry points, build system |
| [Authentication](./authentication.md) | API keys, credential flow, per-request isolation |
| [HTTP Server](./http-server.md) | Routes, error handling, OAuth proxy |
| [API Reference](./api-reference.md) | All Stackby backend endpoints (`/api/v1/mcp/*`) |
| [Data Model](./data-model.md) | Stackby entity hierarchy (Workspace → Stack → Table → Record) |
| [Request Lifecycle](./request-lifecycle.md) | End-to-end flow, camelCase normalization, error chain |
| [Tool Catalog](./tools/README.md) | All 36 MCP tools — inputs, outputs, and API calls |
| [Deployment](./deployment.md) | Environment variables, Cursor/Claude configs, Docker |
| [Troubleshooting](./troubleshooting.md) | Common errors and step-by-step fixes |
| [Input Validation](./input-validation.md) | Normalization rules for column types, block types, and field parsing |
