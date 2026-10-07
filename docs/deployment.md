# Deployment

This guide covers everything needed to install, configure, and run the Stackby MCP Server — from a one-line `npx` command through Docker and PM2-managed production deployments.

---

## Table of Contents

1. [Environment Variables](#1-environment-variables)
2. [Installation Methods](#2-installation-methods)
3. [Cursor Configuration (mcp.json)](#3-cursor-configuration-mcpjson)
4. [Claude Desktop Configuration](#4-claude-desktop-configuration)
5. [Verifying Connectivity](#5-verifying-connectivity)
6. [Docker](#6-docker)

---

## 1. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `STACKBY_API_KEY` | **Yes** (stdio); optional for HTTP when per-request header is present | _(none)_ | API key or Personal Access Token. Used by stdio transport as the sole credential. In HTTP mode, serves as a fallback when no `X-Stackby-API-Key` request header is sent. |
| `STACKBY_BEARER_TOKEN` | No | _(none)_ | Alternative bearer token credential. Supplied via the `Authorization: Bearer <token>` request header in HTTP mode. When present, it takes precedence over `STACKBY_API_KEY` for that request. |
| `STACKBY_API_URL` | No | `https://stackby.com` | Override the base URL for all outbound Stackby API calls. Useful for self-hosted Stackby instances. The per-request `X-Stackby-API-URL` header takes precedence over this variable when both are set. |
| `PORT` | No | `3001` | TCP port the HTTP server listens on. Applies to HTTP transport mode only (`npm run start:http`). |

### Credential resolution priority

For each incoming request the server resolves credentials in this order:

1. `X-Stackby-API-Key` request header (HTTP mode only)
2. `Authorization: Bearer <token>` request header (HTTP mode only)
3. `STACKBY_API_KEY` environment variable (stdio and HTTP fallback)

Both `x-api-key` and `Authorization: Bearer` headers are sent on every outbound call to the Stackby backend, each populated with the resolved credential value.

---

## 2. Installation Methods

### Method 1 — npx (no install required)

Run directly without a global install. This is the recommended method for Cursor and quick testing:

```bash
npx stackby-mcp-server
```

Pass this as the `command` field in `mcp.json` (see [Cursor Configuration](#3-cursor-configuration-mcpjson)).

### Method 2 — Global npm install

Install once and run the binary from anywhere:

```bash
npm install -g stackby-mcp-server
stackby-mcp-server   # stdio mode
```

### Method 3 — Build from source

Clone the repository, install dependencies, build, and run:

```bash
git clone https://github.com/stackbyhq/stackby-mcp-server
cd stackby-mcp-server
npm install
npm run build

# stdio mode (Cursor, Claude Desktop)
npm start

# HTTP mode (hosted, ChatGPT)
npm run start:http
```

The TypeScript compiler (`tsc`) writes output to `dist/`. The minimum Node.js version is **18**.

#### Production HTTP deployment with PM2

```bash
npm run pm2:start    # start as background process named "mcp-backend"
npm run pm2:restart  # restart after a code update
npm run pm2:stop     # stop the process
```

---

## 3. Cursor Configuration (mcp.json)

Add one of the following blocks to your Cursor `mcp.json` file. The file is typically located at `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level).

### Stdio mode (npx — recommended)

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

The server process runs locally alongside Cursor and communicates over stdio. The API key is passed via the `env` block.

### Hosted HTTP mode (mcp.stackby.com)

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

This connects to the Stackby-hosted MCP endpoint. No local server process is required.

### Local HTTP testing

Use this during development when running `npm run start:http` locally:

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

Change `3001` to match your `PORT` environment variable if you overrode the default.

---

## 4. Claude Desktop Configuration

> **Note:** Claude Desktop supports **stdio transport only**. The HTTP (`streamableHttp`) transport mode is not available in Claude Desktop.

Edit the Claude Desktop configuration file at:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

After saving, restart Claude Desktop. The Stackby tools will appear in the tool list.

---

## 5. Verifying Connectivity

The `list-workspaces` utility script makes a single `GET /api/v1/mcp/workspaces` call and prints all workspaces accessible with the configured API key. Use it to confirm the key is valid before wiring up an AI client.

```bash
# Build first if you haven't already
npm run build

# Run the utility (set your API key in the environment)
STACKBY_API_KEY=your_api_key_here node dist/list-workspaces.js
```

**Example output:**

```
API: https://stackby.com
Workspaces (2):
  - My Team (id: ws_abc123)
  - Personal (id: ws_def456)
```

If the key is invalid or unset the script exits with a non-zero code and prints an error to stderr. No workspaces returned (empty list) means the key is valid but the account has no workspaces yet.

---

## 6. Docker

The `Dockerfile` in the repository root builds the server image. The default entrypoint runs **stdio mode**. Override the entrypoint to run **HTTP mode**.

### Build the image

```bash
docker build -t stackby-mcp-server .
```

### Run in stdio mode (default)

```bash
docker run -e STACKBY_API_KEY=your_api_key_here stackby-mcp-server
```

### Run in HTTP mode (override entrypoint)

```bash
docker run \
  -p 3001:3001 \
  -e STACKBY_API_KEY=your_api_key_here \
  --entrypoint node \
  stackby-mcp-server \
  dist/server-http.js
```

### Custom port

Set `PORT` and update the `-p` flag to match:

```bash
docker run \
  -p 8080:8080 \
  -e STACKBY_API_KEY=your_api_key_here \
  -e PORT=8080 \
  --entrypoint node \
  stackby-mcp-server \
  dist/server-http.js
```

---

## See Also

- [Authentication](./authentication.md) — credential types, per-request isolation, header precedence
- [HTTP Server](./http-server.md) — routes, error responses, OAuth endpoints
- [Troubleshooting](./troubleshooting.md) — common failure modes and fixes
- [Architecture](./architecture.md) — transport modes, source file responsibilities
