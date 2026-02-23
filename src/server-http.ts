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

/** Read and parse POST body once. SDK uses parsedBody when provided and does not read from req. */
async function readBody(req: http.IncomingMessage): Promise<{ body: unknown; rawLength: number }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const rawLength = raw.length;
  if (!raw.trim()) return { body: undefined, rawLength };
  try {
    return { body: JSON.parse(raw) as unknown, rawLength };
  } catch {
    return { body: undefined, rawLength };
  }
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

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "";
    const path = normalizePath(url);

    if (path === HEALTH_PATH && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    if (path === MCP_PATH && (req.method === "POST" || req.method === "GET")) {
      const apiKey = getApiKeyFromRequest(req);
      const apiUrl = getApiUrlFromRequest(req);
      if (!apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing API key. Send X-Stackby-API-Key or Authorization: Bearer <key>." }));
        return;
      }
      try {
        let parsedBody: unknown;
        if (req.method === "POST") {
          const { body, rawLength } = await readBody(req);
          parsedBody = body;
          // POST body was empty or invalid JSON; stream is consumed so SDK must not read req. Return 400 ourselves.
          if (parsedBody === undefined) {
            console.error("[MCP /mcp] POST body empty or invalid JSON, raw length:", rawLength);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: {
                  code: -32700,
                  message: rawLength === 0 ? "Parse error: Request body is empty" : "Parse error: Invalid JSON",
                },
                id: null,
              })
            );
            return;
          }
        } else {
          parsedBody = undefined;
        }
        // Stateless: use a fresh server + transport per request so we never hit "Already connected to a transport".
        const mcpServer = createStackbyMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await mcpServer.connect(transport);
        // Pass parsedBody explicitly so the SDK uses it and does not read from req (stream already consumed).
        await runWithRequestContext({ apiKey, apiUrl }, () => transport.handleRequest(req, res, parsedBody));
      } catch (err) {
        const payload = serializeError(err);
        const message = (payload.message as string) ?? String(err);
        console.error("[MCP /mcp] Error handling request:", message);
        if (payload.stack) console.error(payload.stack);
        const errorHeader = encodeURIComponent(message.slice(0, 200));
        if (!res.headersSent) {
          res.writeHead(500, {
            "Content-Type": "application/json; charset=utf-8",
            "X-MCP-Error": errorHeader,
          });
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
