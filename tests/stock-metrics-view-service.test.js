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

function buildAnnualMetricField(value, overrides = {}) {
  return {
    effectiveValue: value,
    sourceOfTruth: "system",
    baseSourceOfTruth: "system",
    userValue: null,
    ...overrides,
  };
}

function buildStockDocument() {
  return {
    tickerSymbol: "AAPL",
    annualData: [
      {
        fiscalYear: 2023,
        fiscalYearEndDate: "2023-12-31",
        base: {
          sharePrice: buildAnnualMetricField(190.5, {
            sourceOfTruth: "roic",
          }),
          marketCap: buildAnnualMetricField(2900000000000, {
            sourceOfTruth: "derived",
          }),
        },
        valuationMultiples: {
          evSalesTrailing: buildAnnualMetricField(6.2, {
            sourceOfTruth: "derived",
          }),
          evEbitTrailing: buildAnnualMetricField(18.2, {
            sourceOfTruth: "derived",
          }),
          peTrailing: buildAnnualMetricField(27.4, {
            sourceOfTruth: "roic",
          }),
        },
        epsAndDividends: {
          epsTrailing: buildAnnualMetricField(6.1, {
            sourceOfTruth: "roic",
          }),
          dyTrailing: buildAnnualMetricField(1.3, {
            sourceOfTruth: "derived",
          }),
          dpsTrailing: buildAnnualMetricField(0.95, {
            sourceOfTruth: "roic",
          }),
        },
        forecastData: {
          fy1: {
            ebit: buildAnnualMetricField(null),
            revenue: buildAnnualMetricField(12),
            operatingMargin: buildAnnualMetricField(0),
            freeCashFlow: buildAnnualMetricField(null),
            netIncome: buildAnnualMetricField(5),
            marketCap: buildAnnualMetricField(3300000000000),
            evSales: buildAnnualMetricField(5.9),
            evEbit: buildAnnualMetricField(16.1),
            pe: buildAnnualMetricField(24.8),
            eps: buildAnnualMetricField(6.8),
            dy: buildAnnualMetricField(1.4),
            dps: buildAnnualMetricField(1.02),
          },
          fy2: {
            marketCap: buildAnnualMetricField(3450000000000),
            evSales: buildAnnualMetricField(5.6),
            evEbit: buildAnnualMetricField(15.2),
            pe: buildAnnualMetricField(23.4),
            eps: buildAnnualMetricField(7.3),
            dy: buildAnnualMetricField(1.5),
            dps: buildAnnualMetricField(1.08),
          },
          fy3: {
            marketCap: buildAnnualMetricField(3600000000000),
            evEbit: buildAnnualMetricField(14.8),
            pe: buildAnnualMetricField(22.1),
            eps: buildAnnualMetricField(7.9),
            dy: buildAnnualMetricField(1.6),
            dps: buildAnnualMetricField(1.14),
          },
        },
      },
      {
        fiscalYear: 2024,
        fiscalYearEndDate: "2024-12-31",
        base: {
          sharePrice: buildAnnualMetricField(210.4, {
            sourceOfTruth: "roic",
          }),
          marketCap: buildAnnualMetricField(3200000000000, {
            sourceOfTruth: "derived",
          }),
        },
        valuationMultiples: {
          evSalesTrailing: buildAnnualMetricField(5.9, {
            sourceOfTruth: "derived",
          }),
          evEbitTrailing: buildAnnualMetricField(17.5, {
            sourceOfTruth: "derived",
          }),
          peTrailing: buildAnnualMetricField(25.2, {
            sourceOfTruth: "roic",
          }),
        },
        epsAndDividends: {
          epsTrailing: buildAnnualMetricField(5.8, {
            sourceOfTruth: "roic",
          }),
          dyTrailing: buildAnnualMetricField(1.2, {
            sourceOfTruth: "derived",
          }),
          dpsTrailing: buildAnnualMetricField(0.88, {
            sourceOfTruth: "roic",
          }),
        },
        forecastData: {
          fy1: {
            ebit: buildAnnualMetricField(null),
            revenue: buildAnnualMetricField(18),
            operatingMargin: buildAnnualMetricField(0),
            freeCashFlow: buildAnnualMetricField(null),
            netIncome: buildAnnualMetricField(7),
            marketCap: buildAnnualMetricField(3000000000000),
            evSales: buildAnnualMetricField(5.7),
            evEbit: buildAnnualMetricField(15.4),
            pe: buildAnnualMetricField(22.9),
            eps: buildAnnualMetricField(6.4),
            dy: buildAnnualMetricField(1.3),
            dps: buildAnnualMetricField(0.99),
          },
          fy2: {
            marketCap: buildAnnualMetricField(3150000000000),
            evSales: buildAnnualMetricField(5.4),
            evEbit: buildAnnualMetricField(14.9),
            pe: buildAnnualMetricField(21.8),
            eps: buildAnnualMetricField(6.9),
            dy: buildAnnualMetricField(1.4),
            dps: buildAnnualMetricField(1.04),
          },
          fy3: {
            marketCap: buildAnnualMetricField(3300000000000),
            evEbit: buildAnnualMetricField(14.1),
            pe: buildAnnualMetricField(20.6),
            eps: buildAnnualMetricField(7.4),
            dy: buildAnnualMetricField(1.5),
            dps: buildAnnualMetricField(1.1),
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
  WatchlistStock.findOne = async () => ({
    ...stockDocument,
    save: async () => stockDocument,
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

test("buildStockMetricsView only marks cells overridden when a user override is still active", async () => {
  const stockDocument = {
    tickerSymbol: "AAPL",
    annualData: [
      {
        fiscalYear: 2024,
        fiscalYearEndDate: "2024-12-31",
        forecastData: {
          fy1: {
            // This row simulates the exact bug we saw in the UI: the document
            // still says `"user"`, but the userValue is gone because the
            // override was cleared. Metrics-view should treat that as not
            // overridden so the frontend can drop the purple styling.
            ebit: buildAnnualMetricField(18, {
              sourceOfTruth: "user",
              baseSourceOfTruth: "system",
              userValue: null,
            }),
            // This row still has an active user override, so the metrics view
            // should continue telling the UI to style it as overridden.
            revenue: buildAnnualMetricField(32, {
              sourceOfTruth: "user",
              baseSourceOfTruth: "system",
              userValue: 40,
            }),
          },
        },
      },
    ],
  };

  WatchlistStock.findOne = async () => ({
    ...stockDocument,
    save: async () => stockDocument,
  });

  lensService.resolveVisibleFieldsForStock = async () => ({
    detailFields: [
      {
        order: 100,
        fieldPath: "annualData[].forecastData.fy1.ebit",
        label: "EBIT FY+1",
        shortLabel: "EBIT FY+1",
        section: "Income Statement",
        shortSection: "Income",
        surface: "detail",
      },
      {
        order: 200,
        fieldPath: "annualData[].forecastData.fy1.revenue",
        label: "Revenue FY+1",
        shortLabel: "Revenue FY+1",
        section: "Income Statement",
        shortSection: "Income",
        surface: "detail",
      },
    ],
  });

  StockMetricsRowPreference.find = () => ({
    lean: async () => ([]),
  });

  const { buildStockMetricsView } = loadServiceUnderTest();
  const metricsView = await buildStockMetricsView("aapl");
  const rowByKey = new Map(metricsView.rows.map((row) => [row.rowKey, row]));

  // A cleared override should not keep the stale "overridden" flag alive.
  assert.equal(rowByKey.get("100::annualData[].forecastData.fy1.ebit").cells[0].isOverridden, false);

  // A row with a real userValue must still report itself as overridden.
  assert.equal(rowByKey.get("200::annualData[].forecastData.fy1.revenue").cells[0].isOverridden, true);
});

test("buildStockMetricsView keeps derived rows read-only and clears legacy derived overrides back to calculated values", async () => {
  const savedStockDocument = buildStockDocument();
  const saveCalls = [];

  savedStockDocument.annualData[0].base.marketCap = buildAnnualMetricField(2900000000000, {
    sourceOfTruth: "user",
    baseSourceOfTruth: "derived",
    userValue: 123,
    lastOverriddenAt: new Date("2025-01-01T00:00:00.000Z"),
  });
  savedStockDocument.annualData[0].forecastData.fy1.marketCap = buildAnnualMetricField(3300000000000, {
    sourceOfTruth: "user",
    baseSourceOfTruth: "derived",
    userValue: 456,
    lastOverriddenAt: new Date("2025-01-01T00:00:00.000Z"),
  });

  WatchlistStock.findOne = async () => ({
    ...savedStockDocument,
    save: async () => {
      saveCalls.push("saved");
      return savedStockDocument;
    },
  });

  lensService.resolveVisibleFieldsForStock = async () => ({
    detailFields: [
      {
        order: 670,
        fieldPath: "annualData[].forecastData.fy1.marketCap",
        label: "Market cap FY+1",
        shortLabel: "Market cap FY+1",
        section: "Shares & Market Cap",
        shortSection: "Shares",
        surface: "detail",
      },
      {
        order: 950,
        fieldPath: "annualData[].forecastData.fy1.evEbit",
        label: "EV/EBIT FY+1",
        shortLabel: "EV/EBIT FY+1",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 980,
        fieldPath: "annualData[].valuationMultiples.peTrailing",
        label: "PE trailing",
        shortLabel: "PE trailing",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
    ],
  });

  StockMetricsRowPreference.find = () => ({
    lean: async () => ([]),
  });

  const { buildStockMetricsView } = loadServiceUnderTest();
  const metricsView = await buildStockMetricsView("aapl");
  const rowByKey = new Map(metricsView.rows.map((row) => [row.rowKey, row]));

  // This regression locks the new policy in at the service layer: derived rows
  // still render their calculated values, but the UI should not receive a
  // direct edit affordance for them anymore.
  assert.equal(rowByKey.get("670::annualData[].forecastData.fy1.marketCap").cells[0].isOverrideable, false);
  assert.equal(rowByKey.get("670::annualData[].forecastData.fy1.marketCap").cells[0].overrideTarget, null);
  assert.equal(rowByKey.get("950::annualData[].forecastData.fy1.evEbit").cells[0].isOverrideable, true);
  assert.equal(rowByKey.get("980::annualData[].valuationMultiples.peTrailing").cells[0].isOverrideable, true);

  // Legacy user-owned derived values should be repaired before the payload is
  // shaped, so old bad data stops winning on later loads.
  assert.equal(savedStockDocument.annualData[0].base.marketCap.userValue, null);
  assert.equal(savedStockDocument.annualData[0].base.marketCap.sourceOfTruth, "derived");
  assert.equal(savedStockDocument.annualData[0].forecastData.fy1.marketCap.userValue, null);
  assert.equal(savedStockDocument.annualData[0].forecastData.fy1.marketCap.sourceOfTruth, "derived");
  assert.equal(saveCalls.length, 1);
});

test("buildStockMetricsView defaults the requested pricing, valuation, and dividend rows to bold but still respects a saved unbold", async () => {
  const stockDocument = buildStockDocument();

  WatchlistStock.findOne = async () => ({
    ...stockDocument,
    save: async () => stockDocument,
  });

  lensService.resolveVisibleFieldsForStock = async () => ({
    detailFields: [
      {
        order: 670,
        fieldPath: "annualData[].forecastData.fy1.marketCap",
        label: "Market cap FY+1",
        shortLabel: "Market cap FY+1",
        section: "Shares & Market Cap",
        shortSection: "Shares & Market Cap",
        surface: "detail",
      },
      {
        order: 680,
        fieldPath: "annualData[].forecastData.fy2.marketCap",
        label: "Market cap FY+2",
        shortLabel: "Market cap FY+2",
        section: "Shares & Market Cap",
        shortSection: "Shares & Market Cap",
        surface: "detail",
      },
      {
        order: 690,
        fieldPath: "annualData[].forecastData.fy3.marketCap",
        label: "Market cap FY+3",
        shortLabel: "Market cap FY+3",
        section: "Shares & Market Cap",
        shortSection: "Shares & Market Cap",
        surface: "detail",
      },
      {
        order: 810,
        fieldPath: "annualData[].valuationMultiples.evSalesTrailing",
        label: "EV/Sales trailing",
        shortLabel: "EV/Sales trailing",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 820,
        fieldPath: "annualData[].forecastData.fy1.evSales",
        label: "EV/Sales FY+1",
        shortLabel: "EV/Sales FY+1",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 830,
        fieldPath: "annualData[].forecastData.fy2.evSales",
        label: "EV/Sales FY+2",
        shortLabel: "EV/Sales FY+2",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 940,
        fieldPath: "annualData[].valuationMultiples.evEbitTrailing",
        label: "EV/EBIT trailing",
        shortLabel: "EV/EBIT trailing",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 950,
        fieldPath: "annualData[].forecastData.fy1.evEbit",
        label: "EV/EBIT FY+1",
        shortLabel: "EV/EBIT FY+1",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 960,
        fieldPath: "annualData[].forecastData.fy2.evEbit",
        label: "EV/EBIT FY+2",
        shortLabel: "EV/EBIT FY+2",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 970,
        fieldPath: "annualData[].forecastData.fy3.evEbit",
        label: "EV/EBIT FY+3",
        shortLabel: "EV/EBIT FY+3",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 980,
        fieldPath: "annualData[].valuationMultiples.peTrailing",
        label: "PE trailing",
        shortLabel: "PE trailing",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 990,
        fieldPath: "annualData[].forecastData.fy1.pe",
        label: "PE FY+1",
        shortLabel: "PE FY+1",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 1000,
        fieldPath: "annualData[].forecastData.fy2.pe",
        label: "PE FY+2",
        shortLabel: "PE FY+2",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 1010,
        fieldPath: "annualData[].forecastData.fy3.pe",
        label: "PE FY+3",
        shortLabel: "PE FY+3",
        section: "Valuation Multiples",
        shortSection: "Value",
        surface: "detail",
      },
      {
        order: 1410,
        fieldPath: "annualData[].epsAndDividends.epsTrailing",
        label: "EPS (trailing)",
        shortLabel: "EPS (trailing)",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1420,
        fieldPath: "annualData[].forecastData.fy1.eps",
        label: "EPS FY+1",
        shortLabel: "EPS FY+1",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1430,
        fieldPath: "annualData[].forecastData.fy2.eps",
        label: "EPS FY+2",
        shortLabel: "EPS FY+2",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1440,
        fieldPath: "annualData[].forecastData.fy3.eps",
        label: "EPS FY+3",
        shortLabel: "EPS FY+3",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1450,
        fieldPath: "annualData[].epsAndDividends.dyTrailing",
        label: "DY trailing",
        shortLabel: "DY trailing",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1460,
        fieldPath: "annualData[].forecastData.fy1.dy",
        label: "DY FY+1",
        shortLabel: "DY FY+1",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1470,
        fieldPath: "annualData[].forecastData.fy2.dy",
        label: "DY FY+2",
        shortLabel: "DY FY+2",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1480,
        fieldPath: "annualData[].forecastData.fy3.dy",
        label: "DY FY+3",
        shortLabel: "DY FY+3",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1490,
        fieldPath: "annualData[].epsAndDividends.dpsTrailing",
        label: "DPS (trailing)",
        shortLabel: "DPS (trailing)",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1500,
        fieldPath: "annualData[].forecastData.fy1.dps",
        label: "DPS FY+1",
        shortLabel: "DPS FY+1",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1510,
        fieldPath: "annualData[].forecastData.fy2.dps",
        label: "DPS FY+2",
        shortLabel: "DPS FY+2",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
      {
        order: 1520,
        fieldPath: "annualData[].forecastData.fy3.dps",
        label: "DPS FY+3",
        shortLabel: "DPS FY+3",
        section: "EPS & Dividends",
        shortSection: "EPS & Dividends",
        surface: "detail",
      },
    ],
  });

  StockMetricsRowPreference.find = () => ({
    lean: async () => ([
      {
        tickerSymbol: "AAPL",
        rowKey: "main::annualData[].base.marketCap",
        isBold: false,
      },
      {
        tickerSymbol: "AAPL",
        rowKey: "980::annualData[].valuationMultiples.peTrailing",
        isBold: false,
      },
      {
        tickerSymbol: "AAPL",
        rowKey: "1490::annualData[].epsAndDividends.dpsTrailing",
        isBold: false,
      },
    ]),
  });

  const { buildStockMetricsView } = loadServiceUnderTest();
  const metricsView = await buildStockMetricsView("aapl");
  const rowByKey = new Map(metricsView.rows.map((row) => [row.rowKey, row]));
  const mainTablePreferenceByKey = new Map(
    metricsView.mainTableRowPreferences.map((rowPreference) => [rowPreference.rowKey, rowPreference])
  );

  // The service is where the default-bold rule really lives. These rows start
  // bold for every stock card before the frontend normalizes anything.
  assert.equal(mainTablePreferenceByKey.get("main::annualData[].base.sharePrice").isBold, true);
  assert.equal(rowByKey.get("670::annualData[].forecastData.fy1.marketCap").isBold, true);
  assert.equal(rowByKey.get("680::annualData[].forecastData.fy2.marketCap").isBold, true);
  assert.equal(rowByKey.get("690::annualData[].forecastData.fy3.marketCap").isBold, true);
  assert.equal(rowByKey.get("810::annualData[].valuationMultiples.evSalesTrailing").isBold, true);
  assert.equal(rowByKey.get("820::annualData[].forecastData.fy1.evSales").isBold, true);
  assert.equal(rowByKey.get("830::annualData[].forecastData.fy2.evSales").isBold, true);
  assert.equal(rowByKey.get("940::annualData[].valuationMultiples.evEbitTrailing").isBold, true);
  assert.equal(rowByKey.get("950::annualData[].forecastData.fy1.evEbit").isBold, true);
  assert.equal(rowByKey.get("960::annualData[].forecastData.fy2.evEbit").isBold, true);
  assert.equal(rowByKey.get("970::annualData[].forecastData.fy3.evEbit").isBold, true);
  assert.equal(rowByKey.get("1000::annualData[].forecastData.fy2.pe").isBold, true);
  assert.equal(rowByKey.get("1010::annualData[].forecastData.fy3.pe").isBold, true);
  assert.equal(rowByKey.get("1410::annualData[].epsAndDividends.epsTrailing").isBold, true);
  assert.equal(rowByKey.get("1420::annualData[].forecastData.fy1.eps").isBold, true);
  assert.equal(rowByKey.get("1430::annualData[].forecastData.fy2.eps").isBold, true);
  assert.equal(rowByKey.get("1440::annualData[].forecastData.fy3.eps").isBold, true);
  assert.equal(rowByKey.get("1450::annualData[].epsAndDividends.dyTrailing").isBold, true);
  assert.equal(rowByKey.get("1460::annualData[].forecastData.fy1.dy").isBold, true);
  assert.equal(rowByKey.get("1470::annualData[].forecastData.fy2.dy").isBold, true);
  assert.equal(rowByKey.get("1480::annualData[].forecastData.fy3.dy").isBold, true);
  assert.equal(rowByKey.get("1500::annualData[].forecastData.fy1.dps").isBold, true);
  assert.equal(rowByKey.get("1510::annualData[].forecastData.fy2.dps").isBold, true);
  assert.equal(rowByKey.get("1520::annualData[].forecastData.fy3.dps").isBold, true);
  assert.equal(rowByKey.get("990::annualData[].forecastData.fy1.pe").isBold, true);

  // A saved false should still win, because users are allowed to unbold any
  // default-highlighted row and keep that choice for one stock card.
  assert.equal(mainTablePreferenceByKey.get("main::annualData[].base.marketCap").isBold, false);
  assert.equal(rowByKey.get("980::annualData[].valuationMultiples.peTrailing").isBold, false);
  assert.equal(rowByKey.get("1490::annualData[].epsAndDividends.dpsTrailing").isBold, false);
});
