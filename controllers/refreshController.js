// Refresh re-fetches ROIC-backed fields without destroying user overrides.
// It updates imported/default values, then reruns backend formulas so derived
// fields stay in sync with any user-entered corrections.

const { resolveStoredImportRange } = require("../services/importRangeService");
const WatchlistStock = require("../models/WatchlistStock");
const {
  applyFreshStockDataToExistingStock,
  buildFreshStockData,
} = require("../services/watchlistStockRefreshService");

async function refreshStock(req, res, next) {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const stock = await WatchlistStock.findOne({ tickerSymbol: ticker });
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const {
      years,
      importRangeYearsExplicit,
    } = resolveStoredImportRange(stock.sourceMeta);
    const freshData = await buildFreshStockData({
      tickerSymbol: ticker,
      years,
      importRangeYearsExplicit,
      investmentCategory: stock.investmentCategory,
    });
    applyFreshStockDataToExistingStock(stock, freshData);

    stock.sourceMeta.lastRefreshAt = new Date();
    await stock.save();
    res.json(stock);
  } catch (error) {
    next(error);
  }
}

module.exports = { refreshStock };
