const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CURRENT_STOCK_DATA_VERSION,
  isStockDataVersionStale,
  isStockDocumentRefreshRequired,
} = require("../services/stockDataVersionService");

function buildStockDocument(overrides = {}) {
  return {
    sourceMeta: {
      importRangeYears: null,
      importRangeYearsExplicit: false,
      annualHistoryFetchVersion: 3,
      stockDataVersion: CURRENT_STOCK_DATA_VERSION,
    },
    annualData: Array.from({ length: 22 }, (_, index) => ({
      fiscalYear: 2025 - index,
    })),
    ...overrides,
  };
}

test("isStockDataVersionStale treats missing stockDataVersion as stale", () => {
  const stockDocument = buildStockDocument({
    sourceMeta: {
      importRangeYears: null,
      importRangeYearsExplicit: false,
      annualHistoryFetchVersion: 3,
    },
  });

  assert.equal(isStockDataVersionStale(stockDocument), true);
  assert.equal(isStockDocumentRefreshRequired(stockDocument), true);
});

test("isStockDataVersionStale treats older stockDataVersion values as stale", () => {
  const stockDocument = buildStockDocument({
    sourceMeta: {
      importRangeYears: null,
      importRangeYearsExplicit: false,
      annualHistoryFetchVersion: 3,
      stockDataVersion: CURRENT_STOCK_DATA_VERSION - 1,
    },
  });

  assert.equal(isStockDataVersionStale(stockDocument), true);
  assert.equal(isStockDocumentRefreshRequired(stockDocument), true);
});

test("isStockDocumentRefreshRequired keeps upgraded stocks current when no legacy history gap remains", () => {
  const stockDocument = buildStockDocument();

  assert.equal(isStockDataVersionStale(stockDocument), false);
  assert.equal(isStockDocumentRefreshRequired(stockDocument), false);
});

test("isStockDocumentRefreshRequired still refreshes legacy annual-history gaps under the unified helper", () => {
  const stockDocument = buildStockDocument({
    sourceMeta: {
      importRangeYears: null,
      importRangeYearsExplicit: false,
      annualHistoryFetchVersion: 1,
      stockDataVersion: CURRENT_STOCK_DATA_VERSION,
    },
    annualData: Array.from({ length: 10 }, (_, index) => ({
      fiscalYear: 2025 - index,
    })),
  });

  assert.equal(isStockDataVersionStale(stockDocument), false);
  assert.equal(isStockDocumentRefreshRequired(stockDocument), true);
});
