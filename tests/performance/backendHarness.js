require("dotenv").config();

const path = require("node:path");

const { buildPerformanceMongoUri } = require("./buildPerformanceMongoUri");
const {
  compareScenarioMetrics,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile,
} = require("./baselineUtils");
const {
  BACKEND_BASELINE_FILE,
  DEFAULT_ANNUAL_HISTORY_SIZE,
  DEFAULT_BACKEND_REPEATS,
  DEFAULT_DATASET_SIZES,
  DEFAULT_LEGACY_PERCENTAGE,
  DEFAULT_PRICE_HISTORY_MONTHS,
  DEFAULT_SEED_CHUNK_SIZE,
  PERFORMANCE_RESULTS_DIR,
  getTimestampSlug,
} = require("./performanceConfig");
const {
  clearPerformanceCollections,
  installPerformanceRoicStubs,
  seedLargeWatchlistDataset,
} = require("./largeWatchlistDataset");
const { installDefaultBoldRowsShim } = require("./installDefaultBoldRowsShim");
const { installServerStartupShim } = require("./installServerStartupShim");

function percentile(values, percentileTarget) {
  if (!values.length) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const position = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileTarget / 100) * sortedValues.length) - 1),
  );
  return Number(sortedValues[position].toFixed(2));
}

async function requestJson(baseUrl, pathName, options = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const rawBody = await response.text();
  const durationMs = Number((performance.now() - startedAt).toFixed(2));

  let parsedBody = rawBody;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Keeping the raw body is more useful than throwing when a performance
    // harness is trying to report what the backend actually returned.
  }

  return {
    body: parsedBody,
    durationMs,
    ok: response.ok,
    payloadBytes: Buffer.byteLength(rawBody, "utf8"),
    status: response.status,
  };
}

async function measureRepeatedScenario(runOnce, repeats) {
  const durations = [];
  const payloadSizes = [];
  let lastResponse = null;
  const memoryBefore = process.memoryUsage();

  for (let iteration = 0; iteration < repeats; iteration += 1) {
    lastResponse = await runOnce();
    durations.push(lastResponse.durationMs);
    payloadSizes.push(lastResponse.payloadBytes);
  }

  const memoryAfter = process.memoryUsage();
  const firstDuration = durations[0] || 0;
  const lastDuration = durations.at(-1) || 0;
  const repeatDriftPct = firstDuration > 0
    ? Number((((lastDuration - firstDuration) / firstDuration) * 100).toFixed(2))
    : 0;

  return {
    body: lastResponse?.body,
    durations,
    metrics: {
      heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      payloadBytes: Math.max(...payloadSizes, 0),
      repeatDriftPct,
      rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
    },
    status: lastResponse?.status ?? 0,
  };
}

function buildScenarioResult({ baseline, datasetSize, metrics, scenarioName, metadata = {} }) {
  const comparison = compareScenarioMetrics(metrics, baseline?.scenarios?.[scenarioName] || {});
  return {
    datasetSize,
    metadata,
    metrics,
    passed: comparison.passed,
    regressionBudgetPct: comparison.allowedRegressionPct,
    scenarioName,
    comparisons: comparison.comparisons,
  };
}

