const { ANNUAL_RELATIVE_METRIC_PATHS } = require("../catalog/fieldCatalog");
const { assignMetricValue } = require("../utils/metricField");
const { getNestedValue } = require("../utils/pathUtils");

function mergeMetricField(existingField, freshField) {
  if (!existingField || !freshField) {
    return;
  }

  assignMetricValue(existingField, freshField.roicValue, freshField.sourceOfTruth || "roic");
}

// Refresh only updates the imported/default side of annual metrics.
// User overrides stay attached to the existing document and later derived
// formulas recalculate from the effective values.
function mergeAnnualEntry(existingEntry, freshEntry) {
  existingEntry.fiscalYearEndDate = freshEntry.fiscalYearEndDate;
  existingEntry.reportingCurrency = freshEntry.reportingCurrency ?? null;

  for (const relativePath of ANNUAL_RELATIVE_METRIC_PATHS) {
    const existingField = getNestedValue(existingEntry, relativePath);
    const freshField = getNestedValue(freshEntry, relativePath);
    mergeMetricField(existingField, freshField);
  }
}

module.exports = {
  mergeAnnualEntry,
};
