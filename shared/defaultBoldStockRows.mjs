import defaultBoldStockRowsJson from "./defaultBoldStockRows.json" with { type: "json" };

// The JSON file stays the one canonical default-bold list. This wrapper only
// makes that same list safe to import from browser-facing ESM code.
const normalizedDefaultBoldStockRows = defaultBoldStockRowsJson.map((row) => ({
  surface: String(row?.surface || ""),
  fieldPath: String(row?.fieldPath || ""),
  rowKey: String(row?.rowKey || ""),
}));

// The frontend still needs the same lookups as the backend helper. Keeping the
// derivation here in sync means saved bold defaults behave the same everywhere.
const defaultBoldRowKeys = new Set(
  normalizedDefaultBoldStockRows.map((row) => row.rowKey).filter(Boolean),
);
const defaultBoldMainTableRowKeys = new Set(
  normalizedDefaultBoldStockRows
    .filter((row) => row.surface === "main")
    .map((row) => row.rowKey)
    .filter(Boolean),
);
const defaultBoldMetricsFieldPaths = new Set(
  normalizedDefaultBoldStockRows
    .filter((row) => row.surface === "detail")
    .map((row) => row.fieldPath)
    .filter(Boolean),
);

function isDefaultBoldRowKey(rowKey) {
  return defaultBoldRowKeys.has(String(rowKey || ""));
}

function isDefaultBoldMainTableRowKey(rowKey) {
  return defaultBoldMainTableRowKeys.has(String(rowKey || ""));
}

function isDefaultBoldMetricsFieldPath(fieldPath) {
  return defaultBoldMetricsFieldPaths.has(String(fieldPath || ""));
}

export {
  normalizedDefaultBoldStockRows as defaultBoldStockRows,
  defaultBoldRowKeys,
  defaultBoldMainTableRowKeys,
  defaultBoldMetricsFieldPaths,
  isDefaultBoldRowKey,
  isDefaultBoldMainTableRowKey,
  isDefaultBoldMetricsFieldPath,
};
