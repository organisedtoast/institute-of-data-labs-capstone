require("dotenv").config();

process.env.PORT = "3103";

const assert = require("node:assert/strict");
const test = require("node:test");

const db = require("../config/db");
db.connectDB = async () => {};
db.disconnectDB = async () => {};

const roicService = require("../services/roicService");

const originalMethods = {
  fetchStockPrices: roicService.fetchStockPrices,
  searchRoicByCompanyName: roicService.searchRoicByCompanyName,
  searchRoicByExactTicker: roicService.searchRoicByExactTicker,
  searchRoicByTickerVariants: roicService.searchRoicByTickerVariants,
};

const { startServer, stopServer } = require("../server");

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

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

test.before(async () => {
  await startServer();
});

test.after(async () => {
  Object.assign(roicService, originalMethods);
  await stopServer();
});

test("GET /api/stock-prices/:ticker returns normalized prices and forwards optional dates", async () => {
  let capturedArgs = null;

  roicService.fetchStockPrices = async (ticker, options) => {
    capturedArgs = { ticker, options };
    return [
      { date: "2024-01-31", close: 187.25, volume: 1000 },
      { date: "2024-02-29", close: 192.5, volume: 1100 },
    ];
  };

  const response = await requestJson("/api/stock-prices/aapl?startDate=2024-01&endDate=2024-02");

  assert.equal(response.status, 200);
  assert.equal(response.body.identifier, "AAPL");
  assert.deepEqual(response.body.prices, [
    { date: "2024-01-31", close: 187.25, volume: 1000 },
    { date: "2024-02-29", close: 192.5, volume: 1100 },
  ]);
  assert.deepEqual(capturedArgs, {
    ticker: "AAPL",
    options: {
      startDate: "2024-01",
      endDate: "2024-02",
      order: "ASC",
    },
  });
});

test("GET /api/stock-prices/:ticker validates month filters, rejects blank tickers, and surfaces upstream failures", async () => {
  roicService.fetchStockPrices = async () => {
    const error = new Error("ROIC exploded");
    error.response = {
      status: 503,
      data: { message: "upstream unavailable" },
    };
    throw error;
  };

  const blankTickerResponse = await requestJson("/api/stock-prices/%20");
  assert.equal(blankTickerResponse.status, 400);
  assert.equal(blankTickerResponse.body.message, "Ticker symbol is required.");

  const invalidMonthResponse = await requestJson("/api/stock-prices/AAPL?startDate=2024-1&endDate=2024-02");
  assert.equal(invalidMonthResponse.status, 400);
  assert.equal(invalidMonthResponse.body.message, "startDate and endDate must use the YYYY-MM format.");

  const invalidMonthNumberResponse = await requestJson("/api/stock-prices/AAPL?startDate=2024-13&endDate=2024-02");
  assert.equal(invalidMonthNumberResponse.status, 400);
  assert.equal(invalidMonthNumberResponse.body.message, "startDate and endDate must use the YYYY-MM format.");

  const invertedRangeResponse = await requestJson("/api/stock-prices/AAPL?startDate=2024-06&endDate=2024-05");
  assert.equal(invertedRangeResponse.status, 400);
  assert.equal(invertedRangeResponse.body.message, "startDate must be earlier than or equal to endDate.");

  const failureResponse = await requestJson("/api/stock-prices/MSFT");
  assert.equal(failureResponse.status, 503);
  assert.equal(failureResponse.body.message, "Unable to load stock price data for MSFT.");
  assert.deepEqual(failureResponse.body.details, { message: "upstream unavailable" });
});

