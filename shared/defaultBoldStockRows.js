const defaultBoldStockRows = require("./defaultBoldStockRows.json");

// This CommonJS wrapper is for backend Node code. The frontend uses a matching
// ESM wrapper, but both wrappers still derive their lookups from the same JSON.
const normalizedDefaultBoldStockRows = defaultBoldStockRows.map((row) => ({
  surface: String(row?.surface || ""),
  fieldPath: String(row?.fieldPath || ""),
  rowKey: String(row?.rowKey || ""),
}));

// The backend works with row keys, while the frontend sometimes only has a
// field path during fallback normalization. Deriving both views from one list
// keeps the visible default-bold behavior consistent on both sides.
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

module.exports = {
  defaultBoldStockRows: normalizedDefaultBoldStockRows,
  defaultBoldRowKeys,
  defaultBoldMainTableRowKeys,
  defaultBoldMetricsFieldPaths,
  isDefaultBoldRowKey,
  isDefaultBoldMainTableRowKey,
  isDefaultBoldMetricsFieldPath,
};
