const WatchlistStock = require("../models/WatchlistStock");
const StockMetricsRowPreference = require("../models/StockMetricsRowPreference");
const roicService = require("./roicService");
const { isAnnualFieldDirectlyOverrideable } = require("../catalog/fieldCatalog");
const { buildMainTableRowKey } = require("./stockMetricsViewService");
const { clearLegacyDerivedMetricOverrides } = require("../utils/derivedMetricOverrideCleanup");
const { recalculateDerived } = require("../utils/derivedCalc");
const { isDefaultBoldMainTableRowKey } = require("../shared/defaultBoldStockRows");

const ANNUAL_HISTORY_FETCH_VERSION = 3;

// The Stocks page now loads in two stages:
// 1. a tiny watchlist summary for shared search/navigation state
// 2. one batched dashboard bootstrap payload for the first visible card render
//
// Keeping that split on the backend makes the frontend faster without changing
// the visible stock-card behavior beginners already understand.

function normalizeTickerSymbol(tickerSymbol) {
  return String(tickerSymbol || "").trim().toUpperCase();
}

function getEffectiveValue(metricField) {
  if (!metricField || typeof metricField !== "object") {
    return metricField ?? null;
  }

  if ("effectiveValue" in metricField) {
    return metricField.effectiveValue ?? null;
  }

  return metricField;
}

function getCompanyName(stockDocument) {
  const rawCompanyName =
    stockDocument?.companyName?.effectiveValue ||
    stockDocument?.companyName?.userValue ||
    stockDocument?.companyName?.roicValue ||
    stockDocument?.tickerSymbol;

  return typeof rawCompanyName === "string" && rawCompanyName.trim()
    ? rawCompanyName.trim()
    : normalizeTickerSymbol(stockDocument?.tickerSymbol);
}

function normalizePriceRows(priceRows = []) {
  return priceRows
    .map((priceRow) => {
      const closeValue = Number(priceRow?.close);

      if (typeof priceRow?.date !== "string" || !Number.isFinite(closeValue)) {
        return null;
      }

      return {
        date: priceRow.date,
        close: closeValue,
      };
    })
    .filter(Boolean);
}

const MAIN_TABLE_FIELD_CONFIG = {
  fiscalYearEndDate: {
    rowKey: buildMainTableRowKey("annualData[].fiscalYearEndDate"),
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYearEndDate ?? null,
  },
  fiscalYear: {
    rowKey: buildMainTableRowKey("annualData[].fiscalYear"),
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYear ?? null,
  },
  earningsReleaseDate: {
    rowKey: buildMainTableRowKey("annualData[].earningsReleaseDate"),
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.earningsReleaseDate ?? null,
  },
  priceCurrency: {
    rowKey: buildMainTableRowKey("priceCurrency"),
    payloadPath: null,
    resolveField: (stockDocument) => stockDocument?.priceCurrency || null,
  },
  sharePrice: {
    rowKey: buildMainTableRowKey("annualData[].base.sharePrice"),
    payloadPath: "base.sharePrice",
    resolveField: (_stockDocument, annualRow) => annualRow?.base?.sharePrice ?? null,
  },
  sharesOnIssue: {
    rowKey: buildMainTableRowKey("annualData[].base.sharesOnIssue"),
    payloadPath: "base.sharesOnIssue",
    resolveField: (_stockDocument, annualRow) => annualRow?.base?.sharesOnIssue ?? null,
  },
  marketCap: {
    rowKey: buildMainTableRowKey("annualData[].base.marketCap"),
    payloadPath: "base.marketCap",
    resolveField: (_stockDocument, annualRow) => annualRow?.base?.marketCap ?? null,
  },
};

