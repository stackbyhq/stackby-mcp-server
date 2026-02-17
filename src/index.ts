/**
 * Stackby MCP Server — entry point.
 * list_stacks, list_tables call real Stackby API.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  hasApiKey,
  getApiBaseUrl,
  getWorkspaces,
  getAllStacks,
  getTables,
  getTableViewList,
  describeTable,
  getRowList,
  searchRecords,
  getRecord,
  createRow,
  updateRows,
  deleteRows,
  createTable,
  createColumn,
} from "./stackby-api.js";

const mcpServer = new McpServer({
  name: "stackby-mcp-server",
  version: "0.1.0",
});

mcpServer.registerTool(
  "list_workspaces",
  {
    description: "List Stackby workspaces the user can access. Requires STACKBY_API_KEY (or PAT) in MCP config.",
    inputSchema: {},
  },
  async () => {
    if (!hasApiKey()) {
      return {
        content: [
          {
            type: "text" as const,
            text: "STACKBY_API_KEY is not set. Add it to your MCP config (e.g. in Cursor: .cursor/mcp.json → env.STACKBY_API_KEY) with your Stackby API key or Personal Access Token (PAT).",
          },
        ],
      };
    }
    try {
      const workspaces = await getWorkspaces();
      const lines = workspaces.length === 0
        ? ["No workspaces found."]
        : workspaces.map((w) => `- ${w.name} (id: ${w.id})`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Workspaces (${workspaces.length}):\n${lines.join("\n")}`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to list workspaces: ${message}. STACKBY_API_KEY and STACKBY_API_URL in use: ${getApiBaseUrl()}.`,
          },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "list_stacks",
  {
    description: "List Stackby stacks (bases) the user can access. Requires STACKBY_API_KEY (or PAT) in MCP config.",
    inputSchema: {},
  },
  async () => {
    if (!hasApiKey()) {
      return {
        content: [
          {
            type: "text" as const,
            text: "STACKBY_API_KEY is not set. Add it to your MCP config (e.g. in Cursor: .cursor/mcp.json → env.STACKBY_API_KEY) with your Stackby API key or Personal Access Token (PAT).",
          },
        ],
      };
    }
    try {
      const stacks = await getAllStacks();
      const lines = stacks.length === 0
        ? ["No stacks found."]
        : stacks.map((s) => `- ${s.stackName} (id: ${s.stackId}, workspace: ${s.workspaceName ?? s.workspaceId})`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Stacks (${stacks.length}):\n${lines.join("\n")}`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to list stacks: ${message}. STACKBY_API_KEY and STACKBY_API_URL in use: ${getApiBaseUrl()}.`,
          },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "list_tables",
  {
    description: "List tables in a Stackby stack. Use list_stacks first to get stack IDs.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
    },
  },
  async ({ stackId }) => {
    const id = stackId?.trim();
    if (!id) {
      return {
        content: [{ type: "text" as const, text: "stackId is required. Use list_stacks to get stack IDs." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const tables = await getTables(id);
      const lines = tables.length === 0
        ? ["No tables found in this stack."]
        : tables.map((t) => `- ${t.name} (id: ${t.id})`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Tables in stack ${id} (${tables.length}):\n${lines.join("\n")}`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to list tables: ${message}. Check stackId and API access.`,
          },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "describe_table",
  {
    description: "Get table schema: name, fields (columns with id, name, type), and views. Use list_tables to get stackId and tableId.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
    },
  },
  async ({ stackId, tableId }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    if (!sId || !tId) {
      return {
        content: [{ type: "text" as const, text: "stackId and tableId are required. Use list_stacks and list_tables to get IDs." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const schema = await describeTable(sId, tId);
      const fieldLines = schema.fields.length === 0
        ? ["(no fields)"]
        : schema.fields.map((f) => `  - ${f.name} (id: ${f.id}, type: ${f.type})`);
      const viewLines = schema.views.length === 0
        ? ["(no views)"]
        : schema.views.map((v) => `  - ${v.name} (id: ${v.id})`);
      const text = [
        `Table: ${schema.name} (id: ${schema.id})`,
        "",
        "Fields:",
        ...fieldLines,
        "",
        "Views:",
        ...viewLines,
      ].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to describe table: ${message}. Check stackId, tableId, and API access.` },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "list_records",
  {
    description: "List rows (records) in a table. Use list_stacks and list_tables to get stackId and tableId.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
      maxRecords: z.number().optional().describe("Max records to return (1–100, default 100)"),
    },
  },
  async ({ stackId, tableId, maxRecords }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    if (!sId || !tId) {
      return {
        content: [{ type: "text" as const, text: "stackId and tableId are required. Use list_stacks and list_tables to get IDs." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const records = await getRowList(sId, tId, { maxRecords: maxRecords ?? 100 });
      const lines =
        records.length === 0
          ? ["No records found."]
          : records.map((r) => `- id: ${r.id} | ${JSON.stringify(r.field)}`);
      const text = [`Records in table ${tId} (${records.length}):`, "", ...lines].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to list records: ${message}. Check stackId, tableId, and API access.` },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "search_records",
  {
    description: "Search for rows containing text in a table. Uses first column if fieldIds not provided. Use list_stacks and list_tables to get IDs.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
      searchTerm: z.string().describe("Text to search for"),
      fieldIds: z.array(z.string()).optional().describe("Optional column IDs to search in (uses first column if omitted)"),
      maxRecords: z.number().optional().describe("Max records to return (default 100)"),
    },
  },
  async ({ stackId, tableId, searchTerm, fieldIds, maxRecords }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    const term = searchTerm?.trim();
    if (!sId || !tId || term === undefined || term === "") {
      return {
        content: [{ type: "text" as const, text: "stackId, tableId, and searchTerm are required." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const columnId = fieldIds && fieldIds.length > 0 ? fieldIds[0] : undefined;
      const result = await searchRecords(sId, tId, term, { columnId, maxRecords });
      const count = result.rowIds.length;
      const lines =
        count === 0
          ? ["No matching records."]
          : result.rowIds.map((id, i) => `- id: ${id} | ${(result.rowname && result.rowname[i]) || ""}`);
      const text = [`Search "${term}" in table ${tId} (${count} match${count !== 1 ? "es" : ""}):`, "", ...lines].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to search records: ${message}. Check stackId, tableId, and API access.` },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "get_record",
  {
    description: "Get a single row (record) by id. Use list_records or search_records to get record IDs.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
      recordId: z.string().describe("Record (row) ID"),
    },
  },
  async ({ stackId, tableId, recordId }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    const rId = recordId?.trim();
    if (!sId || !tId || !rId) {
      return {
        content: [{ type: "text" as const, text: "stackId, tableId, and recordId are required." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const record = await getRecord(sId, tId, rId);
      if (!record) {
        return {
          content: [{ type: "text" as const, text: `No record found with id ${rId} in table ${tId}.` }],
        };
      }
      const text = [`Record ${record.id}:`, "", JSON.stringify(record.field, null, 2)].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to get record: ${message}. Check stackId, tableId, recordId, and API access.` },
        ],
        isError: true,
      };
    }
  }
);

// --- Phase 3: Write tools ---

mcpServer.registerTool(
  "create_record",
  {
    description: "Create a new row (record) in a table. Use describe_table to get column names. Fields are keyed by column name.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
      fields: z.record(z.string(), z.unknown()).describe("Field values keyed by column name (e.g. { \"Name\": \"Task 1\", \"Status\": \"Done\" })"),
    },
  },
  async ({ stackId, tableId, fields }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    if (!sId || !tId) {
      return {
        content: [{ type: "text" as const, text: "stackId and tableId are required." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return {
        content: [{ type: "text" as const, text: "fields must be an object of column names to values." }],
        isError: true,
      };
    }
    try {
      const records = await createRow(sId, tId, fields as Record<string, unknown>);
      const created = records[0];
      if (!created) {
        return {
          content: [{ type: "text" as const, text: "No record was created. Check table schema and field names." }],
          isError: true,
        };
      }
      const text = [`Created record: ${created.id}`, "", JSON.stringify(created.field, null, 2)].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to create record: ${message}. Check stackId, tableId, and field names (use describe_table).` },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "update_records",
  {
    description: "Update existing rows. Provide an array of { id, fields }. At most 10 records per request. Use describe_table for column names.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
      records: z
        .array(
          z.object({
            id: z.string().describe("Record (row) ID"),
            fields: z.record(z.string(), z.unknown()).describe("Field values to set (column name -> value)"),
          })
        )
        .min(1)
        .max(10)
        .describe("Records to update"),
    },
  },
  async ({ stackId, tableId, records }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    if (!sId || !tId) {
      return {
        content: [{ type: "text" as const, text: "stackId and tableId are required." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const updated = await updateRows(
        sId,
        tId,
        records.map((r) => ({ id: r.id, fields: r.fields as Record<string, unknown> }))
      );
      const lines = updated.map((r) => `- ${r.id}: ${JSON.stringify(r.field)}`);
      const text = [`Updated ${updated.length} record(s):`, "", ...lines].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to update records: ${message}. Check stackId, tableId, record IDs, and field names.` },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "delete_records",
  {
    description: "Soft-delete rows (records) by ID. At most 10 per request. Use list_records or search_records to get IDs.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
      recordIds: z.array(z.string()).min(1).max(10).describe("Record (row) IDs to delete"),
    },
  },
  async ({ stackId, tableId, recordIds }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    if (!sId || !tId) {
      return {
        content: [{ type: "text" as const, text: "stackId and tableId are required." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const result = await deleteRows(sId, tId, recordIds);
      const list = result?.records ?? [];
      const lines = list.map((r) => `- ${r.id}: deleted=${r.deleted}`);
      const text = [`Deleted ${list.length} record(s):`, "", ...lines].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to delete records: ${message}. Check stackId, tableId, and record IDs.` },
        ],
        isError: true,
      };
    }
  }
);

// --- Phase 4: Schema tools (create only; update later) ---

mcpServer.registerTool(
  "create_table",
  {
    description: "Create a new table in a stack. Use list_stacks to get stackId.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      name: z.string().describe("Table name"),
    },
  },
  async ({ stackId, name }) => {
    const sId = stackId?.trim();
    const tableName = name?.trim();
    if (!sId || !tableName) {
      return {
        content: [{ type: "text" as const, text: "stackId and name are required." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      const result = await createTable(sId, tableName);
      const id = result?.tableId ?? result?.id ?? "unknown";
      const text = [`Created table: ${tableName}`, `Table ID: ${id}`].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to create table: ${message}. Check stackId and plan limits.` },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "create_field",
  {
    description: "Create a new column (field) in a table. Use describe_table to see existing columns. For singleOption/multipleOptions pass options array.",
    inputSchema: {
      stackId: z.string().describe("Stack ID (from list_stacks)"),
      tableId: z.string().describe("Table ID (from list_tables)"),
      name: z.string().describe("Column name"),
      columnType: z.string().describe("Column type: shortText, longText, number, checkbox, dateAndTime, singleOption, multipleOptions, email, url, etc."),
      viewId: z.string().optional().describe("View ID (optional; first view used if omitted)"),
      options: z.array(z.string()).optional().describe("For singleOption/multipleOptions: choice labels"),
    },
  },
  async ({ stackId, tableId, name, columnType, viewId, options }) => {
    const sId = stackId?.trim();
    const tId = tableId?.trim();
    const colName = name?.trim();
    const type = columnType?.trim();
    if (!sId || !tId || !colName || !type) {
      return {
        content: [{ type: "text" as const, text: "stackId, tableId, name, and columnType are required." }],
        isError: true,
      };
    }
    if (!hasApiKey()) {
      return {
        content: [{ type: "text" as const, text: "STACKBY_API_KEY is not set. Add it to your MCP config." }],
      };
    }
    try {
      let viewIdToUse = viewId?.trim();
      if (!viewIdToUse) {
        const views = await getTableViewList(sId, tId);
        viewIdToUse = views.length > 0 ? views[0].id : "";
      }
      const result = await createColumn(sId, tId, colName, type, {
        viewId: viewIdToUse,
        options: options && options.length > 0 ? options : undefined,
      });
      const id = result?.columnId ?? result?.id ?? "unknown";
      const text = [`Created column: ${colName}`, `Column ID: ${id}`, `Type: ${type}`].join("\n");
      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Failed to create field: ${message}. Check stackId, tableId, name, columnType (use describe_table for types).` },
        ],
        isError: true,
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
