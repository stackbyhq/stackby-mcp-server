/**
 * Per-request context for hosted (HTTP) mode.
 * When the MCP server is used over HTTP, each request carries the user's API key in headers.
 * We store it here so stackby-api can use it for that request only (stdio mode keeps using process.env).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  apiKey: string;
  apiUrl?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

export function getApiKeyFromContext(): string | undefined {
  const ctx = getRequestContext();
  return ctx?.apiKey?.trim() || undefined;
}

export function getApiUrlFromContext(): string | undefined {
  const ctx = getRequestContext();
  return ctx?.apiUrl?.trim() || undefined;
}
