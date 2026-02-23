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

**1b. Hosted (https://mcp.stackby.com)** — If you use the hosted MCP endpoint, add it in Cursor as **streamable HTTP** and send your API key in headers:

```json
{
  "mcpServers": {
    "stackby": {
      "type": "streamableHttp",
      "url": "https://mcp.stackby.com/mcp",
      "headers": {
        "X-Stackby-API-Key": "your-api-key-or-pat"
      }
    }
  }
}
```

Alternatively use `"Authorization": "Bearer your-api-key-or-pat"` instead of `X-Stackby-API-Key`. Without one of these headers, the server returns 401 and Cursor may show connection/500-style errors. Restart Cursor after changing the config.

**1c. Test hosted endpoint locally** — To run the HTTP MCP server on your machine and connect Cursor to it (same protocol as hosted):

1. Build and start the HTTP server: `npm run build && npm run start:http` (listens on port 3001).
2. In `mcp.json` use **streamable HTTP** with your local URL and API key header:

```json
{
  "mcpServers": {
    "stackby": {
      "type": "streamableHttp",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "X-Stackby-API-Key": "your-api-key-or-pat"
      }
    }
  }
}
```

3. Restart Cursor (or reload the window). To switch to the real hosted endpoint later, change `url` to `https://mcp.stackby.com/mcp` and restart.

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

### Run HTTP server with PM2 (production)

On the server, build then start the HTTP MCP backend with PM2:

```bash
npm run build
npm run pm2:start
```

This runs `pm2 start dist/server-http.js --name mcp-backend`. Ensure **PM2** is installed (`npm install -g pm2`). The server listens on port **3001** by default (set `PORT` in the environment if needed).

- Restart after code changes: `npm run build && npm run pm2:restart`
- Stop: `npm run pm2:stop`

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
         "env": {
           "STACKBY_API_KEY": "your-api-key-or-pat"
         }
       }
     }
   }
   ```
   Use **command** + **args** (stdio). Do **not** add this server as a URL (streamableHttp/SSE) — that mode is for hosted HTTP and requires different setup.

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

## Troubleshooting

**"Error - Show Output" for the stackby MCP server in Cursor**

1. **See the real error** — In Cursor go to **Settings → MCP**, find **stackby**, and click **"Show Output"**. The log will show why the server failed (e.g. missing file, missing env, or Node error).
2. **Using this repo locally** — You must **build** the project and point Cursor at the built file:
   - In a terminal: `cd` to this repo, then run `npm install` and `npm run build`.
   - In `%USERPROFILE%\.cursor\mcp.json` (Windows) use a **stdio** config with the **full path** to `dist\index.js`:
   ```json
   "stackby": {
     "command": "node",
     "args": ["C:\\Users\\Admin\\Desktop\\Stackby\\stackby-mcp-server\\dist\\index.js"],
     "env": { "STACKBY_API_KEY": "your-api-key-or-pat" }
   }
   ```
   Replace the path if your repo is elsewhere. Do not use `npx -y stackby-mcp-server` for local development unless you have published/installed that package.
3. **API key** — Ensure `STACKBY_API_KEY` (or PAT) is set in the server’s `env` in `mcp.json`. Restart Cursor after editing the config.

**Local stdio works but hosted URL returns 500 with no error body**

- The **stdio** config (e.g. `command` / `args` to `dist/index.js` with `env.STACKBY_API_KEY`) works because the key is in the process env. The **hosted URL** (`https://mcp.stackby.com/mcp`) must receive the API key on **every request** via headers: `X-Stackby-API-Key` or `Authorization: Bearer <key>`.
- To get **proper error responses** from the hosted endpoint (so you see what failed instead of only status 500):
  1. **Deploy the latest code** from this repo (including `server-http.ts`). The server returns a JSON body on 500 with `error`, `name`, `message`, and optionally `stack` and `code`, plus an `X-MCP-Error` response header with a short message.
  2. After deploy, on 500 the **response body** will be JSON, e.g. `{ "error": "MCP handler error", "name": "Error", "message": "..." }`. Check that body (or the `X-MCP-Error` header) in Postman / dev tools to see the real error.
  3. On the server, check logs for `[MCP /mcp] Error handling request:` and the stack trace to debug.

**Streamable HTTP "Error POSTing to endpoint" or SSE "Non-200 status code (500)"**

- **Check API key** — The server returns 401 without a key and can return 500 for other errors. In `mcp.json` under your streamableHttp config, set **headers** so every request includes your key, e.g. `"X-Stackby-API-Key": "your-api-key-or-pat"` or `"Authorization": "Bearer your-api-key-or-pat"`. Restart Cursor after editing.
- **If you're testing locally** (`url": "http://localhost:3001/mcp"`): run `npm run start:http` in a terminal and watch the log when Cursor connects. You’ll see `[MCP /mcp] Error handling request:` plus the real error. Fix that cause and restart the server.
- **If you're using the hosted URL** (`https://mcp.stackby.com/mcp`): 500 means the hosted server threw an error. Confirm headers are set as above. Ensure the hosted server runs the **latest** `server-http` from this repo so 500 responses include the full error JSON and `X-MCP-Error` header.

**Same errors when adding as a local server**

- If you want to run the server locally, add it as a **command (stdio)** server, not as a URL: **Command** `npx`, **Args** `["-y", "stackby-mcp-server"]`, **Env** `{ "STACKBY_API_KEY": "your-api-key-or-pat" }`.

---

Planning and design: `Stackby_API/MCP_SERVER/` (sibling repo).
