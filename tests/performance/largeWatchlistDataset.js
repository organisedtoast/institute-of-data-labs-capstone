const { ensureDefaultLenses } = require("../../services/lensService");
const { CURRENT_STOCK_DATA_VERSION, ANNUAL_HISTORY_FETCH_VERSION } = require("../../services/stockDataVersionService");
const WatchlistStock = require("../../models/WatchlistStock");
const StockMetricsRowPreference = require("../../models/StockMetricsRowPreference");
const InvestmentCategoryConstituentPreference = require("../../models/InvestmentCategoryConstituentPreference");
const StockPriceHistoryCache = require("../../models/StockPriceHistoryCache");
const { CATEGORY_NAMES } = require("../../catalog/fieldCatalog");
const { assignMetricValue } = require("../../utils/metricField");
const {
  createEmptyAnnualEntry,
  createEmptyAnalystRevisions,
  createEmptyForecastBucket,
  createEmptyGrowthForecasts,
} = require("../../utils/documentFactory");
const { DEFAULT_SEED_CHUNK_SIZE } = require("./performanceConfig");

function buildCompanyNameMetric(companyName) {
  return {
    roicValue: companyName,
    userValue: null,
    effectiveValue: companyName,
    sourceOfTruth: "roic",
    baseSourceOfTruth: "roic",
    lastOverriddenAt: null,
  };
}

function buildTicker(index) {
  return `PERF${String(index + 1).padStart(5, "0")}`;
}

function buildCompanyName(index) {
  return `Performance Stock ${String(index + 1).padStart(5, "0")}`;
}

function buildMonthString(year, monthIndex) {
  return `${year}-${String(monthIndex).padStart(2, "0")}`;
}

function buildMonthlyPricePoints(index, monthCount) {
  const points = [];
  const basePrice = 50 + (index % 200);

  for (let monthOffset = 0; monthOffset < monthCount; monthOffset += 1) {
    const totalMonthIndex = monthOffset;
    const year = 2020 + Math.floor(totalMonthIndex / 12);
    const monthIndex = (totalMonthIndex % 12) + 1;
    const month = buildMonthString(year, monthIndex);
    const close = Number((basePrice + monthOffset * 0.8 + (index % 7) * 0.25).toFixed(2));

    points.push({
      month,
      date: `${month}-28`,
      close,
    });
  }

  return points;
}

function buildDailyPriceRows(index, totalRows = 160) {
  const rows = [];
  const basePrice = 40 + (index % 180);
  const startDate = Date.UTC(2023, 0, 1);

  for (let dayOffset = 0; dayOffset < totalRows; dayOffset += 1) {
    const date = new Date(startDate + dayOffset * 24 * 60 * 60 * 1000);
    rows.push({
      date: date.toISOString().slice(0, 10),
      close: Number((basePrice + dayOffset * 0.12 + (index % 5) * 0.15).toFixed(2)),
    });
  }

  return rows;
}

function buildAnnualMetricSeed(index, fiscalYear) {
  const fiscalOffset = 2026 - fiscalYear;
  const sharePrice = 120 + (index % 90) + fiscalOffset * 2;
  const sharesOnIssue = 100000000 + index * 1000 + fiscalOffset * 500;
  const marketCap = sharePrice * sharesOnIssue;
  const revenue = 900 + index * 2 + fiscalOffset * 30;
  const ebit = 180 + (index % 40) + fiscalOffset * 8;
  const eps = Number((4 + (index % 9) * 0.2 + fiscalOffset * 0.12).toFixed(2));
  const dps = Number((1 + (index % 5) * 0.05 + fiscalOffset * 0.03).toFixed(2));
  const dy = Number(((dps / sharePrice) * 100).toFixed(2));
  const pe = Number((sharePrice / Math.max(eps, 0.1)).toFixed(2));

  return {
    dps,
    dy,
    ebit,
    eps,
    marketCap,
    pe,
    revenue,
    sharePrice,
    sharesOnIssue,
  };
}

