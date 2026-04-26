#!/usr/bin/env node
require("dotenv").config();

const {
  applyMeasuredResultsToBaseline,
  readJsonFile,
  writeJsonFile,
} = require("../../tests/performance/baselineUtils");
const {
  BACKEND_BASELINE_FILE,
  BROWSER_BASELINE_FILE,
  DEFAULT_SEED_CHUNK_SIZE,
  parseDatasetSizes,
  parseFraction,
  parsePositiveInteger,
} = require("../../tests/performance/performanceConfig");
const { runBackendHarness } = require("../../tests/performance/backendHarness");
const { runBrowserBenchmark } = require("../../tests/performance/browserBenchmark");

async function main() {
  const harness = process.env.PERF_BASELINE_HARNESS || "backend";
  const datasetSizes = parseDatasetSizes(process.env.PERF_DATASET_SIZES);
  const legacyPercentage = parseFraction(process.env.PERF_LEGACY_PERCENTAGE, 0.05);
  const annualHistorySize = parsePositiveInteger(process.env.PERF_ANNUAL_HISTORY_SIZE, 5);
  const priceHistoryMonths = parsePositiveInteger(process.env.PERF_PRICE_HISTORY_MONTHS, 60);
  const chunkSize = parsePositiveInteger(process.env.PERF_SEED_CHUNK_SIZE, DEFAULT_SEED_CHUNK_SIZE);

  if (harness === "backend" || harness === "all") {
    const { result } = await runBackendHarness({
      annualHistorySize,
      chunkSize,
      databaseName: process.env.PERF_DATABASE_NAME,
      datasetSizes,
      legacyPercentage,
      priceHistoryMonths,
    });
    const existingBaseline = readJsonFile(BACKEND_BASELINE_FILE, {
      harness: "backend",
      version: 1,
      generatedAt: null,
      scenarios: {},
    });
    const refreshedBaseline = applyMeasuredResultsToBaseline(existingBaseline, result.scenarios);
    writeJsonFile(BACKEND_BASELINE_FILE, refreshedBaseline);
  }

  if (harness === "browser" || harness === "all") {
    const { result } = await runBrowserBenchmark({
      annualHistorySize,
      chunkSize,
      databaseName: process.env.PERF_DATABASE_NAME,
      datasetSizes,
      legacyPercentage,
      priceHistoryMonths,
    });
    const existingBaseline = readJsonFile(BROWSER_BASELINE_FILE, {
      harness: "browser",
      version: 1,
      generatedAt: null,
      scenarios: {},
    });
    const refreshedBaseline = applyMeasuredResultsToBaseline(existingBaseline, result.scenarios);
    writeJsonFile(BROWSER_BASELINE_FILE, refreshedBaseline);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
