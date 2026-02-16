/**
 * Stackby API client for MCP server.
 * Uses STACKBY_API_URL and STACKBY_API_KEY (or PAT). DevAPI routes: workspacelist, stacklist.
 */

const BASE_URL = process.env.STACKBY_API_URL || "http://localhost:3000";
const API_KEY = process.env.STACKBY_API_KEY || "";

export function hasApiKey(): boolean {
  return Boolean(API_KEY && API_KEY.trim().length > 0);
}

function authHeaders(): HeadersInit {
  const key = API_KEY.trim();
  if (!key) {
    throw new Error("STACKBY_API_KEY is not set. Set it in your MCP config (e.g. Cursor mcp.json env).");
  }
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    ...(key.startsWith("pat_") ? { Authorization: `Bearer ${key}` } : {}),
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<{ data: T }> {
  const url = path.startsWith("http") ? path : `${BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error ?? body?.message ?? res.statusText;
    throw new Error(`Stackby API ${res.status}: ${msg}`);
  }
  return body as { data: T };
}

export interface Workspace {
  id: string;
  name: string;
}

export interface Stack {
  stackId: string;
  workspaceId: string;
  stackName: string;
  info?: string;
  color?: string;
  icon?: string;
  createdAt?: string;
}

/** GET /api/v1/workspacelist — list workspaces for the authenticated user (devapi). */
export async function getWorkspaces(): Promise<Workspace[]> {
  const out = await request<Workspace[]>("/api/v1/workspacelist", { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

/** GET /api/v1/stacklist/:id — list stacks in a workspace (devapi). id = workspaceId. */
export async function getStacks(workspaceId: string): Promise<{ list: Stack[]; workspaceName: string }> {
  const out = await request<{ list: Stack[]; workspaceName: string }>(`/api/v1/stacklist/${workspaceId}`, { method: "GET" });
  if (out.data && typeof out.data === "object" && Array.isArray((out.data as { list?: Stack[] }).list)) {
    return out.data as { list: Stack[]; workspaceName: string };
  }
  return { list: [], workspaceName: "" };
}

/** Fetch all stacks across all workspaces (for list_stacks tool). */
export async function getAllStacks(): Promise<Array<Stack & { workspaceName?: string }>> {
  const workspaces = await getWorkspaces();
  const all: Array<Stack & { workspaceName?: string }> = [];
  for (const ws of workspaces) {
    try {
      const { list, workspaceName } = await getStacks(ws.id);
      for (const s of list) {
        all.push({ ...s, workspaceName });
      }
    } catch (e) {
      // skip workspace on error (e.g. no access)
    }
  }
  return all;
}

export interface Table {
  id: string;
  name: string;
}

/** GET /api/v1/tablelist/:id — list tables in a stack (devapi). id = stackId. */
export async function getTables(stackId: string): Promise<Table[]> {
  const out = await request<Table[]>(`/api/v1/tablelist/${encodeURIComponent(stackId)}`, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

export interface TableField {
  id: string;
  name: string;
  type: string;
  key?: string;
  label?: string;
}

export interface TableView {
  id: string;
  name: string;
  tableId: string;
}

/** GET /api/v1/columnlist/:stackId/:tableId — list columns/fields for a table (devapi). */
export async function getTableColumns(stackId: string, tableId: string): Promise<TableField[]> {
  const path = `/api/v1/columnlist/${encodeURIComponent(stackId)}/${encodeURIComponent(tableId)}`;
  const out = await request<TableField[]>(path, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

/** GET /api/v1/viewlist/:stackid/:tableid — list views for a table (devapi). */
export async function getTableViewList(stackId: string, tableId: string): Promise<TableView[]> {
  const path = `/api/v1/viewlist/${encodeURIComponent(stackId)}/${encodeURIComponent(tableId)}`;
  const out = await request<TableView[]>(path, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

export interface DescribeTableResult {
  id: string;
  name: string;
  fields: TableField[];
  views: TableView[];
}

/** Describe one table: name (from tablelist), fields (columnlist), views (viewlist). */
export async function describeTable(stackId: string, tableId: string): Promise<DescribeTableResult> {
  const [tables, fields, views] = await Promise.all([
    getTables(stackId),
    getTableColumns(stackId, tableId),
    getTableViewList(stackId, tableId),
  ]);
  const tableMeta = tables.find((t) => t.id === tableId);
  return {
    id: tableId,
    name: tableMeta?.name ?? tableId,
    fields,
    views,
  };
}

export interface TableRecord {
  id: string;
  field: Record<string, unknown>;
}

/** GET /api/v1/rowlist/:id/:table — list rows (devapi). Query: maxrecord (default 100, max 100), offset, optional rowIds. */
export async function getRowList(
  stackId: string,
  tableId: string,
  opts: { maxRecords?: number; offset?: number; rowIds?: string[] } = {}
): Promise<TableRecord[]> {
  const maxRecords = Math.min(Math.max(1, opts.maxRecords ?? 100), 100);
  const offset = Math.max(0, opts.offset ?? 0);
  let path = `/api/v1/rowlist/${encodeURIComponent(stackId)}/${encodeURIComponent(tableId)}?maxrecord=${maxRecords}&offset=${offset}`;
  if (opts.rowIds && opts.rowIds.length > 0) {
    path += `&rowIds=${encodeURIComponent(opts.rowIds.join(","))}`;
  }
  const out = await request<TableRecord[]>(path, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

/** Get a single record by id. Uses rowlist with rowIds=recordId. */
export async function getRecord(
  stackId: string,
  tableId: string,
  recordId: string
): Promise<TableRecord | null> {
  const list = await getRowList(stackId, tableId, { rowIds: [recordId], maxRecords: 1 });
  return list.length > 0 ? list[0] : null;
}

export interface SearchRecordsResult {
  rowIds: string[];
  rowname: string[];
  fields: Array<Record<string, unknown>>;
}

/** POST /api/v2/public/zsearchRow/:stackId/:tableId — search rows in a column (devapi). Body: table, column, search, maxRecord. */
export async function searchRecords(
  stackId: string,
  tableId: string,
  searchTerm: string,
  opts: { columnId?: string; maxRecords?: number } = {}
): Promise<SearchRecordsResult> {
  let columnId = opts.columnId?.trim();
  if (!columnId) {
    const columns = await getTableColumns(stackId, tableId);
    columnId = columns.length > 0 ? columns[0].id : "";
  }
  if (!columnId) {
    return { rowIds: [], rowname: [], fields: [] };
  }
  const maxRecord = Math.min(Math.max(1, opts.maxRecords ?? 100), 99999);
  const path = `/api/v2/public/zsearchRow/${encodeURIComponent(stackId)}/${encodeURIComponent(tableId)}`;
  const body = {
    table: tableId,
    column: columnId,
    search: searchTerm,
    maxRecord,
  };
  const out = await request<SearchRecordsResult[]>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const first = Array.isArray(out.data) && out.data.length > 0 ? out.data[0] : null;
  if (!first || !first.rowIds) {
    return { rowIds: [], rowname: [], fields: [] };
  }
  return {
    rowIds: first.rowIds ?? [],
    rowname: first.rowname ?? [],
    fields: first.fields ?? [],
  };
}

// --- Write APIs (Phase 3) ---

/** POST /api/v1/rowcreate/:id/:table — create one or more rows (devapi). Body: { records: [ { field: { "Column Name": value } } ] }, max 10. */
export async function createRow(
  stackId: string,
  tableId: string,
  fields: Record<string, unknown>
): Promise<TableRecord[]> {
  const path = `/api/v1/rowcreate/${encodeURIComponent(stackId)}/${encodeURIComponent(tableId)}`;
  const body = { records: [{ field: fields }] };
  const out = await request<TableRecord[]>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return Array.isArray(out.data) ? out.data : [];
}

/** POST /api/v1/rowupdate/:id/:table — update rows (devapi). Body: { records: [ { id, field } ] }, max 10. */
export async function updateRows(
  stackId: string,
  tableId: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>
): Promise<TableRecord[]> {
  if (records.length === 0) return [];
  if (records.length > 10) throw new Error("update_records supports at most 10 records per request.");
  const path = `/api/v1/rowupdate/${encodeURIComponent(stackId)}/${encodeURIComponent(tableId)}`;
  const body = {
    records: records.map((r) => ({ id: r.id, field: r.fields })),
  };
  const out = await request<TableRecord[]>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return Array.isArray(out.data) ? out.data : [];
}

/** DELETE /api/v1/rowdelete/:id/:table — soft-delete rows (devapi). Query: rowIds=id1&rowIds=id2. */
export async function deleteRows(
  stackId: string,
  tableId: string,
  recordIds: string[]
): Promise<{ records: Array<{ id: string; deleted: boolean }> }> {
  if (recordIds.length === 0) return { records: [] };
  if (recordIds.length > 10) throw new Error("delete_records supports at most 10 records per request.");
  const query = recordIds.map((id) => `rowIds=${encodeURIComponent(id)}`).join("&");
  const path = `/api/v1/rowdelete/${encodeURIComponent(stackId)}/${encodeURIComponent(tableId)}?${query}`;
  const out = await request<{ records: Array<{ id: string; deleted: boolean }> }>(path, {
    method: "DELETE",
  });
  return out.data ?? { records: [] };
}

// --- Schema APIs (Phase 4: create only) ---

export interface CreateTableResult {
  tableId?: string;
  name?: string;
  [key: string]: unknown;
}

/** POST /api/v1/tableCreate/:id — create a table in a stack (devapi). :id = stackId. */
export async function createTable(
  stackId: string,
  name: string,
  _description?: string
): Promise<CreateTableResult> {
  const path = `/api/v1/tableCreate/${encodeURIComponent(stackId)}`;
  const body = {
    name: name.trim(),
    type: "default",
    data: "",
    copyTable: "",
    copyTableData: false,
  };
  const out = await request<CreateTableResult>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return out.data ?? {};
}

/** Column types supported by POST /api/v1/columnCreate/:columnType (devapi). */
export const COLUMN_TYPES = [
  "shortText",
  "longText",
  "number",
  "checkbox",
  "dateAndTime",
  "time",
  "singleOption",
  "multipleOptions",
  "email",
  "url",
  "phoneNumber",
  "rating",
  "duration",
  "autoNumber",
  "createdTime",
  "updatedTime",
  "createdBy",
  "updatedBy",
  "attachment",
  "link",
  "lookup",
  "lookupCount",
  "aggregation",
  "formula",
  "checkList",
  "location",
  "barcode",
  "signature",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface CreateColumnResult {
  columnId?: string;
  tableId?: string;
  name?: string;
  [key: string]: unknown;
}

/** POST /api/v1/columnCreate/:columnType — create a column (devapi). Body: stackId, tableId, name, viewId; for singleOption/multipleOptions add options[]. */
export async function createColumn(
  stackId: string,
  tableId: string,
  name: string,
  columnType: string,
  opts: { viewId?: string; options?: string[] } = {}
): Promise<CreateColumnResult> {
  const path = `/api/v1/columnCreate/${encodeURIComponent(columnType)}`;
  const body: Record<string, unknown> = {
    stackId,
    tableId,
    name: name.trim(),
    viewId: opts.viewId ?? "",
  };
  if (opts.options && opts.options.length > 0) {
    body.options = opts.options;
  }
  const out = await request<CreateColumnResult>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return out.data ?? {};
}
