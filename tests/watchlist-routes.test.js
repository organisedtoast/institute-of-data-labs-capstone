require("dotenv").config();

process.env.PORT = "3105";

const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const { buildIsolatedMongoUri } = require("./helpers/buildIsolatedMongoUri");

process.env.MONGO_URI = buildIsolatedMongoUri(
  process.env.MONGO_URI,
  "stockgossipmonitor_watchlist_routes_test"
);

const WatchlistStock = require("../models/WatchlistStock");
const StockMetricsRowPreference = require("../models/StockMetricsRowPreference");
const roicService = require("../services/roicService");
const originalFetchStockPrices = roicService.fetchStockPrices;
const { startServer, stopServer } = require("../server");

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

function buildCompanyNameMetric(name) {
  return {
    roicValue: name,
    userValue: null,
    effectiveValue: name,
    sourceOfTruth: "roic",
    lastOverriddenAt: null,
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const rawBody = await response.text();
  let body = rawBody;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = rawBody;
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

async function clearWatchlistCollections() {
  await WatchlistStock.deleteMany({});
  await StockMetricsRowPreference.deleteMany({});
}

test.before(async () => {
  await startServer();
});

test.after(async () => {
  roicService.fetchStockPrices = originalFetchStockPrices;
  await clearWatchlistCollections();

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }

  await stopServer();
});

test.beforeEach(async () => {
  await clearWatchlistCollections();

  roicService.fetchStockPrices = async (tickerSymbol) => {
    if (tickerSymbol === "MSFT") {
      return [
        { date: "2024-01-02", close: 120 },
        { date: "2024-01-03", close: 121.5 },
      ];
    }

    return [
      { date: "2024-01-02", close: 200 },
      { date: "2024-01-03", close: 202.25 },
    ];
  };

  await WatchlistStock.create([
    {
      tickerSymbol: "AAPL",
      investmentCategory: "Profitable Hi Growth",
      priceCurrency: "USD",
      companyName: buildCompanyNameMetric("Apple Inc."),
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
      },
      annualData: [
        {
          fiscalYear: 2024,
          fiscalYearEndDate: "2024-12-31",
          valuationMultiples: {
            evSalesTrailing: {
              roicValue: null,
              userValue: null,
              effectiveValue: 6.1,
              sourceOfTruth: "derived",
              baseSourceOfTruth: "derived",
              lastOverriddenAt: null,
            },
            evEbitTrailing: {
              roicValue: null,
              userValue: null,
              effectiveValue: 18.4,
              sourceOfTruth: "derived",
              baseSourceOfTruth: "derived",
              lastOverriddenAt: null,
            },
            peTrailing: {
              roicValue: 27.1,
              userValue: null,
              effectiveValue: 27.1,
              sourceOfTruth: "roic",
              baseSourceOfTruth: "roic",
              lastOverriddenAt: null,
            },
          },
          epsAndDividends: {
            epsTrailing: {
              roicValue: 6.2,
              userValue: null,
              effectiveValue: 6.2,
              sourceOfTruth: "roic",
              baseSourceOfTruth: "roic",
              lastOverriddenAt: null,
            },
            dyTrailing: {
              roicValue: null,
              userValue: null,
              effectiveValue: 1.3,
              sourceOfTruth: "derived",
              baseSourceOfTruth: "derived",
              lastOverriddenAt: null,
            },
            dpsTrailing: {
              roicValue: 0.95,
              userValue: null,
              effectiveValue: 0.95,
              sourceOfTruth: "roic",
              baseSourceOfTruth: "roic",
              lastOverriddenAt: null,
            },
          },
          forecastData: {
            fy1: {
              marketCap: {
                roicValue: null,
                userValue: null,
                effectiveValue: 3350000000000,
                sourceOfTruth: "derived",
                baseSourceOfTruth: "derived",
                lastOverriddenAt: null,
              },
              evSales: {
                roicValue: null,
                userValue: null,
                effectiveValue: 5.8,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              evEbit: {
                roicValue: null,
                userValue: null,
                effectiveValue: 16.2,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              pe: {
                roicValue: null,
                userValue: null,
                effectiveValue: 24.9,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              eps: {
                roicValue: null,
                userValue: null,
                effectiveValue: 6.8,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              dy: {
                roicValue: null,
                userValue: null,
                effectiveValue: 1.4,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              dps: {
                roicValue: null,
                userValue: null,
                effectiveValue: 1.02,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
            },
            fy2: {
              marketCap: {
                roicValue: null,
                userValue: null,
                effectiveValue: 3500000000000,
                sourceOfTruth: "derived",
                baseSourceOfTruth: "derived",
                lastOverriddenAt: null,
              },
              evSales: {
                roicValue: null,
                userValue: null,
                effectiveValue: 5.5,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              evEbit: {
                roicValue: null,
                userValue: null,
                effectiveValue: 15.1,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              pe: {
                roicValue: null,
                userValue: null,
                effectiveValue: 23.4,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              eps: {
                roicValue: null,
                userValue: null,
                effectiveValue: 7.3,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              dy: {
                roicValue: null,
                userValue: null,
                effectiveValue: 1.5,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              dps: {
                roicValue: null,
                userValue: null,
                effectiveValue: 1.08,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
            },
            fy3: {
              marketCap: {
                roicValue: null,
                userValue: null,
                effectiveValue: 3650000000000,
                sourceOfTruth: "derived",
                baseSourceOfTruth: "derived",
                lastOverriddenAt: null,
              },
              evEbit: {
                roicValue: null,
                userValue: null,
                effectiveValue: 14.4,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              pe: {
                roicValue: null,
                userValue: null,
                effectiveValue: 21.7,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              eps: {
                roicValue: null,
                userValue: null,
                effectiveValue: 7.9,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              dy: {
                roicValue: null,
                userValue: null,
                effectiveValue: 1.6,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
              dps: {
                roicValue: null,
                userValue: null,
                effectiveValue: 1.14,
                sourceOfTruth: "system",
                baseSourceOfTruth: "system",
                lastOverriddenAt: null,
              },
            },
          },
          base: {
            sharePrice: {
              roicValue: 210.4,
              userValue: 215.5,
              effectiveValue: 215.5,
              sourceOfTruth: "user",
              baseSourceOfTruth: "roic",
              lastOverriddenAt: new Date("2025-02-20T00:00:00.000Z"),
            },
            sharesOnIssue: {
              roicValue: 15500000000,
              userValue: null,
              effectiveValue: 15500000000,
              sourceOfTruth: "roic",
              baseSourceOfTruth: "roic",
              lastOverriddenAt: null,
            },
            marketCap: {
              roicValue: null,
              userValue: null,
              effectiveValue: 3200000000000,
              sourceOfTruth: "derived",
              baseSourceOfTruth: "derived",
              lastOverriddenAt: null,
            },
          },
        },
      ],
    },
    {
      tickerSymbol: "MSFT",
      investmentCategory: "Mature Compounder",
      priceCurrency: "USD",
      companyName: buildCompanyNameMetric("Microsoft Corporation"),
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 1,
      },
      annualData: Array.from({ length: 10 }, (_, index) => ({
        fiscalYear: 2025 - index,
        fiscalYearEndDate: `${2025 - index}-12-31`,
        base: {
          sharePrice: {
            roicValue: 100 + index,
            userValue: null,
            effectiveValue: 100 + index,
            sourceOfTruth: "roic",
            baseSourceOfTruth: "roic",
            lastOverriddenAt: null,
          },
          sharesOnIssue: {
            roicValue: 1000000000 + index,
            userValue: null,
            effectiveValue: 1000000000 + index,
            sourceOfTruth: "roic",
            baseSourceOfTruth: "roic",
            lastOverriddenAt: null,
          },
          marketCap: {
            roicValue: null,
            userValue: null,
            effectiveValue: 100000000000 + index,
            sourceOfTruth: "derived",
            baseSourceOfTruth: "derived",
            lastOverriddenAt: null,
          },
        },
      })),
    },
  ]);
});

test("GET /api/watchlist/summary returns the lightweight shared search payload", async () => {
  const response = await requestJson("/api/watchlist/summary");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    {
      identifier: "AAPL",
      tickerSymbol: "AAPL",
      name: "Apple Inc.",
      investmentCategory: "Profitable Hi Growth",
    },
    {
      identifier: "MSFT",
      tickerSymbol: "MSFT",
      name: "Microsoft Corporation",
      investmentCategory: "Mature Compounder",
    },
  ]);
});

test("GET /api/watchlist/dashboards returns batched bootstrap payloads in the requested order", async () => {
  const response = await requestJson("/api/watchlist/dashboards?tickers=MSFT,AAPL");

  assert.equal(response.status, 200);
  assert.equal(response.body.dashboards.length, 2);
  assert.deepEqual(
    response.body.dashboards.map((dashboard) => ({
      identifier: dashboard.identifier,
      companyName: dashboard.companyName,
      hasLoadedMetricsView: dashboard.hasLoadedMetricsView,
      needsBackgroundRefresh: dashboard.needsBackgroundRefresh,
    })),
    [
      {
        identifier: "MSFT",
        companyName: "Microsoft Corporation",
        hasLoadedMetricsView: false,
        needsBackgroundRefresh: true,
      },
      {
        identifier: "AAPL",
        companyName: "Apple Inc.",
        hasLoadedMetricsView: false,
        needsBackgroundRefresh: false,
      },
    ]
  );
  assert.deepEqual(response.body.dashboards[0].prices, [
    { date: "2024-01-02", close: 120 },
    { date: "2024-01-03", close: 121.5 },
  ]);
  assert.equal(response.body.dashboards[0].metricsColumns.length, 0);
  assert.equal(response.body.dashboards[0].metricsRows.length, 0);
  assert.equal(response.body.dashboards[0].annualMetrics.length, 10);
  assert.equal(response.body.dashboards[1].annualMainTableRows.length, 1);
  assert.deepEqual(response.body.dashboards[1].annualMainTableRows[0].cells.sharePrice, {
    columnKey: "annual-2024",
    rowKey: "main::annualData[].base.sharePrice",
    value: 215.5,
    sourceOfTruth: "user",
    isOverridden: true,
    isBold: true,
    isOverrideable: true,
    overrideTarget: {
      kind: "annual",
      fiscalYear: 2024,
      payloadPath: "base.sharePrice",
    },
  });
  assert.deepEqual(response.body.dashboards[1].annualMainTableRows[0].cells.sharesOnIssue, {
    columnKey: "annual-2024",
    rowKey: "main::annualData[].base.sharesOnIssue",
    value: 15500000000,
    sourceOfTruth: "roic",
    isOverridden: false,
    isBold: false,
    isOverrideable: true,
    overrideTarget: {
      kind: "annual",
      fiscalYear: 2024,
      payloadPath: "base.sharesOnIssue",
    },
  });
  assert.deepEqual(response.body.dashboards[1].annualMainTableRows[0].cells.marketCap, {
    columnKey: "annual-2024",
    rowKey: "main::annualData[].base.marketCap",
    value: 3200000000000,
    sourceOfTruth: "derived",
    isOverridden: false,
    isBold: true,
    isOverrideable: false,
    overrideTarget: null,
  });
});

test("PATCH /api/watchlist/:ticker/metrics-row-preferences persists bold without wiping visibility", async () => {
  const firstResponse = await requestJson("/api/watchlist/AAPL/metrics-row-preferences", {
    method: "PATCH",
    body: JSON.stringify({
      rowKey: "710::annualData[].forecastData.fy1.ebit",
      isEnabled: false,
      isBold: true,
    }),
  });

  assert.equal(firstResponse.status, 200);
  const firstUpdatedRow = firstResponse.body.rows.find(
    (row) => row.rowKey === "710::annualData[].forecastData.fy1.ebit"
  );
  assert.ok(firstUpdatedRow);
  assert.equal(firstUpdatedRow.isEnabled, false);
  assert.equal(firstUpdatedRow.isBold, true);
  assert.equal(firstResponse.body.mainTableRowPreferences[0].rowKey, "main::annualData[].fiscalYearEndDate");

  const secondResponse = await requestJson("/api/watchlist/AAPL/metrics-row-preferences", {
    method: "PATCH",
    body: JSON.stringify({
      rowKey: "710::annualData[].forecastData.fy1.ebit",
      isEnabled: true,
    }),
  });

  assert.equal(secondResponse.status, 200);
  const secondUpdatedRow = secondResponse.body.rows.find(
    (row) => row.rowKey === "710::annualData[].forecastData.fy1.ebit"
  );
  assert.ok(secondUpdatedRow);
  assert.equal(secondUpdatedRow.isEnabled, true);
  assert.equal(secondUpdatedRow.isBold, true);

  // The preference record stores both visibility and bolding. Updating one
  // field should not silently erase the other saved row choice.
  const savedPreference = await StockMetricsRowPreference.findOne({
    tickerSymbol: "AAPL",
    rowKey: "710::annualData[].forecastData.fy1.ebit",
  }).lean();

  assert.equal(savedPreference.isEnabled, true);
  assert.equal(savedPreference.isBold, true);
});

test("GET /api/watchlist/:ticker/metrics-view defaults the requested pricing, valuation, and dividend rows to bold but still respects a saved unbold choice", async () => {
  // These seeded rows start bold for every stock card, but an explicit saved
  // false must still win so users can unbold one card and keep that choice.
  await StockMetricsRowPreference.create([
    {
      tickerSymbol: "AAPL",
      rowKey: "main::annualData[].base.marketCap",
      isBold: false,
    },
    {
      tickerSymbol: "AAPL",
      rowKey: "1490::annualData[].epsAndDividends.dpsTrailing",
      isBold: false,
    },
  ]);

  const response = await requestJson("/api/watchlist/AAPL/metrics-view");

  assert.equal(response.status, 200);
  assert.equal(
    response.body.mainTableRowPreferences.find((row) => row.rowKey === "main::annualData[].base.sharePrice")?.isBold,
    true
  );
  assert.equal(
    response.body.mainTableRowPreferences.find((row) => row.rowKey === "main::annualData[].base.marketCap")?.isBold,
    false
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "940::annualData[].valuationMultiples.evEbitTrailing")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "950::annualData[].forecastData.fy1.evEbit")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "960::annualData[].forecastData.fy2.evEbit")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "970::annualData[].forecastData.fy3.evEbit")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "980::annualData[].valuationMultiples.peTrailing")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "990::annualData[].forecastData.fy1.pe")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1000::annualData[].forecastData.fy2.pe")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1010::annualData[].forecastData.fy3.pe")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1410::annualData[].epsAndDividends.epsTrailing")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1420::annualData[].forecastData.fy1.eps")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1430::annualData[].forecastData.fy2.eps")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1440::annualData[].forecastData.fy3.eps")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1450::annualData[].epsAndDividends.dyTrailing")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1460::annualData[].forecastData.fy1.dy")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1470::annualData[].forecastData.fy2.dy")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1480::annualData[].forecastData.fy3.dy")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1490::annualData[].epsAndDividends.dpsTrailing")?.isBold,
    false
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1500::annualData[].forecastData.fy1.dps")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1510::annualData[].forecastData.fy2.dps")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "1520::annualData[].forecastData.fy3.dps")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "670::annualData[].forecastData.fy1.marketCap")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "680::annualData[].forecastData.fy2.marketCap")?.isBold,
    true
  );
  assert.equal(
    response.body.rows.find((row) => row.rowKey === "690::annualData[].forecastData.fy3.marketCap")?.isBold,
    true
  );
});