async function runBackendHarness(rawOptions = {}) {
  const datasetSizes = Array.isArray(rawOptions.datasetSizes) && rawOptions.datasetSizes.length
    ? rawOptions.datasetSizes
    : [...DEFAULT_DATASET_SIZES];
  const repeats = Number.isInteger(rawOptions.repeats) && rawOptions.repeats > 0
    ? rawOptions.repeats
    : DEFAULT_BACKEND_REPEATS;
  const legacyPercentage = Number.isFinite(rawOptions.legacyPercentage)
    ? rawOptions.legacyPercentage
    : DEFAULT_LEGACY_PERCENTAGE;
  const annualHistorySize = Number.isInteger(rawOptions.annualHistorySize)
    ? rawOptions.annualHistorySize
    : DEFAULT_ANNUAL_HISTORY_SIZE;
  const chunkSize = Number.isInteger(rawOptions.chunkSize) && rawOptions.chunkSize > 0
    ? rawOptions.chunkSize
    : DEFAULT_SEED_CHUNK_SIZE;
  const priceHistoryMonths = Number.isInteger(rawOptions.priceHistoryMonths)
    ? rawOptions.priceHistoryMonths
    : DEFAULT_PRICE_HISTORY_MONTHS;
  const baselineFile = rawOptions.baselineFile || BACKEND_BASELINE_FILE;
  const resultDirectory = rawOptions.resultDirectory || path.join(PERFORMANCE_RESULTS_DIR, "backend");

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required before running the backend performance harness.");
  }

  process.env.MONGO_URI = buildPerformanceMongoUri(
    process.env.MONGO_URI,
    rawOptions.databaseName || "stockgossipmonitor_backend_performance",
  );
  process.env.PORT = String(rawOptions.port || 3320);

  const roicService = require("../../services/roicService");
  const restoreRoicService = installPerformanceRoicStubs(roicService);
  installDefaultBoldRowsShim();
  installServerStartupShim();
  const { startServer, stopServer } = require("../../server");
  const baseUrl = `http://127.0.0.1:${process.env.PORT}`;
  const baseline = readJsonFile(baselineFile, {
    harness: "backend",
    version: 1,
    generatedAt: null,
    scenarios: {},
  });
  const scenarioResults = [];

  await startServer();

  try {
    for (const datasetSize of datasetSizes) {
      const seedSummary = await seedLargeWatchlistDataset({
        annualHistorySize,
        chunkSize,
        clearFirst: true,
        legacyPercentage,
        priceHistoryMonths,
        stockCount: datasetSize,
      });

      const summaryMeasurement = await measureRepeatedScenario(
        () => requestJson(baseUrl, "/api/watchlist/summary"),
        repeats,
      );
      scenarioResults.push(buildScenarioResult({
        baseline,
        datasetSize,
        metrics: summaryMeasurement.metrics,
        scenarioName: `summary-${datasetSize}`,
        metadata: {
          route: "GET /api/watchlist/summary",
          stockCount: datasetSize,
        },
      }));

      const dashboardsMeasurement = await measureRepeatedScenario(
        () => requestJson(baseUrl, "/api/watchlist/dashboards"),
        repeats,
      );
      // The benchmark should stress the app routes themselves, not die first
      // because setup tried to hold the whole fake dataset in memory at once.
      scenarioResults.push(buildScenarioResult({
        baseline,
        datasetSize,
        metrics: dashboardsMeasurement.metrics,
        scenarioName: `dashboards-${datasetSize}`,
        metadata: {
          chunkSize: seedSummary.chunkSize,
          route: "GET /api/watchlist/dashboards",
          stockCount: datasetSize,
        },
      }));

      const metricsViewMeasurement = await measureRepeatedScenario(
        () => requestJson(baseUrl, `/api/watchlist/${seedSummary.firstTicker}/metrics-view`),
        repeats,
      );
      scenarioResults.push(buildScenarioResult({
        baseline,
        datasetSize,
        metrics: metricsViewMeasurement.metrics,
        scenarioName: `metrics-view-${datasetSize}`,
        metadata: {
          route: "GET /api/watchlist/:ticker/metrics-view",
          sampleTicker: seedSummary.firstTicker,
          stockCount: datasetSize,
        },
      }));

      const homepageMeasurement = await measureRepeatedScenario(
        () => requestJson(baseUrl, "/api/homepage/investment-category-cards/query", {
          body: JSON.stringify({}),
          method: "POST",
        }),
        repeats,
      );
      scenarioResults.push(buildScenarioResult({
        baseline,
        datasetSize,
        metrics: homepageMeasurement.metrics,
        scenarioName: `homepage-query-${datasetSize}`,
        metadata: {
          route: "POST /api/homepage/investment-category-cards/query",
          stockCount: datasetSize,
        },
      }));
    }
  } finally {
    try {
      await clearPerformanceCollections();
    } finally {
      restoreRoicService();
      await stopServer();
    }
  }

  ensureDirectoryExists(resultDirectory);
  const result = {
    harness: "backend",
    generatedAt: new Date().toISOString(),
    regressionsDetected: scenarioResults.some((scenario) => !scenario.passed),
    scenarios: scenarioResults,
  };
  const outputFile = path.join(resultDirectory, `backend-harness-${getTimestampSlug()}.json`);
  writeJsonFile(outputFile, result);
  writeJsonFile(path.join(resultDirectory, "backend-harness-latest.json"), result);

  return {
    outputFile,
    result,
  };
}

module.exports = {
  runBackendHarness,
};
