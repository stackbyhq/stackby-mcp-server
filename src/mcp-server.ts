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
  updateTable,
  deleteTable,
  createColumn,
  updateColumn,
  deleteColumn,
  createRecordComment,
  createStack,
  getAutomations,
  createAutomation,
  getAutomation,
  updateAutomation,
  deleteAutomation,
  normalizeColumnType,
  mcpAutomationWorkflowAction,
  mcpAutomationTriggerAction,
  mcpAutomationActionAction,
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

const AGGREGATION_FORMULAS = new Set([
  "MIN(values)",
  "MAX(values)",
  "SUM(values)",
  "AVERAGE(values)",
  "COUNT(values)",
  "COUNTA(values)",
  "COUNTALL(values)",
  "AND(values)",
  "OR(values)",
  "XOR(values)",
  "ARRAYJOIN(values)",
  "ARRAYUNIQUE(values)",
  "ARRAYCOMPACT(values)",
  "ARRAYFLATTEN(values)",
]);

const AUTOMATION_TRIGGER_CATALOG = [
  {
    code: "T_CR_ROW",
    name: "When record created",
    description: "Runs when a new row is created in a table.",
    whereToSetTable: "top-level trigger.tableId",
    paramsExample: {},
    notes: ["Usually no triggerParams are needed beyond the trigger table."],
  },
  {
    code: "T_UP_ROW",
    name: "When record updated",
    description: "Runs when a row is updated.",
    whereToSetTable: "top-level trigger.tableId",
    paramsExample: {
      watchingColumns: ["cl_status", "cl_owner"],
      testStepSelectedRow: "rw_sample123",
      columnList: ["cl_status", "cl_owner"],
    },
    notes: ["`watchingColumns` is read by the backend and is the most useful field here."],
  },
  {
    code: "SD_TIME",
    name: "At scheduled time",
    description: "Runs on a schedule or date/time-based cadence.",
    whereToSetTable: "top-level trigger.tableId",
    paramsExample: {
      interval: "days",
      days: {
        every: 1,
        startAtDate: "2026-05-06T09:00:00.000Z",
      },
      nextTriggerTime: "2026-05-07T09:00:00.000Z",
    },
    notes: ["Supported schedule buckets in code include minutes, hours, days, weeks, months, and oneTime."],
  },
  {
    code: "WH_RECV",
    name: "Webhook received",
    description: "Runs when an incoming webhook hits the automation.",
    whereToSetTable: "optional, depends on webhook flow",
    paramsExample: {},
    notes: ["Backend supports this trigger type, but the exact webhook config shape is not obvious from the MCP wrapper alone."],
  },
  {
    code: "RW_COND",
    name: "Row matches conditions",
    description: "Runs when a row enters matching conditions.",
    whereToSetTable: "top-level trigger.tableId",
    paramsExample: {
      filterData: {
        filterSet: [
          { columnId: "cl_status", operator: "is", value: "Open" },
        ],
      },
      testStepSelectedRow: "rw_sample123",
    },
    notes: ["This example is based on how condition values are read downstream for row filtering."],
  },
  {
    code: "VM_ROW",
    name: "View match / row event",
    description: "Row/view-driven trigger used by the automation system.",
    whereToSetTable: "top-level trigger.tableId",
    paramsExample: {
      viewId: "vi_example123",
      testStepSelectedRow: "rw_sample123",
    },
    notes: ["Use when the automation depends on a specific view or view-based matching."],
  },
] as const;

