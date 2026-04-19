// Basic watchlist CRUD remains intentionally small:
// - create a placeholder stock manually
// - read one or many stocks
// - update category or company name
// - delete a stock

const WatchlistStock = require("../models/WatchlistStock");
const { assertActiveLensName } = require("../services/lensService");
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

async function createStock(req, res, next) {
  try {
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
  } catch (error) {
    next(error);
  }
}

async function getAllStocks(req, res, next) {
  try {
    const stocks = await WatchlistStock.find();
    res.json(stocks);
  } catch (error) {
    next(error);
  }
}

async function getOneStock(req, res, next) {
  try {
    const stock = await WatchlistStock.findOne({
      tickerSymbol: req.params.ticker.toUpperCase(),
    });
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    res.json(stock);
  } catch (error) {
    next(error);
  }
}

async function updateStock(req, res, next) {
  try {
    const updates = {};

    if (req.body.investmentCategory !== undefined) {
      await assertActiveLensName(req.body.investmentCategory);
      updates.investmentCategory = req.body.investmentCategory.trim();
    }

    if (req.body.companyName !== undefined) {
      const existingStock = await WatchlistStock.findOne({
        tickerSymbol: req.params.ticker.toUpperCase(),
      });

      if (!existingStock) {
        return res.status(404).json({ error: "Stock not found" });
      }

      updates.companyName = buildCompanyNameOverride(
        existingStock.companyName,
        req.body.companyName
      );

      const doc = await WatchlistStock.findOneAndUpdate(
        { tickerSymbol: req.params.ticker.toUpperCase() },
        updates,
        { returnDocument: "after", runValidators: true }
      );

      return res.json(doc);
    }

    const doc = await WatchlistStock.findOneAndUpdate(
      { tickerSymbol: req.params.ticker.toUpperCase() },
      updates,
      { returnDocument: "after", runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({ error: "Stock not found" });
    }

    res.json(doc);
  } catch (error) {
    next(error);
  }
}

async function deleteStock(req, res, next) {
  try {
    const doc = await WatchlistStock.findOneAndDelete({
      tickerSymbol: req.params.ticker.toUpperCase(),
    });
    if (!doc) {
      return res.status(404).json({ error: "Stock not found" });
    }

    res.json({ message: "Deleted", tickerSymbol: doc.tickerSymbol });
  } catch (error) {
    next(error);
  }
}

module.exports = { createStock, deleteStock, getAllStocks, getOneStock, updateStock };
