/**
 * Stackby API client for MCP server.
 * Uses dedicated MCP API only: /api/v1/mcp/* (existing developer API is unchanged).
 * In HTTP (hosted) mode, API key and URL come from request context; in stdio mode from process.env.
 */
import { getApiKeyFromContext, getApiUrlFromContext } from "./request-context.js";

const DEFAULT_BASE_URL = process.env.STACKBY_API_URL || "https://stackby.com";
const ENV_API_KEY = process.env.STACKBY_API_KEY || "";
const MCP_API = "/api/v1/mcp";

function getEffectiveApiKey(): string {
  const fromContext = getApiKeyFromContext();
  if (fromContext) return fromContext;
  return ENV_API_KEY.trim();
}

function getEffectiveBaseUrl(): string {
  const fromContext = getApiUrlFromContext();
  if (fromContext) return fromContext.replace(/\/$/, "");
  return DEFAULT_BASE_URL.replace(/\/$/, "");
}

export function hasApiKey(): boolean {
  return Boolean(getEffectiveApiKey());
}

/** Returns the base URL actually in use (for error messages). */
export function getApiBaseUrl(): string {
  return getEffectiveBaseUrl();
}

function authHeaders(): HeadersInit {
  const key = getEffectiveApiKey();
  if (!key) {
    throw new Error("STACKBY_API_KEY is not set. Set it in your MCP config (e.g. Cursor mcp.json env) or send header X-Stackby-API-Key (hosted).");
  }
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    ...(key.startsWith("pat_") ? { Authorization: `Bearer ${key}` } : {}),
  };
}

/**
 * Backend sendResponseAuthentication.js sends MCP routes as "plain": the raw payload
 * (body.data) is sent, not { data: body.data }. So we accept both shapes.
 */
function normalizeResponse<T>(body: unknown): { data: T } {
  if (body != null && typeof body === "object" && "data" in body && (body as { data?: unknown }).data !== undefined) {
    return { data: (body as { data: T }).data };
  }
  return { data: body as T };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<{ data: T }> {
  const base = getEffectiveBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string>) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error ?? body?.message ?? res.statusText;
    throw new Error(`Stackby API ${res.status}: ${msg}`);
  }
  return normalizeResponse<T>(body);
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