test("PATCH override routes reject direct edits to derived fields but still recalculate them from editable inputs", async () => {
  const blockedDerivedResponse = await requestJson("/api/watchlist/AAPL/annual/2024/overrides", {
    method: "PATCH",
    body: JSON.stringify({
      base: {
        marketCap: 999999999,
      },
    }),
  });

  assert.equal(blockedDerivedResponse.status, 400);
  assert.match(
    blockedDerivedResponse.body.error,
    /Derived\/internal-calculation field\(s\) cannot be directly overridden/i
  );
  assert.match(blockedDerivedResponse.body.error, /base\.marketCap/);

  const recalculatedResponse = await requestJson("/api/watchlist/AAPL/annual/2024/overrides", {
    method: "PATCH",
    body: JSON.stringify({
      base: {
        sharePrice: 300,
      },
    }),
  });

  assert.equal(recalculatedResponse.status, 200);
  assert.equal(recalculatedResponse.body.annualData[0].base.sharePrice.sourceOfTruth, "user");
  // The user edits the input field, and the backend keeps owning the derived
  // output. This protects the intended "recalculate, do not edit directly"
  // policy for market cap.
  assert.equal(recalculatedResponse.body.annualData[0].base.marketCap.sourceOfTruth, "derived");
  assert.equal(recalculatedResponse.body.annualData[0].base.marketCap.userValue, null);
  assert.equal(recalculatedResponse.body.annualData[0].base.marketCap.effectiveValue, 4650000000000);
});

