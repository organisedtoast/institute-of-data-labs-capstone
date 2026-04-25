// This controller imports a stock by fetching the backend's supported ROIC
// datasets, normalizing them into the watchlist schema, and then upserting the
// resulting document into MongoDB.

const { parseRequestedImportRangeYears } = require("../services/importRangeService");
const WatchlistStock = require("../models/WatchlistStock");
const { getTrimmedString } = require("../middleware/validate");
const { assertActiveLensName } = require("../services/lensService");
const { buildFreshStockData } = require("../services/watchlistStockRefreshService");

async function importStock(req, res, next) {
  try {
    const tickerSymbol = getTrimmedString(req.body?.tickerSymbol);
    const investmentCategory = getTrimmedString(req.body?.investmentCategory);
    const {
      years,
      importRangeYearsExplicit,
    } = parseRequestedImportRangeYears(req.body.years);
    if (!tickerSymbol) {
      return res.status(400).json({ error: "tickerSymbol is required" });
    }

    if (!investmentCategory) {
      return res.status(400).json({ error: "investmentCategory is required and must be a non-empty string." });
    }

    await assertActiveLensName(investmentCategory);

    const stockData = await buildFreshStockData({
      tickerSymbol,
      years,
      importRangeYearsExplicit,
      investmentCategory,
    });

    const doc = await WatchlistStock.findOneAndUpdate(
      { tickerSymbol: tickerSymbol.toUpperCase() },
      stockData,
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    res.status(201).json(doc);
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
}

module.exports = { importStock };
