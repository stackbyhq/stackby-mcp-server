# Connecting Stackby MCP Server via Terminal (CLI) — Step-by-Step Guide

This guide walks through every step to get the Stackby MCP Server running from your terminal — from installing prerequisites to verifying live tool calls — for both **stdio mode** (Cursor, Claude Desktop) and **HTTP mode** (hosted or local HTTP server).

---

## Prerequisites

Before starting, make sure you have:

| Requirement | Check command | Minimum version |
|---|---|---|
| Node.js | `node --version` | v18 or higher |
| npm | `npm --version` | v8 or higher |
| A Stackby API key | Login → Account → API Keys | — |

Get your Stackby API key from your Stackby account settings. It looks like `sb_live_xxxxxxxxxxxxxxxx` or a Personal Access Token (PAT).

---

## Option A — Stdio Mode (Cursor, Claude Desktop, Cline)

Stdio mode runs the server as a local process. AI clients (Cursor, Claude Desktop, Cline) launch it automatically as a child process and communicate over stdin/stdout.

### Step 1 — Install or run with npx (no global install needed)

The fastest way is to use `npx`. No installation required:

```bash
npx -y stackby-mcp-server
```

> This starts the server in stdio mode. It will wait silently for an MCP client to connect — that's expected behavior. Press `Ctrl+C` to stop it.

To verify it starts without errors:

```bash
STACKBY_API_KEY=your_api_key_here npx -y stackby-mcp-server
```

