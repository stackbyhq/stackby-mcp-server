/**
 * Shared MCP server and tool registration (used by stdio and HTTP entry points).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  hasAuthCredential,
  getApiBaseUrl,
  getWorkspaces,
  getAllStacks,
  getStacks,
  getTables,
  getTableViewList,
  createView,
  renameView,
  deleteView,
  describeTable,
  getRowList,
  searchRecords,
  getRecord,
  createRow,
  updateRows,
  deleteRows,
  createTable,
  createColumn,
  createStack,
  mcpDashboardAction,
  mcpBlockAction,
} from "./stackby-api.js";
import { applyStackTemplate, type TemplateTableInput } from "./stack-template.js";

/** Zod schemas for optional AI-friendly stack templates on create_stack */
const templateColumnSchema = z.object({
  name: z.string(),
  columnType: z.string(),
  options: z.array(z.string()).optional(),
  linkToTableKey: z
    .string()
    .optional()
    .describe(
      "For link: target table `key`. For lookup / lookupCount / aggregation: same — the linked table's template key."
    ),
  formulaText: z.string().optional(),
  linkToTableViewId: z.string().optional(),
  linkColumnName: z
    .string()
    .optional()
    .describe("For lookup / rollup / count: name of the link column on this table (must appear earlier in columns)"),
  linkColumnId: z.string().optional(),
  linkedColumnName: z
    .string()
    .optional()
    .describe("For lookup / aggregation: column name on the linked table to pull or roll up"),
  linkedColumnId: z.string().optional(),
});

const templateRowSchema = z.object({
  rowKey: z
    .string()
    .optional()
    .describe("Stable id for this row; reference from link fields via __linkRowKeys / __linkRowKey"),
  fields: z
    .record(z.string(), z.unknown())
    .describe(
      'Column name → value. For link columns use { __linkRowKeys: ["rowKeyA","rowKeyB"] } or { __linkRowKey: "rowKeyA" } after those rows are defined (same template order: define linked rows earlier or in an earlier table).'
    ),
});

const templateTableSchema = z.object({
  key: z
    .string()
    .optional()
    .describe("Stable id for this table; required for linkToTableKey from other tables"),
  name: z
    .string()
    .optional()
    .describe("Table name; required for 2nd+ tables. First table uses the stack default first table."),
  columns: z.array(templateColumnSchema).optional(),
  rows: z.array(templateRowSchema).optional(),
});

