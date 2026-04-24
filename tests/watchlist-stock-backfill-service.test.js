const test = require("node:test");
const assert = require("node:assert/strict");

const WatchlistStock = require("../models/WatchlistStock");
const refreshService = require("../services/watchlistStockRefreshService");

const originalFind = WatchlistStock.find;
const originalBuildFreshStockData = refreshService.buildFreshStockData;
const originalApplyFreshStockDataToExistingStock = refreshService.applyFreshStockDataToExistingStock;

function buildStockDocument({
  tickerSymbol,
  stockDataVersion = 1,
  annualHistoryFetchVersion = 3,
  annualRowCount = 22,
  importRangeYears = null,
  importRangeYearsExplicit = false,
}) {
  return {
    tickerSymbol,
    investmentCategory: "Profitable Hi Growth",
    sourceMeta: {
      importRangeYears,
      importRangeYearsExplicit,
      annualHistoryFetchVersion,
      stockDataVersion,
    },
    annualData: Array.from({ length: annualRowCount }, (_, index) => ({
      fiscalYear: 2025 - index,
    })),
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
      return this;
    },
  };
}

function loadServiceUnderTest() {
  const servicePath = require.resolve("../services/watchlistStockBackfillService");
  delete require.cache[servicePath];
  return require("../services/watchlistStockBackfillService");
}

test.afterEach(() => {
  WatchlistStock.find = originalFind;
  refreshService.buildFreshStockData = originalBuildFreshStockData;
  refreshService.applyFreshStockDataToExistingStock = originalApplyFreshStockDataToExistingStock;
});

test("backfillStaleWatchlistStocks refreshes only stale watchlist rows and skips already-current rows", async () => {
  const staleByVersion = buildStockDocument({
    tickerSymbol: "AAPL",
    stockDataVersion: null,
  });
  const staleByLegacyHistory = buildStockDocument({
    tickerSymbol: "MSFT",
    stockDataVersion: 1,
    annualHistoryFetchVersion: 1,
    annualRowCount: 10,
  });
  const currentStock = buildStockDocument({
    tickerSymbol: "NVDA",
    stockDataVersion: 1,
    annualHistoryFetchVersion: 3,
    annualRowCount: 22,
  });
  const refreshedTickers = [];

  WatchlistStock.find = async () => ([staleByVersion, staleByLegacyHistory, currentStock]);
  refreshService.buildFreshStockData = async ({ tickerSymbol }) => ({ tickerSymbol });
  refreshService.applyFreshStockDataToExistingStock = (stockDocument, freshData) => {
    refreshedTickers.push(freshData.tickerSymbol);
    stockDocument.sourceMeta.stockDataVersion = 1;
    stockDocument.sourceMeta.annualHistoryFetchVersion = 3;
  };

  const { backfillStaleWatchlistStocks } = loadServiceUnderTest();
  const result = await backfillStaleWatchlistStocks({
    logger: {
      info() {},
      error() {},
    },
  });

  assert.deepEqual(refreshedTickers, ["AAPL", "MSFT"]);
  assert.equal(staleByVersion.saveCalls, 1);
  assert.equal(staleByLegacyHistory.saveCalls, 1);
  assert.equal(currentStock.saveCalls, 0);
  assert.equal(result.totalStocks, 3);
  assert.equal(result.staleStocks, 2);
  assert.equal(result.refreshedCount, 2);
  assert.deepEqual(result.failures, []);
});

test("backfillStaleWatchlistStocks reports failed refreshes without hiding successful ones", async () => {
  const staleSuccess = buildStockDocument({
    tickerSymbol: "AAPL",
    stockDataVersion: null,
  });
  const staleFailure = buildStockDocument({
    tickerSymbol: "MSFT",
    stockDataVersion: null,
  });
  const loggedErrors = [];

  WatchlistStock.find = async () => ([staleSuccess, staleFailure]);
  refreshService.buildFreshStockData = async ({ tickerSymbol }) => {
    if (tickerSymbol === "MSFT") {
      throw new Error("ROIC timeout");
    }

    return { tickerSymbol };
  };
  refreshService.applyFreshStockDataToExistingStock = () => {};

  const { backfillStaleWatchlistStocks } = loadServiceUnderTest();
  const result = await backfillStaleWatchlistStocks({
    logger: {
      info() {},
      error(message) {
        loggedErrors.push(message);
      },
    },
  });

  assert.equal(staleSuccess.saveCalls, 1);
  assert.equal(staleFailure.saveCalls, 0);
  assert.equal(result.refreshedCount, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].tickerSymbol, "MSFT");
  assert.match(result.failures[0].message, /ROIC timeout/);
  assert.equal(loggedErrors.length, 1);
});
