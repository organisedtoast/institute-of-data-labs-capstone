// Purpose of this test file:
// We want to prove the server can still boot in a "degraded" mode when MongoDB
// is unavailable during startup. In this app, some routes such as stock search
// are read-only and can still work without a live database connection. This
// test protects that behavior so a Mongo outage does not unnecessarily take
// down the whole backend.

require("dotenv").config();

// Use a dedicated port for this test file so it can run the real server
// without colliding with another test or a local dev session.
process.env.PORT = "3104";

const assert = require("node:assert/strict");
const test = require("node:test");

const db = require("../config/db");
const stockSearchService = require("../services/stockSearchService");

// Save the real implementations so we can restore them after the test.
const originalConnectDB = db.connectDB;
const originalDisconnectDB = db.disconnectDB;
const originalSearchStocks = stockSearchService.searchStocks;

// Clear the cached server module before importing it.
// This matters because `server.js` reads its dependencies when the module loads,
// and we want this test to see our stubbed versions cleanly.
delete require.cache[require.resolve("../server")];
const { startServer, stopServer } = require("../server");

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

// Small helper for making real HTTP requests to the running Express app and
// decoding JSON responses into a test-friendly shape.
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
  // Simulate a startup-time MongoDB outage.
  // The server should log a warning but still boot enough to serve read-only
  // routes that do not depend on MongoDB writes.
  db.connectDB = async () => {
    throw new Error("Mongo unavailable during startup");
  };

  // If startup never connected to Mongo, disconnect should also be harmless.
  db.disconnectDB = async () => {};

  // Stub stock search so the route can return a deterministic success payload
  // without touching the live third-party API.
  stockSearchService.searchStocks = async (query) => ({
    query,
    queryType: "ticker-or-name",
    results: [
      {
        identifier: "AAPL",
        name: "Apple Inc.",
        exchange: "NASDAQ",
        exchangeName: "NASDAQ",
        type: "stock",
        nameSource: "profile",
        isFallbackName: false,
      },
    ],
  });

  // Start the real server once for this file using the stubbed dependencies above.
  await startServer();
});

test.after(async () => {
  // Always restore the real implementations so this test does not leak state
  // into other files.
  stockSearchService.searchStocks = originalSearchStocks;
  db.connectDB = originalConnectDB;
  db.disconnectDB = originalDisconnectDB;
  await stopServer();
});

test("server starts and still serves stock search when MongoDB is unavailable at boot", async () => {
  // This hits a real HTTP route on the running server.
  // The goal is to prove that startup degraded gracefully instead of crashing
  // the whole app just because Mongo was unavailable.
  const response = await requestJson("/api/stocks/search?q=AAPL");

  assert.equal(response.status, 200);
  assert.equal(response.body.query, "AAPL");

  // The route should still return the stock-search payload supplied by our stub,
  // proving the read-only search boundary stayed available.
  assert.deepEqual(response.body.results, [
    {
      identifier: "AAPL",
      name: "Apple Inc.",
      exchange: "NASDAQ",
      exchangeName: "NASDAQ",
      type: "stock",
      nameSource: "profile",
      isFallbackName: false,
    },
  ]);
});