function setAnnualEntryValues(annualEntry, seedValues) {
  assignMetricValue(annualEntry.base.sharePrice, seedValues.sharePrice, "roic");
  assignMetricValue(annualEntry.base.sharesOnIssue, seedValues.sharesOnIssue, "roic");
  assignMetricValue(annualEntry.base.marketCap, seedValues.marketCap, "derived");
  assignMetricValue(annualEntry.incomeStatement.revenue, seedValues.revenue, "roic");
  assignMetricValue(annualEntry.incomeStatement.ebit, seedValues.ebit, "roic");
  assignMetricValue(annualEntry.valuationMultiples.peTrailing, seedValues.pe, "roic");
  assignMetricValue(annualEntry.valuationMultiples.evEbitTrailing, Number((seedValues.pe * 0.75).toFixed(2)), "derived");
  assignMetricValue(annualEntry.valuationMultiples.evSalesTrailing, Number((seedValues.revenue / 200).toFixed(2)), "derived");
  assignMetricValue(annualEntry.epsAndDividends.epsTrailing, seedValues.eps, "roic");
  assignMetricValue(annualEntry.epsAndDividends.dpsTrailing, seedValues.dps, "roic");
  assignMetricValue(annualEntry.epsAndDividends.dyTrailing, seedValues.dy, "derived");
  assignMetricValue(annualEntry.earningsReleaseDate, `${annualEntry.fiscalYear + 1}-02-28`, "system");

  ["fy1", "fy2", "fy3"].forEach((bucketKey, bucketOffset) => {
    const bucket = annualEntry.forecastData[bucketKey];
    assignMetricValue(bucket.marketCap, Number((seedValues.marketCap * (1 + 0.04 * (bucketOffset + 1))).toFixed(2)), "derived");
    assignMetricValue(bucket.evSales, Number((seedValues.revenue / 210 + bucketOffset * 0.2).toFixed(2)), "system");
    assignMetricValue(bucket.evEbit, Number((seedValues.pe * 0.65 + bucketOffset * 0.25).toFixed(2)), "system");
    assignMetricValue(bucket.pe, Number((seedValues.pe - bucketOffset * 0.4).toFixed(2)), "system");
    assignMetricValue(bucket.eps, Number((seedValues.eps * (1 + 0.05 * (bucketOffset + 1))).toFixed(2)), "system");
    assignMetricValue(bucket.dy, Number((seedValues.dy + bucketOffset * 0.08).toFixed(2)), "system");
    assignMetricValue(bucket.dps, Number((seedValues.dps * (1 + 0.04 * (bucketOffset + 1))).toFixed(2)), "system");
  });
}

function buildAnnualData(index, annualHistorySize, reportingCurrency) {
  return Array.from({ length: annualHistorySize }, (_, annualIndex) => {
    const fiscalYear = 2025 - annualIndex;
    const annualEntry = createEmptyAnnualEntry(fiscalYear, `${fiscalYear}-12-31`);
    annualEntry.reportingCurrency = reportingCurrency;
    annualEntry.forecastData = {
      fy1: createEmptyForecastBucket(),
      fy2: createEmptyForecastBucket(),
      fy3: createEmptyForecastBucket(),
    };
    annualEntry.growthForecasts = createEmptyGrowthForecasts();
    annualEntry.analystRevisions = createEmptyAnalystRevisions();

    setAnnualEntryValues(annualEntry, buildAnnualMetricSeed(index, fiscalYear));
    return annualEntry;
  });
}