test("GET /api/stocks/search validates input, ranks ticker matches first, de-duplicates results, and tolerates partial failures", async () => {
  roicService.searchRoicByExactTicker = async (ticker) => {
    assert.equal(ticker, "AAPL");
    return [{ identifier: "AAPL", name: "AAPL", type: "stock" }];
  };

  roicService.searchRoicByTickerVariants = async (query) => {
    assert.equal(query, "AAPL");
    return [
      { identifier: "AAPL.AX", name: "AAPL Australian Listing", type: "stock" },
      { identifier: "AAPL.AX", name: "AAPL Duplicate Variant", type: "stock" },
    ];
  };

  roicService.searchRoicByCompanyName = async (query) => {
    assert.equal(query, "AAPL");
    return [
      { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", exchange_name: "NASDAQ", type: "stock" },
      { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", exchange_name: "NASDAQ", type: "stock" },
    ];
  };

  const missingQueryResponse = await requestJson("/api/stocks/search");
  assert.equal(missingQueryResponse.status, 400);
  assert.equal(missingQueryResponse.body.message, "Please provide a search query with ?q=");

  const successResponse = await requestJson("/api/stocks/search?q=aapl");
  assert.equal(successResponse.status, 200);
  assert.equal(successResponse.body.queryType, "ticker-or-name");
  assert.deepEqual(successResponse.body.results, [
    { identifier: "AAPL", name: "AAPL", exchange: "", exchangeName: "", type: "stock" },
    { identifier: "AAPL.AX", name: "AAPL Australian Listing", exchange: "", exchangeName: "", type: "stock" },
    { identifier: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", exchangeName: "NASDAQ", type: "stock" },
  ]);

  roicService.searchRoicByExactTicker = async () => {
    throw new Error("ticker branch failed");
  };
  roicService.searchRoicByTickerVariants = async () => {
    throw new Error("variant branch failed");
  };
  roicService.searchRoicByCompanyName = async () => {
    return [
      { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", exchange_name: "NASDAQ", type: "stock" },
    ];
  };

  const partialFailureResponse = await requestJson("/api/stocks/search?q=nvda");
  assert.equal(partialFailureResponse.status, 200);
  assert.deepEqual(partialFailureResponse.body.results, [
    { identifier: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", exchangeName: "NASDAQ", type: "stock" },
  ]);
});

test("GET /api/stocks/search returns suffix variants for near ticker matches like WTC -> WTC.AX", async () => {
  roicService.searchRoicByExactTicker = async (ticker) => {
    assert.equal(ticker, "WTC");
    return [];
  };

  roicService.searchRoicByTickerVariants = async (query) => {
    assert.equal(query, "WTC");
    return [
      { identifier: "WTC.AX", name: "WiseTech Global Ltd", exchange: "ASX", exchangeName: "Australian Securities Exchange", type: "stock" },
      { identifier: "WTC.NZ", name: "Other WTC Listing", exchange: "NZX", exchangeName: "New Zealand Exchange", type: "stock" },
    ];
  };

  roicService.searchRoicByCompanyName = async () => {
    return [
      { symbol: "AWTC", name: "A Company Mentioning WTC", exchange: "NYSE", exchange_name: "New York Stock Exchange", type: "stock" },
    ];
  };

  const response = await requestJson("/api/stocks/search?q=WTC");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results, [
    { identifier: "WTC.AX", name: "WiseTech Global Ltd", exchange: "ASX", exchangeName: "Australian Securities Exchange", type: "stock" },
    { identifier: "WTC.NZ", name: "Other WTC Listing", exchange: "NZX", exchangeName: "New Zealand Exchange", type: "stock" },
    { identifier: "AWTC", name: "A Company Mentioning WTC", exchange: "NYSE", exchangeName: "New York Stock Exchange", type: "stock" },
  ]);
});

test("GET /api/stocks/search fails only when every upstream search branch fails", async () => {
  roicService.searchRoicByExactTicker = async () => {
    const error = new Error("ticker failed");
    error.response = {
      status: 502,
      data: { message: "ticker search failed" },
    };
    throw error;
  };

  roicService.searchRoicByTickerVariants = async () => {
    const error = new Error("variant failed");
    error.response = {
      status: 503,
      data: { message: "variant search failed" },
    };
    throw error;
  };

  roicService.searchRoicByCompanyName = async () => {
    const error = new Error("name failed");
    error.response = {
      status: 504,
      data: { message: "name search failed" },
    };
    throw error;
  };

  const response = await requestJson("/api/stocks/search?q=TSLA");
  assert.equal(response.status, 502);
  assert.equal(response.body.message, 'Unable to search stocks for "TSLA".');
  assert.deepEqual(response.body.details, { message: "ticker search failed" });
});
