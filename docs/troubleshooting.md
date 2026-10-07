# Troubleshooting

This guide covers the most common failure modes you will encounter when configuring and running the Stackby MCP Server. Each entry describes the observable symptom, explains the root cause, and gives a step-by-step fix.

For quick cross-reference, the failure modes are:

1. ["Error - Show Output" in Cursor](#1-error---show-output-in-cursor)
2. [Missing auth credential (HTTP 401)](#2-missing-auth-credential-http-401)
3. [POST body empty or invalid JSON (HTTP 400)](#3-post-body-empty-or-invalid-json-http-400)
4. ["Already connected to a transport" (HTTP 500)](#4-already-connected-to-a-transport-http-500)
5. [Diagnosing Stackby API errors](#5-diagnosing-stackby-api-errors)
6. [`X-MCP-Error` header for quick HTTP 500 triage](#6-x-mcp-error-header-for-quick-http-500-triage)
7. [stdio works but hosted URL returns errors](#7-stdio-works-but-hosted-url-returns-errors)

---

## 1. "Error - Show Output" in Cursor

**Symptom**

The Stackby entry in Cursor's MCP panel shows an `Error` status (a red indicator or the text "Error" next to the server name) and no tools are available.

**Root Cause**

The underlying Node.js process that Cursor launched exited immediately or threw an uncaught exception during startup. Common causes include:

- Missing `STACKBY_API_KEY` in the `env` block so the process crashed on the first tool call.
- A wrong path in `command` or `args` — the binary was not found.
- An incompatible Node.js version (requires `>=18`).
- A build that was never run, so `dist/index.js` does not exist.

**Fix**

1. In Cursor, open **Settings → MCP**.
2. Find the `stackby` entry and click **Show Output** (or "View Logs").
3. Read the Node.js error message printed there. Common messages and their fixes are in the table below.

| Error message in output | Fix |
|---|---|
| `Cannot find module 'dist/index.js'` or `ENOENT` | Run `npm run build` in the project directory to compile the TypeScript source. |
| `No auth credential found` | Add `STACKBY_API_KEY` to the `env` block in `mcp.json` (see [Deployment](deployment.md)). |
| `Error: STACKBY_API_KEY is not set` | Same as above. |
| `node: bad option` or `SyntaxError` | Check that your Node.js version is `>=18` with `node --version`. |
| `MODULE_NOT_FOUND` for `@modelcontextprotocol/sdk` | Run `npm install` to install dependencies. |

After applying the fix, save `mcp.json` and Cursor will restart the server automatically.

---

## 2. Missing Auth Credential (HTTP 401)

**Symptom**

Every tool call returns an error like:

```
Failed to list workspaces: Stackby API 401: Unauthorized
```

Or, in HTTP mode, the server itself returns:

```json
{ "error": "Missing auth credential. Send X-Stackby-API-Key or Authorization: Bearer <token>." }
```

**Root Cause**

The server received no usable credential. In **stdio mode** this means `STACKBY_API_KEY` is absent from (or empty in) the `env` block of `mcp.json`. In **HTTP mode** this means neither the `X-Stackby-API-Key` header nor the `Authorization: Bearer` header was included in the request.

**Fix**

**stdio mode** — add (or correct) `STACKBY_API_KEY` in your Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "stackby": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "STACKBY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

**HTTP mode** — add the `X-Stackby-API-Key` header to your MCP client configuration:

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

To verify your API key is correct and working before configuring the AI client, run:

```bash
STACKBY_API_KEY=your_api_key_here node dist/list-workspaces.js
```

This prints your accessible workspaces or a clear error if the key is invalid. See [Deployment](deployment.md) for full environment variable documentation.

---

## 3. POST Body Empty or Invalid JSON (HTTP 400)

**Symptom**

The HTTP MCP endpoint returns `400` with a JSON-RPC error body:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32700,
    "message": "Parse error: Request body is empty"
  },
  "id": null
}
```

Or:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32700,
    "message": "Parse error: Invalid JSON"
  },
  "id": null
}
```

**Root Cause**

The server read the request body from `POST /mcp` and found it was either empty (zero bytes) or contained text that `JSON.parse` rejected. The MCP protocol requires every `POST /mcp` request to carry a valid JSON-RPC message. If the body is absent or malformed, the server returns `400` immediately — before any MCP processing occurs — because the stream has already been consumed and cannot be replayed.

**Fix**

1. Verify your MCP client is sending a `Content-Type: application/json` header and a well-formed JSON body on every POST.
2. Check your client version. Older versions of some MCP clients sent GET requests to initiate a session rather than POST. Update to a version that implements the Streamable HTTP transport.
3. If you are calling the endpoint programmatically, ensure you are serializing the payload with `JSON.stringify` before sending, and that the body is not accidentally stringified twice (i.e., sent as the JSON string `"\"{...}\""` instead of the object `{...}`).
4. If you are behind a proxy or load balancer, confirm it is not stripping the request body.

---

## 4. "Already connected to a transport" (HTTP 500)

**Symptom**

The `/mcp` endpoint returns `HTTP 500` and the response body (or the `X-MCP-Error` header) contains:

```
Already connected to a transport
```

**Root Cause**

The MCP SDK throws this error when `mcpServer.connect(transport)` is called on an `McpServer` instance that is already connected to a different transport. This happens when a single `McpServer` object is shared across multiple HTTP requests. On the second (and every subsequent) request, the existing connection is still present, so the SDK refuses to attach a second transport to the same server.

**Fix**

Each incoming `POST /mcp` request must create its own fresh `McpServer` instance and its own fresh `StreamableHTTPServerTransport`. The stateless pattern already implemented in `src/server-http.ts` does exactly this:

```typescript
// Inside the request handler — correct pattern
const mcpServer = createStackbyMcpServer();          // new instance per request
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
await mcpServer.connect(transport);
await transport.handleRequest(req, res, parsedBody);
```

If you have modified `server-http.ts` and moved `createStackbyMcpServer()` outside the request handler (for example, to a module-level variable), move it back inside so it runs on every request.

---

## 5. Diagnosing Stackby API Errors

**Symptom**

A tool call returns an error message of the form:

```
Failed to list records: Stackby API 404: Not Found
```

or:

```
Failed to create record: Stackby API 400: Bad Request
```

**Root Cause**

The Stackby backend returned a non-2xx HTTP response. The MCP server catches the error thrown by `stackby-api.ts` and surfaces it as an `isError: true` tool response. The short message visible to the AI client is only a summary; the full diagnostic detail is written to the server's **stderr**.

**Fix**

1. **Check server stderr.** The full error record written there includes:

   | Field | Contents |
   |---|---|
   | `status` | The HTTP status code returned by the Stackby backend |
   | `authMode` | Which credential was used (`apiKey` or `bearerToken`) |
   | `responseError` | The error type string from the backend JSON |
   | `responseBody` | The raw response body from the backend |

   In stdio mode (Cursor, Claude Desktop) this appears in the "Show Output" / logs panel. In HTTP mode it appears in the process stdout/stderr stream (check your PM2 logs with `pm2 logs` or your Docker container logs with `docker logs`).

2. **Match the status code to the likely cause:**

   | Status | Typical cause | Fix |
   |---|---|---|
   | `401` / `403` | Wrong or expired API key | Verify `STACKBY_API_KEY` is correct and active in your Stackby account settings |
   | `404` | `stackId`, `tableId`, `recordId`, or other ID does not exist | Use `list_stacks` / `list_tables` / `describe_table` to retrieve valid IDs |
   | `400` | Request body is missing a required field or a field has an invalid value | Review the tool's required parameters and check the `responseBody` for the backend's specific error message |
   | `429` | Rate limit exceeded | Reduce the frequency of calls or add delays between bulk operations |
   | `500` | Stackby backend error | Check [status.stackby.com](https://stackby.com) and retry; if persistent, contact Stackby support with the `responseBody` from your logs |

3. **Confirm the base URL** is correct. If you have set `STACKBY_API_URL` or the `X-Stackby-API-URL` header to a custom value, verify the URL is reachable and returns valid JSON from the Stackby API.

---

## 6. `X-MCP-Error` Header for Quick HTTP 500 Triage

**Symptom**

The `/mcp` endpoint returns `HTTP 500`. The JSON body is large (containing a full stack trace) and your environment — for example, an ALB access log or a proxy layer — can only capture response headers, not bodies.

**Root Cause**

An unhandled exception was thrown inside the MCP request handler. The server set both a structured JSON body and the `X-MCP-Error` response header before returning `500`.

**Fix**

Read the `X-MCP-Error` response header. Its value is a URL-encoded excerpt of the error message, truncated to 200 characters. This gives you the error cause without requiring JSON body parsing.

**Example header value (after URL-decoding):**

```
Stackby API 401: Unauthorized
```

or:

```
Cannot read properties of undefined (reading 'stackId')
```

**Steps:**

1. Capture the `X-MCP-Error` header from the `500` response (via `curl -v`, an HTTP proxy, or your load balancer access logs).
2. URL-decode the value: in a browser DevTools console run `decodeURIComponent(headerValue)`, or use any online decoder.
3. Use the decoded message to identify the failure (missing parameter, auth error, upstream error) and apply the appropriate fix from this guide.
4. If you need the full stack trace, check the server's stderr output (see [Failure Mode 5](#5-diagnosing-stackby-api-errors)) where the complete `error.stack` is also logged.

---

## 7. stdio Works but Hosted URL Returns Errors

**Symptom**

The server works perfectly when configured with stdio transport in Cursor or Claude Desktop, but switching to the hosted URL (`https://mcp.stackby.com/mcp`) or a self-hosted HTTP endpoint results in tool errors or HTTP 401 responses.

**Root Cause**

The stdio configuration uses `STACKBY_API_KEY` as an environment variable on the local process, so the credential is always present. In HTTP mode there is no environment variable — every request must supply the credential in an HTTP header. If the `streamableHttp` configuration block is missing the `X-Stackby-API-Key` header, the server receives requests with no credential and returns `401`.

**Fix**

Add the `X-Stackby-API-Key` header to the `streamableHttp` configuration block:

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

For local HTTP testing, use the same pattern with `http://localhost:3001/mcp`:

```json
{
  "mcpServers": {
    "stackby-local": {
      "type": "streamableHttp",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "X-Stackby-API-Key": "your_api_key_here"
      }
    }
  }
}
```

Note: `Authorization: Bearer <token>` is also accepted in place of `X-Stackby-API-Key` if your Stackby account uses a bearer token. See [Authentication](authentication.md) for the full credential resolution order.

---

## Related Documentation

- [Authentication](authentication.md) — credential resolution order, per-request isolation, 401 behavior
- [HTTP Server](http-server.md) — all HTTP routes, error response shapes, `X-MCP-Error` header details
- [Deployment](deployment.md) — environment variables, `mcp.json` configuration examples, Docker setup
- [Architecture](architecture.md) — stateless per-request model and the "already connected" error in context
