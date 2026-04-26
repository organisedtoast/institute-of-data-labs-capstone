const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_ALLOWED_REGRESSION_PCT,
} = require("./performanceConfig");

function ensureDirectoryExists(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  ensureDirectoryExists(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compareMetric(currentValue, baselineValue, allowedRegressionPct) {
  if (!Number.isFinite(currentValue)) {
    return {
      status: "invalid-current",
      baseline: baselineValue,
      current: currentValue,
      allowedRegressionPct,
      deltaPct: null,
      passed: false,
    };
  }

  if (!Number.isFinite(baselineValue) || baselineValue <= 0) {
    return {
      status: "no-baseline",
      baseline: baselineValue,
      current: currentValue,
      allowedRegressionPct,
      deltaPct: null,
      passed: true,
    };
  }

  const deltaPct = ((currentValue - baselineValue) / baselineValue) * 100;
  const passed = deltaPct <= allowedRegressionPct;

  return {
    status: passed ? "pass" : "regression",
    baseline: baselineValue,
    current: currentValue,
    allowedRegressionPct,
    deltaPct: Number(deltaPct.toFixed(2)),
    passed,
  };
}

function compareScenarioMetrics(currentMetrics = {}, baselineScenario = {}) {
  const allowedRegressionPct = Number.isFinite(baselineScenario.allowedRegressionPct)
    ? baselineScenario.allowedRegressionPct
    : DEFAULT_ALLOWED_REGRESSION_PCT;
  const baselineMetrics = baselineScenario.metrics || {};
  const comparisons = {};
  let passed = true;

  Object.entries(currentMetrics).forEach(([metricName, metricValue]) => {
    if (!Number.isFinite(metricValue)) {
      return;
    }

    comparisons[metricName] = compareMetric(
      metricValue,
      baselineMetrics[metricName],
      allowedRegressionPct,
    );

    if (comparisons[metricName].passed === false) {
      passed = false;
    }
  });

  return {
    allowedRegressionPct,
    comparisons,
    passed,
  };
}

function buildScenarioBaselineEntries(scenarios = [], fallbackAllowedRegressionPct = DEFAULT_ALLOWED_REGRESSION_PCT) {
  return Object.fromEntries(
    scenarios.map((scenarioName) => [
      scenarioName,
      {
        allowedRegressionPct: fallbackAllowedRegressionPct,
        metrics: {},
      },
    ]),
  );
}

function applyMeasuredResultsToBaseline(existingBaseline = {}, measuredScenarios = []) {
  const nextBaseline = {
    ...existingBaseline,
    generatedAt: new Date().toISOString(),
    scenarios: {
      ...(existingBaseline.scenarios || {}),
    },
  };

  measuredScenarios.forEach((scenario) => {
    const existingScenario = nextBaseline.scenarios[scenario.scenarioName] || {};
    nextBaseline.scenarios[scenario.scenarioName] = {
      allowedRegressionPct: Number.isFinite(existingScenario.allowedRegressionPct)
        ? existingScenario.allowedRegressionPct
        : DEFAULT_ALLOWED_REGRESSION_PCT,
      metrics: {
        ...(existingScenario.metrics || {}),
        ...scenario.metrics,
      },
    };
  });

  return nextBaseline;
}

module.exports = {
  applyMeasuredResultsToBaseline,
  buildScenarioBaselineEntries,
  compareScenarioMetrics,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile,
};
