/**
 * One-off script: list workspaces for the configured Stackby account.
 * Usage: npm run build && node dist/list-workspaces.js
 * Requires: STACKBY_API_KEY (or PAT) in environment.
 */
import { getWorkspaces, getApiBaseUrl, hasApiKey } from "./stackby-api.js";

async function main() {
  if (!hasApiKey()) {
    console.error("STACKBY_API_KEY is not set. Set it in your environment or MCP config.");
    process.exit(1);
  }
  try {
    const workspaces = await getWorkspaces();
    console.log(`API: ${getApiBaseUrl()}`);
    console.log(`Workspaces (${workspaces.length}):`);
    if (workspaces.length === 0) {
      console.log("  No workspaces found.");
    } else {
      for (const w of workspaces) {
        console.log(`  - ${w.name} (id: ${w.id})`);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to list workspaces:", message);
    process.exit(1);
  }
}

main();
