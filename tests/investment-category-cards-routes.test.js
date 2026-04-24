// Purpose of this test file:
// This file checks the real HTTP routes behind the homepage investment-category
// cards feature. It verifies that the backend can build category-card payloads,
// classify constituents as active/unavailable/user-disabled, persist user
// toggle preferences, and reject invalid requests before the frontend ever sees
// the data.

require("dotenv").config();

// Give this test file its own port so it can run the real Express server
// without conflicting with other tests or a local dev server.
process.env.PORT = "3104";

const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const { buildIsolatedMongoUri } = require("./helpers/buildIsolatedMongoUri");

process.env.MONGO_URI = buildIsolatedMongoUri(
  process.env.MONGO_URI,
  "stockgossipmonitor_investment_category_cards_routes_test"
);

const WatchlistStock = require("../models/WatchlistStock");
const InvestmentCategoryConstituentPreference = require("../models/InvestmentCategoryConstituentPreference");
const StockPriceHistoryCache = require("../models/StockPriceHistoryCache");
const roicService = require("../services/roicService");

// We only stub one ROIC function in this file, so we keep a copy of the real
// implementation and restore it after the test suite finishes.
const originalFetchStockPrices = roicService.fetchStockPrices;
const { startServer, stopServer } = require("../server");

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

// Watchlist documents store `companyName` as a metric-field object instead of a
// plain string. This helper builds the smallest valid shape for test data.
function buildCompanyNameMetric(name) {
  return {
    roicValue: name,
    userValue: null,
    effectiveValue: name,
    sourceOfTruth: "roic",
    lastOverriddenAt: null,
  };
}

// Small helper for making real HTTP requests to the running test server.
// Returning `{ status, ok, body }` keeps the assertions compact and readable.
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

// These route tests write to real MongoDB collections, so we clear the test
// records before and after runs to keep the suite repeatable.
async function clearHomepageCollections() {
  await Promise.all([
    WatchlistStock.deleteMany({ tickerSymbol: { $in: ["ALPHA", "BETA", "GAMMA"] } }),
    InvestmentCategoryConstituentPreference.deleteMany({ investmentCategory: "Profitable Hi Growth" }),
    StockPriceHistoryCache.deleteMany({ tickerSymbol: { $in: ["ALPHA", "BETA", "GAMMA"] } }),
  ]);
}

test.before(async () => {
  // Start the real Express app once for the whole file.
  await startServer();
});

test.after(async () => {
  // Always restore the real ROIC method so other tests are not affected.
  roicService.fetchStockPrices = originalFetchStockPrices;
  await clearHomepageCollections();

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }

  await stopServer();
});

test.beforeEach(async () => {
  // Reset database state before every test so each case starts clean.
  await clearHomepageCollections();

  // Stub only the upstream price lookup. Everything else in the route stack is
  // real: HTTP routing, controllers, services, and MongoDB models.
  roicService.fetchStockPrices = async (tickerSymbol) => {
    if (tickerSymbol === "ALPHA") {
      return [
        { date: "2024-01-02", close: 9 },
        { date: "2024-01-31", close: 10 },
        { date: "2024-02-29", close: 15 },
        { date: "2024-03-28", close: 20 },
      ];
    }

    if (tickerSymbol === "BETA") {
      return [
        { date: "2024-02-01", close: 19 },
        { date: "2024-02-29", close: 20 },
        { date: "2024-03-28", close: 25 },
      ];
    }

    if (tickerSymbol === "GAMMA") {
      return [
        { date: "2024-01-31", close: 30 },
        { date: "2024-02-29", close: 33 },
      ];
    }

    return [];
  };

  // Seed watchlist stocks across two categories.
  // Only ALPHA and BETA belong to "Profitable Hi Growth", so GAMMA helps prove
  // the route filters constituents by category correctly.
  await WatchlistStock.create([
    {
      tickerSymbol: "ALPHA",
      investmentCategory: "Profitable Hi Growth",
      companyName: buildCompanyNameMetric("Alpha Corp"),
    },
    {
      tickerSymbol: "BETA",
      investmentCategory: "Profitable Hi Growth",
      companyName: buildCompanyNameMetric("Beta Corp"),
    },
    {
      tickerSymbol: "GAMMA",
      investmentCategory: "Mature Compounder",
      companyName: buildCompanyNameMetric("Gamma Corp"),
    },
  ]);
});

