const mongoose = require("mongoose");
const {
  ANALYST_REVISION_FIELDS,
  ANNUAL_GROUP_FIELDS,
  FORECAST_BUCKET_FIELDS,
  GROWTH_FORECAST_FIELDS,
} = require("../catalog/fieldCatalog");
const {
  createEmptyAnalystRevisions,
  createEmptyForecastBucket,
  createEmptyGrowthForecasts,
} = require("../utils/documentFactory");
const { createMetricField } = require("../utils/metricField");

// Every stored metric uses this same override-capable shape. Some fields will
// start with a ROIC import, some with a backend formula, and some as manual
// placeholders, but they all behave the same once they are in the database.
const metricFieldSchema = new mongoose.Schema({
  roicValue: { type: mongoose.Schema.Types.Mixed, default: null },
  userValue: { type: mongoose.Schema.Types.Mixed, default: null },
  effectiveValue: { type: mongoose.Schema.Types.Mixed, default: null },
  sourceOfTruth: {
    type: String,
    enum: ["roic", "user", "derived", "system"],
    default: "system",
  },
  lastOverriddenAt: { type: Date, default: null },
}, { _id: false });

function metricFieldDefinition(sourceOfTruth = "system") {
  return {
    type: metricFieldSchema,
    default: () => createMetricField(null, sourceOfTruth),
  };
}

function buildMetricGroupSchema(fieldNames) {
  const definition = {};
  for (const fieldName of fieldNames) {
    definition[fieldName] = metricFieldDefinition();
  }

  return new mongoose.Schema(definition, { _id: false });
}

const annualDataSchema = new mongoose.Schema({
  fiscalYear: { type: Number, required: true },
  fiscalYearEndDate: { type: String, default: null },
  earningsReleaseDate: metricFieldDefinition(),
  base: {
    type: buildMetricGroupSchema(ANNUAL_GROUP_FIELDS.base),
    default: () => ({}),
  },
  balanceSheet: {
    type: buildMetricGroupSchema(ANNUAL_GROUP_FIELDS.balanceSheet),
    default: () => ({}),
  },
  incomeStatement: {
    type: buildMetricGroupSchema(ANNUAL_GROUP_FIELDS.incomeStatement),
    default: () => ({}),
  },
  ownerEarningsBridge: {
    type: buildMetricGroupSchema(ANNUAL_GROUP_FIELDS.ownerEarningsBridge),
    default: () => ({}),
  },
  sharesAndMarketCap: {
    type: buildMetricGroupSchema(ANNUAL_GROUP_FIELDS.sharesAndMarketCap),
    default: () => ({}),
  },
  valuationMultiples: {
    type: buildMetricGroupSchema(ANNUAL_GROUP_FIELDS.valuationMultiples),
    default: () => ({}),
  },
  epsAndDividends: {
    type: buildMetricGroupSchema(ANNUAL_GROUP_FIELDS.epsAndDividends),
    default: () => ({}),
  },
}, { _id: false });

const forecastBucketSchema = buildMetricGroupSchema(FORECAST_BUCKET_FIELDS);
const growthForecastSchema = buildMetricGroupSchema(GROWTH_FORECAST_FIELDS);
const analystRevisionsSchema = buildMetricGroupSchema(ANALYST_REVISION_FIELDS);

// The main stock document now carries three layers:
// - top-level stock identity and metadata
// - `annualData[]` for historical fiscal-year rows
// - `forecastData` / growth / revisions for forward-looking placeholders
const watchlistStockSchema = new mongoose.Schema({
  tickerSymbol: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  companyName: metricFieldDefinition(),
  investmentCategory: {
    type: String,
    required: true,
    trim: true,
  },
  priceCurrency: { type: String, default: "USD" },
  sourceMeta: {
    lastImportedAt: { type: Date },
    lastRefreshAt: { type: Date },
    importRangeYears: { type: Number, default: null },
    importRangeYearsExplicit: { type: Boolean, default: false },
    roicEndpointsUsed: [String],
  },
  annualData: [annualDataSchema],
  forecastData: {
    fy1: { type: forecastBucketSchema, default: () => createEmptyForecastBucket() },
    fy2: { type: forecastBucketSchema, default: () => createEmptyForecastBucket() },
    fy3: { type: forecastBucketSchema, default: () => createEmptyForecastBucket() },
  },
  growthForecasts: {
    type: growthForecastSchema,
    default: () => createEmptyGrowthForecasts(),
  },
  analystRevisions: {
    type: analystRevisionsSchema,
    default: () => createEmptyAnalystRevisions(),
  },
}, { timestamps: true });

module.exports = mongoose.model("WatchlistStock", watchlistStockSchema, "watchlist");
