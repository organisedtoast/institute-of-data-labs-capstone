function buildDefaultBoldStockRowsHelper(defaultBoldStockRows = []) {
  // Both backend and frontend wrappers derive their lookup Sets from the same
  // normalized list so one JSON source controls the default-bold behavior.
  const normalizedDefaultBoldStockRows = defaultBoldStockRows.map((row) => ({
    surface: String(row?.surface || ""),
    fieldPath: String(row?.fieldPath || ""),
    rowKey: String(row?.rowKey || ""),
  }));

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

  return {
    defaultBoldStockRows: normalizedDefaultBoldStockRows,
    defaultBoldRowKeys,
    defaultBoldMainTableRowKeys,
    defaultBoldMetricsFieldPaths,
    isDefaultBoldRowKey,
    isDefaultBoldMainTableRowKey,
    isDefaultBoldMetricsFieldPath,
  };
}

module.exports = buildDefaultBoldStockRowsHelper;
