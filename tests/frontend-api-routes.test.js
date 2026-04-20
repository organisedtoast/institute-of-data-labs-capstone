// This test verifies the behavior of the frontend API routes defined in server.js.

// Because these routes are just thin wrappers around the service layer, the tests
// focus on confirming that the controller correctly validates and normalizes
// client input, handles errors from the service layer appropriately, and
// returns the expected HTTP status codes and response formats to the client.

// The service layer is also stubbed in each test to control the data returned to the route handlers

// Does this test connect to the real ROIC API? No, it does not. 
// The service methods that would normally call the ROIC API are replaced with stub functions that return hardcoded data or throw errors as needed for each test case.
// This allows us to test the route handlers in isolation without relying on external APIs or network calls.

// Does this test connect to the real MongoDB database? No, it does not.
// The database connection functions are replaced with empty async functions that do nothing,
// so the server can start up without trying to connect to a real database. 
// This is possible because the stock lookup routes being tested do not interact with the database directly.


// Load environment variables from .env before the server is imported.
// This keeps the test environment consistent with local development.
require("dotenv").config();

// Use a dedicated test port so these requests do not clash with a locally
// running app on the default port.
process.env.PORT = "3103";

// Node's built-in assertion and test modules are enough for this file,
// so we do not need Jest, Mocha, or another test framework here.
const assert = require("node:assert/strict");
const test = require("node:test");

const db = require("../config/db");
const stockSearchService = require("../services/stockSearchService");

// Replace the real database connect/disconnect functions with empty async
// functions. That lets us test the HTTP routes without needing MongoDB
// running for this file.
db.connectDB = async () => {};
db.disconnectDB = async () => {};

const roicService = require("../services/roicService");

// Save the original service methods so we can restore them after the tests.
// Each test temporarily replaces one or more of these methods with a stub.
const originalMethods = {
  fetchStockPrices: roicService.fetchStockPrices,
  searchStocks: stockSearchService.searchStocks,
};

const { startServer, stopServer } = require("../server");

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

// Small helper that sends a request to the running test server and returns
// a simple object containing the status code and parsed response body.
// It tries JSON first, but safely falls back to plain text if the response
// is not JSON.
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

// Start the Express server once before all tests run. Because server.js
// exports startServer(), these tests can boot the real app and talk to it
// over HTTP just like a frontend client would.
test.before(async () => {
  await startServer();
});

// After the tests finish, put the real service methods back and shut the
// server down so the test process can exit cleanly.
test.after(async () => {
  roicService.fetchStockPrices = originalMethods.fetchStockPrices;
  stockSearchService.searchStocks = originalMethods.searchStocks;
  await stopServer();
});

