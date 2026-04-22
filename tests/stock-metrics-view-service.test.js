// Purpose of this test file:
// Metrics mode now hides rows by default when every annual cell is empty.
// This backend regression test protects that rule where it actually lives:
// the metrics-view service that combines lens rows, annual data, and any
// stored row-visibility preferences from MongoDB.

const assert = require("node:assert/strict");
const test = require("node:test");

const WatchlistStock = require("../models/WatchlistStock");
const StockMetricsRowPreference = require("../models/StockMetricsRowPreference");
const lensService = require("../services/lensService");

const originalFindOne = WatchlistStock.findOne;
const originalFind = StockMetricsRowPreference.find;
const originalResolveVisibleFieldsForStock = lensService.resolveVisibleFieldsForStock;

function buildAnnualMetricField(value) {
  return {
    effectiveValue: value,
    sourceOfTruth: "system",
    userValue: null,
  };
}

function buildStockDocument() {
  return {
    tickerSymbol: "AAPL",
    annualData: [
      {
        fiscalYear: 2023,
        fiscalYearEndDate: "2023-12-31",
        forecastData: {
          fy1: {
            ebit: buildAnnualMetricField(null),
            revenue: buildAnnualMetricField(12),
            operatingMargin: buildAnnualMetricField(0),
            freeCashFlow: buildAnnualMetricField(null),
            netIncome: buildAnnualMetricField(5),
          },
        },
      },
      {
        fiscalYear: 2024,
        fiscalYearEndDate: "2024-12-31",
        forecastData: {
          fy1: {
            ebit: buildAnnualMetricField(null),
            revenue: buildAnnualMetricField(18),
            operatingMargin: buildAnnualMetricField(0),
            freeCashFlow: buildAnnualMetricField(null),
            netIncome: buildAnnualMetricField(7),
          },
        },
      },
    ],
  };
}

function buildDetailFields() {
  return [
    {
      order: 100,
      fieldPath: "annualData[].forecastData.fy1.ebit",
      label: "EBIT FY+1",
      shortLabel: "EBIT FY+1",
      section: "EBIT Forecast",
      shortSection: "EBIT",
      surface: "detail",
    },
    {
      order: 200,
      fieldPath: "annualData[].forecastData.fy1.revenue",
      label: "Revenue FY+1",
      shortLabel: "Revenue FY+1",
      section: "Revenue Forecast",
      shortSection: "Revenue",
      surface: "detail",
    },
    {
      order: 300,
      fieldPath: "annualData[].forecastData.fy1.operatingMargin",
      label: "Operating Margin FY+1",
      shortLabel: "Op Margin FY+1",
      section: "Margin Forecast",
      shortSection: "Margin",
      surface: "detail",
    },
    {
      order: 400,
      fieldPath: "annualData[].forecastData.fy1.freeCashFlow",
      label: "Free Cash Flow FY+1",
      shortLabel: "FCF FY+1",
      section: "Cash Flow Forecast",
      shortSection: "Cash Flow",
      surface: "detail",
    },
    {
      order: 500,
      fieldPath: "annualData[].forecastData.fy1.netIncome",
      label: "Net Income FY+1",
      shortLabel: "Net Income FY+1",
      section: "Earnings Forecast",
      shortSection: "Earnings",
      surface: "detail",
    },
  ];
}

function loadServiceUnderTest() {
  const servicePath = require.resolve("../services/stockMetricsViewService");
  delete require.cache[servicePath];
  return require("../services/stockMetricsViewService");
}

test.afterEach(() => {
  WatchlistStock.findOne = originalFindOne;
  StockMetricsRowPreference.find = originalFind;
  lensService.resolveVisibleFieldsForStock = originalResolveVisibleFieldsForStock;
});

test("buildStockMetricsView hides fully empty rows by default but keeps preference overrides intact", async () => {
  const stockDocument = buildStockDocument();

  // Stub the watchlist lookup with a deterministic in-memory document so this
  // test focuses only on the service logic, not on MongoDB connectivity.
  WatchlistStock.findOne = () => ({
    lean: async () => stockDocument,
  });

  // The lens decides which detail rows are eligible for metrics mode.
  // We include a mix of empty, non-empty, zero-valued, and preference-driven rows
  // so one service call can prove all important visibility branches.
  lensService.resolveVisibleFieldsForStock = async () => ({
    detailFields: buildDetailFields(),
  });

  // Row preferences should override the new default empty-row behavior.
  StockMetricsRowPreference.find = () => ({
    lean: async () => ([
      {
        tickerSymbol: "AAPL",
        rowKey: "400::annualData[].forecastData.fy1.freeCashFlow",
        isEnabled: true,
      },
      {
        tickerSymbol: "AAPL",
        rowKey: "500::annualData[].forecastData.fy1.netIncome",
        isEnabled: false,
      },
    ]),
  });

  const { buildStockMetricsView } = loadServiceUnderTest();
  const metricsView = await buildStockMetricsView("aapl");
  const rowByKey = new Map(metricsView.rows.map((row) => [row.rowKey, row]));

  // No preference + all null cells = hidden by default.
  assert.equal(rowByKey.get("100::annualData[].forecastData.fy1.ebit").isEnabled, false);

  // At least one real value keeps the row visible by default.
  assert.equal(rowByKey.get("200::annualData[].forecastData.fy1.revenue").isEnabled, true);

  // Zero is real data, so valid zero rows must stay visible.
  assert.equal(rowByKey.get("300::annualData[].forecastData.fy1.operatingMargin").isEnabled, true);

  // A saved "show row" preference must win even if every cell is still empty.
  assert.equal(rowByKey.get("400::annualData[].forecastData.fy1.freeCashFlow").isEnabled, true);

  // A saved "hide row" preference must still win for a row that has data.
  assert.equal(rowByKey.get("500::annualData[].forecastData.fy1.netIncome").isEnabled, false);
});