test("GET stock-card read routes clear legacy derived overrides before shaping payloads", async () => {
  await WatchlistStock.updateOne(
    { tickerSymbol: "AAPL", "annualData.fiscalYear": 2024 },
    {
      $set: {
        "annualData.$.base.marketCap.userValue": 123,
        "annualData.$.base.marketCap.sourceOfTruth": "user",
        "annualData.$.base.marketCap.baseSourceOfTruth": "derived",
        "annualData.$.base.marketCap.lastOverriddenAt": new Date("2025-02-21T00:00:00.000Z"),
      },
    }
  );

  const response = await requestJson("/api/watchlist/dashboards", {
    method: "GET",
  });

  assert.equal(response.status, 200);
  const repairedMarketCapCell = response.body.dashboards[1].annualMainTableRows[0].cells.marketCap;
  assert.equal(repairedMarketCapCell.sourceOfTruth, "derived");
  assert.equal(repairedMarketCapCell.isOverridden, false);
  assert.equal(repairedMarketCapCell.isOverrideable, false);
  assert.equal(repairedMarketCapCell.overrideTarget, null);

  const repairedStock = await WatchlistStock.findOne({ tickerSymbol: "AAPL" }).lean();
  assert.equal(repairedStock.annualData[0].base.marketCap.userValue, null);
  assert.equal(repairedStock.annualData[0].base.marketCap.sourceOfTruth, "derived");
  assert.equal(repairedStock.annualData[0].base.marketCap.lastOverriddenAt, null);
});
