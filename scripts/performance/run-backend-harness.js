#!/usr/bin/env node
require("dotenv").config();

const {
  DEFAULT_BACKEND_REPEATS,
  DEFAULT_SEED_CHUNK_SIZE,
  parseDatasetSizes,
  parseFraction,
  parsePositiveInteger,
} = require("../../tests/performance/performanceConfig");
const { runBackendHarness } = require("../../tests/performance/backendHarness");

async function main() {
  const datasetSizes = parseDatasetSizes(process.env.PERF_DATASET_SIZES);
  const repeats = parsePositiveInteger(process.env.PERF_BACKEND_REPEATS, DEFAULT_BACKEND_REPEATS);
  const legacyPercentage = parseFraction(process.env.PERF_LEGACY_PERCENTAGE, 0.05);
  const annualHistorySize = parsePositiveInteger(process.env.PERF_ANNUAL_HISTORY_SIZE, 5);
  const priceHistoryMonths = parsePositiveInteger(process.env.PERF_PRICE_HISTORY_MONTHS, 60);
  const chunkSize = parsePositiveInteger(process.env.PERF_SEED_CHUNK_SIZE, DEFAULT_SEED_CHUNK_SIZE);

  const { outputFile, result } = await runBackendHarness({
    annualHistorySize,
    chunkSize,
    databaseName: process.env.PERF_DATABASE_NAME,
    datasetSizes,
    legacyPercentage,
    priceHistoryMonths,
    repeats,
  });

  console.log(JSON.stringify({
    outputFile,
    regressionsDetected: result.regressionsDetected,
    scenarioCount: result.scenarios.length,
  }, null, 2));

  if (result.regressionsDetected) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
