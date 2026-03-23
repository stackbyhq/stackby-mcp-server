/**
 * Apply a declarative stack template after stack creation (tables, columns, rows, links).
 * Orchestrates existing MCP APIs: createTable, createColumn, createRow.
 */
import {
  createColumn,
  createRow,
  createTable,
  getTableViewList,
  getTables,
  normalizeColumnType,
} from "./stackby-api.js";

export interface TemplateColumnInput {
  name: string;
  columnType: string;
  options?: string[];
  /** Target table `key` in the same template (for link columns). */
  linkToTableKey?: string;
  formulaText?: string;
  linkToTableViewId?: string;
}

export interface TemplateRowInput {
  /** Stable id for this row; other rows can reference it in link fields via __linkRowKeys / __linkRowKey. */
  rowKey?: string;
  fields: Record<string, unknown>;
}

export interface TemplateTableInput {
  /** Stable id for this table; use in linkToTableKey from other tables. */
  key?: string;
  /** Display name. Required for 2nd+ tables (new tables). First table uses the stack's default first table. */
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

/**
 * After POST /mcp/stacks/create, applies optional tables/columns/rows.
 * - First template table maps to the stack's existing first table (from default stack creation).
 * - Additional template entries create new tables via createTable.
 * - Columns: non-link types first, then link (needs linkToTableKey -> table key), then formula/lookup/aggregation.
 * - Rows: use rowKey; in link fields use `{ __linkRowKeys: ["otherRowKey"] }` or `{ __linkRowKey: "otherRowKey" }`.
 */
export async function applyStackTemplate(
  stackId: string,
  tables: TemplateTableInput[]
): Promise<ApplyStackTemplateResult> {
  const warnings: string[] = [];
  const tableSummaries: string[] = [];
  const keyToTableId = new Map<string, string>();

  if (!tables.length) {
    return { tableSummaries, warnings };
  }

  const existing = await getTables(stackId);
  if (existing.length === 0) {
    warnings.push("No tables found in the new stack; cannot apply template.");
    return { tableSummaries, warnings };
  }

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const tableKey = t.key?.trim() || slug(t.name ?? `table-${i}`);
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
        if (!tableId) {
          throw new Error("createTable response missing tableId");
        }
        tableSummaries.push(`Created table "${tname}" (${tableId}), key "${tableKey}"`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`Failed to create table "${tname}": ${msg}`);
        continue;
      }
    }

    keyToTableId.set(tableKey, tableId);
  }

  // --- Columns (all tables) ---
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const tableKey = t.key?.trim() || slug(t.name ?? `table-${i}`);
    const tableId = keyToTableId.get(tableKey);
    if (!tableId || !t.columns?.length) continue;

    let viewId = "";
    try {
      const views = await getTableViewList(stackId, tableId);
      viewId = views[0]?.id ?? "";
    } catch (e) {
      warnings.push(`Could not load views for table key "${tableKey}": ${e}`);
    }

    const cols = t.columns;
    const phase1 = cols.filter((c) => {
      const nt = normType(c).toLowerCase();
      return (
        nt !== "link" &&
        nt !== "lookup" &&
        nt !== "lookupcount" &&
        nt !== "aggregation" &&
        nt !== "formula"
      );
    });
    const phase2 = cols.filter((c) => normType(c).toLowerCase() === "link");
    const phase3 = cols.filter((c) => {
      const nt = normType(c).toLowerCase();
      return (
        nt === "lookup" ||
        nt === "lookupcount" ||
        nt === "aggregation" ||
        nt === "formula"
      );
    });

    const runPhase = async (list: TemplateColumnInput[], phaseLabel: string) => {
      for (const col of list) {
        try {
          const nt = normType(col);
          const lt = nt.toLowerCase();
          let linkToTableId: string | undefined;
          let linkToTableViewId: string | undefined;

          if (lt === "link") {
            const tk = col.linkToTableKey?.trim();
            if (!tk) {
              warnings.push(`Link column "${col.name}" (${tableKey}): linkToTableKey is required`);
              continue;
            }
            linkToTableId = keyToTableId.get(tk);
            if (!linkToTableId) {
              warnings.push(`Link column "${col.name}": unknown linkToTableKey "${tk}"`);
              continue;
            }
            if (col.linkToTableViewId?.trim()) {
              linkToTableViewId = col.linkToTableViewId.trim();
            } else {
              const lv = await getTableViewList(stackId, linkToTableId);
              linkToTableViewId = lv[0]?.id ?? "";
            }
          }

          if (lt === "formula" && !col.formulaText?.trim()) {
            warnings.push(`Formula column "${col.name}" (${tableKey}): formulaText is recommended`);
          }

          await createColumn(stackId, tableId, col.name, col.columnType, {
            viewId,
            options: col.options,
            linkToTableId,
            linkToTableViewId,
            formulaText: col.formulaText,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(`${phaseLabel} column "${col.name}" on table key "${tableKey}": ${msg}`);
        }
      }
    };

    await runPhase(phase1, "Base");
    await runPhase(phase2, "Link");
    await runPhase(phase3, "Formula/Lookup");
  }

  // --- Rows (stable rowKeys for link resolution) ---
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

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const tableKey = t.key?.trim() || slug(t.name ?? `table-${i}`);
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