export function createStackbyMcpServer(): McpServer {
  const mcpServer = new McpServer({
    name: "stackby-mcp-server",
    version: "0.1.0",
  });

  // helper to convert snake_case keys from the GPT input into camelCase
  function camelCaseKeys<T extends Record<string, any>>(obj: T): T {
    const out: any = {};
    for (const key of Object.keys(obj || {})) {
      const camel = key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      out[camel] = obj[key];
    }
    return out;
  }

  // wrapper that normalizes input before calling the real handler
  function withCamel<R>(
    handler: (input: Record<string, any>) => Promise<R>
  ): (input: any) => Promise<R> {
    return async (originalInput: any) => {
      const input = camelCaseKeys<Record<string, any>>(originalInput || {});
      return handler(input);
    };
  }


  mcpServer.registerTool(
    "list_workspaces",
    {
      description: "List Stackby workspaces the user can access. Requires STACKBY_API_KEY (or PAT) in MCP config.",
      inputSchema: {},
    },
    withCamel(async () => {
      if (!hasAuthCredential()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode.",
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
    })
  );

  mcpServer.registerTool(
    "list_stacks",
    {
      description: "List Stackby stacks (bases) the user can access. Pass workspaceId to filter by workspace. Requires STACKBY_API_KEY (or PAT) in MCP config.",
      inputSchema: {
        workspaceId: z.string().optional().describe("Optional Workspace ID to filter stacks by (from list_workspaces)"),
      },
    },
    withCamel(async (input) => {
      const { workspaceId } = input;
      const wsId = workspaceId?.trim();
      if (!hasAuthCredential()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode.",
            },
          ],
        };
      }
      try {
        let stacks;
        if (wsId) {
          const { list, workspaceName } = await getStacks(wsId);
          stacks = list.map((s: any) => ({ ...s, workspaceName }));
        } else {
          stacks = await getAllStacks();
        }

        const lines = stacks.length === 0
          ? ["No stacks found."]
          : stacks.map((s: any) => `- ${s.stackName} (id: ${s.stackId}, workspace: ${s.workspaceName ?? s.workspaceId})`);

        // If there are too many stacks, truncate the output to prevent killing the context window if no workspace is provided.
        if (!wsId && stacks.length > 200) {
          lines.splice(200);
          lines.push(`\n... and ${stacks.length - 200} more. Please provide a specific workspaceId to list_stacks to see more.`);
        }

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
    })
  );

  mcpServer.registerTool(
    "create_stack",
    {
      description:
        "Create a new Stackby stack (base) in a workspace. Optionally pass `tables` for a full template: tables are auto-ordered so link targets come first. First logical table maps to the stack's default first sheet; others use `name` + createTable. Columns: use `linkToTableKey` + `linkColumnName` + `linkedColumnName` for lookup and rollup (aggregation); use `lookupCount` + `linkColumnName` + `linkToTableKey` for counts. Formula runs after base+link columns. Rows: `rowKey` and { __linkRowKeys: [\"key\"] } for links.",
      inputSchema: {
        workspaceId: z.string().describe("Workspace ID to create the stack in (from list_workspaces)"),
        name: z.string().describe("Name for the new stack (1-150 chars)"),
        color: z.string().optional().describe("Hex color for the stack icon (default #30A9DE)"),
        icon: z.string().optional().describe("Icon name (default ios-bulb)"),
        tables: z
          .array(templateTableSchema)
          .optional()
          .describe(
            "Optional template: tables with columns and rows. Omit for an empty default stack only."
          ),
      },
    },
    withCamel(async (input) => {
      const { workspaceId, name, color, icon, tables } = input;
      const wsId = workspaceId?.trim();
      const stackName = name?.trim();
      if (!wsId || !stackName) {
        return {
          content: [{ type: "text" as const, text: "workspaceId and name are required. Use list_workspaces to get workspace IDs." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const tpl = Array.isArray(tables) ? tables : [];
        let stack: any;
        let template: any;
        let usedFallback = false;
        let fallbackReason = "";

        try {
          const created = await createStack(wsId, stackName, {
            color: color?.trim() || undefined,
            icon: icon?.trim() || undefined,
            tables: tpl.length > 0 ? tpl : undefined,
          });
          stack = created.stack;
          template = created.template;
        } catch (err) {
          if (tpl.length === 0) throw err;
          usedFallback = true;
          fallbackReason = err instanceof Error ? err.message : String(err);
          const created = await createStack(wsId, stackName, {
            color: color?.trim() || undefined,
            icon: icon?.trim() || undefined,
          });
          stack = created.stack;
          template = created.template;
        }

        const id = stack?.stackId ?? (stack as any)?.id ?? "unknown";
        const returnedName = stack?.stackName ?? stackName;
        const lines = [
          `Created stack: ${returnedName}`,
          `Stack ID: ${id}`,
          `Workspace: ${wsId}`,
        ];
        if (usedFallback) {
          lines.push("", `Server-side template apply failed, used client-side fallback: ${fallbackReason}`);
        }
        if (tpl.length > 0 && !template) {
          const applied = await applyStackTemplate(id, tpl as TemplateTableInput[]);
          if (applied.tableSummaries.length > 0) {
            lines.push("", "Template applied (client):", ...applied.tableSummaries.map((s) => `  ${s}`));
          }
          if (applied.warnings.length > 0) {
            lines.push("", "Template warnings:", ...applied.warnings.map((w) => `  - ${w}`));
          }
        } else {
          if (template?.tableSummaries?.length) {
            lines.push("", "Template applied:", ...template.tableSummaries.map((s: string) => `  ${s}`));
          }
          if (template?.warnings?.length) {
            lines.push("", "Template warnings:", ...template.warnings.map((w: string) => `  - ${w}`));
          }
        }
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log("::: stack create failed :", err)
        return {
          content: [
            { type: "text" as const, text: `Failed to create stack: ${message}. Check workspaceId, stack name, and plan limits.` },
          ],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "list_views",
    {
      description: "List views for a table (grid, kanban, etc.). Use list_tables to get stackId and tableId.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      if (!sId || !tId) {
        return {
          content: [{ type: "text" as const, text: "stackId and tableId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const views = await getTableViewList(sId, tId);
        const lines =
          views.length === 0
            ? ["No views found."]
            : views.map((v) => `- ${v.name} (id: ${v.id}, type: ${v.type ?? "grid"})`);
        return {
          content: [
            {
              type: "text" as const,
              text: `Views in table ${tId} (${views.length}):\n${lines.join("\n")}`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to list views: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "create_view",
    {
      description:
        "Create a new view on a table. Defaults copy column order from the first existing view. Use type: grid, kanban, gallery, calendar, form, etc. For duplicate mode set copyMode to duplicate and copyViewId to the source view id.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        tableId: z.string().describe("Table ID"),
        name: z.string().describe("View name"),
        type: z.string().optional().describe("View type (default grid)"),
        copyMode: z.enum(["new", "duplicate"]).optional(),
        copyViewId: z.string().optional().describe("Required if copyMode is duplicate"),
        sequenceViewId: z.string().optional().describe("View to copy column/row order from (default: first view)"),
        description: z.string().optional(),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, name, type, copyMode, copyViewId, sequenceViewId, description } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const vName = name?.trim();
      if (!sId || !tId || !vName) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, and name are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const result = await createView(sId, tId, {
          name: vName,
          type: type?.trim() || undefined,
          copyMode: copyMode as "new" | "duplicate" | undefined,
          copyViewId: copyViewId?.trim(),
          sequenceViewId: sequenceViewId?.trim(),
          description,
        });
        return {
          content: [{ type: "text" as const, text: `View created.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to create view: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "rename_view",
    {
      description: "Rename (or update description of) a view. Use list_views for view IDs.",
      inputSchema: {
        stackId: z.string(),
        tableId: z.string(),
        viewId: z.string().describe("View ID (from list_views)"),
        name: z.string().describe("New view name"),
        description: z.string().optional(),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, viewId, name, description } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const vId = viewId?.trim();
      const vName = name?.trim();
      if (!sId || !tId || !vId || !vName) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, viewId, and name are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const result = await renameView(sId, tId, vId, { name: vName, description });
        return {
          content: [{ type: "text" as const, text: `View updated.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to rename view: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "delete_view",
    {
      description: "Delete a view from a table (soft-delete). Use list_views for view IDs.",
      inputSchema: {
        stackId: z.string(),
        tableId: z.string(),
        viewId: z.string().describe("View ID to delete"),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, viewId } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const vId = viewId?.trim();
      if (!sId || !tId || !vId) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, and viewId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const result = await deleteView(sId, tId, vId);
        return {
          content: [{ type: "text" as const, text: `View deleted.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to delete view: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "list_tables",
    {
      description: "List tables in a Stackby stack. Use list_stacks first to get stack IDs.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
      },
    },
    withCamel(async (input) => {
      const { stackId } = input;
      const id = stackId?.trim();
      if (!id) {
        return {
          content: [{ type: "text" as const, text: "stackId is required. Use list_stacks to get stack IDs." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
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
    })
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
    withCamel(async (input) => {
      const { stackId, tableId } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      if (!sId || !tId) {
        return {
          content: [{ type: "text" as const, text: "stackId and tableId are required. Use list_stacks and list_tables to get IDs." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
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
    })
    );

  mcpServer.registerTool(
    "list_records",
    {
      description: "List rows (records) in a table. Use list_stacks and list_tables to get stackId and tableId.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        maxRecords: z.number().optional().describe("Max records to return (1–100, default 100)"),
        offset: z.number().optional().describe("Number of records to skip (pagination)"),
        rowIds: z.array(z.string()).optional().describe("Return only these row IDs"),
        pageSize: z.number().optional().describe("Same as maxRecords (1–100)"),
        view: z.string().optional().describe("View ID to use for row order/filter"),
        filter: z.string().optional().describe("Filter expression (JSON)"),
        sort: z.string().optional().describe("Sort expression (JSON)"),
        latest: z.string().optional().describe("Return latest rows (e.g. by updated time)"),
        filterByFormula: z.string().optional().describe("Formula-based filter"),
        conjuction: z.string().optional().describe("Filter conjunction: 'and' or 'or' (default and)"),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, maxRecords, offset, rowIds, pageSize, view, filter, sort, latest, filterByFormula, conjuction } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      if (!sId || !tId) {
        return {
          content: [{ type: "text" as const, text: "stackId and tableId are required. Use list_stacks and list_tables to get IDs." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const records = await getRowList(sId, tId, {
          maxRecords: maxRecords ?? 100,
          offset,
          rowIds,
          pageSize,
          view,
          filter,
          sort,
          latest,
          filterByFormula,
          conjuction,
        });
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
    })
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
    withCamel(async (input) => {
      const { stackId, tableId, searchTerm, fieldIds, maxRecords } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const term = searchTerm?.trim();
      if (!sId || !tId || term === undefined || term === "") {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, and searchTerm are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
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
    })
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
    withCamel(async (input) => {
      const { stackId, tableId, recordId } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const rId = recordId?.trim();
      if (!sId || !tId || !rId) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, and recordId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
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
    })
    );

  mcpServer.registerTool(
    "create_record",
    {
      description: "Create a new row (record) in a table. Use describe_table to get column names. Fields are keyed by column name.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        fields: z
          .union([z.record(z.string(), z.unknown()), z.string()])
          .describe("Field values keyed by column name (object) or JSON string object."),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, fields } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      let parsedFields: Record<string, unknown> | undefined;
      if (fields && typeof fields === "object" && !Array.isArray(fields)) {
        parsedFields = fields as Record<string, unknown>;
      } else if (typeof fields === "string" && fields.trim()) {
        try {
          const raw = JSON.parse(fields);
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            parsedFields = raw as Record<string, unknown>;
          }
        } catch {
          parsedFields = undefined;
        }
      }
      if (!sId || !tId) {
        return {
          content: [{ type: "text" as const, text: "stackId and tableId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      if (!parsedFields) {
        return {
          content: [{ type: "text" as const, text: "fields must be an object (or JSON string object) of column names to values." }],
          isError: true,
        };
      }
      try {
        const records = await createRow(sId, tId, parsedFields);
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
    })
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
    withCamel(async (input) => {
      const { stackId, tableId, records } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      if (!sId || !tId) {
        return {
          content: [{ type: "text" as const, text: "stackId and tableId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const updated = await updateRows(
          sId,
          tId,
          records.map((r: any) => ({ id: r.id, fields: r.fields as Record<string, unknown> }))
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
    })
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
    withCamel(async (input) => {
      const { stackId, tableId, recordIds } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      if (!sId || !tId) {
        return {
          content: [{ type: "text" as const, text: "stackId and tableId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
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
    })
  );

  mcpServer.registerTool(
    "create_table",
    {
      description: "Create a new table in a stack. Use list_stacks to get stackId.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        name: z.string().describe("Table name"),
      },
    },
    withCamel(async (input) => {
      const { stackId, name } = input;
      const sId = stackId?.trim();
      const tableName = name?.trim();
      if (!sId || !tableName) {
        return {
          content: [{ type: "text" as const, text: "stackId and name are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
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
    })
  );

  mcpServer.registerTool(
    "create_field",
    {
      description: "Create a new column (field) in a table. Use describe_table to see existing columns. For singleOption/multipleOptions pass options array. For link columns, provide linkToTableId. For formula columns, pass formulaText (e.g. {Amount} * {Quantity}).",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        name: z.string().describe("Column name"),
        columnType: z.string().describe("Column type: shortText, longText, number, checkbox, dateAndTime, singleOption, multipleOptions, email, url, link, formula, etc."),
        viewId: z.string().optional().describe("View ID (optional; first view used if omitted)"),
        options: z
          .union([z.array(z.string()), z.string()])
          .optional()
          .describe("For singleOption/multipleOptions: choice labels. Accepts array or JSON string array."),
        linkToTableId: z.string().optional().describe("For link columns: Table ID to connect to (required when columnType is link). Use list_tables to get table IDs."),
        linkToTableViewId: z.string().optional().describe("For link columns: View ID of the target table (optional; first view used if omitted)"),
        formulaText: z.string().optional().describe("For formula columns: the formula expression (e.g. {Amount} * {Quantity} or CREATED_TIME). Use column names in braces."),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, name, columnType, viewId, options, linkToTableId, linkToTableViewId, formulaText } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const colName = name?.trim();
      const type = columnType?.trim();
      let parsedOptions: string[] | undefined;
      if (Array.isArray(options)) {
        parsedOptions = options.filter((o): o is string => typeof o === "string");
      } else if (typeof options === "string" && options.trim()) {
        try {
          const raw = JSON.parse(options);
          if (Array.isArray(raw)) {
            parsedOptions = raw.filter((o): o is string => typeof o === "string");
          } else {
            parsedOptions = options
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } catch {
          parsedOptions = options
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
      if (!sId || !tId || !colName || !type) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, name, and columnType are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      const isLinkType = /^link$/i.test(type);
      if (isLinkType && !linkToTableId?.trim()) {
        return {
          content: [{
            type: "text" as const,
            text: "To create a link column, you must specify which table to connect to. Please provide linkToTableId (use list_tables to get available table IDs in this stack).",
          }],
          isError: true,
        };
      }
      try {
        let viewIdToUse = viewId?.trim();
        if (!viewIdToUse) {
          const views = await getTableViewList(sId, tId);
          viewIdToUse = views.length > 0 ? views[0].id : "";
        }
        let linkToViewId = linkToTableViewId?.trim();
        if (isLinkType && linkToTableId?.trim() && !linkToViewId) {
          const linkViews = await getTableViewList(sId, linkToTableId.trim());
          linkToViewId = linkViews.length > 0 ? linkViews[0].id : "";
        }
        const result = await createColumn(sId, tId, colName, type, {
          viewId: viewIdToUse,
          options: parsedOptions && parsedOptions.length > 0 ? parsedOptions : undefined,
          linkToTableId: isLinkType ? linkToTableId?.trim() : undefined,
          linkToTableViewId: isLinkType ? linkToViewId : undefined,
          formulaText: formulaText?.trim() || undefined,
        });
        const id = result?.columnId ?? result?.id ?? "unknown";
        const text = [`Created column: ${colName}`, `Column ID: ${id}`, `Type: ${type}`].join("\n");
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text" as const, text: `Failed to create field: ${message}. Check stackId, tableId, name, columnType (use describe_table for types). For link columns, provide linkToTableId.` },
          ],
          isError: true,
        };
      }
    })
    );

  mcpServer.registerTool(
    "dashboard_action",
    {
      description:
        "Run a dashboard action via the MCP developer API (same rules as the app). stackId can be omitted in `body` (it is taken from the URL). Actions: create (body: name; id = new dashboard id), update, getblocks, positionupdate, move. See Stackby dashboard API docs for field shapes.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        id: z.string().describe("Dashboard ID (for create, use a new unique id)"),
        action: z.string().describe("create | update | getblocks | positionupdate | move"),
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Action payload (e.g. { name } for create). stackId is optional; URL stackId is used if omitted."),
      },
    },
    withCamel(async (input) => {
      const { stackId, id, action, body: actionBody } = input;
      const sId = stackId?.trim();
      const dashId = id?.trim();
      const act = action?.trim();
      if (!sId || !dashId || !act) {
        return {
          content: [{ type: "text" as const, text: "stackId, id, and action are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await mcpDashboardAction(sId, dashId, act, (actionBody as Record<string, unknown>) ?? {});
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `dashboard_action failed: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "block_action",
    {
      description:
        "Run a block action via the MCP developer API. stackId can be omitted in `body` (it is taken from the URL). Actions: create, update, duplicate, move. Create requires dashboardId, name, type, and layout fields per Stackby validation.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        id: z.string().describe("Block ID (for create, use a new unique id)"),
        action: z.string().describe("create | update | duplicate | move"),
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Action payload matching blockaction API (e.g. dashboardId, name, type for create)."),
      },
    },
    withCamel(async (input) => {
      const { stackId, id, action, body: actionBody } = input;
      const sId = stackId?.trim();
      const blockId = id?.trim();
      const act = action?.trim();
      if (!sId || !blockId || !act) {
        return {
          content: [{ type: "text" as const, text: "stackId, id, and action are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await mcpBlockAction(sId, blockId, act, (actionBody as Record<string, unknown>) ?? {});
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `block_action failed: ${message}` }],
          isError: true,
        };
      }
    })
  );

  return mcpServer;
}



