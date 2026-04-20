require("dotenv").config();

process.env.PORT = "3104";

const assert = require("node:assert/strict");
const test = require("node:test");

const db = require("../config/db");
const stockSearchService = require("../services/stockSearchService");

const originalConnectDB = db.connectDB;
const originalDisconnectDB = db.disconnectDB;
const originalSearchStocks = stockSearchService.searchStocks;

delete require.cache[require.resolve("../server")];
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
  db.connectDB = async () => {
    throw new Error("Mongo unavailable during startup");
  };
  db.disconnectDB = async () => {};
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

  await startServer();
});

test.after(async () => {
  stockSearchService.searchStocks = originalSearchStocks;
  db.connectDB = originalConnectDB;
  db.disconnectDB = originalDisconnectDB;
  await stopServer();
});

test("server starts and still serves stock search when MongoDB is unavailable at boot", async () => {
  const response = await requestJson("/api/stocks/search?q=AAPL");

  assert.equal(response.status, 200);
  assert.equal(response.body.query, "AAPL");
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
