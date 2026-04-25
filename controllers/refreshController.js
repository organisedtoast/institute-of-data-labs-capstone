// Refresh keeps user overrides intact while pulling new ROIC-backed inputs and
// then recalculating the backend-owned derived fields.

const { resolveStoredImportRange } = require("../services/importRangeService");
const WatchlistStock = require("../models/WatchlistStock");
const {
  applyFreshStockDataToExistingStock,
  buildFreshStockData,
} = require("../services/watchlistStockRefreshService");

// Express 5 forwards rejected async handlers to the shared error middleware,
// so this route does not need a local try/catch(next) wrapper.
async function refreshStock(req, res) {
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
}

module.exports = { refreshStock };