function buildWatchlistStockDocument(index, options) {
  const tickerSymbol = buildTicker(index);
  const companyName = buildCompanyName(index);
  const investmentCategory = CATEGORY_NAMES[index % CATEGORY_NAMES.length];
  const priceCurrency = index % 3 === 0 ? "USD" : "AUD";
  const reportingCurrency = index % 4 === 0 ? "GBP" : "USD";
  const annualData = buildAnnualData(index, options.annualHistorySize, reportingCurrency);
  const isLegacyStock = index < Math.floor(options.stockCount * options.legacyPercentage);

  return {
    tickerSymbol,
    companyName: buildCompanyNameMetric(companyName),
    investmentCategory,
    priceCurrency,
    reportingCurrency,
    sourceMeta: {
      lastImportedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastRefreshAt: new Date("2026-02-01T00:00:00.000Z"),
      importRangeYears: options.annualHistorySize,
      importRangeYearsExplicit: true,
      annualHistoryFetchVersion: isLegacyStock ? Math.max(1, ANNUAL_HISTORY_FETCH_VERSION - 1) : ANNUAL_HISTORY_FETCH_VERSION,
      stockDataVersion: isLegacyStock ? Math.max(0, CURRENT_STOCK_DATA_VERSION - 1) : CURRENT_STOCK_DATA_VERSION,
      roicEndpointsUsed: ["/v2/stock-prices/{identifier}"],
      currencyDiagnostics: {
        reportingCurrencySource: "incomeStatement",
        balanceSheetMismatches: [],
      },
    },
    annualData,
    forecastData: {
      fy1: createEmptyForecastBucket(),
      fy2: createEmptyForecastBucket(),
      fy3: createEmptyForecastBucket(),
    },
    growthForecasts: createEmptyGrowthForecasts(),
    analystRevisions: createEmptyAnalystRevisions(),
  };
}

function buildPreferenceDocumentsForChunk(stockDocuments, startIndex = 0) {
  return stockDocuments.flatMap((stockDocument, index) => [
    {
      tickerSymbol: stockDocument.tickerSymbol,
      rowKey: "main::annualData[].base.marketCap",
      isEnabled: true,
      isBold: (startIndex + index) % 3 === 0,
    },
    {
      tickerSymbol: stockDocument.tickerSymbol,
      rowKey: "1490::annualData[].epsAndDividends.dpsTrailing",
      isEnabled: (startIndex + index) % 11 !== 0,
      isBold: (startIndex + index) % 5 === 0,
    },
  ]);
}

function buildConstituentPreferenceDocumentsForChunk(stockDocuments, startIndex = 0) {
  return stockDocuments
    .filter((_, index) => (startIndex + index) % 17 === 0)
    .map((stockDocument) => ({
      investmentCategory: stockDocument.investmentCategory,
      tickerSymbol: stockDocument.tickerSymbol,
      isEnabled: false,
    }));
}

function buildPriceCacheDocumentsForChunk(stockDocuments, priceHistoryMonths, startIndex = 0) {
  return stockDocuments.map((stockDocument, index) => {
    const pricePoints = buildMonthlyPricePoints(startIndex + index, priceHistoryMonths);

    return {
      tickerSymbol: stockDocument.tickerSymbol,
      pricePoints,
      earliestMonth: pricePoints[0]?.month || "",
      latestMonth: pricePoints.at(-1)?.month || "",
      lastSyncedAt: new Date("2026-03-01T00:00:00.000Z"),
    };
  });
}

function buildStockDocumentsForChunk(startIndex, endIndex, options) {
  return Array.from(
    { length: endIndex - startIndex },
    (_, index) => buildWatchlistStockDocument(startIndex + index, options),
  );
}

async function clearPerformanceCollections() {
  await Promise.all([
    WatchlistStock.deleteMany({}),
    StockMetricsRowPreference.deleteMany({}),
    InvestmentCategoryConstituentPreference.deleteMany({}),
    StockPriceHistoryCache.deleteMany({}),
  ]);
}

