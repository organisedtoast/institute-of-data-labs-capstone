const {
  ANALYST_REVISION_FIELDS,
  ANNUAL_GROUP_FIELDS,
  FORECAST_BUCKET_FIELDS,
  GROWTH_FORECAST_FIELDS,
} = require("../catalog/fieldCatalog");
const { createMetricField } = require("./metricField");

function buildMetricGroup(fieldNames, sourceOfTruth = "system") {
  return fieldNames.reduce((group, fieldName) => {
    group[fieldName] = createMetricField(null, sourceOfTruth);
    return group;
  }, {});
}

function createEmptyAnnualEntry(fiscalYear = null, fiscalYearEndDate = null) {
  return {
    fiscalYear,
    fiscalYearEndDate,
    reportingCurrency: null,
    earningsReleaseDate: createMetricField(null, "system"),
    base: buildMetricGroup(ANNUAL_GROUP_FIELDS.base),
    balanceSheet: buildMetricGroup(ANNUAL_GROUP_FIELDS.balanceSheet),
    incomeStatement: buildMetricGroup(ANNUAL_GROUP_FIELDS.incomeStatement),
    ownerEarningsBridge: buildMetricGroup(ANNUAL_GROUP_FIELDS.ownerEarningsBridge),
    sharesAndMarketCap: buildMetricGroup(ANNUAL_GROUP_FIELDS.sharesAndMarketCap),
    valuationMultiples: buildMetricGroup(ANNUAL_GROUP_FIELDS.valuationMultiples),
    epsAndDividends: buildMetricGroup(ANNUAL_GROUP_FIELDS.epsAndDividends),
  };
}

function createEmptyForecastBucket() {
  return buildMetricGroup(FORECAST_BUCKET_FIELDS);
}

function createEmptyGrowthForecasts() {
  return buildMetricGroup(GROWTH_FORECAST_FIELDS);
}

function createEmptyAnalystRevisions() {
  return buildMetricGroup(ANALYST_REVISION_FIELDS);
}

module.exports = {
  createEmptyAnalystRevisions,
  createEmptyAnnualEntry,
  createEmptyForecastBucket,
  createEmptyGrowthForecasts,
};
