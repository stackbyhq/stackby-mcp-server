# HTTP Server (`src/server-http.ts`)

## Overview

The HTTP transport mode exposes the Stackby MCP Server as a standard HTTPS endpoint rather than a stdio process. This mode is designed for AI clients that communicate over HTTP — such as ChatGPT plugins and other web-based MCP clients — and is used for the publicly hosted instance at `mcp.stackby.com`.

The HTTP server is **fully stateless**: every POST request to `/mcp` creates a brand-new `McpServer` instance and a brand-new `StreamableHTTPServerTransport`. There is no shared state, no session, and no connection reuse between requests. Concurrent requests are completely isolated from one another.

Use HTTP transport when:
- Your AI client connects over a URL rather than launching a local process (e.g. ChatGPT, any cloud-hosted MCP client).
- You are running a shared, multi-tenant deployment (e.g. `mcp.stackby.com`) where many users each send their own API key per request.
- You need load balancer health checks (`GET /health`).

Use stdio transport ([`src/index.ts`](../src/index.ts)) for local clients like Cursor and Claude Desktop that launch the server as a child process.

---

## Route Table

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | ALB / load balancer health check. Returns `200 OK` with body `OK`. No authentication required. |
| `POST` | `/mcp` | MCP JSON-RPC endpoint. Processes tool calls from AI clients. Requires `X-Stackby-API-Key` or `Authorization: Bearer` header. |
| `GET` | `/mcp` | MCP SSE (Server-Sent Events) stream for clients that use the SSE transport variant. Same auth requirement as POST. |
| `GET` | `/.well-known/oauth-authorization-server` | OAuth 2.0 authorization server metadata discovery document. |
| `GET` | `/mcp/.well-known/oauth-authorization-server` | Same OAuth 2.0 metadata at the MCP-relative path (for clients that prepend `/mcp` to discovery paths). |
| `GET` | `/oauth/authorize` | Redirect proxy. Forwards the request (with query string) to `https://stackby.com/oauth/authorize` via HTTP 302. |
| `POST` | `/oauth/token` | Token proxy. Forwards the request body to `https://stackby.com/api/oauth/token` and streams the response back to the client. |
| `*` | `*` (catch-all) | Returns `404 Not Found` with a plain-text body for any route not matched above. |

---

## POST /mcp Request Flow

The following steps happen in order for every `POST /mcp` request:

1. **Authentication check** — The server reads the `X-Stackby-API-Key` header and the `Authorization: Bearer <token>` header. If neither is present, the request is rejected immediately with `HTTP 401` and a JSON error body. No MCP processing occurs.

2. **Read and buffer the body** — The full request body is read from the Node.js `IncomingMessage` stream and accumulated in memory as a UTF-8 string. This step consumes the stream entirely.

3. **Parse the body as JSON** — The buffered string is parsed with `JSON.parse`. If the body is empty (`rawLength === 0`) or the parse throws, the server returns `HTTP 400` with a JSON-RPC parse error (`"code": -32700`) and does **not** forward the request to the MCP handler.

4. **Create a fresh `McpServer` + `StreamableHTTPServerTransport`** — A new server instance and transport instance are constructed for this request only. This is the mechanism that guarantees stateless isolation — no instance is ever reused.

5. **Wrap in `runWithRequestContext`** — The resolved credentials (`apiKey`, `bearerToken`) and the optional API URL override (`apiUrl`) are placed into an `AsyncLocalStorage` context scoped to this request's async execution tree. All downstream API calls in `stackby-api.ts` read credentials from this context rather than from `process.env`.