function installPerformanceRoicStubs(roicService) {
  if (roicService.__performanceStubRestore) {
    return roicService.__performanceStubRestore;
  }

  const originalMethods = {};
  const methodNames = [
    "fetchCompanyProfile",
    "fetchAnnualPerShare",
    "fetchAnnualProfitability",
    "fetchAnnualBalanceSheet",
    "fetchAnnualIncomeStatement",
    "fetchAnnualCashFlow",
    "fetchAnnualCreditRatios",
    "fetchAnnualEnterpriseValue",
    "fetchAnnualMultiples",
    "fetchStockPrices",
    "fetchEarningsCalls",
    "searchRoicByCompanyName",
  ];

  methodNames.forEach((methodName) => {
    originalMethods[methodName] = roicService[methodName];
  });

  function getTickerIndex(identifier) {
    const match = String(identifier || "").match(/(\d+)$/);
    return match ? Number(match[1]) - 1 : 0;
  }

  Object.assign(roicService, {
    async fetchCompanyProfile(identifier) {
      const index = getTickerIndex(identifier);
      return {
        companyName: buildCompanyName(index),
        currency: index % 3 === 0 ? "USD" : "AUD",
      };
    },
    async fetchAnnualPerShare(identifier, options = {}) {
      const index = getTickerIndex(identifier);
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => {
        const fiscalYear = 2025 - annualIndex;
        const seedValues = buildAnnualMetricSeed(index, fiscalYear);
        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          bs_sh_out: seedValues.sharesOnIssue,
          eps: seedValues.eps,
          div_per_shr: seedValues.dps,
          book_val_per_sh: Number((20 + index % 15 + annualIndex * 0.5).toFixed(2)),
        };
      });
    },
    async fetchAnnualProfitability(identifier, options = {}) {
      const index = getTickerIndex(identifier);
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => ({
        fiscalYear: 2025 - annualIndex,
        return_on_inv_capital: Number((0.12 + (index % 5) * 0.01 + annualIndex * 0.005).toFixed(4)),
      }));
    },
    async fetchAnnualBalanceSheet(identifier, options = {}) {
      const index = getTickerIndex(identifier);
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => ({
        fiscalYear: 2025 - annualIndex,
        currency: index % 4 === 0 ? "GBP" : "USD",
        bs_c_and_ce_and_sti_detailed: 150 + index + annualIndex * 8,
        short_and_long_term_debt: 220 + index + annualIndex * 12,
        bs_tot_asset: 900 + index * 3 + annualIndex * 40,
        bs_tot_liab: 400 + index * 2 + annualIndex * 25,
        bs_total_equity: 500 + index + annualIndex * 15,
      }));
    },
    async fetchAnnualIncomeStatement(identifier, options = {}) {
      const index = getTickerIndex(identifier);
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => {
        const fiscalYear = 2025 - annualIndex;
        const seedValues = buildAnnualMetricSeed(index, fiscalYear);
        return {
          fiscalYear,
          currency: index % 4 === 0 ? "GBP" : "USD",
          is_sales_revenue_turnover: seedValues.revenue,
          is_gross_profit: Number((seedValues.revenue * 0.35).toFixed(2)),
          ebitda: Number((seedValues.ebit * 1.18).toFixed(2)),
          depreciation_and_amortization: Number((seedValues.ebit * 0.11).toFixed(2)),
          is_oper_income: seedValues.ebit,
          net_interest_expense: Number((18 + annualIndex * 1.5).toFixed(2)),
          pretax_income: Number((seedValues.ebit * 0.9).toFixed(2)),
          income_tax_expense: Number((seedValues.ebit * 0.2).toFixed(2)),
          is_net_income: Number((seedValues.ebit * 0.7).toFixed(2)),
        };
      });
    },
    async fetchAnnualCashFlow(identifier, options = {}) {
      const index = getTickerIndex(identifier);
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => ({
        fiscalYear: 2025 - annualIndex,
        cf_cap_expenditures: Number((60 + index % 10 + annualIndex * 4).toFixed(2)),
        free_cash_flow: Number((140 + index % 12 + annualIndex * 10).toFixed(2)),
      }));
    },
    async fetchAnnualCreditRatios(identifier, options = {}) {
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => ({
        fiscalYear: 2025 - annualIndex,
        debt_to_equity: 0.4,
      }));
    },
    async fetchAnnualEnterpriseValue(identifier, options = {}) {
      const index = getTickerIndex(identifier);
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => ({
        fiscalYear: 2025 - annualIndex,
        enterprise_value: 500000000 + index * 10000 + annualIndex * 20000,
      }));
    },
    async fetchAnnualMultiples(identifier, options = {}) {
      const index = getTickerIndex(identifier);
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => {
        const fiscalYear = 2025 - annualIndex;
        const seedValues = buildAnnualMetricSeed(index, fiscalYear);
        return {
          fiscalYear,
          pe_ratio: seedValues.pe,
        };
      });
    },
    async fetchStockPrices(identifier) {
      return buildDailyPriceRows(getTickerIndex(identifier));
    },
    async fetchEarningsCalls(identifier, options = {}) {
      const annualHistorySize = Number.isInteger(options.years) ? options.years : 5;
      return Array.from({ length: annualHistorySize }, (_, annualIndex) => ({
        date: `${2026 - annualIndex}-02-28`,
        fiscalYear: 2025 - annualIndex,
      }));
    },
    async searchRoicByCompanyName(query) {
      return [
        {
          symbol: "PERF00001",
          companyName: String(query || "Performance Search Result"),
        },
      ];
    },
  });

  const restore = () => {
    Object.assign(roicService, originalMethods);
    delete roicService.__performanceStubRestore;
  };

  roicService.__performanceStubRestore = restore;
  return restore;
}

