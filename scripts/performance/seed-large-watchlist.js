#!/usr/bin/env node
require("dotenv").config();

const mongoose = require("mongoose");

const { buildPerformanceMongoUri } = require("../../tests/performance/buildPerformanceMongoUri");
const {
  DEFAULT_ANNUAL_HISTORY_SIZE,
  DEFAULT_LEGACY_PERCENTAGE,
  DEFAULT_PRICE_HISTORY_MONTHS,
  DEFAULT_SEED_CHUNK_SIZE,
  parseFraction,
  parsePositiveInteger,
} = require("../../tests/performance/performanceConfig");
const { seedLargeWatchlistDataset } = require("../../tests/performance/largeWatchlistDataset");
const { connectDB, disconnectDB } = require("../../config/db");

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required before seeding a large watchlist dataset.");
  }

  process.env.MONGO_URI = buildPerformanceMongoUri(
    process.env.MONGO_URI,
    process.env.PERF_DATABASE_NAME || "stockgossipmonitor_manual_performance_seed",
  );

  const stockCount = parsePositiveInteger(process.argv[2], 1000);
  const legacyPercentage = parseFraction(process.env.PERF_LEGACY_PERCENTAGE, DEFAULT_LEGACY_PERCENTAGE);
  const annualHistorySize = parsePositiveInteger(process.env.PERF_ANNUAL_HISTORY_SIZE, DEFAULT_ANNUAL_HISTORY_SIZE);
  const priceHistoryMonths = parsePositiveInteger(process.env.PERF_PRICE_HISTORY_MONTHS, DEFAULT_PRICE_HISTORY_MONTHS);
  const chunkSize = parsePositiveInteger(process.env.PERF_SEED_CHUNK_SIZE, DEFAULT_SEED_CHUNK_SIZE);

  await connectDB();

  try {
    const seedSummary = await seedLargeWatchlistDataset({
      annualHistorySize,
      chunkSize,
      legacyPercentage,
      priceHistoryMonths,
      stockCount,
    });

    console.log(JSON.stringify({
      message: "Large watchlist dataset seeded successfully.",
      seedSummary,
    }, null, 2));
  } finally {
    if (mongoose.connection.readyState === 1) {
      await disconnectDB();
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
