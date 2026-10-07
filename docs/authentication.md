# Authentication

## Overview

The Stackby MCP Server supports two credential types: an **API key** and a **bearer token**. In stdio mode both are supplied through environment variables; in HTTP mode they arrive as request headers on every incoming `/mcp` call. Regardless of transport, the server forwards both credentials on every outbound call to the Stackby backend — each request to `/api/v1/mcp/*` includes an `x-api-key` header and an `Authorization: Bearer` header populated from the resolved credential.

---

## Credential Types

| Credential | stdio mode | HTTP mode |
|---|---|---|
| **API Key** | `STACKBY_API_KEY` environment variable | `X-Stackby-API-Key` request header |
| **Bearer Token** | `STACKBY_BEARER_TOKEN` environment variable | `Authorization: Bearer <token>` request header |

Both credential values are forwarded to the Stackby backend on every outbound API call as:

```
x-api-key: <resolved_key>
Authorization: Bearer <resolved_key>
```

When a bearer token is available it is used exclusively (both headers receive the bearer token value). When only an API key is present, both headers receive the API key value. This dual-header pattern satisfies the `devapi` authentication mode required by all `/api/v1/mcp/*` backend endpoints.

---

## HTTP Mode: Per-Request Isolation

In HTTP mode, credentials are extracted from the incoming request headers at the start of each POST to `/mcp`:

- `X-Stackby-API-Key` → API key
- `Authorization: Bearer <token>` → bearer token
- `X-Stackby-API-URL` → optional base URL override

These values are stored in a [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) store (`request-context.ts`) that is scoped to the async execution tree of that single request via `runWithRequestContext()`. Every downstream function call — including `authHeaders()` in `stackby-api.ts` — reads credentials from this store using `getApiKeyFromContext()` and `getBearerTokenFromContext()`.

Because `AsyncLocalStorage` is scoped per async tree, **concurrent requests never share credential state**. One request cannot read or overwrite another request's API key even when many requests are in flight simultaneously.

In stdio mode there is no `AsyncLocalStorage` store; `authHeaders()` falls back directly to `process.env.STACKBY_API_KEY` and `process.env.STACKBY_BEARER_TOKEN`.

---

## Credential Resolution Priority

```mermaid
flowchart TD
    A[Incoming request] --> B{HTTP or stdio?}

    B -->|HTTP| C{X-Stackby-API-Key header present?}
    C -->|yes| D[Use header API key]
    C -->|no| E{Authorization: Bearer header present?}
    E -->|yes| F[Use bearer token]
    E -->|no| G[HTTP 401 — returned before any MCP processing]

    B -->|stdio| H{STACKBY_BEARER_TOKEN env set?}
    H -->|yes| I[Use bearer token from env]
    H -->|no| J{STACKBY_API_KEY env set?}
    J -->|yes| K[Use API key from env]
    J -->|no| L[Error thrown when first API call is made]

    D --> M[Stored in AsyncLocalStorage for this request only]
    F --> M
    I --> N[Read directly from process.env on each call]
    K --> N

    M --> O[authHeaders\\(\\) resolves credential]
    N --> O
    O --> P[x-api-key + Authorization: Bearer on every outbound call]
```

A per-request HTTP credential always takes precedence over environment variables. This allows a single server binary to serve both local stdio clients (using env-var credentials) and hosted HTTP clients (using per-request header credentials) simultaneously.

---

## Base URL Resolution

The base URL used for all Stackby backend calls is resolved in this order:

| Source | Priority |
|---|---|
| `X-Stackby-API-URL` request header (HTTP mode) | Highest |
| `STACKBY_API_URL` environment variable | Second |
| Hardcoded default `https://stackby.com` | Lowest |

Trailing slashes are stripped from the resolved URL before it is used. The resolved value is available via `getApiBaseUrl()` in `stackby-api.ts` and is logged in error output when a request to the backend fails.

---

## 401 Response for Missing Credentials

When a `POST /mcp` request arrives without any credential header — neither `X-Stackby-API-Key` nor `Authorization: Bearer` — the HTTP server rejects the request immediately with:

```
HTTP 401 Unauthorized
Content-Type: application/json

{ "error": "Missing auth credential. Send X-Stackby-API-Key or Authorization: Bearer <token>." }
```

This check runs **before** the MCP transport is initialized and before any MCP processing occurs. No `McpServer` instance is created for unauthenticated requests.

---

## Outbound Headers

Every HTTP request made by `stackby-api.ts` to the Stackby backend includes the following headers, regardless of which transport mode is in use:

```
x-api-key: <resolved_key>
Authorization: Bearer <resolved_key>
Content-Type: application/json
```

When a bearer token is the resolved credential, all three slots are populated from that token. When only an API key is present, both `x-api-key` and `Authorization: Bearer` receive the API key value. If neither credential is available when `authHeaders()` is called, the function throws:

```
Error: No auth credential set. Provide STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config,
or send X-Stackby-API-Key / Authorization: Bearer <token> (hosted).
```

This error propagates as a tool-level error to the AI client (`isError: true`).

---

## Self-Hosted Stackby

If you run your own Stackby instance, override the base URL so all API calls are directed to your server:

**stdio mode** — set the environment variable:

```bash
STACKBY_API_URL=https://stackby.example.com
```

**HTTP mode** — pass the header on each request:

```
X-Stackby-API-URL: https://stackby.example.com
```

The per-request header takes precedence over the environment variable, so you can point different HTTP clients at different Stackby instances by varying the header value while keeping a single server process running.
