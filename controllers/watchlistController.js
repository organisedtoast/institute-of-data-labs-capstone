// This controller keeps the older watchlist CRUD routes together with the
// newer summary/bootstrap reads that feed shared search state and first paint.

const WatchlistStock = require("../models/WatchlistStock");
const { assertActiveLensName } = require("../services/lensService");
const {
  listWatchlistDashboardBootstraps,
  listWatchlistSummaries,
} = require("../services/watchlistDashboardService");
const normalizeTickerSymbol = require("../utils/normalizeTickerSymbol");
const {
  createEmptyAnalystRevisions,
  createEmptyForecastBucket,
  createEmptyGrowthForecasts,
} = require("../utils/documentFactory");
const { createMetricField } = require("../utils/metricField");

function buildCompanyNameOverride(existingField, companyName) {
  const trimmedName = companyName.trim();

  return {
    roicValue: existingField?.roicValue ?? null,
    userValue: trimmedName,
    effectiveValue: trimmedName,
    sourceOfTruth: "user",
    lastOverriddenAt: new Date(),
  };
}

// Express 5 forwards rejected async handlers to the shared error middleware,
// so these routes can stay small without repeating try/catch(next) wrappers.
async function createStock(req, res) {
  await assertActiveLensName(req.body.investmentCategory);

  const doc = await WatchlistStock.create({
    tickerSymbol: req.body.tickerSymbol,
    investmentCategory: req.body.investmentCategory.trim(),
    companyName: createMetricField(null, "system"),
    forecastData: {
      fy1: createEmptyForecastBucket(),
      fy2: createEmptyForecastBucket(),
      fy3: createEmptyForecastBucket(),
    },
    growthForecasts: createEmptyGrowthForecasts(),
    analystRevisions: createEmptyAnalystRevisions(),
  });

  res.status(201).json(doc);
}

async function getAllStocks(req, res) {
  // This route only serializes the documents back to JSON, so lean avoids
  // paying for full Mongoose document instances we never mutate here.
  const stocks = await WatchlistStock.find().lean();
  res.json(stocks);
}

async function getStockSummaries(req, res) {
  const summaries = await listWatchlistSummaries();
  res.json(summaries);
}

async function getDashboardBootstraps(req, res) {
  const requestedTickers = typeof req.query?.tickers === "string"
    ? req.query.tickers.split(",")
    : Array.isArray(req.query?.tickers)
      ? req.query.tickers
      : [];
  const dashboards = await listWatchlistDashboardBootstraps({
    tickers: requestedTickers,
  });
  res.json({ dashboards });
}

async function getOneStock(req, res) {
  const tickerSymbol = normalizeTickerSymbol(req.params.ticker);
  // Like getAllStocks, this read path only returns JSON and never calls save().
  const stock = await WatchlistStock.findOne({
    tickerSymbol,
  }).lean();
  if (!stock) {
    return res.status(404).json({ error: "Stock not found" });
  }

  res.json(stock);
}

async function updateStock(req, res) {
  const tickerSymbol = normalizeTickerSymbol(req.params.ticker);
  const updates = {};

  if (req.body.investmentCategory !== undefined) {
    await assertActiveLensName(req.body.investmentCategory);
    updates.investmentCategory = req.body.investmentCategory.trim();
  }

  if (req.body.companyName !== undefined) {
    const existingStock = await WatchlistStock.findOne({ tickerSymbol });

    if (!existingStock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    // We only need the existing document when rebuilding the override-friendly
    // companyName field, so category-only updates can skip that extra read.
    updates.companyName = buildCompanyNameOverride(
      existingStock.companyName,
      req.body.companyName
    );
  }

  const doc = await WatchlistStock.findOneAndUpdate(
    { tickerSymbol },
    updates,
    { returnDocument: "after", runValidators: true }
  );

  if (!doc) {
    return res.status(404).json({ error: "Stock not found" });
  }

  res.json(doc);
}

async function deleteStock(req, res) {
  const doc = await WatchlistStock.findOneAndDelete({
    tickerSymbol: normalizeTickerSymbol(req.params.ticker),
  });
  if (!doc) {
    return res.status(404).json({ error: "Stock not found" });
  }

  res.json({ message: "Deleted", tickerSymbol: doc.tickerSymbol });
}

module.exports = {
  createStock,
  deleteStock,
  getAllStocks,
  getDashboardBootstraps,
  getOneStock,
  getStockSummaries,
  updateStock,
};
