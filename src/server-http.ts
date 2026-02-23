/**
 * Stackby MCP Server — HTTP entry point for hosted mode (e.g. ChatGPT, ALB).
 * Per-request API key via X-Stackby-API-Key or Authorization: Bearer <key>.
 * GET /health for ALB health checks; POST /mcp and GET /mcp for MCP.
 */
import * as http from "node:http";
import { createStackbyMcpServer } from "./mcp-server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runWithRequestContext } from "./request-context.js";

const PORT = Number(process.env.PORT) || 3001;
const MCP_PATH = "/mcp";
const HEALTH_PATH = "/health";

/** Normalize path for comparison (lowercase, no trailing slash). */
function normalizePath(raw: string): string {
  const p = (raw || "").split("?")[0].trim().toLowerCase();
  return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function getApiKeyFromRequest(req: http.IncomingMessage): string | undefined {
  const header = req.headers["x-stackby-api-key"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return undefined;
}

function getApiUrlFromRequest(req: http.IncomingMessage): string | undefined {
  const header = req.headers["x-stackby-api-url"];
  return typeof header === "string" && header.trim() ? header.trim() : undefined;
}

/** True if body is a single JSON-RPC notification (no id) or batch of same — server should respond 202 with empty body. */
function isNotificationOnly(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  if (Array.isArray(obj)) {
    return obj.length === 0 || obj.every((m) => isNotificationOnly(m));
  }
  return "jsonrpc" in obj && "method" in obj && !("id" in obj && obj.id !== undefined && obj.id !== null);
}

/** Serialize any thrown value into a JSON-safe object so the client sees the real error. */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      error: "MCP handler error",
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...("code" in err && typeof (err as { code: unknown }).code === "string" && { code: (err as { code: string }).code }),
    };
  }
  return {
    error: "MCP handler error",
    message: String(err),
  };
}

async function main(): Promise<void> {
  // Log unhandled rejections (e.g. from SDK after response started) so hosted logs show the real error
  process.on("unhandledRejection", (reason, promise) => {
    console.error("[MCP] Unhandled rejection:", reason);
  });

  const mcpServer = createStackbyMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless for hosted
  });
  await mcpServer.connect(transport);

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "";
    const path = normalizePath(url);

    if (path === HEALTH_PATH && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    console.log("path", path);
    console.log("req.method", req.method);
    console.log("req.headers", req.headers);
    console.log("req.url", req.url);
    console.log("req.body", await readBody(req));
    if (path === MCP_PATH && (req.method === "POST" || req.method === "GET")) {
      const apiKey = getApiKeyFromRequest(req);
      const apiUrl = getApiUrlFromRequest(req);
      if (!apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing API key. Send X-Stackby-API-Key or Authorization: Bearer <key>." }));
        return;
      }
      let parsedBody: unknown;
      try {
        if (req.method === "POST") {
          parsedBody = await readBody(req);
        } else {
          parsedBody = undefined;
        }
        // Notification-only POST (e.g. notifications/initialized): respond 202 empty per MCP streamable HTTP spec
        if (req.method === "POST" && isNotificationOnly(parsedBody)) {
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end("");
          return;
        }
        await runWithRequestContext({ apiKey, apiUrl }, () => transport.handleRequest(req, res, parsedBody));
      } catch (err) {
        const payload = serializeError(err);
        const message = (payload.message as string) ?? String(err);
        console.error("[MCP /mcp] Error handling request:", message);
        if (payload.stack) console.error(payload.stack);
        const errorHeader = encodeURIComponent(message.slice(0, 200));
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json", "X-MCP-Error": errorHeader });
          res.end(JSON.stringify(payload));
        } else {
          try {
            res.setHeader("X-MCP-Error", errorHeader);
          } catch {
            // headers already sent
          }
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    console.log(`Stackby MCP HTTP server listening on port ${PORT}`);
    console.log(`  GET  ${HEALTH_PATH} — health check`);
    console.log(`  POST ${MCP_PATH} — MCP (send X-Stackby-API-Key or Authorization: Bearer <key>)`);
    console.log(`  GET  ${MCP_PATH} — MCP SSE`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
