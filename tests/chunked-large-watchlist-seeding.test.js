require("dotenv").config();

const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const { connectDB, disconnectDB } = require("../config/db");
const { buildPerformanceMongoUri } = require("../tests/performance/buildPerformanceMongoUri");
const { seedLargeWatchlistDataset, clearPerformanceCollections } = require("../tests/performance/largeWatchlistDataset");
const WatchlistStock = require("../models/WatchlistStock");
const StockMetricsRowPreference = require("../models/StockMetricsRowPreference");
const InvestmentCategoryConstituentPreference = require("../models/InvestmentCategoryConstituentPreference");
const StockPriceHistoryCache = require("../models/StockPriceHistoryCache");

process.env.MONGO_URI = buildPerformanceMongoUri(
  process.env.MONGO_URI,
  "stockgossipmonitor_chunked_large_watchlist_seeding_test",
);

async function countCollections() {
  const [
    watchlistCount,
    rowPreferenceCount,
    constituentPreferenceCount,
    priceCacheCount,
  ] = await Promise.all([
    WatchlistStock.countDocuments({}),
    StockMetricsRowPreference.countDocuments({}),
    InvestmentCategoryConstituentPreference.countDocuments({}),
    StockPriceHistoryCache.countDocuments({}),
  ]);

  return {
    constituentPreferenceCount,
    priceCacheCount,
    rowPreferenceCount,
    watchlistCount,
  };
}

test.before(async () => {
  await connectDB();
});

test.after(async () => {
  try {
    await clearPerformanceCollections();

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await disconnectDB();
  }
});

test.beforeEach(async () => {
  await clearPerformanceCollections();
});

test("chunked seeding keeps expected counts and deterministic summary for a small dataset", async () => {
  const seedSummary = await seedLargeWatchlistDataset({
    annualHistorySize: 5,
    chunkSize: 25,
    legacyPercentage: 0.05,
    priceHistoryMonths: 60,
    stockCount: 100,
  });
  const counts = await countCollections();

  assert.equal(seedSummary.stockCount, 100);
  assert.equal(seedSummary.firstTicker, "PERF00001");
  assert.equal(seedSummary.legacyStockCount, 5);
  assert.equal(seedSummary.chunkSize, 25);
  assert.equal(seedSummary.chunkCount, 4);
  assert.equal(counts.watchlistCount, 100);
  assert.equal(counts.rowPreferenceCount, 200);
  assert.equal(counts.constituentPreferenceCount, 6);
  assert.equal(counts.priceCacheCount, 100);

  // We check one representative stock so the test proves chunking preserved
  // deterministic content instead of only proving the insert counts.
  const firstStock = await WatchlistStock.findOne({ tickerSymbol: "PERF00001" }).lean();
  assert.equal(firstStock.investmentCategory, "Unprofitable Hi Growth");
  assert.equal(firstStock.annualData.length, 5);
  assert.equal(firstStock.annualData[0].base.sharePrice.effectiveValue, 122);
  assert.equal(firstStock.forecastData.fy1.marketCap.effectiveValue, null);
});

test("chunked seeding works when stockCount is smaller than, equal to, or not divisible by chunkSize", async () => {
  const smallSummary = await seedLargeWatchlistDataset({
    chunkSize: 50,
    stockCount: 20,
  });
  assert.equal(smallSummary.chunkCount, 1);
  assert.equal((await countCollections()).watchlistCount, 20);

  await clearPerformanceCollections();

  const equalSummary = await seedLargeWatchlistDataset({
    chunkSize: 40,
    stockCount: 40,
  });
  assert.equal(equalSummary.chunkCount, 1);
  assert.equal((await countCollections()).watchlistCount, 40);

  await clearPerformanceCollections();

  const unevenSummary = await seedLargeWatchlistDataset({
    chunkSize: 30,
    stockCount: 65,
  });
  assert.equal(unevenSummary.chunkCount, 3);
  assert.equal((await countCollections()).watchlistCount, 65);
});
