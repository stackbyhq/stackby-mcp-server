/**
 * Apply a declarative stack template after stack creation (tables, columns, rows, links).
 * Orchestrates existing MCP APIs: createTable, createColumn, createRow.
 *
 * Management strategy:
 * - **Table order**: Topologically sort tables so any table **linked to** appears before tables that hold the link
 *   (so the default first table is usually a good parent, e.g. Companies before Tasks).
 * - **Columns**: Base types → **link** → **formula** (can reference other columns) → **lookup / lookupCount / aggregation**
 *   (need `linkColumnId` + foreign `linkedColumnId` per Stackby API).
 * - **Row order**: Same sorted table order so parent rows tend to exist before child rows that use `__linkRowKeys`.
 */
import {
  createColumn,
  createRow,
  createTable,
  describeTable,
  getTableViewList,
  getTables,
  normalizeColumnType,
} from "./stackby-api.js";

export interface TemplateColumnInput {
  name: string;
  columnType: string;
  options?: string[];
  /** For type `link`: the `key` of the target table in the same `tables` array. */
  linkToTableKey?: string;
  formulaText?: string;
  linkToTableViewId?: string;
  /**
   * For lookup / lookupCount / aggregation: the **name** of an existing **link** column on this table
   * (after that link column is created). Alternative to `linkColumnId`.
   */
  linkColumnName?: string;
  /** Explicit link column id (same table). */
  linkColumnId?: string;
  /**
   * For lookup / aggregation: column **name** on the **linked** (foreign) table to pull or roll up.
   * Resolved after foreign table columns exist. Alternative to `linkedColumnId`.
   */
  linkedColumnName?: string;
  linkedColumnId?: string;
}

export interface TemplateRowInput {
  rowKey?: string;
  fields: Record<string, unknown>;
}

export interface TemplateTableInput {
  key?: string;
  name?: string;
  columns?: TemplateColumnInput[];
  rows?: TemplateRowInput[];
}

export interface ApplyStackTemplateResult {
  tableSummaries: string[];
  warnings: string[];
}

function slug(s: string): string {
  const t = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return t || "table";
}

function normType(c: TemplateColumnInput): string {
  return normalizeColumnType(c.columnType);
}

function tableKeyFor(tables: TemplateTableInput[], index: number): string {
  const t = tables[index];
  return t.key?.trim() || slug(t.name ?? `table-${index}`);
}

function tableKeysInOrder(tables: TemplateTableInput[]): string[] {
  return tables.map((_, i) => tableKeyFor(tables, i));
}

/**
 * If table i has a link column to table key K, then index(K) must come before i.
 * Returns indices in a valid creation order (Kahn topological sort).
 */
function sortTableIndicesByLinkDependencies(tables: TemplateTableInput[]): number[] {
  const n = tables.length;
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);

  const keys = tableKeysInOrder(tables);
  const indegree = new Array(n).fill(0);
  const graph: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const deps = new Set<number>();
    for (const col of tables[i].columns ?? []) {
      if (normType(col).toLowerCase() !== "link") continue;
      const lk = col.linkToTableKey?.trim();
      if (!lk) continue;
      const j = keys.indexOf(lk);
      if (j >= 0 && j !== i) deps.add(j);
    }
    indegree[i] = deps.size;
    for (const j of deps) graph[j].push(i);
  }

  const q: number[] = [];
  for (let i = 0; i < n; i++) if (indegree[i] === 0) q.push(i);
  const out: number[] = [];
  while (q.length) {
    const i = q.shift()!;
    out.push(i);
    for (const t of graph[i]) {
      indegree[t]--;
      if (indegree[t] === 0) q.push(t);
    }
  }

  if (out.length !== n) {
    for (let i = 0; i < n; i++) if (!out.includes(i)) out.push(i);
  }
  return out;
}

function colRegistryKey(tableKey: string, columnName: string): string {
  return `${tableKey}::${columnName.trim()}`;
}

async function resolveColumnIdByName(
  stackId: string,
  tableId: string,
  columnName: string,
  warnings: string[]
): Promise<string | undefined> {
  const schema = await describeTable(stackId, tableId);
  const f = schema.fields.find((x) => x.name.trim() === columnName.trim());
  if (!f) warnings.push(`Column "${columnName}" not found on table ${tableId}`);
  return f?.id;
}

