const WatchlistStock = require("../models/WatchlistStock");
const StockMetricsRowPreference = require("../models/StockMetricsRowPreference");
const { resolveVisibleFieldsForStock } = require("./lensService");
const { hasUserOverride } = require("../utils/metricField");
const { getNestedValue } = require("../utils/pathUtils");

function normalizeTickerSymbol(tickerSymbol) {
  return String(tickerSymbol || "").trim().toUpperCase();
}

function sortAnnualRows(annualRows = []) {
  return [...annualRows].sort((left, right) => {
    const leftDate = left?.fiscalYearEndDate || "";
    const rightDate = right?.fiscalYearEndDate || "";

    return leftDate.localeCompare(rightDate);
  });
}

function buildAnnualColumns(stockDocument) {
  return sortAnnualRows(stockDocument?.annualData || []).map((annualRow) => ({
    key: `annual-${annualRow.fiscalYear}`,
    kind: "annual",
    label: Number.isInteger(annualRow?.fiscalYear) ? `FY ${annualRow.fiscalYear}` : "FY",
    shortLabel: Number.isInteger(annualRow?.fiscalYear) ? String(annualRow.fiscalYear) : "FY",
    fiscalYear: Number.isInteger(annualRow?.fiscalYear) ? annualRow.fiscalYear : null,
    fiscalYearEndDate:
      typeof annualRow?.fiscalYearEndDate === "string" ? annualRow.fiscalYearEndDate : null,
    earningsReleaseDate: annualRow?.earningsReleaseDate?.effectiveValue ?? null,
  }));
}

function buildColumns(stockDocument) {
  return buildAnnualColumns(stockDocument);
}

function getMetricFieldValue(metricField) {
  if (metricField && typeof metricField === "object" && "effectiveValue" in metricField) {
    return {
      value: metricField.effectiveValue ?? null,
      sourceOfTruth: metricField.sourceOfTruth || "system",
      // Metrics-view shapes UI state for the dashboard. Purple text should
      // mean there is an active user override right now, not that the field
      // happened to say `"user"` at some point in the document's history.
      isOverridden: hasUserOverride(metricField),
    };
  }

  return {
    value: metricField ?? null,
    sourceOfTruth: "system",
    isOverridden: false,
  };
}

function buildAnnualCells(stockDocument, fieldPath, columns) {
  const relativePath = fieldPath.replace(/^annualData\[\]\./, "");
  const annualRows = sortAnnualRows(stockDocument?.annualData || []);

  return columns.map((column) => {
    const annualRow = annualRows.find((candidate) => candidate.fiscalYear === column.fiscalYear);
    const normalizedMetric = getMetricFieldValue(getNestedValue(annualRow, relativePath));

    return {
      columnKey: column.key,
      value: normalizedMetric.value,
      sourceOfTruth: normalizedMetric.sourceOfTruth,
      isOverridden: normalizedMetric.isOverridden,
      isOverrideable: true,
      overrideTarget: {
        kind: "annual",
        fiscalYear: column.fiscalYear,
        payloadPath: relativePath,
      },
    };
  });
}

function buildCellsForField(stockDocument, fieldPath, columns) {
  // Metrics mode now treats every detail row as part of the annual table so
  // each fiscal-year column can hold both trailing data and yearly placeholders.
  return buildAnnualCells(stockDocument, fieldPath, columns);
}

function rowHasAnyRealCellValue(cells = []) {
  return cells.some((cell) => cell?.value !== null && cell?.value !== undefined);
}

async function buildStockMetricsView(tickerSymbol) {
  const normalizedTicker = normalizeTickerSymbol(tickerSymbol);
  const stockDocument = await WatchlistStock.findOne({ tickerSymbol: normalizedTicker }).lean();

  if (!stockDocument) {
    const error = new Error("Stock not found");
    error.statusCode = 404;
    throw error;
  }

  const { detailFields } = await resolveVisibleFieldsForStock(stockDocument);
  const columns = buildColumns(stockDocument);
  const storedPreferences = await StockMetricsRowPreference.find({ tickerSymbol: normalizedTicker }).lean();
  const preferenceByRowKey = new Map(
    storedPreferences.map((preference) => [preference.rowKey, preference])
  );

  const rows = detailFields.map((field) => {
    const rowKey = `${field.order}::${field.fieldPath}`;
    const preference = preferenceByRowKey.get(rowKey);
    const cells = buildCellsForField(stockDocument, field.fieldPath, columns);
    const hasAnyRealData = rowHasAnyRealCellValue(cells);

    // Lens membership decides which detail rows are eligible for metrics mode.
    // Rows that are empty across every annual year start hidden by default so
    // placeholder-only rows do not crowd the table before the user opts in.
    return {
      rowKey,
      fieldPath: field.fieldPath,
      label: field.label,
      shortLabel: field.shortLabel,
      section: field.section,
      shortSection: field.shortSection,
      order: field.order,
      surface: field.surface,
      isEnabled: preference ? preference.isEnabled !== false : hasAnyRealData,
      cells,
    };
  });

  return {
    tickerSymbol: normalizedTicker,
    columns,
    rows,
  };
}

async function setStockMetricsRowEnabledState({ tickerSymbol, rowKey, isEnabled }) {
  const normalizedTicker = normalizeTickerSymbol(tickerSymbol);

  await StockMetricsRowPreference.findOneAndUpdate(
    {
      tickerSymbol: normalizedTicker,
      rowKey,
    },
    {
      tickerSymbol: normalizedTicker,
      rowKey,
      isEnabled: Boolean(isEnabled),
    },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
    }
  );

  return buildStockMetricsView(normalizedTicker);
}

module.exports = {
  buildStockMetricsView,
  setStockMetricsRowEnabledState,
};