6. **Call `transport.handleRequest` with the pre-parsed body** — The SDK method is invoked with the already-parsed body object. Because the stream was fully consumed in step 2, this prevents the SDK from attempting to re-read a closed stream (see [Why Pre-Parse the Body?](#why-pre-parse-the-body) below).

7. **Error handling** — If the MCP handler throws an unhandled exception, the server catches it, writes the error to stderr, and responds with `HTTP 500`. A structured JSON body and the `X-MCP-Error` response header are set (see [Error Response Shapes](#error-response-shapes) below).

---

## Why Pre-Parse the Body?

An HTTP request body in Node.js is a **readable stream**. Like all Node.js streams, it can only be read once — once the bytes have been consumed, attempting to read the stream again returns nothing.

The MCP SDK's `StreamableHTTPServerTransport.handleRequest()` would normally read the body itself from the raw `IncomingMessage` object. However, by the time the server has validated the JSON (step 3 above), the stream is already fully consumed. If the SDK then tried to read it, it would see an empty stream and fail.

The solution is to read and parse the body **before** creating the transport, then pass the already-parsed JavaScript object directly to `transport.handleRequest(req, res, parsedBody)`. When a `parsedBody` argument is provided, the SDK uses it instead of reading from `req`. This prevents stream re-read errors entirely.

---

## Error Response Shapes

| Condition | HTTP Status | Response Body | Notable Header |
|-----------|-------------|---------------|----------------|
| Missing auth credential (no `X-Stackby-API-Key` and no `Authorization: Bearer`) | `401` | `{ "error": "Missing auth credential. Send X-Stackby-API-Key or Authorization: Bearer <token>." }` | — |
| Empty request body | `400` | `{ "jsonrpc": "2.0", "error": { "code": -32700, "message": "Parse error: Request body is empty" }, "id": null }` | — |
| Invalid JSON in request body | `400` | `{ "jsonrpc": "2.0", "error": { "code": -32700, "message": "Parse error: Invalid JSON" }, "id": null }` | — |
| Unhandled exception in MCP handler | `500` | `{ "error": "MCP handler error", "name": "<ErrorClass>", "message": "<error message>", "stack": "<stack trace>" }` | `X-MCP-Error: <url-encoded excerpt, max 200 chars>` |

The `X-MCP-Error` header on `500` responses contains a URL-encoded substring of the error message truncated to 200 characters. It can be read from the response headers without parsing the JSON body, which is useful when the body is large or the client cannot easily parse JSON error responses.

---

## OAuth 2.0 Metadata

The `GET /.well-known/oauth-authorization-server` and `GET /mcp/.well-known/oauth-authorization-server` routes return an OAuth 2.0 Authorization Server Metadata document ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)). The `issuer` and endpoint URLs are derived from the incoming `Host` header. The `jwks_uri` always points to the main Stackby site.

```json
{
  "issuer": "https://<host>",
  "authorization_endpoint": "https://<host>/oauth/authorize",
  "token_endpoint": "https://<host>/oauth/token",
  "jwks_uri": "https://stackby.com/api/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "token_endpoint_auth_methods_supported": [
    "client_secret_post",
    "client_secret_basic",
    "none"
  ],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["schema:read", "data:read", "data:write"]
}
```

When the `Host` header contains `localhost`, the `issuer` and endpoint URLs use the `http` scheme; all other hosts use `https`.

---

## Configuration and Deployment

### PORT Environment Variable

The HTTP server listens on the port specified by the `PORT` environment variable. If `PORT` is not set, it defaults to `3001`.

```bash
PORT=8080 npm run start:http   # listen on port 8080
npm run start:http              # listen on port 3001 (default)
```

### Starting the HTTP Server Directly

```bash
npm run build
npm run start:http
```

### PM2 Process Manager

For production deployments, PM2 keeps the HTTP server alive across crashes and system reboots:

```bash
npm run pm2:start    # start the server under PM2
npm run pm2:restart  # apply a new build without downtime
npm run pm2:stop     # stop the PM2 process
```

### Docker (HTTP Mode)

The default Dockerfile entrypoint runs stdio mode. To run HTTP mode via Docker, override the entrypoint:

```bash
docker run -p 3001:3001 \
  --entrypoint node \
  stackby-mcp-server \
  dist/server-http.js
```

Map the container port with `-p <host-port>:<container-port>` and set `PORT` if you need a different port.

---

## Related Documentation

- [Authentication](authentication.md) — how credentials are extracted from request headers and scoped per-request
- [Architecture](architecture.md) — how the HTTP entry point fits into the overall system
- [Deployment](deployment.md) — full environment variable reference and Cursor/Claude Desktop configuration
- [Troubleshooting](troubleshooting.md) — diagnosing 401, 400, 500 errors and the "Already connected to a transport" failure mode
