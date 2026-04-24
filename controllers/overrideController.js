// Override routes let a user correct any metric path the backend stores.
// We keep separate routes for annual rows, forecast buckets, and top-level
// placeholders so the request path itself tells a beginner which part of the
// document is being edited.

const {
  ANNUAL_DERIVED_PATHS,
  ANNUAL_OVERRIDEABLE_PATHS,
  FORECAST_BUCKET_KEYS,
  FORECAST_OVERRIDEABLE_PATHS,
  FORECAST_RELATIVE_METRIC_PATHS,
  TOP_LEVEL_OVERRIDEABLE_PATHS,
  TOP_LEVEL_METRIC_PATHS,
  isForecastFieldDerivedInternalCalculation,
  isTopLevelFieldDerivedInternalCalculation,
} = require("../catalog/fieldCatalog");
const WatchlistStock = require("../models/WatchlistStock");
const { clearLegacyDerivedMetricOverrides } = require("../utils/derivedMetricOverrideCleanup");
const { recalculateDerived } = require("../utils/derivedCalc");
const { createMetricField } = require("../utils/metricField");
const { flattenObjectPaths, getNestedValue, setNestedValue } = require("../utils/pathUtils");
const { getBaseSourceOfTruth, resolveEffectiveValue } = require("../utils/effectiveValue");

function applyMetricOverrides(target, allowedPaths, derivedLockedPaths, payload) {
  const flattened = flattenObjectPaths(payload);
  const blockedDerivedPaths = flattened
    .map((entry) => entry.path)
    .filter((path) => derivedLockedPaths.includes(path));
  const unsupportedPaths = flattened
    .map((entry) => entry.path)
    .filter((path) => !allowedPaths.includes(path) && !derivedLockedPaths.includes(path));

  if (blockedDerivedPaths.length > 0) {
    const error = new Error(
      `Derived/internal-calculation field(s) cannot be directly overridden: ${blockedDerivedPaths.join(", ")}. Update the editable input fields instead so the backend can recalculate them.`
    );
    error.statusCode = 400;
    throw error;
  }

  if (unsupportedPaths.length > 0) {
    const error = new Error(`Unsupported override field(s): ${unsupportedPaths.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  for (const { path, value } of flattened) {
    let metricField = getNestedValue(target, path);
    if (!metricField) {
      // New yearly placeholder rows may not exist on older stock documents yet.
      // We create the shared metric-field shape lazily so an override can still
      // land in the correct annual row without requiring a manual migration.
      setNestedValue(target, path, createMetricField(null, "system"));
      metricField = getNestedValue(target, path);
    }

    if (!metricField) {
      const error = new Error(`Unknown override field: ${path}`);
      error.statusCode = 400;
      throw error;
    }

    metricField.userValue = value;
    // Saving an override and clearing an override are two different states:
    // - save: keep the user value active
    // - clear: remove the user value and fall back to the last non-user source
    // Without this branch the document can stay stuck on `"user"`, which is
    // why the dashboard text was staying purple after "clear override".
    metricField.lastOverriddenAt = value === null ? null : new Date();
    const baseSourceOfTruth = getBaseSourceOfTruth(
      metricField,
      metricField.sourceOfTruth || "system",
    );
    const resolved = resolveEffectiveValue(metricField, baseSourceOfTruth);
    metricField.baseSourceOfTruth = resolved.baseSourceOfTruth;
    metricField.effectiveValue = resolved.effectiveValue;
    metricField.sourceOfTruth = resolved.sourceOfTruth;
  }
}

async function setAnnualOverride(req, res, next) {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const fiscalYear = parseInt(req.params.fiscalYear, 10);
    const stock = await WatchlistStock.findOne({ tickerSymbol: ticker });
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const annualEntry = stock.annualData.find((row) => row.fiscalYear === fiscalYear);
    if (!annualEntry) {
      return res.status(404).json({ error: "Year not found" });
    }

    const annualRouteForecastDerivedPaths = FORECAST_BUCKET_KEYS.flatMap((bucketKey) =>
      FORECAST_RELATIVE_METRIC_PATHS
        .filter((path) => isForecastFieldDerivedInternalCalculation(path))
        .map((path) => `forecastData.${bucketKey}.${path}`)
    );
    const annualRouteOverrideablePaths = [
      ...ANNUAL_OVERRIDEABLE_PATHS,
      ...FORECAST_BUCKET_KEYS.flatMap((bucketKey) =>
        FORECAST_OVERRIDEABLE_PATHS.map((path) => `forecastData.${bucketKey}.${path}`)
      ),
      ...TOP_LEVEL_OVERRIDEABLE_PATHS,
    ];

    if (clearLegacyDerivedMetricOverrides(stock)) {
      recalculateDerived(stock);
    }

    // The catalog source metadata is now the only policy source. That keeps
    // "derived means recalculated-but-locked" consistent between routes and UI.
    applyMetricOverrides(
      annualEntry,
      annualRouteOverrideablePaths,
      [
        ...ANNUAL_DERIVED_PATHS,
        ...annualRouteForecastDerivedPaths,
        ...TOP_LEVEL_METRIC_PATHS.filter((path) => isTopLevelFieldDerivedInternalCalculation(path)),
      ],
      req.body
    );
    recalculateDerived(stock);
    await stock.save();
    res.json(stock);
  } catch (error) {
    next(error);
  }
}

async function setForecastOverride(req, res, next) {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const bucket = req.params.bucket.toLowerCase();
    const stock = await WatchlistStock.findOne({ tickerSymbol: ticker });
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const forecastBucket = stock.forecastData?.[bucket];
    if (!forecastBucket) {
      return res.status(404).json({ error: "Forecast bucket not found" });
    }

    if (clearLegacyDerivedMetricOverrides(stock)) {
      recalculateDerived(stock);
    }

    applyMetricOverrides(
      forecastBucket,
      FORECAST_OVERRIDEABLE_PATHS,
      FORECAST_RELATIVE_METRIC_PATHS.filter((path) => isForecastFieldDerivedInternalCalculation(path)),
      req.body
    );
    recalculateDerived(stock);
    await stock.save();
    res.json(stock);
  } catch (error) {
    next(error);
  }
}

async function setTopLevelMetricOverride(req, res, next) {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const stock = await WatchlistStock.findOne({ tickerSymbol: ticker });
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    if (clearLegacyDerivedMetricOverrides(stock)) {
      recalculateDerived(stock);
    }

    applyMetricOverrides(
      stock,
      TOP_LEVEL_OVERRIDEABLE_PATHS,
      TOP_LEVEL_METRIC_PATHS.filter((path) => isTopLevelFieldDerivedInternalCalculation(path)),
      req.body
    );
    recalculateDerived(stock);
    await stock.save();
    res.json(stock);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  setAnnualOverride,
  setForecastOverride,
  setTopLevelMetricOverride,
};