const AUTOMATION_ACTION_CATALOG = [
  {
    code: "CR_ROW",
    name: "Create record",
    description: "Create a new row in a target table.",
    paramsExample: {
      tableId: "tb_target123",
      column: {
        cl_name: "tb_source123 cl_title",
        cl_status: "Open",
      },
    },
    notes: ["`column` maps target column ids to static values or trigger-derived values."],
  },
  {
    code: "UP_ROW",
    name: "Update record",
    description: "Update an existing row in a target table.",
    paramsExample: {
      tableId: "tb_target123",
      rowId: "rw_target123",
      column: {
        cl_status: "Done",
        cl_notes: "tb_source123 cl_summary",
      },
    },
    notes: ["`rowId` is required. It can be a literal row id or a dynamic reference resolved by the backend."],
  },
  {
    code: "FIND_ROW",
    name: "Find record",
    description: "Look up rows to use in later automation steps.",
    paramsExample: {
      tableId: "tb_target123",
      findOn: "condition",
      maximumRow: 25,
      filterData: {
        filterSet: [
          { columnId: "cl_status", operator: "is", value: "tb_source123 cl_status" },
        ],
      },
    },
    notes: ["Common patterns are `findOn: \"condition\"` with `filterData`, or a view-based search with `viewId`."],
  },
  {
    code: "S_EMAIL",
    name: "Send email",
    description: "Send an email from Stackby automation.",
    paramsExample: {
      toWithColumnId: "tb_source123 cl_email",
      subjectWithColumnId: "New update for {{Name}}",
      messageWithColumnId: "Hello {{Name}}, your record was updated.",
      ccWithColumnId: "",
      bccWithColumnId: "",
      fromNameWithColumnId: "Stackby Automations",
      replyToWithColumnId: "",
      attechmentWithColumnId: [],
    },
    notes: ["Email actions use `...WithColumnId` fields heavily in the backend."],
  },
  {
    code: "WHATSAPP",
    name: "Send WhatsApp",
    description: "Send a WhatsApp message.",
    paramsExample: {
      apiConfigId: "wa_config_123",
      templateName: "order_update",
      whatsappActionObj: {
        sendto: ["tb_source123 cl_phone"],
        header: [],
        body: ["Hello {{Name}}"],
        buttons: [],
      },
    },
    notes: ["The backend reads `templateName`, `apiConfigId`, and `whatsappActionObj.sendto/header/body/buttons`."],
  },
  {
    code: "GMAIL",
    name: "Send Gmail",
    description: "Send an email using Gmail integration.",
    paramsExample: {
      toWithColumnId: "tb_source123 cl_email",
      subjectWithColumnId: "Follow-up",
      messageWithColumnId: "Hello from Gmail automation",
    },
    notes: ["Likely similar to email-style actions, but exact integration-specific fields may vary."],
  },
  {
    code: "OUTLOOK",
    name: "Send Outlook email",
    description: "Send an email using Outlook integration.",
    paramsExample: {
      toWithColumnId: "tb_source123 cl_email",
      subjectWithColumnId: "Follow-up",
      messageWithColumnId: "Hello from Outlook automation",
    },
    notes: ["Likely similar to email-style actions, but exact integration-specific fields may vary."],
  },
  {
    code: "MS_TEAM",
    name: "Send to Microsoft Teams",
    description: "Post or notify via Microsoft Teams.",
    paramsExample: {
      teamId: "team_123",
      channelId: "channel_123",
      accessToken: "token",
      refreshToken: "refresh",
      body: "New record was created",
    },
    notes: ["These fields are read directly in the runtime handler."],
  },
  {
    code: "SLACK",
    name: "Send Slack message",
    description: "Post a message to Slack.",
    paramsExample: {
      channelId: "C123456",
      accessToken: "xoxb-...",
      message: "A new record was created",
      botName: "Stackby Bot",
      icon_url: "https://example.com/icon.png",
    },
    notes: ["These fields are read directly in the runtime handler."],
  },
  {
    code: "SORT",
    name: "Sort records",
    description: "Run a sort-related automation step.",
    paramsExample: {
      findActionId: "ac_find123",
      sort: [{ columnId: "cl_priority", direction: "asc" }],
    },
    notes: ["`findActionId` should point to a prior `FIND_ROW` action whose result you want to sort."],
  },
  {
    code: "AI_GEN",
    name: "AI generate",
    description: "Generate content with an AI-powered automation step.",
    paramsExample: {
      findActionId: "ac_find123",
      columnCellvalues: {
        cl_prompt: { str: "Summarize this row" },
      },
      aiActionConfig: {},
      column: {
        cl_output: "Generated content goes here",
      },
      generatedData: {},
    },
    notes: ["The backend reads `findActionId`, `columnCellvalues`, `aiActionConfig`, `column`, and `generatedData`."],
  },
] as const;

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

  function normalizeBlockType(type: unknown): string {
    const raw = typeof type === "string" ? type.trim() : "";
    if (!raw) return "Chart";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function normalizeBlockActionBody(
    stackId: string,
    blockId: string,
    action: string,
    body: Record<string, unknown> = {}
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      ...body,
      stackId: (body.stackId as string | undefined) ?? stackId,
    };
    if (action !== "create") {
      return payload;
    }

    if (payload.blockFields || payload.gridLayout || payload.linearLayout) {
      return payload;
    }

    const dashboardId = typeof payload.dashboardId === "string" ? payload.dashboardId.trim() : "";
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Chart";
    const blockType = normalizeBlockType(payload.type);
    const layout =
      payload.layout && typeof payload.layout === "object"
        ? (payload.layout as Record<string, unknown>)
        : {};
    const config =
      payload.config && typeof payload.config === "object"
        ? (payload.config as Record<string, unknown>)
        : {};
    const reservedBlockKeys = new Set([
      "stackId",
      "dashboardId",
      "name",
      "type",
      "layout",
      "config",
      "blockFields",
      "gridLayout",
      "linearLayout",
    ]);

    const x = typeof layout.x === "number" ? layout.x : 0;
    const y = typeof layout.y === "number" ? layout.y : 0;
    const w = typeof layout.w === "number" ? layout.w : 2;
    const h = typeof layout.h === "number" ? layout.h : 3;

    const blockFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        blockFields[key] = value;
      }
    }
    for (const [key, value] of Object.entries(payload)) {
      if (reservedBlockKeys.has(key) || value === undefined) {
        continue;
      }
      blockFields[key] = value;
    }

    return {
      stackId: payload.stackId,
      dashboardId,
      name,
      blockFields: JSON.stringify(blockFields),
      gridLayout: JSON.stringify({
        i: blockId,
        x,
        y,
        w,
        h,
        minH: 1,
        minW: 1,
      }),
      linearLayout: JSON.stringify({
        i: blockId,
        x,
        y,
        w: 1,
        h,
        minH: 1,
        minW: 1,
        moved: false,
        static: false,
      }),
      type: blockType,
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
          if (!id || id === "unknown") {
            throw new Error(
              "Stack was created but the API response did not include a stackId, so the template could not be applied client-side."
            );
          }
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
        console.log("::: record create errro: " ,err)
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
    "update_table",
    {
      description: "Update a table's name and/or description.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        name: z.string().optional().describe("New table name"),
        description: z.string().optional().describe("New table description"),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, name, description } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const body: Record<string, unknown> = {};
      if (typeof name === "string" && name.trim()) body.name = name.trim();
      if (typeof description === "string") body.description = description;
      if (!sId || !tId) {
        return {
          content: [{ type: "text" as const, text: "stackId and tableId are required." }],
          isError: true,
        };
      }
      if (Object.keys(body).length === 0) {
        return {
          content: [{ type: "text" as const, text: "Provide at least one of: name, description." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const result = await updateTable(sId, tId, body);
        return {
          content: [{ type: "text" as const, text: `Table updated.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to update table: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "delete_table",
    {
      description: "Delete a table from a stack.",
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
        const result = await deleteTable(sId, tId);
        return {
          content: [{ type: "text" as const, text: `Table deleted.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to delete table: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "create_field",
    {
      description:
        "Create a new column (field) in a table. Use describe_table first to get field IDs. For singleOption/multipleOptions pass options. For link pass linkToTableId. For formula pass formulaText. For relational computed fields: lookup, count/lookupCount, and rollup/aggregation, use linkColumnId as the link field on the current table; use linkedColumnId as the source field on the linked (foreign) table (needed for lookup and rollup/aggregation). Example: adding a lookup in Table 1 for Col2 from Table 2 -> linkColumnId is Table 1 link field, linkedColumnId is Table 2 Col2 field id.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        name: z.string().describe("Column name"),
        columnType: z.string().describe("Column type: shortText, longText, number, checkbox, dateAndTime, singleOption, multipleOptions, email, url, link, formula, lookup, lookupCount (or count), aggregation (or rollup), etc."),
        viewId: z.string().optional().describe("View ID (optional; first view used if omitted)"),
        options: z
          .union([z.array(z.string()), z.string()])
          .optional()
          .describe("For singleOption/multipleOptions: choice labels. Accepts array or JSON string array."),
        linkToTableId: z.string().optional().describe("For link columns: Table ID to connect to (required when columnType is link). Use list_tables to get table IDs."),
        linkToTableViewId: z.string().optional().describe("For link columns: View ID of the target table (optional; first view used if omitted)"),
        linkColumnId: z.string().optional().describe("For lookup / count / lookupCount / aggregation / rollup: link field ID on this table (the relational link field on the table where this new field is being created)."),
        linkedColumnId: z.string().optional().describe("For lookup / aggregation / rollup: field ID on the linked (foreign) table to display or roll up. Not required for lookupCount/count."),
        formulaText: z.string().optional().describe("For formula columns: formula expression (e.g. {Amount} * {Quantity} or CREATED_TIME). For aggregation/rollup: only one of MIN(values), MAX(values), SUM(values), AVERAGE(values), COUNT(values), COUNTA(values), COUNTALL(values), AND(values), OR(values), XOR(values), ARRAYJOIN(values), ARRAYUNIQUE(values), ARRAYCOMPACT(values), ARRAYFLATTEN(values)."),
      },
    },
    withCamel(async (input) => {
      const {
        stackId,
        tableId,
        name,
        columnType,
        viewId,
        options,
        linkToTableId,
        linkToTableViewId,
        linkColumnId,
        linkedColumnId,
        formulaText,
      } = input;
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
      const normalizedType = normalizeColumnType(type);
      const isLookupFamilyType = normalizedType === "lookup" || normalizedType === "lookupCount" || normalizedType === "aggregation";
      const trimmedFormulaText = formulaText?.trim();
      if (normalizedType === "aggregation" && trimmedFormulaText && !AGGREGATION_FORMULAS.has(trimmedFormulaText)) {
        return {
          content: [{
            type: "text" as const,
            text: `Invalid formulaText for aggregation/rollup. Allowed values: ${Array.from(AGGREGATION_FORMULAS).join(", ")}`,
          }],
          isError: true,
        };
      }
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
          linkColumnId: isLookupFamilyType ? linkColumnId?.trim() : undefined,
          linkedColumnId: isLookupFamilyType ? linkedColumnId?.trim() : undefined,
          formulaText: trimmedFormulaText || undefined,
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
    "update_field",
    {
      description:
        "Update a field (column). Use `name` to rename, `description` to set field description, or include `type` plus related config fields to update field configuration.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        columnId: z.string().describe("Column ID (from describe_table)"),
        name: z.string().optional().describe("New field name"),
        description: z.string().optional().describe("New field description"),
        type: z.string().optional().describe("Field type when updating field config"),
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional raw PATCH body for advanced field updates. Merged with top-level inputs."),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, columnId, name, description, type, body } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const cId = columnId?.trim();
      const payload: Record<string, unknown> = { ...((body as Record<string, unknown>) ?? {}) };
      if (typeof name === "string" && name.trim()) payload.name = name.trim();
      if (typeof description === "string") payload.description = description;
      if (typeof type === "string" && type.trim()) payload.type = type.trim();
      if (!sId || !tId || !cId) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, and columnId are required." }],
          isError: true,
        };
      }
      if (Object.keys(payload).length === 0) {
        return {
          content: [{ type: "text" as const, text: "Provide at least one field update: name, description, type, or body." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const result = await updateColumn(sId, tId, cId, payload);
        return {
          content: [{ type: "text" as const, text: `Field updated.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to update field: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "delete_field",
    {
      description: "Delete a field (column) from a table.",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        columnId: z.string().describe("Column ID (from describe_table)"),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, columnId } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const cId = columnId?.trim();
      if (!sId || !tId || !cId) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, and columnId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const result = await deleteColumn(sId, tId, cId);
        return {
          content: [{ type: "text" as const, text: `Field deleted.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to delete field: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "create_record_comment",
    {
      description: "Add a comment to a record (row).",
      inputSchema: {
        stackId: z.string().describe("Stack ID (from list_stacks)"),
        tableId: z.string().describe("Table ID (from list_tables)"),
        recordId: z.string().describe("Record (row) ID"),
        text: z.string().describe("Comment text"),
        attachment: z.unknown().optional().describe("Optional attachment payload"),
        cellValue: z.unknown().optional().describe("Optional cellValue payload"),
      },
    },
    withCamel(async (input) => {
      const { stackId, tableId, recordId, text, attachment, cellValue } = input;
      const sId = stackId?.trim();
      const tId = tableId?.trim();
      const rId = recordId?.trim();
      const commentText = text?.trim();
      if (!sId || !tId || !rId || !commentText) {
        return {
          content: [{ type: "text" as const, text: "stackId, tableId, recordId, and text are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const result = await createRecordComment(sId, tId, rId, {
          text: commentText,
          attachment,
          cellValue,
        });
        return {
          content: [{ type: "text" as const, text: `Comment created.\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to create record comment: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "list_automation_capabilities",
    {
      description:
        "List the automation trigger types, action types, and advanced workflow actions supported by Stackby MCP. Use this first so the AI can choose the right automation setup.",
      inputSchema: {},
    },
    withCamel(async () => {
      const workflowActions = [
        "create",
        "update",
        "delete",
        "details",
        "updateSequence",
        "duplicate",
        "runCount",
        "sectioncreate",
        "sectionrename",
        "sectiondelete",
        "addtosection",
        "sectionmove",
        "sectionexpand",
        "updateDescription",
      ];
      const triggerActions = ["create", "update", "delete", "list", "trigger"];
      const actionActions = ["create", "update", "delete", "list", "action", "updateSequence", "duplicate", "updateDescription"];
      const lines = [
        "Automation trigger types:",
        ...AUTOMATION_TRIGGER_CATALOG.flatMap((item) => [
          `- ${item.code}: ${item.name} — ${item.description}`,
          `  table: ${item.whereToSetTable}`,
          `  triggerParams example: ${JSON.stringify(item.paramsExample)}`,
          `  notes: ${item.notes.join(" ")}`,
        ]),
        "",
        "Automation action types:",
        ...AUTOMATION_ACTION_CATALOG.flatMap((item) => [
          `- ${item.code}: ${item.name} — ${item.description}`,
          `  actionParams example: ${JSON.stringify(item.paramsExample)}`,
          `  notes: ${item.notes.join(" ")}`,
        ]),
        "",
        `Advanced workflow endpoint actions: ${workflowActions.join(", ")}`,
        `Advanced trigger endpoint actions: ${triggerActions.join(", ")}`,
        `Advanced action endpoint actions: ${actionActions.join(", ")}`,
        "",
        "Notes:",
        "- `create_automation` is the easiest path: it creates the workflow, first trigger, and optional actions in one call.",
        "- Use `add_automation_trigger` or `add_automation_action` when building step-by-step.",
        "- `triggerParams` and `actionParams` are passed through as-is to Stackby's backend and may vary by trigger/action type.",
      ];
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    })
  );

  mcpServer.registerTool(
    "update_records_for_table",
    {
      description: "Update existing rows for a table. Alias of update_records. Provide an array of { id, fields }. At most 10 records per request.",
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
        const text = [`Updated ${updated.length} record(s) for table ${tId}:`, "", ...lines].join("\n");
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text" as const, text: `Failed to update records for table: ${message}. Check stackId, tableId, record IDs, and field names.` },
          ],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "list_automations",
    {
      description: "List automations in a Stackby stack.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      if (!sId) {
        return {
          content: [{ type: "text" as const, text: "stackId is required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await getAutomations(sId);
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to list automations: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "get_automation",
    {
      description: "Get full details for one automation.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        automationId: z.string().describe("Automation ID"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const automationId = input.automationId?.trim();
      if (!sId || !automationId) {
        return {
          content: [{ type: "text" as const, text: "stackId and automationId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await getAutomation(sId, automationId);
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to get automation: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "create_automation",
    {
      description:
        "Create a full automation workflow in one step. Best tool for user-friendly automation setup: creates the automation, its trigger, and optional actions.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        name: z.string().describe("Automation name"),
        description: z.string().optional().describe("Automation description"),
        isTurnedOn: z.boolean().optional().describe("Whether the automation should be turned on"),
        tableId: z.string().optional().describe("Optional primary table id for the automation"),
        viewId: z.string().optional().describe("Optional view id for the automation"),
        trigger: z.object({
          triggerType: z.string().describe("Trigger type code. Use list_automation_capabilities first."),
          triggerParams: z.unknown().optional().describe("Trigger configuration payload"),
          tableId: z.string().optional().describe("Table id used by the trigger"),
          description: z.string().optional().describe("Trigger description"),
        }),
        actions: z.array(z.object({
          actionType: z.string().describe("Action type code. Use list_automation_capabilities first."),
          actionParams: z.unknown().optional().describe("Action configuration payload"),
          sequence: z.number().optional().describe("Optional execution order"),
          description: z.string().optional().describe("Action description"),
        })).optional(),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const name = input.name?.trim();
      const trigger = input.trigger;
      if (!sId || !name || !trigger?.triggerType?.trim()) {
        return {
          content: [{ type: "text" as const, text: "stackId, name, and trigger.triggerType are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await createAutomation(sId, {
          name,
          description: input.description,
          isTurnedOn: input.isTurnedOn,
          tableId: input.tableId?.trim() || undefined,
          viewId: input.viewId?.trim() || undefined,
          trigger: {
            triggerType: trigger.triggerType.trim(),
            triggerParams: trigger.triggerParams,
            tableId: trigger.tableId?.trim() || undefined,
            description: trigger.description,
          },
          actions: Array.isArray(input.actions)
            ? input.actions.map((action: any) => ({
                actionType: action.actionType?.trim(),
                actionParams: action.actionParams,
                sequence: action.sequence,
                description: action.description,
              }))
            : undefined,
        });
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to create automation: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "update_automation",
    {
      description: "Update automation metadata such as name, description, enabled state, table, or view.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        automationId: z.string().describe("Automation ID"),
        body: z.record(z.string(), z.unknown()).describe("PATCH payload for the automation"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const automationId = input.automationId?.trim();
      const body = input.body as Record<string, unknown> | undefined;
      if (!sId || !automationId || !body) {
        return {
          content: [{ type: "text" as const, text: "stackId, automationId, and body are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await updateAutomation(sId, automationId, body);
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to update automation: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "delete_automation",
    {
      description: "Delete an automation workflow.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        automationId: z.string().describe("Automation ID"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const automationId = input.automationId?.trim();
      if (!sId || !automationId) {
        return {
          content: [{ type: "text" as const, text: "stackId and automationId are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await deleteAutomation(sId, automationId);
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to delete automation: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "add_automation_trigger",
    {
      description:
        "Add a trigger to an existing automation. This is the step-by-step helper version of the low-level automation trigger API.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        automationId: z.string().describe("Triggered automation ID"),
        triggerType: z.string().describe("Trigger type code"),
        triggerParams: z.unknown().optional().describe("Trigger configuration payload"),
        tableId: z.string().optional().describe("Table id used by the trigger"),
        description: z.string().optional().describe("Optional trigger description"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const automationId = input.automationId?.trim();
      const triggerType = input.triggerType?.trim();
      if (!sId || !automationId || !triggerType) {
        return {
          content: [{ type: "text" as const, text: "stackId, automationId, and triggerType are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await mcpAutomationTriggerAction(sId, "create", {
          triggeredAutomationId: automationId,
          triggerType,
          triggerParams: input.triggerParams,
          tableId: input.tableId?.trim() || undefined,
          description: input.description,
        });
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to add automation trigger: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "add_automation_action",
    {
      description:
        "Add an action step to an existing automation. This is the step-by-step helper version of the low-level automation action API.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        automationId: z.string().describe("Triggered automation ID"),
        actionType: z.string().describe("Action type code"),
        actionParams: z.unknown().optional().describe("Action configuration payload"),
        sequence: z.number().optional().describe("Optional execution sequence"),
        description: z.string().optional().describe("Optional action description"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const automationId = input.automationId?.trim();
      const actionType = input.actionType?.trim();
      if (!sId || !automationId || !actionType) {
        return {
          content: [{ type: "text" as const, text: "stackId, automationId, and actionType are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await mcpAutomationActionAction(sId, "create", {
          triggeredAutomationId: automationId,
          actionType,
          actionParams: input.actionParams,
          sequence: input.sequence,
          description: input.description,
        });
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to add automation action: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "automation_workflow_action",
    {
      description:
        "Advanced passthrough for Stackby automation workflow actions. Use this for duplicate, updateSequence, section actions, updateDescription, and other backend workflow operations.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        action: z.string().describe("Workflow action name"),
        body: z.record(z.string(), z.unknown()).optional().describe("Action payload"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const action = input.action?.trim();
      if (!sId || !action) {
        return {
          content: [{ type: "text" as const, text: "stackId and action are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await mcpAutomationWorkflowAction(sId, action, (input.body as Record<string, unknown>) ?? {});
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `automation_workflow_action failed: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "automation_trigger_action",
    {
      description:
        "Advanced passthrough for Stackby automation trigger actions. Supports backend actions like create, update, delete, list, and trigger.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        action: z.string().describe("Trigger action name"),
        body: z.record(z.string(), z.unknown()).optional().describe("Action payload"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const action = input.action?.trim();
      if (!sId || !action) {
        return {
          content: [{ type: "text" as const, text: "stackId and action are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await mcpAutomationTriggerAction(sId, action, (input.body as Record<string, unknown>) ?? {});
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `automation_trigger_action failed: ${message}` }],
          isError: true,
        };
      }
    })
  );

  mcpServer.registerTool(
    "automation_action_action",
    {
      description:
        "Advanced passthrough for Stackby automation action-step operations. Supports backend actions like create, update, delete, list, updateSequence, duplicate, and updateDescription.",
      inputSchema: {
        stackId: z.string().describe("Stack ID"),
        action: z.string().describe("Action-step operation name"),
        body: z.record(z.string(), z.unknown()).optional().describe("Action payload"),
      },
    },
    withCamel(async (input) => {
      const sId = input.stackId?.trim();
      const action = input.action?.trim();
      if (!sId || !action) {
        return {
          content: [{ type: "text" as const, text: "stackId and action are required." }],
          isError: true,
        };
      }
      if (!hasAuthCredential()) {
        return {
          content: [{ type: "text" as const, text: "No auth credential found. Set STACKBY_API_KEY or STACKBY_BEARER_TOKEN in MCP config, or send Authorization: Bearer <token> in hosted mode." }],
        };
      }
      try {
        const data = await mcpAutomationActionAction(sId, action, (input.body as Record<string, unknown>) ?? {});
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `automation_action_action failed: ${message}` }],
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
        const normalizedBody = normalizeBlockActionBody(
          sId,
          blockId,
          act,
          (actionBody as Record<string, unknown>) ?? {}
        );
        const data = await mcpBlockAction(sId, blockId, act, normalizedBody);
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


