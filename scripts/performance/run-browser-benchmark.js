#!/usr/bin/env node
require("dotenv").config();

const {
  DEFAULT_BROWSER_SCROLL_STEPS,
  DEFAULT_SEED_CHUNK_SIZE,
  parseDatasetSizes,
  parseFraction,
  parsePositiveInteger,
} = require("../../tests/performance/performanceConfig");
const {
  BROWSER_BENCHMARK_STATUS,
  runBrowserBenchmark,
} = require("../../tests/performance/browserBenchmark");

function printBrowserBenchmarkSummary(result, outputFile) {
  const summary = {
    outputFile,
    scenarioCount: result.scenarios.length,
    status: result.status,
  };

  if (result.status === BROWSER_BENCHMARK_STATUS.PASSED) {
    summary.message = "Browser benchmark ran successfully, including the progressive-activation checks.";
  } else if (result.status === BROWSER_BENCHMARK_STATUS.SETUP_BLOCKED) {
    summary.message = "Browser benchmark setup is blocked before the real benchmark can start.";
    summary.setupStatus = result.setupDiagnostics?.setupStatus || null;
    summary.launchBlockedReason = result.setupDiagnostics?.launchBlockedReason || null;
  } else {
    summary.message = "Browser benchmark failed after setup completed.";
    summary.regressionsDetected = result.regressionsDetected;
  }

  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const datasetSizes = parseDatasetSizes(process.env.PERF_DATASET_SIZES);
  const scrollSteps = parsePositiveInteger(process.env.PERF_BROWSER_SCROLL_STEPS, DEFAULT_BROWSER_SCROLL_STEPS);
  const legacyPercentage = parseFraction(process.env.PERF_LEGACY_PERCENTAGE, 0.05);
  const annualHistorySize = parsePositiveInteger(process.env.PERF_ANNUAL_HISTORY_SIZE, 5);
  const priceHistoryMonths = parsePositiveInteger(process.env.PERF_PRICE_HISTORY_MONTHS, 60);
  const chunkSize = parsePositiveInteger(process.env.PERF_SEED_CHUNK_SIZE, DEFAULT_SEED_CHUNK_SIZE);
  const preflightOnly = process.env.PERF_BROWSER_PREFLIGHT === "1";

  const { outputFile, result } = await runBrowserBenchmark({
    annualHistorySize,
    chunkSize,
    databaseName: process.env.PERF_DATABASE_NAME,
    datasetSizes,
    legacyPercentage,
    preflightOnly,
    priceHistoryMonths,
    scrollSteps,
  });

  printBrowserBenchmarkSummary(result, outputFile);

  if (result.status !== BROWSER_BENCHMARK_STATUS.PASSED) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
