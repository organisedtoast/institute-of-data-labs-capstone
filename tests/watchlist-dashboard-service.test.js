const assert = require("node:assert/strict");
const test = require("node:test");

const WatchlistStock = require("../models/WatchlistStock");
const StockMetricsRowPreference = require("../models/StockMetricsRowPreference");
const roicService = require("../services/roicService");
const {
  listWatchlistDashboardBootstraps,
} = require("../services/watchlistDashboardService");

const originalWatchlistFind = WatchlistStock.find;
const originalPreferenceFind = StockMetricsRowPreference.find;
const originalFetchStockPrices = roicService.fetchStockPrices;

function buildCompanyNameMetric(name) {
  return {
    roicValue: name,
    userValue: null,
    effectiveValue: name,
    sourceOfTruth: "roic",
    baseSourceOfTruth: "roic",
    lastOverriddenAt: null,
  };
}

function buildStockDocument(tickerSymbol, companyName) {
  return {
    tickerSymbol,
    companyName: buildCompanyNameMetric(companyName),
    investmentCategory: "Profitable Hi Growth",
    priceCurrency: "USD",
    reportingCurrency: "USD",
    annualData: [
      {
        fiscalYear: 2024,
        fiscalYearEndDate: "2024-12-31",
        base: {
          sharePrice: {
            roicValue: 100,
            userValue: null,
            effectiveValue: 100,
            sourceOfTruth: "roic",
            baseSourceOfTruth: "roic",
            lastOverriddenAt: null,
          },
          sharesOnIssue: {
            roicValue: 10,
            userValue: null,
            effectiveValue: 10,
            sourceOfTruth: "roic",
            baseSourceOfTruth: "roic",
            lastOverriddenAt: null,
          },
          marketCap: {
            roicValue: null,
            userValue: null,
            effectiveValue: 1000,
            sourceOfTruth: "derived",
            baseSourceOfTruth: "derived",
            lastOverriddenAt: null,
          },
        },
      },
    ],
  };
}

test.afterEach(() => {
  WatchlistStock.find = originalWatchlistFind;
  StockMetricsRowPreference.find = originalPreferenceFind;
  roicService.fetchStockPrices = originalFetchStockPrices;
});

test("listWatchlistDashboardBootstraps batches row-preference reads and keeps per-stock bolding intact", async () => {
  const stockDocuments = [
    buildStockDocument("AAPL", "Apple Inc."),
    buildStockDocument("MSFT", "Microsoft Corporation"),
  ];
  const rowPreferenceFilters = [];

  WatchlistStock.find = async () => stockDocuments;
  StockMetricsRowPreference.find = (filter) => {
    rowPreferenceFilters.push(filter);
    return {
      lean: async () => ([
        {
          tickerSymbol: "AAPL",
          rowKey: "main::priceCurrency",
          isBold: true,
        },
        {
          tickerSymbol: "MSFT",
          rowKey: "main::annualData[].base.sharePrice",
          isBold: false,
        },
      ]),
    };
  };
  roicService.fetchStockPrices = async () => [];

  const payloads = await listWatchlistDashboardBootstraps({
    tickers: ["msft", "aapl"],
  });

  // One batched preference query keeps the first-paint bootstrap path from
  // doing an extra Mongo round-trip for every visible stock card.
  assert.deepEqual(rowPreferenceFilters, [
    {
      tickerSymbol: { $in: ["MSFT", "AAPL"] },
    },
  ]);
  assert.deepEqual(
    payloads.map((payload) => payload.identifier),
    ["MSFT", "AAPL"],
  );
  assert.equal(
    payloads[0].annualMainTableRows[0].cells.sharePrice.isBold,
    false,
  );
  assert.equal(
    payloads[1].annualMainTableRows[0].cells.priceCurrency.isBold,
    true,
  );
});
