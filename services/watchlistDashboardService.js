const WatchlistStock = require("../models/WatchlistStock");
const roicService = require("./roicService");

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
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYearEndDate ?? null,
  },
  fiscalYear: {
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYear ?? null,
  },
  earningsReleaseDate: {
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.earningsReleaseDate ?? null,
  },
  sharePrice: {
    payloadPath: "base.sharePrice",
    resolveField: (annualRow) => annualRow?.base?.sharePrice ?? null,
  },
  sharesOnIssue: {
    payloadPath: "base.sharesOnIssue",
    resolveField: (annualRow) => annualRow?.base?.sharesOnIssue ?? null,
  },
  marketCap: {
    payloadPath: "base.marketCap",
    resolveField: (annualRow) => annualRow?.base?.marketCap ?? null,
  },
};

function createAnnualMainTableCell(fieldKey, annualRow, fiscalYear) {
  const fieldConfig = MAIN_TABLE_FIELD_CONFIG[fieldKey];
  const rawField = fieldConfig?.resolveField?.(annualRow);
  const value = getEffectiveValue(rawField);
  const hasMetricMetadata = rawField && typeof rawField === "object" && "sourceOfTruth" in rawField;

  // The main table now needs the same per-cell override metadata as the
  // detailed metrics table. Shipping it in the bootstrap payload lets the page
  // decide at first paint which annual cells should open the shared editor.
  return {
    columnKey: Number.isInteger(fiscalYear) ? `annual-${fiscalYear}` : "",
    value,
    sourceOfTruth:
      hasMetricMetadata && typeof rawField.sourceOfTruth === "string" ? rawField.sourceOfTruth : "system",
    isOverridden: hasMetricMetadata && rawField.sourceOfTruth === "user",
    isOverrideable: Boolean(fieldConfig?.payloadPath && Number.isInteger(fiscalYear) && hasMetricMetadata),
    overrideTarget:
      fieldConfig?.payloadPath && Number.isInteger(fiscalYear) && hasMetricMetadata
        ? {
            kind: "annual",
            fiscalYear,
            payloadPath: fieldConfig.payloadPath,
          }
        : null,
  };
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

function normalizeAnnualMainTableRows(stockDocument) {
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
            createAnnualMainTableCell(fieldKey, annualRow, normalizedFiscalYear),
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

  return {
    identifier,
    companyName: getCompanyName(stockDocument),
    investmentCategory:
      typeof stockDocument?.investmentCategory === "string"
        ? stockDocument.investmentCategory.trim()
        : "",
    priceCurrency: stockDocument?.priceCurrency || "USD",
    prices: normalizePriceRows(priceRows),
    annualMetrics: normalizeAnnualMetrics(stockDocument),
    annualMainTableRows: normalizeAnnualMainTableRows(stockDocument),
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
      sourceMeta: 1,
      annualData: 1,
    }
  ).lean();

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
      const identifier = normalizeTickerSymbol(stockDocument.tickerSymbol);
      const needsBackgroundRefresh = shouldUpgradeLegacyAnnualHistory(stockDocument);

      try {
        const priceRows = await fetchBootstrapPriceRows(identifier);

        return buildDashboardBootstrapPayload(stockDocument, priceRows, {
          needsBackgroundRefresh,
        });
      } catch (_error) {
        return buildDashboardBootstrapPayload(stockDocument, [], {
          needsBackgroundRefresh,
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
