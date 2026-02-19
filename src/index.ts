/**
 * Stackby MCP Server — stdio entry point (Cursor, Claude Desktop).
 * For hosted HTTP (ChatGPT), use server-http.js.
 */
import { createStackbyMcpServer } from "./mcp-server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main(): Promise<void> {
  const mcpServer = createStackbyMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