/** GET /api/v1/mcp/workspaces — list workspaces (MCP API only). */
export async function getWorkspaces(): Promise<Workspace[]> {
  const out = await request<Workspace[]>(`${MCP_API}/workspaces`, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

/** POST /api/v1/mcp/stacks — list stacks in a workspace. Body: { workspaceId }. */
export async function getStacks(workspaceId: string, workspaceName?: string): Promise<{ list: Stack[]; workspaceName: string }> {
  const out = await request<Array<{ stackId?: string; stackName: string; workspaceId: string; color?: string; icon?: string }>>(`${MCP_API}/stacks`, {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  const raw = Array.isArray(out.data) ? out.data : [];
  const list: Stack[] = raw.map((s) => ({
    stackId: s.stackId ?? "",
    stackName: s.stackName,
    workspaceId: s.workspaceId,
    color: s.color,
    icon: s.icon,
  }));
  return { list, workspaceName: workspaceName ?? "" };
}

/** Fetch all stacks across all workspaces (for list_stacks tool). */
export async function getAllStacks(): Promise<Array<Stack & { workspaceName?: string }>> {
  const workspaces = await getWorkspaces();
  const all: Array<Stack & { workspaceName?: string }> = [];
  for (const ws of workspaces) {
    try {
      const { list, workspaceName } = await getStacks(ws.id, ws.name);
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

/** GET /api/v1/mcp/stacks/:stackId/tables — list tables in a stack (MCP API only). */
export async function getTables(stackId: string): Promise<Table[]> {
  const out = await request<Table[]>(`${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables`, { method: "GET" });
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

/** GET /api/v1/mcp/stacks/:stackId/tables/:tableId/columns — list columns (MCP API only). */
export async function getTableColumns(stackId: string, tableId: string): Promise<TableField[]> {
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/columns`;
  const out = await request<TableField[]>(path, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

/** GET /api/v1/mcp/stacks/:stackId/tables/:tableId/views — list all visible views (MCP API only). */
export async function getTableViewList(stackId: string, tableId: string): Promise<TableView[]> {
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/views`;
  const out = await request<TableView[]>(path, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

export interface DescribeTableResult {
  id: string;
  name: string;
  fields: TableField[];
  views: TableView[];
}

/** GET /api/v1/mcp/stacks/:stackId/tables/:tableId — describe table (single API: id, name, fields, views). */
export async function describeTable(stackId: string, tableId: string): Promise<DescribeTableResult> {
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}`;
  const out = await request<DescribeTableResult>(path, { method: "GET" });
  const d = out.data;
  return {
    id: d?.id ?? tableId,
    name: d?.name ?? tableId,
    fields: Array.isArray(d?.fields) ? d.fields : [],
    views: Array.isArray(d?.views) ? d.views : [],
  };
}

export interface TableRecord {
  id: string;
  field: Record<string, unknown>;
}

/** Options for list rows — aligned with rowList.js query params. */
export interface GetRowListOptions {
  maxRecords?: number;
  offset?: number;
  rowIds?: string[];
  pageSize?: number;
  view?: string;
  filter?: string;
  sort?: string;
  latest?: string;
  filterByFormula?: string;
  conjuction?: string;
}

/** GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows — list rows (MCP API). Passes all opts as query params. */
export async function getRowList(
  stackId: string,
  tableId: string,
  opts: GetRowListOptions = {}
): Promise<TableRecord[]> {
  const maxRecords = Math.min(Math.max(1, opts.maxRecords ?? opts.pageSize ?? 100), 100);
  const offset = Math.max(0, opts.offset ?? 0);
  const params = new URLSearchParams();
  params.set("maxrecord", String(maxRecords));
  params.set("offset", String(offset));
  if (opts.rowIds && opts.rowIds.length > 0) {
    params.set("rowIds", opts.rowIds.join(","));
  }
  if (opts.view != null && opts.view !== "") params.set("view", opts.view);
  if (opts.filter != null && opts.filter !== "") params.set("filter", opts.filter);
  if (opts.sort != null && opts.sort !== "") params.set("sort", opts.sort);
  if (opts.latest != null && opts.latest !== "") params.set("latest", opts.latest);
  if (opts.filterByFormula != null && opts.filterByFormula !== "") params.set("filterByFormula", opts.filterByFormula);
  if (opts.conjuction != null && opts.conjuction !== "") params.set("conjuction", opts.conjuction);
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/rows?${params.toString()}`;
  const out = await request<TableRecord[]>(path, { method: "GET" });
  return Array.isArray(out.data) ? out.data : [];
}

/** GET /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/:recordId — get one record (MCP API). */
export async function getRecord(
  stackId: string,
  tableId: string,
  recordId: string
): Promise<TableRecord | null> {
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(recordId)}`;
  const out = await request<TableRecord | TableRecord[]>(path, { method: "GET" });
  const data = out.data;
  if (Array.isArray(data)) return data.length > 0 ? data[0] : null;
  return data && typeof data === "object" ? (data as TableRecord) : null;
}

export interface SearchRecordsResult {
  rowIds: string[];
  rowname: string[];
  fields: Array<Record<string, unknown>>;
}

/** POST /api/v1/mcp/stacks/:stackId/tables/:tableId/search — search rows (MCP API). */
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
  const maxRecord = Math.min(Math.max(1, opts.maxRecords ?? 100), 99999);
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/search`;
  const body = { search: searchTerm, columnId: columnId || undefined, maxRecords: maxRecord };
  const out = await request<SearchRecordsResult | SearchRecordsResult[]>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = out.data;
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || !(first as SearchRecordsResult).rowIds) {
    return { rowIds: [], rowname: [], fields: [] };
  }
  const f = first as SearchRecordsResult;
  return { rowIds: f.rowIds ?? [], rowname: f.rowname ?? [], fields: f.fields ?? [] };
}

// --- Write APIs (Phase 3) ---

/** POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows — create row(s) (MCP API). */
export async function createRow(
  stackId: string,
  tableId: string,
  fields: Record<string, unknown>
): Promise<TableRecord[]> {
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/rows`;
  const body = { records: [{ field: fields }] };
  const out = await request<TableRecord[]>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return Array.isArray(out.data) ? out.data : [];
}

/** POST /api/v1/mcp/stacks/:stackId/tables/:tableId/rows/update — update rows (MCP API). */
export async function updateRows(
  stackId: string,
  tableId: string,
  records: Array<{ id: string; fields: Record<string, unknown> }>
): Promise<TableRecord[]> {
  if (records.length === 0) return [];
  if (records.length > 10) throw new Error("update_records supports at most 10 records per request.");
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/rows/update`;
  const body = {
    records: records.map((r) => ({ id: r.id, field: r.fields })),
  };
  const out = await request<TableRecord[]>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return Array.isArray(out.data) ? out.data : [];
}

/** DELETE /api/v1/mcp/stacks/:stackId/tables/:tableId/rows — soft-delete rows (MCP API). */
export async function deleteRows(
  stackId: string,
  tableId: string,
  recordIds: string[]
): Promise<{ records: Array<{ id: string; deleted: boolean }> }> {
  if (recordIds.length === 0) return { records: [] };
  if (recordIds.length > 10) throw new Error("delete_records supports at most 10 records per request.");
  const query = recordIds.map((id) => `rowIds=${encodeURIComponent(id)}`).join("&");
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables/${encodeURIComponent(tableId)}/rows?${query}`;
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

/** POST /api/v1/mcp/stacks/:stackId/tables — create a table in a stack (MCP API). */
export async function createTable(
  stackId: string,
  name: string,
  _description?: string
): Promise<CreateTableResult> {
  const path = `${MCP_API}/stacks/${encodeURIComponent(stackId)}/tables`;
  const body = { name: name.trim() };
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

/** POST /api/v1/mcp/columns — create a column (MCP API). Body: stackId, tableId, name, columnType, viewId?, options? */
export async function createColumn(
  stackId: string,
  tableId: string,
  name: string,
  columnType: string,
  opts: { viewId?: string; options?: string[] } = {}
): Promise<CreateColumnResult> {
  const path = `${MCP_API}/columns`;
  const body: Record<string, unknown> = {
    stackId,
    tableId,
    name: name.trim(),
    columnType,
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
