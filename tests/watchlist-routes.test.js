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
    value: 215.5,
    sourceOfTruth: "user",
    isOverridden: true,
    isOverrideable: true,
    overrideTarget: {
      kind: "annual",
      fiscalYear: 2024,
      payloadPath: "base.sharePrice",
    },
  });
  assert.deepEqual(response.body.dashboards[1].annualMainTableRows[0].cells.sharesOnIssue, {
    columnKey: "annual-2024",
    value: 15500000000,
    sourceOfTruth: "roic",
    isOverridden: false,
    isOverrideable: true,
    overrideTarget: {
      kind: "annual",
      fiscalYear: 2024,
      payloadPath: "base.sharesOnIssue",
    },
  });
});