test("POST /api/homepage/investment-category-cards/query returns category cards and aggregates active constituents", async () => {
  // Hit the real route that builds homepage category cards for the requested
  // visible month range.
  const response = await requestJson("/api/homepage/investment-category-cards/query", {
    method: "POST",
    body: JSON.stringify({
      cards: [
        {
          investmentCategory: "Profitable Hi Growth",
          startMonth: "2024-01",
          endMonth: "2024-03",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.cards.length, 1);
  assert.equal(response.body.cards[0].investmentCategory, "Profitable Hi Growth");

  // In this window:
  // - ALPHA is active because it has prices starting in the first visible month
  // - BETA is unavailable because it is missing January, so it cannot be fairly indexed
  // - no constituent has been manually disabled yet
  assert.deepEqual(response.body.cards[0].counts, {
    active: 1,
    userDisabled: 0,
    unavailable: 1,
  });

  // Because ALPHA is the only active constituent, the aggregate series should
  // exactly match ALPHA's indexed performance: 100 -> 150 -> 200.
  assert.deepEqual(response.body.cards[0].series, [
    { date: "2024-01-01", close: 100 },
    { date: "2024-02-01", close: 150 },
    { date: "2024-03-01", close: 200 },
  ]);

  // The route also returns per-constituent UI metadata so the frontend knows
  // which rows are active, unavailable, enabled, and toggleable.
  assert.deepEqual(response.body.cards[0].constituents, [
    {
      tickerSymbol: "ALPHA",
      companyName: "Alpha Corp",
      status: "active",
      isEnabled: true,
      isToggleable: true,
    },
    {
      tickerSymbol: "BETA",
      companyName: "Beta Corp",
      status: "unavailable",
      isEnabled: true,
      isToggleable: true,
    },
  ]);
});

test("POST /api/homepage/investment-category-cards/query defaults homepage cards to the latest trailing 5Y range", async () => {
  const response = await requestJson("/api/homepage/investment-category-cards/query", {
    method: "POST",
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const profitableHiGrowthCard = response.body.cards.find(
    (card) => card.investmentCategory === "Profitable Hi Growth"
  );

  assert.ok(profitableHiGrowthCard);
  assert.equal(profitableHiGrowthCard.endMonth, profitableHiGrowthCard.maxAvailableMonth);

  const [endYear, endMonth] = profitableHiGrowthCard.endMonth.split("-").map(Number);
  const expectedStartDate = new Date(Date.UTC(endYear, endMonth - 1 - 60, 1));
  const expectedClampedStartMonth = `${expectedStartDate.getUTCFullYear()}-${String(expectedStartDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const expectedStartMonth = expectedClampedStartMonth < profitableHiGrowthCard.minAvailableMonth
    ? profitableHiGrowthCard.minAvailableMonth
    : expectedClampedStartMonth;

  assert.equal(profitableHiGrowthCard.startMonth, expectedStartMonth);
});

test("PATCH /api/homepage/investment-category-cards/:category/constituents/:ticker persists user-disabled status", async () => {
  // Simulate the user turning off ALPHA inside the category card.
  // The route should both persist that preference and recalculate the returned
  // category-card state for the same visible range.
  const response = await requestJson("/api/homepage/investment-category-cards/Profitable%20Hi%20Growth/constituents/ALPHA", {
    method: "PATCH",
    body: JSON.stringify({
      isEnabled: false,
      startMonth: "2024-01",
      endMonth: "2024-03",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.investmentCategory, "Profitable Hi Growth");
  assert.deepEqual(response.body.counts, {
    active: 0,
    userDisabled: 1,
    unavailable: 1,
  });
  assert.equal(response.body.startMonth, "2024-01");
  assert.equal(response.body.endMonth, "2024-03");

  // With ALPHA disabled and BETA still unavailable, there are no active
  // constituents left to build a chart from.
  assert.equal(response.body.emptyStateMessage, "No active constituents have data for this visible range.");
  assert.deepEqual(response.body.constituents, [
    {
      tickerSymbol: "ALPHA",
      companyName: "Alpha Corp",
      status: "userDisabled",
      isEnabled: false,
      isToggleable: true,
    },
    {
      tickerSymbol: "BETA",
      companyName: "Beta Corp",
      status: "unavailable",
      isEnabled: true,
      isToggleable: true,
    },
  ]);

  // The preference should also be saved in MongoDB, not just echoed in the
  // HTTP response. This proves the toggle is persistent.
  const savedPreference = await InvestmentCategoryConstituentPreference.findOne({
    investmentCategory: "Profitable Hi Growth",
    tickerSymbol: "ALPHA",
  }).lean();

  assert.equal(savedPreference.isEnabled, false);
});

test("POST /api/homepage/investment-category-cards/query validates month strings and unknown categories", async () => {
  // First check request validation for bad month formatting.
  const invalidMonthResponse = await requestJson("/api/homepage/investment-category-cards/query", {
    method: "POST",
    body: JSON.stringify({
      cards: [
        {
          investmentCategory: "Profitable Hi Growth",
          startMonth: "2024-1",
          endMonth: "2024-03",
        },
      ],
    }),
  });

  assert.equal(invalidMonthResponse.status, 400);
  assert.equal(invalidMonthResponse.body.error, "startMonth and endMonth must use the YYYY-MM format.");

  // Then check business validation for an investment category that does not
  // exist in the lens/category system.
  const unknownCategoryResponse = await requestJson("/api/homepage/investment-category-cards/query", {
    method: "POST",
    body: JSON.stringify({
      cards: [
        {
          investmentCategory: "Unknown Category",
          startMonth: "2024-01",
          endMonth: "2024-03",
        },
      ],
    }),
  });

  assert.equal(unknownCategoryResponse.status, 400);
  assert.equal(unknownCategoryResponse.body.error, "Unknown investmentCategory: Unknown Category");
});
