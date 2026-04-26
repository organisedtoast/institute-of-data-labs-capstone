const {
  DEFAULT_MEMORY_REGRESSION_PERCENT,
  DEFAULT_TIME_REGRESSION_PERCENT,
} = require("./performanceConfig");
const { readJsonFile, writeJsonFile } = require("./performanceFileUtils");

function buildScenarioKey(scenarioName, datasetSize) {
  return `${scenarioName}::${datasetSize}`;
}

function buildBaselineLookup(baselineDocument = {}) {
  const entries = Array.isArray(baselineDocument.entries) ? baselineDocument.entries : [];
  return new Map(
    entries.map((entry) => [buildScenarioKey(entry.scenarioName, entry.datasetSize), entry]),
  );
}

function compareMetric(currentValue, baselineValue, allowedRegressionPercent) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue)) {
    return {
      status: "missing-baseline",
      pass: null,
      allowedMaximum: null,
      regressionPercent: null,
    };
  }

  const allowedMaximum = baselineValue * (1 + (allowedRegressionPercent / 100));
  const regressionPercent = baselineValue === 0
    ? 0
    : ((currentValue - baselineValue) / baselineValue) * 100;

  return {
    status: "compared",
    pass: currentValue <= allowedMaximum,
    allowedMaximum,
    regressionPercent,
  };
}

function attachBaselineComparison(resultEntry, baselineLookup, suiteDefaults = {}) {
  const baselineEntry = baselineLookup.get(buildScenarioKey(resultEntry.scenarioName, resultEntry.datasetSize));
  const allowedTimeRegressionPercent = suiteDefaults.allowedTimeRegressionPercent
    ?? DEFAULT_TIME_REGRESSION_PERCENT;
  const allowedMemoryRegressionPercent = suiteDefaults.allowedMemoryRegressionPercent
    ?? DEFAULT_MEMORY_REGRESSION_PERCENT;

  if (!baselineEntry) {
    return {
      ...resultEntry,
      baseline: {
        status: "missing-baseline",
        allowedTimeRegressionPercent,
        allowedMemoryRegressionPercent,
      },
      pass: null,
    };
  }

  const timeChecks = Object.entries(resultEntry.timeMetrics || {}).map(([metricName, currentValue]) => {
    const comparison = compareMetric(
      currentValue,
      baselineEntry.timeMetrics?.[metricName],
      allowedTimeRegressionPercent,
    );

    return {
      metricName,
      currentValue,
      baselineValue: baselineEntry.timeMetrics?.[metricName] ?? null,
      ...comparison,
    };
  });

  const memoryChecks = Object.entries(resultEntry.memoryMetrics || {}).map(([metricName, currentValue]) => {
    const comparison = compareMetric(
      currentValue,
      baselineEntry.memoryMetrics?.[metricName],
      allowedMemoryRegressionPercent,
    );

    return {
      metricName,
      currentValue,
      baselineValue: baselineEntry.memoryMetrics?.[metricName] ?? null,
      ...comparison,
    };
  });

  const checks = [...timeChecks, ...memoryChecks];
  const failedCheck = checks.find((check) => check.pass === false);
  const overallPass = failedCheck ? false : true;

  return {
    ...resultEntry,
    baseline: {
      status: "compared",
      allowedTimeRegressionPercent,
      allowedMemoryRegressionPercent,
      checks,
    },
    pass: overallPass,
  };
}

function buildBaselineDocument({ suiteName, resultEntries, allowedTimeRegressionPercent, allowedMemoryRegressionPercent }) {
  return {
    suiteName,
    updatedAt: new Date().toISOString(),
    allowedTimeRegressionPercent,
    allowedMemoryRegressionPercent,
    // The baseline stores the current measured values so later runs can spot
    // regressions relative to this chosen reference point.
    entries: resultEntries.map((entry) => ({
      scenarioName: entry.scenarioName,
      datasetSize: entry.datasetSize,
      timeMetrics: entry.timeMetrics,
      memoryMetrics: entry.memoryMetrics,
    })),
  };
}

function loadBaselineDocument(filePath) {
  return readJsonFile(filePath, {
    suiteName: "unknown",
    allowedTimeRegressionPercent: DEFAULT_TIME_REGRESSION_PERCENT,
    allowedMemoryRegressionPercent: DEFAULT_MEMORY_REGRESSION_PERCENT,
    entries: [],
  });
}

function saveBaselineDocument(filePath, document) {
  writeJsonFile(filePath, document);
}

module.exports = {
  attachBaselineComparison,
  buildBaselineDocument,
  buildBaselineLookup,
  buildScenarioKey,
  loadBaselineDocument,
  saveBaselineDocument,
};