function createAnnualMainTableCell(fieldKey, annualRow, fiscalYear, rowPreferenceByKey = new Map(), stockDocument = null) {
  const fieldConfig = MAIN_TABLE_FIELD_CONFIG[fieldKey];
  const rawField = fieldConfig?.resolveField?.(stockDocument, annualRow);
  const value = getEffectiveValue(rawField);
  const hasMetricMetadata = rawField && typeof rawField === "object" && "sourceOfTruth" in rawField;
  const rowPreference = rowPreferenceByKey.get(fieldConfig?.rowKey);
  const nextBoldState = typeof rowPreference?.isBold === "boolean"
    ? rowPreference.isBold
    : isDefaultBoldMainTableRowKey(fieldConfig?.rowKey);
  const isDirectlyOverrideable =
    Boolean(fieldConfig?.payloadPath && Number.isInteger(fiscalYear) && hasMetricMetadata)
    && isAnnualFieldDirectlyOverrideable(fieldConfig.payloadPath);

  // The main table now needs the same per-cell override metadata as the
  // detailed metrics table. Shipping it in the bootstrap payload lets the page
  // decide at first paint which annual cells should open the shared editor.
  // Bold defaults also come from one shared helper, so saved row choices and
  // frontend fallback logic do not drift apart over time. Derived fields still
  // show their recalculated values here, but they no longer advertise a direct
  // override affordance because the catalog marks them as internal formulas.
  return {
    columnKey: Number.isInteger(fiscalYear) ? `annual-${fiscalYear}` : "",
    rowKey: fieldConfig?.rowKey || "",
    value,
    sourceOfTruth:
      hasMetricMetadata && typeof rawField.sourceOfTruth === "string" ? rawField.sourceOfTruth : "system",
    isOverridden: hasMetricMetadata && rawField.sourceOfTruth === "user",
    isBold: nextBoldState,
    isOverrideable: isDirectlyOverrideable,
    overrideTarget:
      isDirectlyOverrideable
        ? {
            kind: "annual",
            fiscalYear,
            payloadPath: fieldConfig.payloadPath,
          }
        : null,
  };
}

async function persistLegacyDerivedCleanup(stockDocument) {
  if (!stockDocument || typeof stockDocument !== "object") {
    return stockDocument;
  }

  // Read paths now repair any legacy derived overrides too, so old user-owned
  // market-cap style values stop resurfacing after the new lockout ships.
  if (clearLegacyDerivedMetricOverrides(stockDocument)) {
    recalculateDerived(stockDocument);
    if (typeof stockDocument.save === "function") {
      await stockDocument.save();
    }
  }

  return stockDocument;
}

function normalizeAnnualMetrics(stockDocument) {
  const annualRows = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData : [];

  return annualRows
    .map((annualRow) => {
      const fiscalYear = Number(annualRow?.fiscalYear);

      return {
        fiscalYear: Number.isInteger(fiscalYear) ? fiscalYear : null,
        fiscalYearEndDate:
          typeof annualRow?.fiscalYearEndDate === "string" ? annualRow.fiscalYearEndDate : null,
        earningsReleaseDate: getEffectiveValue(annualRow?.earningsReleaseDate),
        sharePrice: getEffectiveValue(annualRow?.base?.sharePrice),
        sharesOnIssue: getEffectiveValue(annualRow?.base?.sharesOnIssue),
        marketCap: getEffectiveValue(annualRow?.base?.marketCap),
      };
    })
    .sort((left, right) => {
      const leftDate = left.fiscalYearEndDate || "";
      const rightDate = right.fiscalYearEndDate || "";

      return leftDate.localeCompare(rightDate);
    });
}

function normalizeAnnualMainTableRows(stockDocument, rowPreferenceByKey = new Map()) {
  const annualRows = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData : [];

  return annualRows
    .map((annualRow) => {
      const fiscalYear = Number(annualRow?.fiscalYear);
      const normalizedFiscalYear = Number.isInteger(fiscalYear) ? fiscalYear : null;

      return {
        fiscalYear: normalizedFiscalYear,
        fiscalYearEndDate:
          typeof annualRow?.fiscalYearEndDate === "string" ? annualRow.fiscalYearEndDate : null,
        cells: Object.fromEntries(
          Object.keys(MAIN_TABLE_FIELD_CONFIG).map((fieldKey) => [
            fieldKey,
            createAnnualMainTableCell(fieldKey, annualRow, normalizedFiscalYear, rowPreferenceByKey, stockDocument),
          ])
        ),
      };
    })
    .sort((left, right) => {
      const leftDate = left.fiscalYearEndDate || "";
      const rightDate = right.fiscalYearEndDate || "";

      return leftDate.localeCompare(rightDate);
    });
}

function shouldUpgradeLegacyAnnualHistory(stockDocument) {
  const importRangeYears = stockDocument?.sourceMeta?.importRangeYears;
  const importRangeYearsExplicit = stockDocument?.sourceMeta?.importRangeYearsExplicit === true;
  const annualHistoryFetchVersion = Number(stockDocument?.sourceMeta?.annualHistoryFetchVersion);
  const annualRowCount = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData.length : 0;
  const needsVersionUpgrade =
    !Number.isInteger(annualHistoryFetchVersion) ||
    annualHistoryFetchVersion < ANNUAL_HISTORY_FETCH_VERSION;
  const hasLegacyTruncatedUncappedHistory =
    importRangeYears == null && (annualRowCount === 10 || annualRowCount === 20);

  if (importRangeYearsExplicit) {
    return false;
  }

  return needsVersionUpgrade || (
    hasLegacyTruncatedUncappedHistory &&
    annualHistoryFetchVersion !== ANNUAL_HISTORY_FETCH_VERSION
  );
}

