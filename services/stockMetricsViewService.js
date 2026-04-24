const WatchlistStock = require("../models/WatchlistStock");
const StockMetricsRowPreference = require("../models/StockMetricsRowPreference");
const { isAnnualRouteFieldDirectlyOverrideable } = require("../catalog/fieldCatalog");
const { resolveVisibleFieldsForStock } = require("./lensService");
const { clearLegacyDerivedMetricOverrides } = require("../utils/derivedMetricOverrideCleanup");
const { recalculateDerived } = require("../utils/derivedCalc");
const { hasUserOverride } = require("../utils/metricField");
const { getNestedValue } = require("../utils/pathUtils");
const { isDefaultBoldRowKey } = require("../shared/defaultBoldStockRows");

function normalizeTickerSymbol(tickerSymbol) {
  return String(tickerSymbol || "").trim().toUpperCase();
}

function buildMainTableRowKey(fieldPath) {
  return `main::${fieldPath}`;
}

const MAIN_TABLE_ROW_CONFIG = [
  {
    fieldPath: "annualData[].fiscalYearEndDate",
    rowKey: buildMainTableRowKey("annualData[].fiscalYearEndDate"),
    label: "FY end date",
  },
  {
    fieldPath: "annualData[].fiscalYear",
    rowKey: buildMainTableRowKey("annualData[].fiscalYear"),
    label: "FY",
  },
  {
    fieldPath: "annualData[].earningsReleaseDate",
    rowKey: buildMainTableRowKey("annualData[].earningsReleaseDate"),
    label: "FY release date",
  },
  {
    fieldPath: "annualData[].base.sharePrice",
    rowKey: buildMainTableRowKey("annualData[].base.sharePrice"),
    label: "Share price",
  },
  {
    fieldPath: "annualData[].base.sharesOnIssue",
    rowKey: buildMainTableRowKey("annualData[].base.sharesOnIssue"),
    label: "Shares on issue",
  },
  {
    fieldPath: "annualData[].base.marketCap",
    rowKey: buildMainTableRowKey("annualData[].base.marketCap"),
    label: "Market cap",
  },
];

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
  const isDirectlyOverrideable = isAnnualRouteFieldDirectlyOverrideable(relativePath);

  return columns.map((column) => {
    const annualRow = annualRows.find((candidate) => candidate.fiscalYear === column.fiscalYear);
    const normalizedMetric = getMetricFieldValue(getNestedValue(annualRow, relativePath));

    return {
      columnKey: column.key,
      value: normalizedMetric.value,
      sourceOfTruth: normalizedMetric.sourceOfTruth,
      isOverridden: normalizedMetric.isOverridden,
      // Detail rows still display derived values, but the catalog source type
      // decides whether the user can edit them directly. Derived rows stay
      // read-only so the user changes the inputs and lets recalculation win.
      isOverrideable: isDirectlyOverrideable,
      overrideTarget: isDirectlyOverrideable
        ? {
            kind: "annual",
            fiscalYear: column.fiscalYear,
            payloadPath: relativePath,
          }
        : null,
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

function buildMainTableRowPreferences(preferenceByRowKey) {
  return MAIN_TABLE_ROW_CONFIG.map((rowConfig) => {
    const preference = preferenceByRowKey.get(rowConfig.rowKey);

    return {
      rowKey: rowConfig.rowKey,
      fieldPath: rowConfig.fieldPath,
      label: rowConfig.label,
      // The shared helper keeps backend first paint and frontend fallback
      // normalization aligned, while a saved user choice still wins.
      isBold: typeof preference?.isBold === "boolean"
        ? preference.isBold
        : isDefaultBoldRowKey(rowConfig.rowKey),
    };
  });
}

async function buildStockMetricsView(tickerSymbol) {
  const normalizedTicker = normalizeTickerSymbol(tickerSymbol);
  const stockDocument = await WatchlistStock.findOne({ tickerSymbol: normalizedTicker });

  if (!stockDocument) {
    const error = new Error("Stock not found");
    error.statusCode = 404;
    throw error;
  }

  if (clearLegacyDerivedMetricOverrides(stockDocument)) {
    recalculateDerived(stockDocument);
    await stockDocument.save();
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
      // The shared default list belongs in the backend payload too, so
      // existing stocks and older frontend payloads stay visually consistent.
      isBold: typeof preference?.isBold === "boolean"
        ? preference.isBold
        : isDefaultBoldRowKey(rowKey),
      cells,
    };
  });

  return {
    tickerSymbol: normalizedTicker,
    columns,
    mainTableRowPreferences: buildMainTableRowPreferences(preferenceByRowKey),
    rows,
  };
}

async function setStockMetricsRowPreference({ tickerSymbol, rowKey, isEnabled, isBold }) {
  const normalizedTicker = normalizeTickerSymbol(tickerSymbol);
  const nextPreferenceUpdate = {};

  // Using a partial $set lets one preference update land without wiping the
  // other saved row choice. That matters now that hide/show and bold share the
  // same persistence record.
  if (typeof isEnabled === "boolean") {
    nextPreferenceUpdate.isEnabled = Boolean(isEnabled);
  }

  if (typeof isBold === "boolean") {
    nextPreferenceUpdate.isBold = Boolean(isBold);
  }

  await StockMetricsRowPreference.findOneAndUpdate(
    {
      tickerSymbol: normalizedTicker,
      rowKey,
    },
    {
      $set: nextPreferenceUpdate,
      $setOnInsert: {
        tickerSymbol: normalizedTicker,
        rowKey,
      },
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
  buildMainTableRowKey,
  setStockMetricsRowPreference,
};