/**
 * After POST /mcp/stacks/create, applies optional tables/columns/rows.
 */
export async function applyStackTemplate(
  stackId: string,
  tables: TemplateTableInput[]
): Promise<ApplyStackTemplateResult> {
  const warnings: string[] = [];
  const tableSummaries: string[] = [];
  const keyToTableId = new Map<string, string>();
  const columnIdByKey = new Map<string, string>();

  if (!tables.length) {
    return { tableSummaries, warnings };
  }

  const existing = await getTables(stackId);
  if (existing.length === 0) {
    warnings.push("No tables found in the new stack; cannot apply template.");
    return { tableSummaries, warnings };
  }

  const order = sortTableIndicesByLinkDependencies(tables);
  const sortedTables = order.map((i) => tables[i]);
  if (order.some((v, i) => v !== i)) {
    tableSummaries.push(
      `Tables reordered by link dependencies: ${order.map((i) => tableKeyFor(tables, i)).join(" → ")}`
    );
  }

  const sortedKeys = tableKeysInOrder(sortedTables);

  for (let i = 0; i < sortedTables.length; i++) {
    const t = sortedTables[i];
    const tableKey = sortedKeys[i];
    let tableId: string;

    if (i === 0) {
      tableId = existing[0].id;
      tableSummaries.push(
        `Table key "${tableKey}" → first stack table "${existing[0].name}" (${tableId})`
      );
    } else {
      const tname = t.name?.trim() || `Table ${i + 1}`;
      try {
        const created = await createTable(stackId, tname);
        tableId =
          (created.tableId as string) ||
          (created as { id?: string }).id ||
          "";
        if (!tableId) throw new Error("createTable response missing tableId");
        tableSummaries.push(`Created table "${tname}" (${tableId}), key "${tableKey}"`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`Failed to create table "${tname}": ${msg}`);
        continue;
      }
    }

    keyToTableId.set(tableKey, tableId);
  }

  const runColumnPhases = async (t: TemplateTableInput, tableKey: string, tableId: string) => {
    if (!t.columns?.length) return;

    let viewId = "";
    try {
      const views = await getTableViewList(stackId, tableId);
      viewId = views[0]?.id ?? "";
    } catch (e) {
      warnings.push(`Could not load views for table key "${tableKey}": ${e}`);
    }

    const cols = t.columns;
    const ntLower = (c: TemplateColumnInput) => normType(c).toLowerCase();

    const phaseBase = cols.filter(
      (c) =>
        !["link", "lookup", "lookupcount", "aggregation", "formula"].includes(ntLower(c))
    );
    const phaseLink = cols.filter((c) => ntLower(c) === "link");
    const phaseFormula = cols.filter((c) => ntLower(c) === "formula");
    const phaseRollup = cols.filter((c) =>
      ["lookup", "lookupcount", "aggregation"].includes(ntLower(c))
    );

    const createOne = async (col: TemplateColumnInput, phaseLabel: string) => {
      const nt = normType(col);
      const lt = nt.toLowerCase();
      let linkToTableId: string | undefined;
      let linkToTableViewId: string | undefined;
      let linkColumnId: string | undefined;
      let linkedColumnId: string | undefined;

      if (lt === "link") {
        const tk = col.linkToTableKey?.trim();
        if (!tk) {
          warnings.push(`Link column "${col.name}" (${tableKey}): linkToTableKey is required`);
          return;
        }
        linkToTableId = keyToTableId.get(tk);
        if (!linkToTableId) {
          warnings.push(`Link column "${col.name}": unknown linkToTableKey "${tk}"`);
          return;
        }
        if (col.linkToTableViewId?.trim()) {
          linkToTableViewId = col.linkToTableViewId.trim();
        } else {
          const lv = await getTableViewList(stackId, linkToTableId);
          linkToTableViewId = lv[0]?.id ?? "";
        }
      }

      if (lt === "formula" && !col.formulaText?.trim()) {
        warnings.push(`Formula column "${col.name}" (${tableKey}): formulaText is usually required`);
      }

      if (["lookup", "lookupcount", "aggregation"].includes(lt)) {
        const tk = col.linkToTableKey?.trim();
        if (!tk) {
          warnings.push(
            `${phaseLabel} "${col.name}": linkToTableKey is required (template key of the linked table)`
          );
          return;
        }
        linkToTableId = keyToTableId.get(tk);
        if (!linkToTableId) {
          warnings.push(`Column "${col.name}": unknown linkToTableKey "${tk}"`);
          return;
        }

        if (col.linkColumnId?.trim()) {
          linkColumnId = col.linkColumnId.trim();
        } else if (col.linkColumnName?.trim()) {
          linkColumnId = columnIdByKey.get(colRegistryKey(tableKey, col.linkColumnName));
          if (!linkColumnId) {
            warnings.push(
              `${phaseLabel} "${col.name}": no column id for linkColumnName "${col.linkColumnName}" (create the link column first in this template)`
            );
            return;
          }
        } else {
          warnings.push(
            `${phaseLabel} "${col.name}": set linkColumnName or linkColumnId for the link column on this table`
          );
          return;
        }

        if (lt === "lookup" || lt === "aggregation") {
          if (col.linkedColumnId?.trim()) {
            linkedColumnId = col.linkedColumnId.trim();
          } else if (col.linkedColumnName?.trim()) {
            linkedColumnId = await resolveColumnIdByName(
              stackId,
              linkToTableId,
              col.linkedColumnName,
              warnings
            );
            if (!linkedColumnId) return;
          } else {
            warnings.push(
              `${phaseLabel} "${col.name}": set linkedColumnName or linkedColumnId on the linked table`
            );
            return;
          }
        }
      }

      try {
        const result = await createColumn(stackId, tableId, col.name, col.columnType, {
          viewId,
          options: col.options,
          linkToTableId,
          linkToTableViewId,
          formulaText: col.formulaText,
          linkColumnId,
          linkedColumnId,
        });
        const newId = (result.columnId as string) || (result as { id?: string }).id;
        if (newId) {
          columnIdByKey.set(colRegistryKey(tableKey, col.name), newId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`${phaseLabel} column "${col.name}" on table key "${tableKey}": ${msg}`);
      }
    };

    for (const col of phaseBase) await createOne(col, "Base");
    for (const col of phaseLink) await createOne(col, "Link");
    for (const col of phaseFormula) await createOne(col, "Formula");
    for (const col of phaseRollup) await createOne(col, "Lookup/Rollup");
  };

  for (let i = 0; i < sortedTables.length; i++) {
    const t = sortedTables[i];
    const tableKey = sortedKeys[i];
    const tableId = keyToTableId.get(tableKey);
    if (!tableId) continue;
    await runColumnPhases(t, tableKey, tableId);
  }

  const rowKeyToId = new Map<string, string>();

  const resolveFieldValue = (val: unknown): unknown => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const o = val as Record<string, unknown>;
      if (Array.isArray(o.__linkRowKeys)) {
        const ids: string[] = [];
        for (const k of o.__linkRowKeys) {
          const id = rowKeyToId.get(String(k));
          if (id) ids.push(id);
          else warnings.push(`Unknown rowKey in __linkRowKeys: "${String(k)}"`);
        }
        return ids;
      }
      if (typeof o.__linkRowKey === "string" && o.__linkRowKey.trim()) {
        const id = rowKeyToId.get(o.__linkRowKey.trim());
        if (!id) {
          warnings.push(`Unknown rowKey in __linkRowKey: "${o.__linkRowKey}"`);
          return [];
        }
        return [id];
      }
    }
    return val;
  };

  for (let i = 0; i < sortedTables.length; i++) {
    const t = sortedTables[i];
    const tableKey = sortedKeys[i];
    const tableId = keyToTableId.get(tableKey);
    if (!tableId || !t.rows?.length) continue;

    for (const row of t.rows) {
      const fields: Record<string, unknown> = {};
      for (const [fname, fval] of Object.entries(row.fields || {})) {
        fields[fname] = resolveFieldValue(fval);
      }
      try {
        const recs = await createRow(stackId, tableId, fields);
        const created = recs[0];
        const rk = row.rowKey?.trim();
        if (rk && created?.id) {
          rowKeyToId.set(rk, created.id);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`Row create failed on table key "${tableKey}": ${msg}`);
      }
    }
  }

  return { tableSummaries, warnings };
}