No output = working correctly (stdio servers don't print anything when idle).

---

### Step 2 — OR install globally

If you prefer a global binary:

```bash
npm install -g stackby-mcp-server
```

Verify the install:

```bash
stackby-mcp-server --version
# or
which stackby-mcp-server   # macOS/Linux
where stackby-mcp-server   # Windows
```

Run it:

```bash
STACKBY_API_KEY=your_api_key_here stackby-mcp-server
```

---

### Step 3 — OR build from source

If you cloned the repository:

```bash
# Step 3a: Clone the repo
git clone https://github.com/stackbyhq/stackby-mcp-server
cd stackby-mcp-server

# Step 3b: Install dependencies
npm install

# Step 3c: Build TypeScript → JavaScript
npm run build
```

Expected output from `npm run build`:

```
Build OK. Output in dist/
Run npm start to run the server.
```

Run the server:

```bash
# macOS / Linux
STACKBY_API_KEY=your_api_key_here npm start

# Windows (Command Prompt)
set STACKBY_API_KEY=your_api_key_here && npm start

# Windows (PowerShell)
$env:STACKBY_API_KEY="your_api_key_here"; npm start
```

Or point directly at the compiled file:

```bash
# macOS / Linux
STACKBY_API_KEY=your_api_key_here node dist/index.js

# Windows
node dist/index.js
# (set STACKBY_API_KEY in your system environment or .env loader)
```

---

### Step 4 — Verify your API key works

Run the workspace verification utility to confirm your key is valid before wiring up any AI client:

```bash
# macOS / Linux (from the project directory after npm run build)
STACKBY_API_KEY=your_api_key_here node dist/list-workspaces.js

# Windows (PowerShell)
$env:STACKBY_API_KEY="your_api_key_here"; node dist/list-workspaces.js
```

Expected output:

```
API: https://stackby.com
Workspaces (2):
  - My Team (id: ws_abc123)
  - Personal (id: ws_def456)
```

If you see an error like `Stackby API 401: Unauthorized`, your API key is wrong or missing.

---

### Step 5 — Configure Cursor (mcp.json)

Find your Cursor MCP config file:

| OS | Path |
|---|---|
| macOS / Linux | `~/.cursor/mcp.json` |
| Windows | `%USERPROFILE%\.cursor\mcp.json` |

Open the file (create it if it doesn't exist) and add:

**Using npx (recommended — no global install):**

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

**Using global install:**

```json
{
  "mcpServers": {
    "stackby": {
      "command": "stackby-mcp-server",
      "args": [],
      "env": {
        "STACKBY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

**Using local build (full path to dist/index.js):**

```json
{
  "mcpServers": {
    "stackby": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\stackby-mcp-server\\dist\\index.js"],
      "env": {
        "STACKBY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

> On Windows, use double backslashes `\\` in the path.

Restart Cursor after saving the file. Then open **Settings → MCP** and confirm the `stackby` entry shows a green status.

---

### Step 6 — Configure Claude Desktop (mcp.json)

Find your Claude Desktop config file:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Add the same block under `mcpServers`:

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

Restart Claude Desktop. The Stackby tools will appear in the tool picker.

---

## Option B — HTTP Mode (hosted or local HTTP server)

HTTP mode exposes the server as a REST endpoint. Use this for ChatGPT, a multi-user hosted deployment, or any MCP client that connects via URL instead of launching a process.

### Step 1 — Start the HTTP server

From the project directory (after `npm run build`):

```bash
# macOS / Linux
STACKBY_API_KEY=your_api_key_here npm run start:http

# Windows (PowerShell)
$env:STACKBY_API_KEY="your_api_key_here"; npm run start:http
```

Expected output:

```
Stackby MCP HTTP server listening on port 3001
```

The server is now running at `http://localhost:3001`.

To use a different port:

```bash
# macOS / Linux
PORT=8080 STACKBY_API_KEY=your_api_key_here npm run start:http

# Windows (PowerShell)
$env:PORT="8080"; $env:STACKBY_API_KEY="your_api_key_here"; npm run start:http
```

---

### Step 2 — Test the health endpoint

```bash
curl http://localhost:3001/health
```

Expected response:

```
OK
```

If you get a connection refused error, the server is not running. Check the terminal where you started it.

---

### Step 3 — Send a test MCP request via curl

Test that the server processes a tool call correctly. The `list_workspaces` tool requires no input parameters:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "X-Stackby-API-Key: your_api_key_here" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_workspaces",
      "arguments": {}
    },
    "id": 1
  }'
```

Expected response shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Workspaces (2):\n- My Team (id: ws_abc123)\n- Personal (id: ws_def456)"
      }
    ]
  }
}
```

If you see `"error": { "code": -32700 }`, the request body was malformed.
If you see HTTP 401, the API key header is missing or wrong.

---

### Step 4 — Test additional tools via curl

**List stacks in a workspace:**

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "X-Stackby-API-Key: your_api_key_here" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_stacks",
      "arguments": { "workspaceId": "ws_abc123" }
    },
    "id": 2
  }'
```

**List tables in a stack:**

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "X-Stackby-API-Key: your_api_key_here" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_tables",
      "arguments": { "stackId": "st_your_stack_id" }
    },
    "id": 3
  }'
```

**Describe a table (get fields and views):**

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "X-Stackby-API-Key: your_api_key_here" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "describe_table",
      "arguments": {
        "stackId": "st_your_stack_id",
        "tableId": "tb_your_table_id"
      }
    },
    "id": 4
  }'
```

---

### Step 5 — Run HTTP server with PM2 (production/persistent)

For a long-running server that survives terminal restarts and reboots, use PM2:

```bash
# Install PM2 globally (once)
npm install -g pm2

# Build the server
npm run build

# Start with PM2
npm run pm2:start
```

Useful PM2 commands:

```bash
npm run pm2:restart   # restart after code changes (npm run build first)
npm run pm2:stop      # stop the server
pm2 status            # check if the process is running
pm2 logs mcp-backend  # view live logs
```

PM2 stores logs at `~/.pm2/logs/mcp-backend-out.log` (stdout) and `~/.pm2/logs/mcp-backend-error.log` (stderr).

---

### Step 6 — Configure Cursor for HTTP mode

To connect Cursor to the local HTTP server (or to the hosted endpoint):

**Hosted Stackby MCP endpoint:**

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

**Local HTTP server (http://localhost:3001):**

```json
{
  "mcpServers": {
    "stackby": {
      "type": "streamableHttp",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "X-Stackby-API-Key": "your_api_key_here"
      }
    }
  }
}
```

> Make sure `npm run start:http` is running in another terminal before connecting Cursor to the local URL.

---

## Option C — Docker

### Step 1 — Build the Docker image

```bash
# From the project root (where Dockerfile lives)
docker build -t stackby-mcp-server .
```

### Step 2 — Run in HTTP mode

```bash
docker run -d \
  --name stackby-mcp \
  -p 3001:3001 \
  -e STACKBY_API_KEY=your_api_key_here \
  --entrypoint node \
  stackby-mcp-server \
  dist/server-http.js