function buildSummaryPayload(stockDocument) {
  const identifier = normalizeTickerSymbol(stockDocument?.tickerSymbol);

  return {
    identifier,
    tickerSymbol: identifier,
    name: getCompanyName(stockDocument),
    investmentCategory:
      typeof stockDocument?.investmentCategory === "string"
        ? stockDocument.investmentCategory.trim()
        : "",
  };
}

function buildDashboardBootstrapPayload(stockDocument, priceRows, options = {}) {
  const identifier = normalizeTickerSymbol(stockDocument?.tickerSymbol);
  const rowPreferenceByKey = options.rowPreferenceByKey instanceof Map
    ? options.rowPreferenceByKey
    : new Map();

  return {
    identifier,
    companyName: getCompanyName(stockDocument),
    investmentCategory:
      typeof stockDocument?.investmentCategory === "string"
        ? stockDocument.investmentCategory.trim()
        : "",
    priceCurrency: stockDocument?.priceCurrency || "USD",
    reportingCurrency: stockDocument?.reportingCurrency || null,
    prices: normalizePriceRows(priceRows),
    annualMetrics: normalizeAnnualMetrics(stockDocument),
    annualMainTableRows: normalizeAnnualMainTableRows(stockDocument, rowPreferenceByKey),
    metricsColumns: [],
    metricsRows: [],
    hasLoadedMetricsView: false,
    needsBackgroundRefresh: options.needsBackgroundRefresh === true,
    loadError: typeof options.loadError === "string" ? options.loadError : "",
  };
}

async function listWatchlistSummaries() {
  const stockDocuments = await WatchlistStock.find(
    {},
    {
      tickerSymbol: 1,
      companyName: 1,
      investmentCategory: 1,
    }
  ).lean();

  return stockDocuments.map(buildSummaryPayload);
}

function buildTickerFilter(tickers = []) {
  const normalizedTickers = tickers
    .map((ticker) => normalizeTickerSymbol(ticker))
    .filter(Boolean);

  if (!normalizedTickers.length) {
    return {
      filter: {},
      orderedTickers: [],
    };
  }

  return {
    filter: {
      tickerSymbol: { $in: normalizedTickers },
    },
    orderedTickers: normalizedTickers,
  };
}

async function fetchBootstrapPriceRows(identifier) {
  return roicService.fetchStockPrices(identifier, {
    order: "DESC",
  });
}

async function listWatchlistDashboardBootstraps(options = {}) {
  const { tickers = [] } = options;
  const { filter, orderedTickers } = buildTickerFilter(tickers);

  const stockDocuments = await WatchlistStock.find(
    filter,
    {
      tickerSymbol: 1,
      companyName: 1,
      investmentCategory: 1,
      priceCurrency: 1,
      reportingCurrency: 1,
      sourceMeta: 1,
      annualData: 1,
    }
  );

  const stockDocumentsByTicker = new Map(
    stockDocuments.map((stockDocument) => [normalizeTickerSymbol(stockDocument.tickerSymbol), stockDocument])
  );
  const orderedStockDocuments = orderedTickers.length
    ? orderedTickers
        .map((ticker) => stockDocumentsByTicker.get(ticker))
        .filter(Boolean)
    : stockDocuments;

  const dashboardPayloads = await Promise.all(
    orderedStockDocuments.map(async (stockDocument) => {
      await persistLegacyDerivedCleanup(stockDocument);
      const identifier = normalizeTickerSymbol(stockDocument.tickerSymbol);
      const needsBackgroundRefresh = shouldUpgradeLegacyAnnualHistory(stockDocument);
      const storedPreferences = await StockMetricsRowPreference.find({
        tickerSymbol: identifier,
      }).lean();
      const rowPreferenceByKey = new Map(
        storedPreferences.map((preference) => [preference.rowKey, preference])
      );

      try {
        const priceRows = await fetchBootstrapPriceRows(identifier);

        return buildDashboardBootstrapPayload(stockDocument, priceRows, {
          needsBackgroundRefresh,
          rowPreferenceByKey,
        });
      } catch (_error) {
        return buildDashboardBootstrapPayload(stockDocument, [], {
          needsBackgroundRefresh,
          rowPreferenceByKey,
          loadError: `Unable to load dashboard data for ${identifier}.`,
        });
      }
    })
  );

  return dashboardPayloads;
}

module.exports = {
  buildDashboardBootstrapPayload,
  buildSummaryPayload,
  listWatchlistDashboardBootstraps,
  listWatchlistSummaries,
  normalizeAnnualMainTableRows,
  normalizeAnnualMetrics,
  normalizePriceRows,
  shouldUpgradeLegacyAnnualHistory,
};