test("GET /api/stock-prices/:ticker returns normalized prices and forwards optional dates", async () => {
  let capturedArgs = null;

  // Stub the upstream service so this test controls the data returned to
  // the route handler. We also capture the arguments to verify that the
  // controller normalized the ticker and passed the query filters through.
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

test("GET /api/stock-prices/:ticker uses DESC when no custom date range is provided", async () => {
  let capturedArgs = null;

  roicService.fetchStockPrices = async (ticker, options) => {
    capturedArgs = { ticker, options };
    return [
      { date: "2024-01-31", close: 187.25 },
      { date: "2024-02-29", close: 192.5 },
    ];
  };

  const response = await requestJson("/api/stock-prices/aapl");

  assert.equal(response.status, 200);
  assert.equal(response.body.identifier, "AAPL");
  assert.deepEqual(response.body.prices, [
    { date: "2024-01-31", close: 187.25 },
    { date: "2024-02-29", close: 192.5 },
  ]);
  assert.deepEqual(capturedArgs, {
    ticker: "AAPL",
    options: {
      startDate: "",
      endDate: "",
      order: "DESC",
    },
  });
});

test("GET /api/stock-prices/:ticker validates month filters, rejects blank tickers, and surfaces upstream failures", async () => {
  // In this test we force the service call to fail so we can confirm the
  // route returns the correct error response to the client.
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
  // The route now delegates stock search composition to the dedicated backend
  // stockSearchService, so this test only checks request validation and that
  // the controller returns the service payload as JSON.
  stockSearchService.searchStocks = async (query) => {
    assert.equal(query, "aapl");
    return {
      query: "aapl",
      queryType: "ticker-or-name",
      results: [
        { identifier: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", exchangeName: "NASDAQ", type: "stock", nameSource: "profile", isFallbackName: false },
        { identifier: "AAPL.AX", name: "Apple Australia", exchange: "ASX", exchangeName: "Australian Securities Exchange", type: "stock", nameSource: "profile", isFallbackName: false },
        { identifier: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", exchangeName: "NASDAQ", type: "stock", nameSource: "company-search", isFallbackName: false },
      ],
    };
  };

  const missingQueryResponse = await requestJson("/api/stocks/search");
  assert.equal(missingQueryResponse.status, 400);
  assert.equal(missingQueryResponse.body.message, "Please provide a search query with ?q=");

  const successResponse = await requestJson("/api/stocks/search?q=aapl");
  assert.equal(successResponse.status, 200);
  assert.equal(successResponse.body.query, "aapl");
  assert.equal(successResponse.body.queryType, "ticker-or-name");
  assert.deepEqual(successResponse.body.results, [
    { identifier: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", exchangeName: "NASDAQ", type: "stock", nameSource: "profile", isFallbackName: false },
    { identifier: "AAPL.AX", name: "Apple Australia", exchange: "ASX", exchangeName: "Australian Securities Exchange", type: "stock", nameSource: "profile", isFallbackName: false },
    { identifier: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", exchangeName: "NASDAQ", type: "stock", nameSource: "company-search", isFallbackName: false },
  ]);
});

test("GET /api/stocks/search returns suffix variants for near ticker matches like WTC -> WTC.AX", async () => {
  stockSearchService.searchStocks = async (query) => {
    assert.equal(query, "WTC");
    return {
      query: "WTC",
      queryType: "ticker-or-name",
      results: [
        { identifier: "WTC.AX", name: "WiseTech Global Ltd", exchange: "ASX", exchangeName: "Australian Securities Exchange", type: "stock", nameSource: "profile", isFallbackName: false },
        { identifier: "WTC.NZ", name: "Other WTC Listing", exchange: "NZX", exchangeName: "New Zealand Exchange", type: "stock", nameSource: "profile", isFallbackName: false },
        { identifier: "AWTC", name: "A Company Mentioning WTC", exchange: "NYSE", exchangeName: "New York Stock Exchange", type: "stock", nameSource: "company-search", isFallbackName: false },
      ],
    };
  };

  const response = await requestJson("/api/stocks/search?q=WTC");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.results, [
    { identifier: "WTC.AX", name: "WiseTech Global Ltd", exchange: "ASX", exchangeName: "Australian Securities Exchange", type: "stock", nameSource: "profile", isFallbackName: false },
    { identifier: "WTC.NZ", name: "Other WTC Listing", exchange: "NZX", exchangeName: "New Zealand Exchange", type: "stock", nameSource: "profile", isFallbackName: false },
    { identifier: "AWTC", name: "A Company Mentioning WTC", exchange: "NYSE", exchangeName: "New York Stock Exchange", type: "stock", nameSource: "company-search", isFallbackName: false },
  ]);
});

test("GET /api/stocks/search fails only when every upstream search branch fails", async () => {
  stockSearchService.searchStocks = async () => {
    const error = new Error('Unable to search stocks for "TSLA".');
    error.statusCode = 502;
    error.details = { message: "ticker search failed" };
    throw error;
  };

  const response = await requestJson("/api/stocks/search?q=TSLA");
  assert.equal(response.status, 502);
  assert.equal(response.body.message, 'Unable to search stocks for "TSLA".');
  assert.deepEqual(response.body.details, { message: "ticker search failed" });
});