```

Verify it's running:

```bash
docker ps
curl http://localhost:3001/health
```

### Step 3 — View logs

```bash
docker logs stackby-mcp
docker logs -f stackby-mcp   # follow live
```

### Step 4 — Stop and remove

```bash
docker stop stackby-mcp
docker rm stackby-mcp
```

---

## Self-Hosted Stackby (Custom API URL)

If you run your own Stackby instance, override the base URL:

```bash
# stdio mode
STACKBY_API_KEY=your_key STACKBY_API_URL=https://stackby.yourcompany.com npm start

# HTTP mode
STACKBY_API_KEY=your_key STACKBY_API_URL=https://stackby.yourcompany.com npm run start:http
```

Or in `mcp.json` env block:

```json
"env": {
  "STACKBY_API_KEY": "your_api_key_here",
  "STACKBY_API_URL": "https://stackby.yourcompany.com"
}
```

---

## Environment Variable Reference

| Variable | Where to set | Description |
|---|---|---|
| `STACKBY_API_KEY` | Terminal env / mcp.json `env` | API key or PAT — required for stdio; fallback for HTTP |
| `STACKBY_BEARER_TOKEN` | Terminal env / request header | Alternative bearer token credential |
| `STACKBY_API_URL` | Terminal env / mcp.json `env` | Override base URL (default: `https://stackby.com`) |
| `PORT` | Terminal env | HTTP server port (default: `3001`) |

---

## Quick CLI Cheat Sheet

```bash
# --- VERIFY ---
# Check Node version
node --version                                    # must be >= 18

# Verify API key
STACKBY_API_KEY=<key> node dist/list-workspaces.js

# --- STDIO MODE ---
# One-liner (npx)
STACKBY_API_KEY=<key> npx -y stackby-mcp-server

# From source
npm install && npm run build
STACKBY_API_KEY=<key> npm start

# --- HTTP MODE ---
# Start local HTTP server
STACKBY_API_KEY=<key> npm run start:http           # port 3001

# Health check
curl http://localhost:3001/health                  # → OK

# Test tool call
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "X-Stackby-API-Key: <key>" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workspaces","arguments":{}},"id":1}'

# --- PM2 ---
npm install -g pm2
npm run build && npm run pm2:start
pm2 logs mcp-backend

# --- DOCKER ---
docker build -t stackby-mcp-server .
docker run -d -p 3001:3001 -e STACKBY_API_KEY=<key> --entrypoint node stackby-mcp-server dist/server-http.js
curl http://localhost:3001/health
```

---

## Troubleshooting

### Server starts but Cursor shows "Error"
Open **Cursor Settings → MCP → stackby → Show Output** to see the real Node.js error. Common causes:
- Wrong path to `dist/index.js` in the `args` field
- `STACKBY_API_KEY` missing from the `env` block
- Node.js < v18

### HTTP 401 Unauthorized
The API key is not being sent. For stdio: add `STACKBY_API_KEY` to the `env` block in `mcp.json`. For HTTP: add `"X-Stackby-API-Key": "<key>"` to the `headers` block.

### HTTP 400 Parse Error (code -32700)
The POST body is empty or invalid JSON. Make sure your curl command uses `-H "Content-Type: application/json"` and a valid `-d` payload.

### Connection refused on localhost:3001
The HTTP server is not running. Start it with `npm run start:http` in a separate terminal first.

### `dist/index.js` not found
Run `npm run build` to compile TypeScript to JavaScript first.

### All tools fail with "Stackby API 403: Forbidden"
The API key does not have permission for the workspace or stack. Check key permissions in your Stackby account settings.

---

## See Also

- [Architecture](./docs/architecture.md) — system components and transport modes
- [Authentication](./docs/authentication.md) — credential types and resolution priority
- [Deployment](./docs/deployment.md) — full deployment reference
- [Troubleshooting](./docs/troubleshooting.md) — all common failure modes with fixes
- [Tool Catalog](./docs/tools/README.md) — all 36 MCP tools
