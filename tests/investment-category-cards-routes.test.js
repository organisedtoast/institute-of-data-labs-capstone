require("dotenv").config();

process.env.PORT = "3104";

const assert = require("node:assert/strict");
const test = require("node:test");

const WatchlistStock = require("../models/WatchlistStock");
const InvestmentCategoryConstituentPreference = require("../models/InvestmentCategoryConstituentPreference");
const StockPriceHistoryCache = require("../models/StockPriceHistoryCache");
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

async function clearHomepageCollections() {
  await Promise.all([
    WatchlistStock.deleteMany({ tickerSymbol: { $in: ["ALPHA", "BETA", "GAMMA"] } }),
    InvestmentCategoryConstituentPreference.deleteMany({ investmentCategory: "Profitable Hi Growth" }),
    StockPriceHistoryCache.deleteMany({ tickerSymbol: { $in: ["ALPHA", "BETA", "GAMMA"] } }),
  ]);
}

test.before(async () => {
  await startServer();
});

test.after(async () => {
  roicService.fetchStockPrices = originalFetchStockPrices;
  await clearHomepageCollections();
  await stopServer();
});

test.beforeEach(async () => {
  await clearHomepageCollections();
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
  assert.deepEqual(response.body.cards[0].counts, {
    active: 1,
    userDisabled: 0,
    unavailable: 1,
  });
  assert.deepEqual(response.body.cards[0].series, [
    { date: "2024-01-01", close: 100 },
    { date: "2024-02-01", close: 150 },
    { date: "2024-03-01", close: 200 },
  ]);
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

test("PATCH /api/homepage/investment-category-cards/:category/constituents/:ticker persists user-disabled status", async () => {
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

  const savedPreference = await InvestmentCategoryConstituentPreference.findOne({
    investmentCategory: "Profitable Hi Growth",
    tickerSymbol: "ALPHA",
  }).lean();

  assert.equal(savedPreference.isEnabled, false);
});

test("POST /api/homepage/investment-category-cards/query validates month strings and unknown categories", async () => {
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