async function seedLargeWatchlistDataset(rawOptions = {}) {
  const options = {
    annualHistorySize: rawOptions.annualHistorySize ?? 5,
    chunkSize: rawOptions.chunkSize ?? DEFAULT_SEED_CHUNK_SIZE,
    clearFirst: rawOptions.clearFirst !== false,
    legacyPercentage: rawOptions.legacyPercentage ?? 0.05,
    priceHistoryMonths: rawOptions.priceHistoryMonths ?? 60,
    stockCount: rawOptions.stockCount ?? 100,
  };

  if (options.clearFirst) {
    await clearPerformanceCollections();
  }

  await ensureDefaultLenses();

  const chunkSize = Math.max(1, Number(options.chunkSize) || DEFAULT_SEED_CHUNK_SIZE);
  const chunkCount = Math.ceil(options.stockCount / chunkSize);

  // Building one giant array of every stock and every helper document at once
  // can consume gigabytes of heap before MongoDB receives the first insert.
  // Chunking keeps only a small slice of the synthetic dataset in memory.
  for (let startIndex = 0; startIndex < options.stockCount; startIndex += chunkSize) {
    const endIndex = Math.min(startIndex + chunkSize, options.stockCount);
    // The data still stays deterministic because each document is based on its
    // global stock index, not on whichever chunk happened to build it.
    const stockDocuments = buildStockDocumentsForChunk(startIndex, endIndex, options);
    const rowPreferenceDocuments = buildPreferenceDocumentsForChunk(stockDocuments, startIndex);
    const constituentPreferenceDocuments = buildConstituentPreferenceDocumentsForChunk(stockDocuments, startIndex);
    const priceCacheDocuments = buildPriceCacheDocumentsForChunk(
      stockDocuments,
      options.priceHistoryMonths,
      startIndex,
    );

    // Each chunk is inserted before the next one is built, which bounds setup
    // memory and lets the benchmark spend its time on the real app routes.
    await WatchlistStock.insertMany(stockDocuments, { ordered: false });
    await StockMetricsRowPreference.insertMany(rowPreferenceDocuments, { ordered: false });

    if (constituentPreferenceDocuments.length) {
      await InvestmentCategoryConstituentPreference.insertMany(constituentPreferenceDocuments, { ordered: false });
    }

    await StockPriceHistoryCache.insertMany(priceCacheDocuments, { ordered: false });
  }

  return {
    annualHistorySize: options.annualHistorySize,
    categoryCount: CATEGORY_NAMES.length,
    chunkCount,
    chunkSize,
    firstTicker: options.stockCount > 0 ? buildTicker(0) : null,
    legacyStockCount: Math.floor(options.stockCount * options.legacyPercentage),
    priceHistoryMonths: options.priceHistoryMonths,
    stockCount: options.stockCount,
  };
}

module.exports = {
  clearPerformanceCollections,
  installPerformanceRoicStubs,
  seedLargeWatchlistDataset,
};
