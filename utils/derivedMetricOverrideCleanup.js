const {
  ANNUAL_DERIVED_PATHS,
  FORECAST_BUCKET_KEYS,
  FORECAST_DERIVED_PATHS,
  TOP_LEVEL_DERIVED_PATHS,
} = require("../catalog/fieldCatalog");
const { resolveEffectiveValue } = require("./metricField");
const { getNestedValue } = require("./pathUtils");

function clearDerivedMetricFieldOverride(metricField) {
  if (!metricField || typeof metricField !== "object" || !("effectiveValue" in metricField)) {
    return false;
  }

  const hadLegacyUserOwnership =
    metricField.userValue !== null
    && metricField.userValue !== undefined
    || metricField.sourceOfTruth === "user"
    || metricField.baseSourceOfTruth === "user"
    || metricField.lastOverriddenAt !== null
    && metricField.lastOverriddenAt !== undefined;

  if (!hadLegacyUserOwnership) {
    return false;
  }

  // Derived fields should always flow back to their calculated source. If an
  // older document still carries a saved user override here, we clear it so the
  // recalculated value can become the source of truth again.
  metricField.userValue = null;
  metricField.lastOverriddenAt = null;
  const resolvedField = resolveEffectiveValue(metricField, "derived");
  metricField.baseSourceOfTruth = resolvedField.baseSourceOfTruth;
  metricField.effectiveValue = resolvedField.effectiveValue;
  metricField.sourceOfTruth = resolvedField.sourceOfTruth;
  return true;
}

function clearDerivedMetricOverridesFromTarget(target, fieldPaths = []) {
  let didChange = false;

  for (const fieldPath of fieldPaths) {
    const metricField = getNestedValue(target, fieldPath);
    if (clearDerivedMetricFieldOverride(metricField)) {
      didChange = true;
    }
  }

  return didChange;
}

function clearLegacyDerivedMetricOverrides(stockDocument) {
  let didChange = false;
  const annualRows = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData : [];

  for (const annualRow of annualRows) {
    if (clearDerivedMetricOverridesFromTarget(annualRow, ANNUAL_DERIVED_PATHS)) {
      didChange = true;
    }

    // Older stock documents can carry forecast snapshots inside each annual
    // row. Clearing derived overrides here keeps those historical views in sync
    // with the same derived-field lock we now enforce everywhere else.
    if (
      clearDerivedMetricOverridesFromTarget(
        annualRow,
        FORECAST_BUCKET_KEYS.flatMap((bucketKey) =>
          FORECAST_DERIVED_PATHS.map((fieldPath) => `forecastData.${bucketKey}.${fieldPath}`)
        ),
      )
    ) {
      didChange = true;
    }

    if (clearDerivedMetricOverridesFromTarget(annualRow, TOP_LEVEL_DERIVED_PATHS)) {
      didChange = true;
    }
  }

  const forecastBuckets = stockDocument?.forecastData && typeof stockDocument.forecastData === "object"
    ? Object.values(stockDocument.forecastData)
    : [];

  for (const forecastBucket of forecastBuckets) {
    if (clearDerivedMetricOverridesFromTarget(forecastBucket, FORECAST_DERIVED_PATHS)) {
      didChange = true;
    }
  }

  if (clearDerivedMetricOverridesFromTarget(stockDocument, TOP_LEVEL_DERIVED_PATHS)) {
    didChange = true;
  }

  return didChange;
}

module.exports = {
  clearDerivedMetricFieldOverride,
  clearLegacyDerivedMetricOverrides,
};
