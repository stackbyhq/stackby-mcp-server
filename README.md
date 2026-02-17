# Stackby MCP Server

Model Context Protocol (MCP) server for Stackby. Exposes tools so AI clients (Cursor, Claude Desktop, Cline, ChatGPT with MCP) can work with Stackby data.

**Auth:** Stackby Developer API via `STACKBY_API_KEY` (API key or Personal Access Token). See [CONFIG](https://github.com/stackby/Stackby_API/blob/production/MCP_SERVER/docs/CONFIG.md) in the planning repo (or sibling `Stackby_API/MCP_SERVER/docs/CONFIG.md`).

---

## Install (one-click)

**1. Add to Cursor** — Edit `~/.cursor/mcp.json` (Mac/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows):

```json
{
  "mcpServers": {
    "stackby": {
      "command": "npx",
      "args": ["-y", "stackby-mcp-server"],
      "env": {
        "STACKBY_API_KEY": "your-api-key-or-pat",
      }
    }
  }
}
```

Replace `your-api-key-or-pat` with your Stackby API key or PAT. Set `STACKBY_API_URL` to your Stackby API base URL (omit for default). Restart Cursor.

**2. Or install globally:** `npm install -g stackby-mcp-server` then use `"command": "stackby-mcp-server"` in `mcp.json`.

---

## Tools (11)

| Tool | Description |
|------|-------------|
| `list_stacks` | List stacks (bases) the user can access. |
| `list_tables` | List tables in a stack. |
| `describe_table` | Table schema: fields (columns), views. |
| `list_records` | List rows in a table (with optional maxRecords). |
| `search_records` | Search rows by text. |
| `get_record` | Get one row by ID. |
| `create_record` | Create a row (fields keyed by column name). |
| `update_records` | Update rows (array of `{ id, fields }`, max 10). |
| `delete_records` | Soft-delete rows by ID (max 10). |
| `create_table` | Create a new table in a stack. |
| `create_field` | Create a new column (field) in a table. |

---

## Setup

```bash
npm install
npm run build
```

**How to verify the build:** After `npm run build` you should see `Build OK. Output in dist/`. Run `npm start` — the server runs over stdio (no visible output; it waits for Cursor/Claude to connect).

## Verify in Cursor (Step 1.2)

1. Open Cursor **Settings** → **MCP** (or edit the config file directly).
2. Add the Stackby MCP server. Use **project** or **user** config.

   **Option A — User config** (`~/.cursor/mcp.json` on Mac/Linux, or `%USERPROFILE%\\.cursor\\mcp.json` on Windows):

   ```json
   {
     "mcpServers": {
       "stackby": {
         "command": "node",
         "args": ["C:\\Users\\Admin\\Desktop\\Stackby\\stackby-mcp-server\\dist\\index.js"],
         "env": {}
       }
     }
   }
   ```

   **Option B — If you use `npx` from the project folder:** (from a terminal in `stackby-mcp-server` run `node dist/index.js`; Cursor can use that path in `args`.)

   Use the **full path** to `dist/index.js` in `args` so Cursor can spawn the server.
3. Restart Cursor (or reload the window).
4. Set `STACKBY_API_KEY` (and optionally `STACKBY_API_URL`) in the `env` object. In a chat, check the **tools** list — you should see all 11 tools: **list_stacks**, **list_tables**, **describe_table**, **list_records**, **search_records**, **get_record**, **create_record**, **update_records**, **delete_records**, **create_table**, **create_field**.

## Run (stdio — for Cursor / Claude)

```bash
STACKBY_API_KEY=your_api_key STACKBY_API_URL=https://api.stackby.com npm start
```

Or one-click: `npx stackby-mcp-server` (after npm publish)

## Config

| Env | Required | Description |
|-----|----------|-------------|
| `STACKBY_API_KEY` | Yes | Stackby API key (or PAT when implemented). |

**Full config** (Cursor, Claude Desktop, Cline, HTTP transport): see `Stackby_API/MCP_SERVER/docs/CONFIG.md` in the sibling repo.

---

Planning and design: `Stackby_API/MCP_SERVER/` (sibling repo).
