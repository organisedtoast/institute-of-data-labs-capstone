// Override routes let a user correct any metric path the backend stores.
// We keep separate routes for annual rows, forecast buckets, and top-level
// placeholders so the request path itself tells a beginner which part of the
// document is being edited.

const {
  ANALYST_REVISION_FIELDS,
  FORECAST_RELATIVE_METRIC_PATHS,
  GROWTH_FORECAST_FIELDS,
  TOP_LEVEL_METRIC_PATHS,
} = require("../catalog/fieldCatalog");
const WatchlistStock = require("../models/WatchlistStock");
const { recalculateDerived } = require("../utils/derivedCalc");
const { createMetricField } = require("../utils/metricField");
const { flattenObjectPaths, getNestedValue, setNestedValue } = require("../utils/pathUtils");
const { getBaseSourceOfTruth, resolveEffectiveValue } = require("../utils/effectiveValue");

function applyMetricOverrides(target, allowedPaths, payload) {
  const flattened = flattenObjectPaths(payload);
  const unsupportedPaths = flattened
    .map((entry) => entry.path)
    .filter((path) => !allowedPaths.includes(path));

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

    const allowedPaths = [
      "earningsReleaseDate",
      "base.sharePrice",
      "base.sharesOnIssue",
      "base.marketCap",
      "base.returnOnInvestedCapital",
      "balanceSheet.cash",
      "balanceSheet.nonCashInvestments",
      "balanceSheet.debt",
      "balanceSheet.netDebtOrCash",
      "balanceSheet.netDebtToEbitda",
      "balanceSheet.ebitInterestCoverage",
      "balanceSheet.assets",
      "balanceSheet.liabilities",
      "balanceSheet.equity",
      "balanceSheet.leverageRatio",
      "balanceSheet.enterpriseValueTrailing",
      "incomeStatement.revenue",
      "incomeStatement.grossProfit",
      "incomeStatement.codb",
      "incomeStatement.ebitda",
      "incomeStatement.depreciationAndAmortization",
      "incomeStatement.ebit",
      "incomeStatement.netInterestExpense",
      "incomeStatement.npbt",
      "incomeStatement.incomeTaxExpense",
      "incomeStatement.npat",
      "incomeStatement.capitalExpenditures",
      "incomeStatement.fcf",
      "ownerEarningsBridge.deemedMaintenanceCapex",
      "ownerEarningsBridge.ownerEarnings",
      "sharesAndMarketCap.changeInShares",
      "valuationMultiples.evSalesTrailing",
      "valuationMultiples.ebitdaMarginTrailing",
      "valuationMultiples.ebitMarginTrailing",
      "valuationMultiples.npatMarginTrailing",
      "valuationMultiples.evEbitTrailing",
      "valuationMultiples.peTrailing",
      "valuationMultiples.tangibleBookValuePerShare",
      "valuationMultiples.priceToNta",
      "valuationMultiples.dividendPayout",
      "epsAndDividends.epsTrailing",
      "epsAndDividends.dyTrailing",
      "epsAndDividends.dpsTrailing",
      ...FORECAST_RELATIVE_METRIC_PATHS.map((path) => `forecastData.${path}`),
      ...GROWTH_FORECAST_FIELDS.map((fieldName) => `growthForecasts.${fieldName}`),
      ...ANALYST_REVISION_FIELDS.map((fieldName) => `analystRevisions.${fieldName}`),
    ];

    applyMetricOverrides(annualEntry, allowedPaths, req.body);
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

    applyMetricOverrides(forecastBucket, FORECAST_RELATIVE_METRIC_PATHS, req.body);
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

    applyMetricOverrides(stock, TOP_LEVEL_METRIC_PATHS, req.body);
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
